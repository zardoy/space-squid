import fs from 'fs'
import path from 'path'
import { DataRegistry, DEFAULT_VANILLA_JAR } from 'minecraft-worldgen/dist/data/registry'

/**
 * Vanilla game data the server needs at run time and `minecraft-data` does not have: loot tables and cooking recipes (smelting, blasting, smoking).
 * It reads the datapack layers like minecraft-worldgen does (a `DataRegistry`):
 *  1. the vanilla client jar (node: `MC_WORLDGEN_VANILLA_JAR` / `~/.cache/mc-worldgen/client.jar`, or `options.gameDataJars`),
 *  2. zip URL(s) of `globalThis.__MC_GAMEDATA_URL` (browser hosts; a string, a list or a function returning one; a JSON bundle of `data/minecraft/loot_table/chests/*` and the cooking
 *     `data/minecraft/recipe/*` files (`{ "<path>": json }`, about 10 KB gzipped) or a zip of them is enough, it is not the worldgen pack),
 *  3. datapack zips in `<worldFolder>/datapacks/`,
 *  4. `options.lootTables` (`{ 'minecraft:chests/foo': {...} }` or a function) which wins over everything.
 * Without any of them loot tables are unknown (chests with a `LootTable` stay as they are) and a built-in list of the vanilla cooking recipes is used.
 */

export interface CookingRecipe {
  kind: 'smelting' | 'blasting' | 'smoking' | 'campfire_cooking'
  /** item names without namespace, or `#tag` ids */
  ingredients: string[]
  result: string
  count: number
  /** ticks in a plain furnace (blast furnace / smoker take half) */
  time: number
  experience: number
}

const strip = (id: string) => id.replace(/^minecraft:/, '')

/** the vanilla smelting recipes when no datapack is available */
const BUILTIN_SMELTING: Array<[string[], string, number]> = [
  [['iron_ore', 'deepslate_iron_ore', 'raw_iron'], 'iron_ingot', 0.7], [['gold_ore', 'deepslate_gold_ore', 'raw_gold', 'nether_gold_ore'], 'gold_ingot', 1],
  [['copper_ore', 'deepslate_copper_ore', 'raw_copper'], 'copper_ingot', 0.7], [['ancient_debris'], 'netherite_scrap', 2],
  [['coal_ore', 'deepslate_coal_ore'], 'coal', 0.1], [['diamond_ore', 'deepslate_diamond_ore'], 'diamond', 1], [['emerald_ore', 'deepslate_emerald_ore'], 'emerald', 1],
  [['lapis_ore', 'deepslate_lapis_ore'], 'lapis_lazuli', 0.2], [['redstone_ore', 'deepslate_redstone_ore'], 'redstone', 0.7], [['nether_quartz_ore'], 'quartz', 1],
  [['sand', 'red_sand'], 'glass', 0.1], [['cobblestone'], 'stone', 0.1], [['stone'], 'smooth_stone', 0.1], [['cobbled_deepslate'], 'deepslate', 0.1], [['stone_bricks'], 'cracked_stone_bricks', 0.1],
  [['clay_ball'], 'brick', 0.3], [['clay'], 'terracotta', 0.35], [['netherrack'], 'nether_brick', 0.1], [['cactus'], 'green_dye', 1], [['kelp'], 'dried_kelp', 0.1],
  [['sandstone'], 'smooth_sandstone', 0.1], [['red_sandstone'], 'smooth_red_sandstone', 0.1], [['quartz_block'], 'smooth_quartz', 0.1], [['wet_sponge'], 'sponge', 0.15],
  [['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log', 'oak_wood', 'spruce_wood', 'birch_wood', 'jungle_wood', 'acacia_wood', 'dark_oak_wood', 'stripped_oak_log', 'stripped_spruce_log', 'stripped_birch_log', 'stripped_jungle_log', 'stripped_acacia_log', 'stripped_dark_oak_log'], 'charcoal', 0.15],
  [['beef'], 'cooked_beef', 0.35], [['porkchop'], 'cooked_porkchop', 0.35], [['chicken'], 'cooked_chicken', 0.35], [['mutton'], 'cooked_mutton', 0.35], [['rabbit'], 'cooked_rabbit', 0.35],
  [['cod'], 'cooked_cod', 0.35], [['salmon'], 'cooked_salmon', 0.35], [['potato'], 'baked_potato', 0.35], [['chorus_fruit'], 'popped_chorus_fruit', 0.1],
  [['white_terracotta'], 'white_glazed_terracotta', 0.1], [['iron_sword', 'iron_pickaxe', 'iron_axe', 'iron_shovel', 'iron_hoe', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'], 'iron_nugget', 0.1],
  [['gold_helmet', 'gold_chestplate', 'gold_leggings', 'gold_boots', 'golden_sword', 'golden_pickaxe', 'golden_axe', 'golden_shovel', 'golden_hoe'], 'gold_nugget', 0.1]
]

export class GameData {
  readonly registry = new DataRegistry({ jars: [] })
  private loaded = false
  get isLoaded () { return this.loaded }

  /** resolves when the datapack layers are read; `lootTable` / `recipes` work after that */
  readonly ready: Promise<void>
  private recipeCache?: CookingRecipe[]

  constructor (private readonly options: { gameDataJars?: string[], worldFolder?: string | false, lootTables?: Record<string, any> | ((id: string) => any), version: string }, private readonly renamed?: (kind: 'items', name: string) => string) {
    this.ready = this.load().catch(err => { console.warn('[gameData] could not read loot tables / recipes: ' + (err as Error).message) })
  }

  private async load () {
    const { options } = this
    for (const jar of options.gameDataJars ?? [DEFAULT_VANILLA_JAR]) {
      try {
        if (fs.existsSync(jar)) this.registry.addJar(jar)
      } catch {}
    }
    const g = globalThis as any
    let urls = g.__MC_GAMEDATA_URL
    if (typeof urls === 'function') urls = await urls()
    for (const url of Array.isArray(urls) ? urls : urls ? [urls] : []) {
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const bytes = new Uint8Array(await res.arrayBuffer())
        // a JSON bundle `{ "data/minecraft/loot_table/chests/x.json": {...}, ... }` (much smaller than a zip: the tables compress well together) or a datapack zip
        if (bytes[0] === 0x7B) this.registry.addVirtualFiles(`gamedata:${url}`.slice(0, 80), JSON.parse(new TextDecoder().decode(bytes)))
        else this.registry.addZipBuffer(`gamedata:${url}`.slice(0, 80), bytes)
      } catch {}
    }
    if (options.worldFolder) {
      try {
        const dir = path.join(options.worldFolder, 'datapacks')
        for (const f of (await fs.promises.readdir(dir) as string[]).filter(f => f.endsWith('.zip') || f.endsWith('.jar')).sort()) {
          this.registry.addZipBuffer(f, await fs.promises.readFile(path.join(dir, f)))
        }
      } catch {} // no datapacks folder
    }
    this.loaded = true
  }

  /** parsed loot table (`minecraft:chests/simple_dungeon`), undefined when unknown */
  lootTable (id: string): any | undefined {
    const { lootTables } = this.options
    const fromOptions = typeof lootTables === 'function' ? lootTables(id) : lootTables?.[id] ?? lootTables?.[strip(id)]
    if (fromOptions) return fromOptions
    if (!this.loaded) return undefined
    for (const dir of ['loot_table', 'loot_tables']) {
      try {
        if (this.registry.has(dir, id)) return this.registry.json(dir, id)
      } catch {}
    }
    return undefined
  }

  itemTag (id: string): string[] {
    try { return this.registry.tag('item', id.replace(/^#/, '')).map(strip) } catch { return [] }
  }

  /** all cooking recipes (datapack ones, else the built-in vanilla list) */
  recipes (): CookingRecipe[] {
    if (this.recipeCache) return this.recipeCache
    // before the datapack layers are read only the built-in list is known: do not cache it
    const cache = (list: CookingRecipe[]) => this.loaded ? (this.recipeCache = list) : list
    const out: CookingRecipe[] = []
    if (this.loaded) {
      for (const dir of ['recipe', 'recipes']) {
        for (const id of this.registry.list(dir)) {
          let r: any
          try { r = this.registry.json(dir, id) } catch { continue }
          const kind = strip(String(r?.type)) as CookingRecipe['kind']
          if (!['smelting', 'blasting', 'smoking', 'campfire_cooking'].includes(kind)) continue
          const ing = (v: any): string[] => typeof v === 'string' ? [v.startsWith('#') ? v : strip(v)] : Array.isArray(v) ? v.flatMap(ing) : v?.item ? [strip(v.item)] : v?.tag ? ['#' + v.tag] : []
          const result = typeof r.result === 'string' ? r.result : r.result?.id ?? r.result?.item
          if (!result) continue
          out.push({ kind, ingredients: ing(r.ingredient), result: strip(result), count: r.result?.count ?? 1, time: r.cookingtime ?? (kind === 'campfire_cooking' ? 600 : kind === 'smelting' ? 200 : 100), experience: r.experience ?? 0 })
        }
      }
      if (out.length) return cache(out)
    }
    for (const [ingredients, result, experience] of BUILTIN_SMELTING) {
      out.push({ kind: 'smelting', ingredients, result, count: 1, time: 200, experience })
      // blast furnaces cook ores and metal tools, smokers food, both in half the time
      if (/ingot$|nugget$|^(coal|diamond|emerald|lapis_lazuli|redstone|quartz|netherite_scrap)$/.test(result)) out.push({ kind: 'blasting', ingredients, result, count: 1, time: 100, experience })
      if (/^cooked_|^baked_potato$|^dried_kelp$/.test(result)) out.push({ kind: 'smoking', ingredients, result, count: 1, time: 100, experience })
    }
    return cache(out)
  }
}

/** burn time in ticks of a furnace fuel (vanilla `FuelValues`); 0 when the item is not a fuel */
export function fuelTicks (name: string): number {
  if (name === 'lava_bucket') return 20000
  if (name === 'coal_block') return 16000
  if (name === 'dried_kelp_block') return 4001
  if (name === 'blaze_rod') return 2400
  if (name === 'coal' || name === 'charcoal') return 1600
  if (name === 'bamboo' || name === 'scaffolding') return 50
  if (name === 'stick' || name === 'bowl' || /_sapling$|_button$|^wooden_(sword|pickaxe|axe|shovel|hoe)$/.test(name)) return /_button$/.test(name) && !/^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|bamboo|crimson|warped)_button$/.test(name) ? 0 : 100
  if (/_slab$/.test(name)) return /^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|bamboo|crimson|warped)_slab$/.test(name) ? 150 : 0
  if (/_(sign|hanging_sign|door|boat|chest_boat)$/.test(name)) return /^(iron|copper|[a-z]+_copper)_/.test(name) ? 0 : 200
  if (/_wool$|_carpet$/.test(name)) return 67
  if (/^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|crimson|warped|bamboo)_(planks|log|wood|stem|hyphae|fence|fence_gate|stairs|trapdoor|pressure_plate|mosaic|block)$|^stripped_.*_(log|wood|stem|hyphae|block)$/.test(name)) return 300
  if (/^(crafting_table|chest|trapped_chest|barrel|bookshelf|chiseled_bookshelf|lectern|loom|note_block|jukebox|daylight_detector|composter|cartography_table|fletching_table|smithing_table|bow|crossbow|fishing_rod|ladder|[a-z_]+_banner)$/.test(name)) return 300
  return 0
}
