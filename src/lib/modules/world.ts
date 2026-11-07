import { gzip } from 'node-gzip'
import nbt from 'prismarine-nbt'

import { promisify } from 'util'
import fs from 'fs'
import { level, Anvil as AnvilLoader } from 'prismarine-provider-anvil'

import * as playerDat from '../playerDat'
import { Chunk, World } from 'prismarine-world/types/world'
import WorldLoader from 'prismarine-world'
import ChunkLoader, { PCChunk } from 'prismarine-chunk'
import RegistryLoader from 'prismarine-registry'
import { LevelDatFull } from 'prismarine-provider-anvil/src/level'
import generations from '../generations'
import { dimensionNbt } from './dimensionCodec'
import { fixSetBiome } from '../worldGenerations/biomeFix'
import { makeTemplateGenerator, getTemplateSpawnPoint } from '../worldGenerations/template'
import { Vec3 } from 'vec3'
import UserError from '../user_error'
import { generateSpiralMatrix } from '../../utils'
import { longArrayToNumber, numberToLongArray, writeLevelDat } from '../../levelDat'
import { getRenamedData } from '../../blockRenames'
import { parseWorldSeed, seedFromLevelDat } from 'minecraft-worldgen/dist/rng/random'

const fsStat = promisify(fs.stat)
const fsMkdir = promisify(fs.mkdir)

export const server: ServerModule = async function (serv, options) {
  const { version, worldSaveVersion: _worldSaveVersion, worldFolder, noWorldRegion, generation: _generation } = options
  let generation = _generation ?? { name: 'noise', options: {} }

  if (generation.name === 'flat') {
    generation.name = 'superflat'
  }
  if (generation.name === 'default' || generation.name === 'diamond_square') {
    generation.name = 'noise'
  }

  // Detect world type from level.dat
  if (worldFolder && !noWorldRegion) {
    try {
      const levelData = await level.readLevel(worldFolder + '/level.dat')
      serv.levelData = levelData
      if (levelData.WorldGenSettings) {
        for (const [key, value] of Object.entries(levelData.WorldGenSettings.dimensions)) {
          if (key.slice('minecraft:') === 'overworld') {
            if (value.generator.type === 'flat') {
              generation.name = 'superflat'
            }
            break
          }
        }
      }
      if (levelData.generatorName) {
        if (levelData.generatorName === 'flat') {
          generation.name = 'superflat'
        } else if (levelData.generatorName === 'default' || levelData.generatorName === 'diamond_square') {
          generation.name = 'noise'
        } else if (generations[levelData.generatorName]) {
          generation.name = levelData.generatorName
        } else {
          console.warn(`Unsupported world chunks generator type: ${levelData.generatorName}`)
          generation.name = 'noise'
        }
      }
    } catch (err) {
      // If level.dat read fails, use default generation
    }
  }

  generation.options ??= {}
  generation.options.worldHeight = serv.supportFeature('tallWorld') ? 384 : 256
  generation.options.minY = serv.supportFeature('tallWorld') ? -64 : 0
  levelDatWriter(serv, options)

  const World = WorldLoader(version)
  const registry = RegistryLoader(version)
  const worldSaveVersion = _worldSaveVersion ?? version
  const Anvil = worldFolder ? AnvilLoader(worldSaveVersion) : undefined

  const newSeed = parseWorldSeed(serv.seed ?? generation.options.seed)
  const worldsFile = worldFolder && !noWorldRegion ? `${worldFolder}/flyingsquid-worlds.json` : undefined
  // read (async fs: browser file systems have no sync calls) before any world is created, creating worlds rewrites the file; no await may be added between the
  // `setTimeout(() => serv.writeLevelDat())` below and the end of this module (it would run before the seed exists)
  const savedSpecs: WorldSpec[] = await (async () => { try { return worldsFile ? JSON.parse(await fs.promises.readFile(worldsFile, 'utf8') as string) : [] } catch { return [] } })()
  let seed
  let regionFolder
  if (worldFolder && !noWorldRegion) {
    regionFolder = worldFolder + '/region'
    try {
      await fsStat(regionFolder)
    } catch (err) {
      await fsMkdir(regionFolder, { recursive: true })
    }

    try {
      // destruct SpawnY, SpawnX, SpawnZ
      const { SpawnY, SpawnX, SpawnZ } = serv.levelData ?? {}
      if ([SpawnY, SpawnX, SpawnZ].every(x => x !== undefined)) {
        serv.spawnPoint ??= new Vec3(SpawnX!, SpawnY!, SpawnZ!)
      }
      seed = seedFromLevelDat(serv.levelData?.RandomSeed) ?? newSeed
      if (serv.levelData?.Version?.Name !== worldSaveVersion) {
        console.warn(`World save version mismatch: you select: ${worldSaveVersion} actual stored: ${serv.levelData?.Version?.Name}`)
      }
      if (!serv.time && serv.levelData?.DayTime) serv.time = longArrayToNumber(serv.levelData?.DayTime)
      const parseBool = (x, defValue) => x ? x === 'false' : defValue
      // RESTORE GAMERULES
      serv.doDaylightCycle = parseBool(serv.levelData?.GameRules?.doDaylightCycle, serv.doDaylightCycle)
    } catch (err) {
      seed = newSeed
      setTimeout(() => {
        serv.writeLevelDat()
      })
    }
  } else { seed = newSeed }

  const generationOptions = {
    ...generation.options,
    seed,
    version,
    getRenamedData,
    baseY: options.baseY
  }
  serv.emit('seed', generationOptions.seed)

  const patchWorld = (world: World) => {
    world['min_y'] = generation.options.minY
    world['height'] = generation.options.worldHeight
  }

  /**
   * `World#getColumn` (prismarine-world) does `await Promise.resolve()` and only then checks
   * `this.columns[key]` before deciding to invoke the chunk generator. If two callers ask for the
   * same chunk before either has reached that point — e.g. our own world-gen code writing custom
   * blocks into a spawn-adjacent chunk racing the player's own chunk-loading requesting the same
   * chunk — BOTH calls see no cached column and BOTH invoke the generator. Whichever `setColumn`
   * resolves last silently replaces `this.columns[key]`, discarding any edits already made to the
   * other (now-orphaned) chunk instance. This wraps `getColumn` so concurrent requests for the same
   * (chunkX, chunkZ) share a single in-flight generation instead of racing.
   */
  const dedupeGetColumn = (world: World) => {
    // prismarine-world stores whatever the chunk generator returned: an async generator (noise) would leave a Promise in `columns`, which then reaches the Anvil
    // storage (toNBT(Promise): "Cannot convert undefined or null to object") and nothing is ever saved. Store the resolved chunk.
    const originalSetColumn = world.setColumn.bind(world)
    world.setColumn = async (chunkX: number, chunkZ: number, chunk: any, save?: boolean) => originalSetColumn(chunkX, chunkZ, await chunk, save)
    const pending = new Map<string, Promise<any>>()
    const original = world.getColumn.bind(world)
    world.getColumn = (chunkX: number, chunkZ: number): Promise<any> => {
      const loaded = world.getLoadedColumn(chunkX, chunkZ)
      if (loaded) return Promise.resolve(loaded)
      const key = `${chunkX},${chunkZ}`
      const existing = pending.get(key)
      if (existing) return existing
      const promise: Promise<any> = Promise.resolve(original(chunkX, chunkZ)).finally(() => {
        pending.delete(key)
      })
      pending.set(key, promise)
      return promise
    }
  }

  const generationModule: (options) => any = generations[generation.name] ? generations[generation.name] : require(generation.name)
  const genOpts = generation.options as any
  const templateStr: string | undefined =
    typeof options.chunkTemplate === 'string' ? options.chunkTemplate
      : typeof genOpts.chunkTemplate === 'string' ? genOpts.chunkTemplate
        : undefined
  const templateBlockMap = options.blockMap ?? genOpts.blockMap
  const originalGenerator = templateStr !== undefined
    ? makeTemplateGenerator(templateStr, generationOptions, templateBlockMap)
    : generationModule(generationOptions)
  if (templateStr !== undefined) {
    serv.spawnPoint = getTemplateSpawnPoint(generationOptions)
  }
  serv.overworldOriginalGenerator = originalGenerator
  serv.overworld = new World((chunkX, chunkZ) => {
    return serv.overworldGeneratorOverride ? serv.overworldGeneratorOverride(chunkX, chunkZ, generationOptions) : originalGenerator(chunkX, chunkZ, generationOptions)
  }, regionFolder === undefined || !Anvil ? null : new Anvil(regionFolder), options.savingInterval as any) as CustomWorld
  serv.overworld.seed = serv.seed = generationOptions.seed
  serv.overworld.generatorName = generation.name
  patchWorld(serv.overworld)
  dedupeGetColumn(serv.overworld)
  // ---- world registry (Multiverse-style): any number of worlds; each has an environment (= client dimension type) and a generator
  const ENV_DIMENSION: Record<WorldEnvironment, number> = { normal: 0, nether: -1, end: 1 }
  const ENV_NOISE_DIM: Record<WorldEnvironment, string> = { normal: 'overworld', nether: 'nether', end: 'end' }
  const baseGeneratorName = generation.name
  const ChunkClass = ChunkLoader(version)
  /** per-world Anvil storage: nether `DIM-1`, end `DIM1`, other worlds `dimensions/flyingsquid/<name>`. Chunks of non-overworld sizes are converted on load (Anvil always yields -64..320 columns). */
  const regionDirOf = (name: string, environment: WorldEnvironment) => !worldFolder || noWorldRegion ? undefined
    : name === 'nether' && environment === 'nether' ? `${worldFolder}/DIM-1/region`
      : name === 'end' && environment === 'end' ? `${worldFolder}/DIM1/region`
        : `${worldFolder}/dimensions/flyingsquid/${name}/region`
  /** deletes the saved chunks of an extra world (used when a world is regenerated from another recipe) */
  serv.deleteWorldData = (name: string) => {
    const dir = regionDirOf(name, 'normal')
    if (dir) try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) { serv.warn(`Could not delete saved chunks of '${name}': ${(e as Error).message}`) }
  }
  const storageFor = (name: string, environment: WorldEnvironment, minY: number, height: number) => {
    if (!worldFolder || noWorldRegion || !Anvil) return null
    const dir = regionDirOf(name, environment)!
    // browser file systems (IndexedDB) only have the async fs calls: the directory is created before the first load / save instead of synchronously here
    const ready: Promise<boolean> = fsMkdir(dir, { recursive: true }).then(() => true, async () => {
      const exists = await fsStat(dir).then(() => true, () => false)
      if (!exists) serv.warn?.(`No storage for world '${name}' (cannot create ${dir}); it will not be saved`)
      return exists
    })
    const anvil: any = new Anvil(dir)
    const sameSize = minY === generation.options.minY && height === generation.options.worldHeight
    return {
      save: async (x: number, z: number, chunk: any) => { if (await ready) await anvil.save(x, z, chunk) },
      load: async (x: number, z: number) => {
        if (!await ready) return null
        const c = await anvil.load(x, z)
        if (!c || sameSize || (c.minY === minY && c.worldHeight === height)) return c
        const out = fixSetBiome(new (ChunkClass as any)({ minY, worldHeight: height }))
        const pos = new Vec3(0, 0, 0)
        for (let y = Math.max(minY, c.minY); y < Math.min(minY + height, c.minY + c.worldHeight); y++) {
          pos.y = y
          for (let zz = 0; zz < 16; zz++) {
            pos.z = zz
            for (let xx = 0; xx < 16; xx++) {
              pos.x = xx
              const id = c.getBlockStateId(pos)
              if (id !== 0) out.setBlockStateId(pos, id)
              out.setSkyLight(pos, 15); out.setBlockLight(pos, 15)
              if ((y & 3) === 0 && (xx & 3) === 0 && (zz & 3) === 0) out.setBiome(pos, c.getBiome(pos))
            }
          }
        }
        return out
      }
    }
  }
  let loadingSaved = true
  const saveWorldSpecs = () => {
    if (loadingSaved) return
    if (!worldsFile) return
    const extra = Object.values(serv.worldSpecs).filter(sp => !['overworld', 'nether', 'end'].includes(sp.name))
    fs.promises.writeFile(worldsFile, JSON.stringify(extra, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2)).catch((e: Error) => serv.warn('Could not save worlds: ' + e.message))
  }
  const createWorld = (spec: WorldSpec): CustomWorld => {
    if (serv.worlds[spec.name]) throw new UserError(`World '${spec.name}' already exists`)
    const environment = spec.environment ?? 'normal'
    if (!(environment in ENV_DIMENSION)) throw new UserError(`Unknown environment '${environment}' (normal | nether | end)`)
    // default generator: the server's generator for the overworld; the noise generator also builds nether / end, others fall back to the simple ones
    const genName = spec.generator ?? (environment === 'normal' || baseGeneratorName === 'noise' ? baseGeneratorName : environment === 'nether' ? 'nether' : 'empty')
    const module: (options) => any = generations[genName] ?? require(genName)
    const worldSeed = spec.seed === undefined ? generationOptions.seed : parseWorldSeed(spec.seed)
    const tall = environment === 'normal'
    const opts = {
      ...generationOptions,
      ...spec.options,
      seed: worldSeed,
      dimension: ENV_NOISE_DIM[environment],
      preset: spec.preset,
      recipe: spec.recipe,
      minY: tall ? generation.options.minY : 0,
      worldHeight: tall ? generation.options.worldHeight : 256
    }
    const generator = module(opts)
    const world = new World(generator, storageFor(spec.name, environment, opts.minY as number, opts.worldHeight as number), options.savingInterval as any) as CustomWorld
    world['min_y'] = opts.minY
    world.disposeGenerator = generator?.dispose
    world['height'] = opts.worldHeight
    dedupeGetColumn(world)
    world.seed = worldSeed
    world.generatorName = genName
    world.environment = environment
    world.dimensionId = ENV_DIMENSION[environment]
    world.worldName = spec.name
    world.blockEntityData = {}
    world.portals = []
    serv.worlds[spec.name] = world
    serv.worldSpecs[spec.name] = { ...spec, environment, generator: genName }
    saveWorldSpecs()
    serv.emit('worldCreated' as any, world)
    return world
  }
  serv.worldSpecs = {}
  serv.worlds = { overworld: serv.overworld }
  serv.overworld.environment = 'normal'
  serv.overworld.dimensionId = 0
  serv.overworld.worldName = 'overworld'
  serv.worldSpecs.overworld = { name: 'overworld', environment: 'normal', generator: generation.name, seed: generationOptions.seed }
  serv.createWorld = createWorld
  serv.netherworld = createWorld({ name: 'nether', environment: 'nether' })
  serv.endworld = createWorld({ name: 'end', environment: 'end' })
  // worlds created at runtime (/mv create) in an earlier session, then the ones declared in the options
  for (const spec of [...savedSpecs, ...(options.worlds ?? [])]) {
    if (serv.worlds[spec.name]) continue
    try { createWorld(spec) } catch (e) { serv.warn(`Could not create world '${spec.name}': ${(e as Error).message}`) }
  }
  loadingSaved = false
  saveWorldSpecs()

  serv.removeWorld = async (name: string) => {
    const world = serv.worlds[name]
    if (!world) throw new UserError(`World '${name}' does not exist`)
    if (world === serv.overworld || world === serv.netherworld || world === serv.endworld) throw new UserError(`World '${name}' is a core world and cannot be removed`)
    for (const player of serv.players.filter(p => p.world === world)) {
      await player.changeWorld(serv.overworld, { dimension: 0 })
    }
    world.stopSaving()
    try { await world.disposeGenerator?.() } catch {}
    delete serv.worlds[name]
    delete serv.worldSpecs[name]
    saveWorldSpecs()
    serv.emit('worldRemoved' as any, name)
  }

  serv.dimensionNames = {
    '-1': 'minecraft:the_nether',
    0: 'minecraft:overworld',
    1: 'minecraft:the_end'
  }

  serv.overworld.blockEntityData = {}
  serv.overworld.portals = []

  serv.pregenWorld = (world, size = 3) => {
    const promises: Promise<Chunk>[] = []
    for (let x = -size; x < size; x++) {
      for (let z = -size; z < size; z++) {
        promises.push(world.getColumn(x, z))
      }
    }
    return Promise.all(promises)
  }

  serv.setBlock = async (world, position, stateId) => {
    serv.players
      .filter(p => p.world === world)
      .forEach(player => player.sendBlock(position, stateId))
    await world.setBlockStateId(position, stateId)
    if (stateId === 0) serv.notifyNeighborsOfStateChange(world, position, serv.tickCount, serv.tickCount, true)
    else serv.updateBlock(world, position, serv.tickCount, serv.tickCount, true)
  }

  if (serv.supportFeature('theFlattening')) {
    serv.setBlockType = async (world, position, id) => {
      serv.setBlock(world, position, registry.blocks[id].minStateId!)
    }
  } else {
    serv.setBlockType = async (world, position, id) => {
      serv.setBlock(world, position, id << 4)
    }
  }

  serv.setBlockAction = async (world, position, actionId, actionParam) => {
    const location = new Vec3(position.x, position.y, position.z)
    const blockType = await world.getBlockType(location)

    serv.players
      .filter(p => p.world === world)
      .forEach(player => player.sendBlockAction(position, actionId, actionParam, blockType))
  }

  serv.chunksUsed = {}
  serv._finishPlayerChunkLoading = (chunkX, chunkZ, player) => {
    const id = chunkX + ',' + chunkZ
    if (player.loadedChunks[id]) return
    if (!serv.chunksUsed[id]) {
      serv.chunksUsed[id] = 0
    }
    serv.chunksUsed[id]++
    player.loadedChunks[id] = true
  }
  serv._unloadPlayerChunk = (chunkX, chunkZ, player) => {
    const id = chunkX + ',' + chunkZ
    delete player.loadedChunks[id]
    if (serv.chunksUsed[id] > 0) {
      serv.chunksUsed[id]--
    }
    if (!serv.chunksUsed[id] && player.world.storageProvider) {
      // Never delete chunks when we do not have a storage provider! They will be lost
      player.world.unloadColumn(chunkX, chunkZ)
      return true
    }
    return false
  }

  // serv.pregenWorld(serv.overworld).then(() => serv.info('Pre-Generated Overworld'));
  // serv.pregenWorld(serv.netherworld).then(() => serv.info('Pre-Generated Nether'));
  serv.commands.add({
    base: 'changeworld',
    info: 'to change world',
    usage: '/changeworld <world> (overworld | nether | end | any world created with /mv create)',
    onlyPlayer: true,
    op: true,
    action (name, ctx) {
      const world = serv.worlds[String(name).trim()]
      if (!world) throw new UserError(`Unknown world '${name}'. Worlds: ${Object.keys(serv.worlds).join(', ')}`)
      return ctx.player.changeWorld(world, { dimension: world.dimensionId })
    }
  })
  serv.commands.add({
    base: 'seed',
    info: 'Get world\'s seed',
    usage: '/seed',
    action (data, ctx) {
      const world = ctx.player?.world ?? serv.overworld
      // todo need concept of command output
      const message = `Seed: ${world.seed}`
      return message
    },
  })

  serv.savePlayersSingleplayer = async () => {
    if (!worldFolder) return
    const savedData = await serv.players[0].save()
    // if we ever support level.dat saving this function needs to be changed i guess
    const levelDatContent = await fs.promises.readFile(worldFolder + '/level.dat')
    const { parsed } = await nbt.parse(levelDatContent)
    //@ts-ignore
    parsed.value.Data.value.Player = savedData
    const newDataCompressed = await gzip(nbt.writeUncompressed(parsed))
    await fs.promises.writeFile(worldFolder + '/level.dat', newDataCompressed)

    await Promise.all(serv.players.slice(1).map(async player => player.save()))
  }

  // serv.commands.add({
  //   base: 'data',
  //   info: 'Gets, merges, modifies and removes block entity and entity NBT data',
  //   usage: '/data',
  //   parse(string, ctx) {
  //     const [action, action2, arg3] = string.split(' ')
  //     return {
  //       action,
  //       action2,
  //       arg3
  //     }
  //   },
  //   action(data, ctx) {
  //   },
  // })

  serv.commands.add({
    // temp
    base: 'setdata',
    info: 'Set entity data - for testing',
    usage: '/setdata',
    op: true,
    tab: [
      'blockX', 'blockY', 'blockZ'
    ],
    parse (string, ctx) {
      return string.split(' ')
    },
    async action (data, ctx) {
      const [blockX, blockY, blockZ, ..._data] = data
      const dataString = _data.join(' ')
      const pos = new Vec3(+blockX, +blockY, +blockZ)
      const block = await ctx.player!.world.getBlock(pos)
      if (block.name !== 'command_block') return
      const key = `${pos.x},${pos.y},${pos.z}`
      //@ts-ignore
      const { blockEntities, setBlock } = await ctx.player!.world.getColumnAt(pos)
      blockEntities[key] ??= {
        name: '',
        value: {}
      }
      blockEntities[key].value ??= {
        id: { type: 'string', value: 'command_block' },
        Command: { type: 'string', value: '' },
        auto: { type: 'byte', value: 0 },
        powered: { type: 'byte', value: 0 },
        conditionMet: { type: 'byte', value: 0 },
        UpdateLastExecution: { type: 'byte', value: 0 },
        LastExecution: { type: 'long', value: 0 },
        LastOutput: { type: 'string', value: '' },
        TrackOutput: { type: 'byte', value: 0 },
        SuccessCount: { type: 'int', value: 0 },
        CustomName: { type: 'string', value: '' },
        color: { type: 'string', value: 'white' },
        x: { type: 'int', value: pos.x },
        y: { type: 'int', value: pos.y },
        z: { type: 'int', value: pos.z },
      }
      blockEntities[key].value.Command = { type: 'string', value: dataString }
      ctx.player!.world.blockEntityData[key] = blockEntities[key]
    },
  })

  if (!worldFolder) {
    serv.writeLevelDat()
  } else if (!noWorldRegion && !serv.levelData) {
    // a new world folder: write level.dat right away. It used to appear only with the first autosave (60 s), a world closed earlier had chunks but no level.dat
    // and was listed as broken (and not loadable) by the web client.
    setTimeout(() => { serv.writeLevelDat().catch((e: Error) => serv.warn(`Could not write level.dat: ${e.message}`)) })
  }

  console.log('worlds init done')

  // Periodic autosave: world and all players
  const autosaveMs = options.savingInterval === false ? 0 : (typeof options.savingInterval === 'number' ? options.savingInterval : 60_000)
  if (autosaveMs > 0 && options.worldFolder) {
    let lastBroadcastTs = 0
    const doAutosave = async () => {
      try {
        // Save level.dat if needed
        await serv.writeLevelDat()
        // Save worlds if backend supports it
        // prismarine-world saves chunks automatically when constructed with anvil; here we ensure flush via stop/start
        // Save players
        await Promise.allSettled(serv.players.map(p => p.save()))
        // Also flush JSON player stores if the database module is loaded
        await serv.saveAllPlayerDataToDisk?.()
        // Broadcast a single "Server saved" message (no spam more than once per interval)
        const now = Date.now()
        if (now - lastBroadcastTs > autosaveMs - 10_000 && options.broadcastSaves) {
          serv.broadcast('§7[autosave] Server saved')
          lastBroadcastTs = now
        }
      } catch (e) {
        serv.warn('Autosave failed: ' + (e as Error)?.message)
      }
    }
    serv.setInterval(doAutosave, autosaveMs)
  }

  return () => {
    for (const world of Object.values(serv.worlds)) {
      // world.throwOnReadWrite = true
      world.stopSaving()
    }
  }
}

const levelDatWriter = (serv: Server, options: Options) => {
  serv.writeLevelDat = async () => {
    const { worldFolder } = options
    if (!worldFolder) return
    const getGeneratorName = (world: string) => {
      const original = serv.worlds[world].generatorName
      if (original === 'superflat') return 'flat'
      if (original === 'noise') return 'default'
      if (original === 'customized') return 'customized'
      return original
    }

    const newLevelDat = {
      RandomSeed: numberToLongArray(serv.seed),
      Version: serv.levelData?.Version ?? { Name: options.version },
      generatorName: serv.levelData?.generatorName ?? getGeneratorName('overworld'),
      // WorldGenSettings: {
      //   dimensions: {
      //     'minecraft:overworld': {
      //       generator: { type: getGeneratorName('overworld') }
      //     }
      //   }
      // },
      LevelName: serv.levelData?.LevelName ?? options.levelName!, // todo fix typing
      allowCommands: serv.levelData?.allowCommands ?? 1,
      time: serv.time,
      GameRules: serv.gamerules,
    }
    await writeLevelDat(worldFolder + '/level.dat', newLevelDat)
    serv.levelData = {
      ...serv.levelData,
      ...newLevelDat
    } as any
  }
}

export const player = function (player: Player, serv: Server, settings: Options) {
  const registry = RegistryLoader(settings.version)

  player.flying = 0
  player._client.on('abilities', ({ flags }) => {
    // todo check can fly!!
    player.flying = flags & 2
  })

  player.save = async () => {
    return await playerDat.save(player, settings.worldFolder || undefined, serv.supportFeature('attributeSnakeCase'), serv.supportFeature('theFlattening'), settings.useInMemoryStorage ?? true)
  }

  player._unloadChunk = (chunkX, chunkZ) => {
    serv._unloadPlayerChunk(chunkX, chunkZ, player)

    if (serv.supportFeature('unloadChunkByEmptyChunk')) {
      player._client.write('map_chunk', {
        x: chunkX,
        z: chunkZ,
        groundUp: true,
        bitMap: 0x0000,
        chunkData: Buffer.alloc(0)
      })
    } else if (serv.supportFeature('unloadChunkDirect')) {
      player._client.write('unload_chunk', {
        chunkX,
        chunkZ
      })
    }
  }

  player.sendChunk = async (chunkX, chunkZ, column: any) => {
    await player.behavior('sendChunk', {
      x: chunkX,
      z: chunkZ,
      chunk: column
    }, ({ x, z, chunk }/* : {x, z, chunk: import('prismarine-chunk').PCChunk} */) => {
      serv._finishPlayerChunkLoading(chunkX, chunkZ, player)

      const newLightsFormat = serv.supportFeature('newLightingDataFormat')
      const dumpedLights = chunk.dumpLight()
      const newLightsData = newLightsFormat ? { skyLight: dumpedLights.skyLight, blockLight: dumpedLights.blockLight } : undefined
      const chunkBuffer = chunk.dump()
      const bitMap = chunk.getMask()
      player._client.write('map_chunk', {
        x,
        z,
        groundUp: bitMap !== undefined ? true : undefined,
        //note: it's a flag that tells the client to trust the edges of the chunk, meaning that the client can render the chunk without having to wait for the edges to be sent
        trustEdges: true, // should be false when a chunk section is updated instead of the whole chunk being overwritten, do we ever do that?
        suppressLightUpdates: true, // 1.19.2
        bitMap: bitMap,
        ...serv.supportFeature('blockStateId') && serv.looseProtocolMode ? {
          // groundUp: false,
          // bitMap: undefined // use full mask (e.g. 0xffff is default). workaround for https://github.com/PrismarineJS/prismarine-chunk/issues/205
        } : {},
        biomes: chunk.dumpBiomes(),
        ignoreOldData: true, // should be false when a chunk section is updated instead of the whole chunk being overwritten, do we ever do that?
        heightmaps: {
          type: 'compound',
          name: '',
          value: {
            MOTION_BLOCKING: { type: 'longArray', value: new Array(serv.supportFeature('dimensionDataIsAvailable') ? 37 : 36).fill([0, 0]) }, // must be
            WORLD_SURFACE: { type: 'longArray', value: new Array(serv.supportFeature('dimensionDataIsAvailable') ? 37 : 36).fill([0, 0]) },
          }
        }, // FIXME: fake heightmap
        chunkData: chunkBuffer,
        blockEntities: [],
        // long-array masks (dumpLight): the BitArray objects of the column are not what the client / serializer expect (in-process clients got no light at all)
        skyLightMask: dumpedLights.skyLightMask ?? chunk.skyLightMask,
        emptySkyLightMask: dumpedLights.emptySkyLightMask ?? chunk.emptySkyLightMask,
        blockLightMask: dumpedLights.blockLightMask ?? chunk.blockLightMask,
        emptyBlockLightMask: dumpedLights.emptyBlockLightMask ?? chunk.emptyBlockLightMask,
        ...newLightsData
      })
      if (serv.supportFeature('lightSentSeparately') && !serv.supportFeature('newLightingDataFormat')) {
        player._client.write('update_light', {
          chunkX: x,
          chunkZ: z,
          trustEdges: true, // should be false when a chunk section is updated instead of the whole chunk being overwritten, do we ever do that?
          skyLightMask: dumpedLights.skyLightMask ?? chunk.skyLightMask,
          blockLightMask: dumpedLights.blockLightMask ?? chunk.blockLightMask,
          emptySkyLightMask: dumpedLights.emptySkyLightMask ?? chunk.emptySkyLightMask,
          emptyBlockLightMask: dumpedLights.emptyBlockLightMask ?? chunk.emptyBlockLightMask,
          ...newLightsData ? newLightsData : {
            data: dumpedLights
          }
        })
      }
      Object.assign(serv.overworld.blockEntityData, column.blockEntities)
      for (const key in column.blockEntities ?? []) {
        const blockEntity = column.blockEntities[key]
        const actionPerBlockName = {
          mobspawner: 1,
          control: 2
        }
        const blockName = blockEntity?.id?.value.replace('minecraft:', '').toLowerCase()
        if (blockName) {
          let action = actionPerBlockName[blockName]
          if (action === undefined) {
            if (serv.looseProtocolMode) { // eg mineflayer don't care of action passed here, so lets always send tile entity
              action = 0
            } else {
              continue
            }
          }
          const [x, y, z] = key.split(',').map(a => parseInt(a))
          player._client.write('tile_entity_data', {
            location: {
              x,
              y,
              z
            },
            action,
            nbtData: {
              type: 'compound',
              name: '',
              value: blockEntity
            }
          })
        }
      }
      return Promise.resolve()
    })
  }

  const CHUNK_PREFETCH = 8
  player.sendNearbyChunks = (viewDistance, group = false, abortSignal?: AbortSignal) => {
    player.lastPositionChunkUpdated = player.position
    const playerChunkX = Math.floor(player.position.x / 16)
    const playerChunkZ = Math.floor(player.position.z / 16)

    Object.keys(player.loadedChunks)
      .map((key) => key.split(',').map(a => parseInt(a)))
      .filter(([x, z]) => Math.abs(x - playerChunkX) > viewDistance || Math.abs(z - playerChunkZ) > viewDistance)
      .forEach(([x, z]) => player._unloadChunk(x, z))

    const todo = generateSpiralMatrix(viewDistance)
      .map(t => ({
        chunkX: playerChunkX + t[0],
        chunkZ: playerChunkZ + t[1]
      }))
      .filter(({ chunkX, chunkZ }) => !player.loadedChunks[`${chunkX},${chunkZ}`])
    // chunks are sent in spiral order, but generation of the next few is requested ahead of time so a multi-worker generator (staged pipeline) has work for all its workers
    const ahead = new Map<number, Promise<PCChunk | undefined>>()
    const request = (i: number) => {
      let p = ahead.get(i)
      if (!p && i < todo.length) {
        p = Promise.resolve(player.world.getColumn(todo[i].chunkX, todo[i].chunkZ) as Promise<PCChunk>)
        p.catch(() => {}) // reported when its turn comes
        ahead.set(i, p)
      }
      return p
    }
    return todo.reduce((acc, { chunkX, chunkZ }, i) => {
      const p = acc
        .then(() => {
          if (abortSignal?.aborted) return
          serv.abortSignal.throwIfAborted()
          for (let k = 1; k <= CHUNK_PREFETCH; k++) request(i + k)
          const col = request(i)
          ahead.delete(i)
          return col
        })
        .then((column) => {
          if (!column || abortSignal?.aborted) return
          return player.sendChunk(chunkX, chunkZ, column)
        })
      return group ? p.then(() => sleep(5)) : p
    }, Promise.resolve())
  }

  function sleep (ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  player.sendMap = () => {
    return player.sendNearbyChunks(settings['view-distance'])
      .catch((err) => setTimeout(() => { throw err }))
  }

  player.sendRestMap = () => {
    player.sendingChunks = true
    player.sendingChunksAbortController?.abort()
    player.sendingChunksAbortController = new AbortController()
    player.sendNearbyChunks(Math.min(player.view, settings['max-view-distance'] ?? player.view), true, player.sendingChunksAbortController.signal)
      .then(() => { player.sendingChunks = false })
      .catch((err) => setTimeout(() => { throw err }))
  }

  player.sendSpawnPosition = () => {
    player._client.write('spawn_position', {
      location: player.spawnPoint,
      angle: 0,
    })
  }

  player._unloadAllChunks = () => {
    Object.keys(player.loadedChunks)
      .map((key) => key.split(',').map(a => parseInt(a)))
      .forEach(([x, z]) => player._unloadChunk(x, z))
  }

  player.changeWorld = async (world, opt) => {
    if (player.world === world && !opt?.force) return Promise.resolve()
    opt = opt || {}
    player.world = world
    player._unloadAllChunks()
    if (typeof opt.gamemode !== 'undefined') {
      if (opt.gamemode !== player.gameMode) player.prevGameMode = player.gameMode
      player.gameMode = opt.gamemode
    }
    player._client.write('respawn', {
      previousGameMode: player.prevGameMode,
      dimension: serv.supportFeature('dimensionIsAString') ? serv.dimensionNames[opt.dimension || 0] : serv.supportFeature('dimensionIsAnInt') ? opt.dimension || 0 : dimensionNbt(opt.dimension || 0),
      // custom worlds get their own level identifier so the client rebuilds its level even when the dimension type is the same
      worldName: ['overworld', 'nether', 'end'].includes(world.worldName) || !world.worldName ? serv.dimensionNames[opt.dimension || 0] : `flyingsquid:${world.worldName.toLowerCase()}`,
      difficulty: opt.difficulty || serv.difficulty,
      hashedSeed: serv.hashedSeed,
      gamemode: opt.gamemode || player.gameMode,
      levelType: 'default',
      isDebug: false,
      isFlat: false,
      copyMetadata: true
    })
    await player.findSpawnPoint()
    player.position = opt.position ?? player.spawnPoint
    player.sendSpawnPosition()
    player.updateAndSpawn()

    await player.sendMap()

    player.sendSelfPosition(false)
    player.emit('change_world')

    await player.waitPlayerLogin()
    player.sendRestMap()
  }
}

export type WorldEnvironment = 'normal' | 'nether' | 'end'

export interface WorldSpec {
  name: string
  /** client dimension type of the world (default normal) */
  environment?: WorldEnvironment
  /** generator name (see generations.js; default: the server generator, nether/end variants for noise) */
  generator?: string
  seed?: number | bigint | string
  /** noise generator overworld preset: default | amplified | large_biomes | caves | floating_islands */
  preset?: string
  /** noise generator custom dimension: built-in recipe name (`mining` | `islands` | `chaos`), `{ builtin, options }`, `{ script, options }` or a recipe object (see docs/worlds.md) */
  recipe?: string | Record<string, any>
  /** extra generator options */
  options?: Record<string, any>
}

export interface CustomWorld extends World {
  /** releases the chunk generator (worker side caches) */
  disposeGenerator?: () => Promise<void>
  blockEntityData: Record<string, any>
  portals: any[]
  seed: number | bigint
  generatorName: string
  environment: WorldEnvironment
  /** dimension id used in respawn packets: -1 nether, 0 overworld, 1 end */
  dimensionId: number
  worldName: string
}

export const usedServerPathsV1 = [
  'region',
  'level.dat',
  'playerdata',
  'Warp files',
  'icon.png'
]

declare global {
  interface Options {
    /** Extra worlds created at startup (also creatable with `/mv create`): `{ name, environment: 'normal' | 'nether' | 'end', generator?, seed?, preset? }` */
    worlds?: WorldSpec[]
    /**
     * @default false
     * Whether to broadcast a message when the server saves.
     */
    broadcastSaves?: boolean
  }

  interface Server {
    /** removes the saved chunks of an extra world (the world must not be loaded) */
    deleteWorldData: (name: string) => void
    /** @internal */
    looseProtocolMode: any
    /** @internal */
    lastPositionChunkUpdated: Vec3
    /** Global spawn and respawn point for every player */
    spawnPoint?: Vec3
    /** Parsed level.dat of the loaded world (only if worldFolder is specificed) */
    levelData?: Partial<LevelDatFull>
    worlds: Record<string, CustomWorld>
    /** Contains the overworld world. This is where the default spawn point is */
    "overworld": CustomWorld
    /** Contains the nether world. This **WILL** be used when a player travels through a portal if they are in the overworld! */
    "netherworld": CustomWorld
    /** The End world (dimension id 1) */
    "endworld": CustomWorld
    /** Spec each registered world was created from (name -> spec) */
    worldSpecs: Record<string, WorldSpec>
    /** Creates, registers and returns a new world (Multiverse-style: any number of worlds, each with an environment and a generator) */
    createWorld: (spec: WorldSpec) => CustomWorld
    /** Unregisters a world (players inside are moved to the overworld); core worlds cannot be removed */
    removeWorld: (name: string) => Promise<void>
    /** @internal */
    "dimensionNames": { '-1': string; 0: string; 1: string }
    /** @internal */
    "pregenWorld": (world: CustomWorld, size?: number) => Promise<Chunk[]>
    /** Saves block in world and sends block update to all players of the same world. */
    "setBlock": (world: CustomWorld, position: Vec3, stateId: number) => Promise<void>
    /** @internal */
    "setBlockType": (world: CustomWorld, position: Vec3, id: number) => Promise<void>
    /** Sends a block action to all players of the same world. */
    "setBlockAction": (world: CustomWorld, position: Vec3, actionId: number, actionParam: any) => Promise<void>
    /** @internal */
    "chunksUsed": {}
    /** @internal */
    "_finishPlayerChunkLoading": (chunkX: number, chunkZ: number, player: Player) => void
    /** @internal */
    "_unloadPlayerChunk": (chunkX: number, chunkZ: number, player: Player) => boolean
    /** @internal */
    "savePlayersSingleplayer": () => Promise<void>,
    /** Alias to serv.overworld.seed (64-bit; bigint for seeds past 2^53) */
    seed: number | bigint,
    writeLevelDat: () => Promise<void>

    /* For plugins accessing the original generator, returns chunk */
    "overworldOriginalGenerator": (chunkX: number, chunkZ: number) => any
    "overworldGeneratorOverride"?: (chunkX: number, chunkZ: number, generationOptions: any) => any
  }
  interface Player {
    /** @internal */
    lastPositionChunkUpdated: Vec3
    /** @internal */
    sendingChunks: boolean
    sendingChunksAbortController?: AbortController
    /** @internal */
    world: CustomWorld
    /** @internal */
    'flying': number
    /** If `worldFolder` option is set, save player's data into `<worldFolder>/playerdata/<UUID>.dat`. Returns promise.
     * Example: save all players data to disk:
     *
     * ```js
     * for (const player of serv.players) {
     *   player.save()
     * }
     * ```
     */
    'save': () => Promise<any>
    /** @internal */
    "_unloadChunk": (chunkX: any, chunkZ: any) => void
    "sendChunk": (chunkX: number, chunkZ: number, column: any) => Promise<void>
    /** @internal */
    "sendNearbyChunks": (viewDistance: any, group?, abortSignal?: AbortSignal) => Promise<any>
    /** @internal */
    "sendMap": () => any
    /** @internal */
    "sendRestMap": () => void
    /** @internal */
    "sendSpawnPosition": () => void
    /** @internal */
    '_unloadAllChunks': () => void
    /** The world object which the player is in (use serv.overworld, serv.netherworld, serv.endworld, or a custom world). Options:
     *
     * - gamemode: Gamemode of the world (Default is player gamemode)
     * - difficulty: Difficulty of world. Default is 0 (easiest)
     * - dimension: Dimension of world. 0 is Overworld, -1 is Nether, 1 is End (Default is 0)
     */
    'changeWorld': (world: any, opt: any) => Promise<void>
  }

  interface PlayerBehaviorInputMap {
    'sendChunk': {
      _input: {
        x: number
        z: number
        chunk: Chunk
      }
    }
  }
}
