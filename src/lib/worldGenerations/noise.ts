import { Vec3 } from 'vec3'
import { fixSetBiome } from './biomeFix'
import { parseWorldSeed } from 'minecraft-worldgen/dist/rng/random'
import { ChunkData, InitInfo } from 'minecraft-worldgen/dist/worker/data'
import { BUILTIN_RECIPES } from 'minecraft-worldgen/dist/recipe/builtin'
import type { RecipeSpec } from 'minecraft-worldgen/dist/recipe/types'
import { ChunkSource, createChunkSource, WebWorkerFactory } from 'minecraft-worldgen/dist/worker/pool'

const DIMENSIONS: Record<string, { settings: string }> = {
  overworld: { settings: 'minecraft:overworld' }, nether: { settings: 'minecraft:nether' }, end: { settings: 'minecraft:end' }
}
const PRESET_SETTINGS: Record<string, string> = {
  default: 'minecraft:overworld', amplified: 'minecraft:amplified', large_biomes: 'minecraft:large_biomes', caves: 'minecraft:caves', floating_islands: 'minecraft:floating_islands'
}

/** Source version of the worldgen data / block names (all palette names are 26.3 names). */
const SOURCE_VERSION = '26.3'

/**
 * Minecraft 26.3 noise worldgen (`minecraft:noise`) chunk generator (package minecraft-worldgen); external worldgen datapacks are optional layers on top of the vanilla data.
 *
 * Options (on top of the usual `version`, `seed`, `minY`, `worldHeight`, `getRenamedData`):
 *  - `jars`: datapack jars in priority order, lowest first (default: vanilla client.jar + the external datapack jar, see
 *    `minecraft-worldgen` `src/data/registry.ts`).
 *  - `dimension`: `overworld` (default) | `nether` | `end`; selects the noise settings, the biome source and the chunk column size
 *    (overworld -64..320, nether / end 0..256 like their dimension types).
 *  - `preset` (overworld only): `default` | `amplified` | `large_biomes` | `caves` | `floating_islands` (vanilla noise settings of the same name).
 *  - `settings`: explicit noise settings id (overrides `dimension` / `preset`).
 *  - `recipe`: custom dimension, see minecraft-worldgen `src/recipe` and docs/worlds.md: a built-in name (`mining` | `islands` | `chaos`), `{ builtin, options }`,
 *    `{ script: '/path/recipe.js', options }` or a complete recipe object. A built-in recipe name is also accepted as `preset`.
 *  - `workers`: worker_threads used for generation (default min(4, cpus-1), env `MC_WORLDGEN_WORKERS`; 0 = in-process).
 *  - `workerFactory` (browser hosts): `(index) => new Worker(...)`; chunks are then generated in Web Workers (count: `workers`,
 *    default min(4, hardwareConcurrency-1)). The worker script is `minecraft-worldgen/dist/worker/web-entry` bundled by the host. The datapack zip
 *    URL(s) (`globalThis.__MC_WORLDGEN_DATAPACK_URL`: string, string[] or a function returning them) are passed to the workers, which fetch it themselves.
 */
function generation (options: any = {}) {
  const { version, getRenamedData } = options
  const dimension: 'overworld' | 'nether' | 'end' = options.dimension ?? 'overworld'
  if (!DIMENSIONS[dimension]) throw new Error(`noise generator: unknown dimension '${dimension}' (overworld | nether | end)`)
  let preset: string = options.preset ?? 'default'
  let recipe: RecipeSpec | undefined = typeof options.recipe === 'string' ? { builtin: options.recipe } : options.recipe
  if (!recipe && BUILTIN_RECIPES[preset]) { recipe = { builtin: preset }; preset = 'default' }
  if (recipe && 'script' in recipe) recipe = { ...recipe, script: require('path').resolve(recipe.script) }
  if (!recipe && dimension === 'overworld' && !PRESET_SETTINGS[preset]) throw new Error(`noise generator: unknown preset '${preset}' (${Object.keys(PRESET_SETTINGS).join(' | ')})`)
  const settingsId: string = options.settings ?? (dimension === 'overworld' ? PRESET_SETTINGS[preset] : DIMENSIONS[dimension].settings)
  // dimension type of the chunk column: overworld -64..320, nether / end 0..256
  const minY: number = dimension === 'overworld' ? (options.minY ?? -64) : 0
  const worldHeight: number = dimension === 'overworld' ? (options.worldHeight ?? 384) : 256
  const Chunk = require('prismarine-chunk')(version)
  const registry = require('prismarine-registry')(version)
  const Block = require('prismarine-block')(registry)
  if (dimension === 'overworld' && (minY !== -64 || worldHeight !== 384)) {
    throw new Error(`noise generator needs a 384-block tall world starting at y=-64 (version >= 1.18), got minY=${minY} height=${worldHeight}`)
  }

  const seed = parseWorldSeed(options.seed)
  const workers: number | undefined = options.workers
  const workerFactory: WebWorkerFactory | undefined = options.workerFactory
  const createSource = (): Promise<ChunkSource> => (async () => {
    let zipBuffers = options.zipBuffers as Array<{ name: string, data: Uint8Array }> | undefined
    if (!zipBuffers && !options.jars) {
      // one URL or several (lowest priority first: vanilla pack, then e.g. a datapack the player loaded)
      let global = (globalThis as any).__MC_WORLDGEN_DATAPACK_URL as string | string[] | (() => string[] | Promise<string[]>) | undefined
      if (typeof global === 'function') global = await global()
      const urls = global === undefined ? undefined : Array.isArray(global) ? global : [global]
      if (urls?.length && workerFactory && workers !== 0) {
        // Web Workers fetch the (HTTP-cached / data: / blob:) datapack themselves instead of receiving a copy each
        return createChunkSource({ seed: seed.toString(), datapackUrl: urls.length === 1 ? urls[0] : urls, settings: settingsId, recipe, maxCachedChunks: options.maxCachedChunks ?? 160 }, workers, workerFactory)
      }
      if (urls?.length) {
        zipBuffers = await Promise.all(urls.map(async (url, i) => {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`worldgen datapack fetch failed ${res.status}: ${url}`)
          return { name: `datapack${i}.zip`, data: new Uint8Array(await res.arrayBuffer()) }
        }))
      }
    }
    return createChunkSource({ seed: seed.toString(), jars: options.jars, zipBuffers, settings: settingsId, recipe }, workers, workerFactory)
  })()
  // created lazily: a dimension nobody visits does not start a worker pool
  let sourceP: Promise<ChunkSource> | undefined
  const getSource = () => {
    if (!sourceP) { sourceP = createSource(); sourceP.catch(() => {}) } // failures surface through generateChunk
    return sourceP
  }

  // ------------------------------------------------------------------ block-state mapping (26.3 -> client version)
  const warned = new Set<string>()
  const stateByName = new Map<string, number>()
  const fallbackStone: number = registry.blocksByName.stone.defaultState ?? registry.blocksByName.stone.minStateId

  // blocks newer than the client version: aliases first, then a category fallback (plants / decoration -> air, other unknown blocks -> stone)
  const ALIASES: Record<string, string> = {
    short_grass: 'grass', tall_dry_grass: 'dead_bush', short_dry_grass: 'dead_bush', dead_bush: 'dead_bush',
    cherry_leaves: 'flowering_azalea_leaves', pale_oak_leaves: 'dark_oak_leaves', mangrove_leaves: 'jungle_leaves',
    cherry_log: 'acacia_log', pale_oak_log: 'dark_oak_log', mangrove_log: 'jungle_log', mangrove_roots: 'oak_log', pale_moss_block: 'moss_block', pale_moss_carpet: 'moss_carpet',
    resin_block: 'orange_terracotta', creaking_heart: 'dark_oak_log', pale_hanging_moss: 'air'
  }
  const PLANTISH = /(^|_)(grass|bush|flowers?|litter|mushroom|fern|vines?|petals|sprouts?|roots|sapling|tulip|dandelion|poppy|orchid|allium|azure_bluet|cornflower|lily|peony|lilac|rose|dripleaf|hanging_moss|wildflowers|firefly|sweet_berry|torchflower|pitcher|eyeblossom|cactus_flower|dry_grass)(_|$)/
  const woodSuffix = /_(log|wood|planks|slab|stairs|fence|fence_gate|door|trapdoor|button|pressure_plate|sign|leaves)$/
  const resolveBlock = (base: string) => {
    const direct = registry.blocksByName[base]
    if (direct) return direct
    const alias = ALIASES[base]
    if (alias && registry.blocksByName[alias]) return registry.blocksByName[alias]
    if (alias === 'air' || PLANTISH.test(base)) return registry.blocksByName.air
    const m = woodSuffix.exec(base)
    if (m && registry.blocksByName['oak' + m[0]]) return registry.blocksByName['oak' + m[0]]
    return undefined
  }
  const mapState = (state: string): number => {
    const m = /^(?:minecraft:)?([^[]+)(?:\[(.*)\])?$/.exec(state)!
    const base = m[1]
    const props: Record<string, string> = {}
    if (m[2]) for (const kv of m[2].split(',')) { const [k, v] = kv.split('='); props[k] = v }
    const renamed = getRenamedData ? getRenamedData('blocks', base, SOURCE_VERSION, version) as string : base
    const block = resolveBlock(renamed) ?? resolveBlock(base)
    if (!block) {
      if (!warned.has(renamed)) { warned.add(renamed); console.warn(`[noise] block '${renamed}' (from ${state}) unknown in ${version}, using stone`) }
      return fallbackStone
    }
    if (block.name === 'air') return 0
    if (!block.states) return block.defaultState ?? block.minStateId ?? block.id
    // the generator omits properties equal to the block's default state: start from the defaults (Block.fromProperties would take the first value of each property)
    const known = new Set<string>(block.states.map((s: any) => s.name))
    const filtered: Record<string, string> = { ...defaultProps(block) }
    for (const k of Object.keys(props)) if (known.has(k)) filtered[k] = props[k]
    try {
      return Block.fromProperties(block.name, filtered, 0).stateId
    } catch {
      return block.defaultState ?? block.minStateId
    }
  }
  const defaultPropsCache = new Map<string, Record<string, string>>()
  const defaultProps = (block: any): Record<string, string> => {
    let d = defaultPropsCache.get(block.name)
    if (!d) {
      d = {}
      try {
        const props = Block.fromStateId(block.defaultState, 0).getProperties()
        for (const [k, v] of Object.entries(props)) d[k] = String(v)
      } catch {}
      defaultPropsCache.set(block.name, d)
    }
    return d
  }
  const stateIdOfName = (name: string): number => {
    let s = stateByName.get(name)
    if (s === undefined) { s = mapState(name); stateByName.set(name, s) }
    return s
  }

  // ------------------------------------------------------------------ biome mapping (<datapack>:* -> vanilla client id)
  const plains: number = registry.biomesByName.plains.id
  let biomeIds: number[] | undefined
  const biomeIdsFor = (info: InitInfo) => biomeIds ??= info.vanillaBiomes.map(v => {
    const b = registry.biomesByName[v.replace(/^minecraft:/, '')]
    return b ? b.id : plains
  })

  const pos = new Vec3(0, 0, 0)

  async function generateChunk (chunkX: number, chunkZ: number): Promise<any> {
    const source = await getSource()
    const data: ChunkData = await source.generate(chunkX, chunkZ)
    const ids = biomeIdsFor(source.info)
    const palette = new Int32Array(data.palette.length)
    for (let i = 1; i < palette.length; i++) palette[i] = stateIdOfName(data.palette[i])

    const chunk = fixSetBiome(new Chunk({ minY, worldHeight }))
    const info = source.info
    const blocks = data.blocks
    const rows = Math.min(info.height, minY + worldHeight - info.minY)
    for (let y = Math.max(0, minY - info.minY); y < rows; y++) {
      pos.y = info.minY + y
      for (let z = 0; z < 16; z++) {
        pos.z = z
        const row = (y * 16 + z) * 16
        for (let x = 0; x < 16; x++) {
          const id = blocks[row + x]
          if (id === 0) continue
          pos.x = x
          chunk.setBlockStateId(pos, palette[id])
        }
      }
    }

    // biomes: quart resolution, absolute y; quart rows above/below the generated range repeat the nearest generated row
    const biomes = data.biomes
    const qRows = info.height >> 2
    const baseQy = info.minY >> 2
    for (let qy = minY >> 2; qy < (minY + worldHeight) >> 2; qy++) {
      const src = Math.min(Math.max(qy - baseQy, 0), qRows - 1)
      for (let qz = 0; qz < 4; qz++) {
        for (let qx = 0; qx < 4; qx++) {
          pos.set(qx * 4, qy * 4, qz * 4)
          chunk.setBiome(pos, ids[biomes[(src * 4 + qz) * 4 + qx]])
        }
      }
    }

    // full-bright like the other generators: max sky + block light everywhere
    for (let y = 0; y < worldHeight; y++) {
      pos.y = minY + y
      for (let z = 0; z < 16; z++) {
        pos.z = z
        for (let x = 0; x < 16; x++) {
          pos.x = x
          chunk.setSkyLight(pos, 15)
          chunk.setBlockLight(pos, 15)
        }
      }
    }
    return chunk
  }
  /** releases the worker generator (and the pool when it was the last user) */
  generateChunk.dispose = async () => { if (sourceP) { const p = sourceP; sourceP = undefined; try { await (await p).close() } catch {} } }
  return generateChunk
}

export = generation
