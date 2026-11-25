/**
 * Loot table evaluation for containers (chests, barrels, ...): the part of vanilla's `LootTable.fill` that matters for a chest:
 * pools -> weighted entries -> item functions (set_count, set_damage, enchant_*, set_potion, ...) -> stacks split / shuffled into the free slots.
 *
 * Both datapack formats are read: 1.20.x (`functions`, `conditions`, `function`) and 1.21.x+ (`modifier`, `condition`, `type`).
 * The random source is java.util.Random (as `LegacyRandomSource` in vanilla), seeded with the `LootTableSeed` of the container, so the same seed gives the same loot.
 */

/** java.util.Random (48-bit LCG) */
export class JavaRandom {
  private seed: bigint
  private static readonly MASK = (1n << 48n) - 1n
  constructor (seed: bigint | number = BigInt(Date.now()) ^ BigInt(Math.floor(Math.random() * 2 ** 32))) {
    this.seed = (BigInt(seed) ^ 0x5DEECE66Dn) & JavaRandom.MASK
  }

  private next (bits: number): number {
    this.seed = (this.seed * 0x5DEECE66Dn + 0xBn) & JavaRandom.MASK
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)))
  }

  nextInt (bound?: number): number {
    if (bound === undefined) return this.next(32)
    if (bound <= 0) throw new Error('bound must be positive')
    if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n)
    let bits: number; let val: number
    do {
      bits = this.next(31)
      val = bits % bound
    } while (bits - val + (bound - 1) > 0x7FFFFFFF)
    return val
  }

  nextBoolean (): boolean { return this.next(1) !== 0 }
  nextFloat (): number { return this.next(24) / (1 << 24) }
  nextLong (): bigint { return BigInt.asIntN(64, (BigInt(this.next(32)) << 32n) + BigInt(this.next(32))) }
  /** `Mth.nextInt(random, min, max)` */
  intBetween (min: number, maxInclusive: number): number { return min >= maxInclusive ? min : this.nextInt(maxInclusive - min + 1) + min }
}

/** an item stack before it is turned into a prismarine item */
export interface LootStack {
  /** item name without namespace */
  name: string
  count: number
  damage?: number
  /** [enchantment name, level] */
  enchantments?: Array<[string, number]>
  potion?: string
  customName?: string
}

export interface LootEnchantment { name: string, maxLevel: number, weight: number, minCost: { a: number, b: number }, maxCost: { a: number, b: number }, category?: string, exclude?: string[] }

export interface LootEnv {
  /** parsed loot table json by id (`minecraft:chests/simple_dungeon`) */
  getTable: (id: string) => any | undefined
  /** max stack size / durability of an item, undefined when the item does not exist in the running version (the stack is dropped) */
  itemInfo: (name: string) => { stackSize: number, maxDurability?: number } | undefined
  enchantments?: LootEnchantment[]
  /** names of the items of an item tag (`#minecraft:foo`) */
  getItemTag?: (id: string) => string[]
}

const strip = (id: string) => id.replace(/^minecraft:/, '')
const typeOf = (o: any): string => strip(String(o?.type ?? o?.function ?? o?.condition ?? ''))
const asList = <T>(v: T | T[] | undefined): T[] => v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]

/** number provider: a constant, `{min,max}`, `{type: uniform|binomial|constant}` */
function number (p: any, rnd: JavaRandom, integer = false): number {
  if (typeof p === 'number') return p
  if (p === undefined || p === null) return 0
  const t = typeOf(p)
  if (t === 'constant') return p.value
  if (t === 'binomial') {
    let n = 0
    for (let i = 0; i < number(p.n, rnd, true); i++) if (rnd.nextFloat() < number(p.p, rnd)) n++
    return n
  }
  // uniform (also the untyped {min, max} form)
  const min = number(p.min, rnd); const max = number(p.max, rnd)
  if (integer || (Number.isInteger(min) && Number.isInteger(max) && t !== 'uniform_float')) return rnd.intBetween(Math.floor(min), Math.floor(max))
  return rnd.nextFloat() * (max - min) + min
}

function conditionHolds (c: any, rnd: JavaRandom): boolean {
  switch (typeOf(c)) {
    case 'random_chance': return rnd.nextFloat() < number(c.chance, rnd)
    case 'inverted': return typeOf(c.term) === 'random_chance' ? !conditionHolds(c.term, rnd) : true
    case 'all_of': return asList(c.terms).every(t => conditionHolds(t, rnd))
    case 'any_of': return asList(c.terms).some(t => conditionHolds(t, rnd))
    case 'killed_by_player': case 'entity_properties': case 'damage_source_properties': case 'match_tool': case 'block_state_property': return false
    default: return true // location_check, table_bonus, ... need a world context a chest does not have
  }
}
const holds = (o: any, rnd: JavaRandom) => [...asList(o.conditions), ...asList(o.condition)].every(c => conditionHolds(c, rnd))

/** the item categories an enchantment applies to (names of `minecraft-data` enchantment `category`) */
export function categoriesOf (name: string): string[] {
  const out: string[] = []
  if (/_helmet$|^turtle_helmet$/.test(name)) out.push('armor_head', 'armor', 'wearable')
  else if (/_chestplate$/.test(name)) out.push('armor_chest', 'armor_torso', 'armor', 'wearable')
  else if (/_leggings$/.test(name)) out.push('armor_legs', 'armor', 'wearable')
  else if (/_boots$/.test(name)) out.push('armor_feet', 'armor', 'wearable')
  else if (/_sword$|_axe$|_spear$/.test(name)) out.push('weapon')
  if (/_(pickaxe|shovel|hoe|axe)$/.test(name)) out.push('digger')
  if (name === 'bow') out.push('bow')
  if (name === 'crossbow') out.push('crossbow')
  if (name === 'trident') out.push('trident')
  if (name === 'fishing_rod') out.push('fishing_rod')
  if (name === 'elytra' || name === 'shears' || name === 'flint_and_steel' || name === 'shield' || name === 'carrot_on_a_stick' || name === 'mace' || name === 'brush') out.push('breakable')
  if (out.some(c => ['weapon', 'digger', 'armor', 'bow', 'crossbow', 'trident', 'fishing_rod'].includes(c))) out.push('breakable', 'vanishable')
  return out
}

/** the enchantment a random level gets: `Mth.nextInt` over the cost ranges like `EnchantmentHelper.getAvailableEnchantmentResults` */
function enchantWithLevels (stack: LootStack, levels: number, rnd: JavaRandom, env: LootEnv, allowedNames?: Set<string>) {
  const all = env.enchantments ?? []
  const isBook = stack.name === 'book' || stack.name === 'enchanted_book'
  const cats = categoriesOf(stack.name)
  const applicable = all.filter(e => (isBook || (cats.length > 0 && (!e.category || cats.includes(e.category)))) && (!allowedNames || allowedNames.has(e.name)))
  if (!applicable.length) return
  // enchantability ~ 10 (iron), as the loot function uses the item's enchantability: level + 1 + rand(enchantability/4+1) + rand(enchantability/4+1), +-15 %
  const enchantability = 10
  let level = levels + 1 + rnd.nextInt(Math.floor(enchantability / 4) + 1) + rnd.nextInt(Math.floor(enchantability / 4) + 1)
  const bonus = (rnd.nextFloat() + rnd.nextFloat() - 1) * 0.15
  level = Math.max(1, Math.round(level + level * bonus))
  let pool = applicable.filter(e => {
    for (let l = e.maxLevel; l >= 1; l--) if (level >= e.minCost.a * l + e.minCost.b && level <= e.maxCost.a * l + e.maxCost.b) return true
    return false
  })
  const chosen: Array<[string, number]> = []
  while (pool.length) {
    const total = pool.reduce((a, e) => a + (e.weight || 1), 0)
    let r = rnd.nextInt(total)
    const pick = pool.find(e => (r -= (e.weight || 1)) < 0) ?? pool[0]
    let lvl = 1
    for (let l = pick.maxLevel; l >= 1; l--) if (level >= pick.minCost.a * l + pick.minCost.b && level <= pick.maxCost.a * l + pick.maxCost.b) { lvl = l; break }
    chosen.push([pick.name, lvl])
    if (rnd.nextInt(50) <= level) {
      level = Math.floor(level / 2)
      pool = pool.filter(e => e !== pick && !(pick.exclude ?? []).includes(e.name) && !(e.exclude ?? []).includes(pick.name) && level >= e.minCost.b)
    } else break
  }
  stack.enchantments = [...(stack.enchantments ?? []), ...chosen]
}

function applyFunction (fn: any, stack: LootStack, rnd: JavaRandom, env: LootEnv): LootStack | undefined {
  if (!holds(fn, rnd)) return stack
  switch (typeOf(fn)) {
    case 'set_count': {
      const n = Math.floor(number(fn.count, rnd))
      stack.count = fn.add ? stack.count + n : n
      break
    }
    case 'limit_count': {
      const lim = fn.limit
      const [min, max] = typeof lim === 'number' ? [lim, lim] : [lim?.min ?? -Infinity, lim?.max ?? Infinity]
      stack.count = Math.max(min, Math.min(max, stack.count))
      break
    }
    case 'set_damage': {
      const max = env.itemInfo(stack.name)?.maxDurability
      if (max) stack.damage = Math.floor(max * (1 - Math.max(0, Math.min(1, number(fn.damage, rnd)))))
      break
    }
    case 'enchant_with_levels': {
      const allowed = typeof fn.options === 'string' && fn.options.startsWith('#') ? undefined : asList<string>(fn.options).map(strip)
      enchantWithLevels(stack, number(fn.levels, rnd, true), rnd, env, allowed?.length ? new Set(allowed) : undefined)
      break
    }
    case 'enchant_randomly': {
      const names = Array.isArray(fn.options) ? fn.options.map(strip) : typeof fn.options === 'string' && !fn.options.startsWith('#') ? [strip(fn.options)] : undefined
      const cats = categoriesOf(stack.name)
      const isBook = stack.name === 'book' || stack.name === 'enchanted_book'
      const all = (env.enchantments ?? []).filter(e => (!names || names.includes(e.name)) && (isBook || fn.only_compatible === false || (cats.length > 0 && (!e.category || cats.includes(e.category)))))
      if (all.length) {
        const pick = all[rnd.nextInt(all.length)]
        stack.enchantments = [...(stack.enchantments ?? []), [pick.name, rnd.intBetween(1, pick.maxLevel)]]
      }
      break
    }
    case 'set_enchantments': {
      const entries = Object.entries<any>(fn.enchantments ?? {})
      stack.enchantments = [...(fn.add ? stack.enchantments ?? [] : []), ...entries.map(([n, l]) => [strip(n), Math.floor(number(l, rnd, true))] as [string, number])]
      break
    }
    case 'set_potion': stack.potion = strip(String(fn.id)); break
    case 'set_name': {
      const n = fn.name
      stack.customName = typeof n === 'string' ? n : n?.translate ?? n?.text
      break
    }
    case 'filtered': {
      // item filters (e.g. "has a map id") need components the server does not build: the wrapped modifier is applied as it is
      for (const f of asList(fn.modifier ?? fn.functions)) { const r = applyFunction(f, stack, rnd, env); if (!r) return undefined }
      break
    }
    case 'sequence': {
      for (const f of asList(fn.functions ?? fn.modifiers)) { const r = applyFunction(f, stack, rnd, env); if (!r) return undefined }
      break
    }
    default: break // explosion_decay, furnace_smelt, set_stew_effect, exploration_map, set_components, ...: the plain item is kept
  }
  return stack
}

function applyFunctions (owner: any, stack: LootStack, rnd: JavaRandom, env: LootEnv): LootStack | undefined {
  let cur: LootStack | undefined = stack
  for (const fn of [...asList(owner.functions), ...asList(owner.modifier)]) {
    cur = applyFunction(fn, cur, rnd, env)
    if (!cur) return undefined
  }
  return cur
}

type Emit = (stack: LootStack) => void

/** returns whether the entry produced something (used by alternatives / sequence) */
function runEntry (entry: any, rnd: JavaRandom, env: LootEnv, emit: Emit, depth: number): boolean {
  if (!holds(entry, rnd)) return false
  switch (typeOf(entry)) {
    case 'item': {
      const name = strip(String(entry.name))
      const info = env.itemInfo(name)
      if (!info) return true // counts as chosen (consumed the roll) but the item does not exist in this version
      const stack = applyFunctions(entry, { name, count: 1 }, rnd, env)
      if (stack && stack.count > 0) emit(stack)
      return true
    }
    case 'tag': {
      const names = env.getItemTag?.(String(entry.name)) ?? []
      const expand = entry.expand === true
      if (!names.length) return true
      const list = expand ? [names[rnd.nextInt(names.length)]] : names
      for (const n of list) {
        const stack = applyFunctions(entry, { name: strip(n), count: 1 }, rnd, env)
        if (stack && env.itemInfo(stack.name) && stack.count > 0) emit(stack)
      }
      return true
    }
    case 'loot_table': {
      if (depth > 8) return true
      const ref = entry.value ?? entry.name
      const table = typeof ref === 'string' ? env.getTable(ref) : ref
      if (table) runTable(table, rnd, env, s => { const r = applyFunctions(entry, s, rnd, env); if (r) emit(r) }, depth + 1)
      return true
    }
    case 'alternatives': {
      for (const child of asList(entry.children)) if (runEntry(child, rnd, env, emit, depth)) return true
      return false
    }
    case 'sequence': {
      for (const child of asList(entry.children)) if (!runEntry(child, rnd, env, emit, depth)) return false
      return true
    }
    case 'group': {
      for (const child of asList(entry.children)) runEntry(child, rnd, env, emit, depth)
      return true
    }
    case 'empty': return true
    default: return true
  }
}

function runPool (pool: any, rnd: JavaRandom, env: LootEnv, emit: Emit, depth: number) {
  if (!holds(pool, rnd)) return
  const entries = asList<any>(pool.entries)
  const rolls = Math.floor(number(pool.rolls, rnd, true))
  const out: Emit = (s) => { const r = applyFunctions(pool, s, rnd, env); if (r) emit(r) }
  for (let i = 0; i < rolls; i++) {
    // weighted pick among the entries whose conditions hold (conditions of composite entries are checked when they run)
    const candidates = entries.filter(e => !(e.conditions || e.condition) || holds(e, rnd))
    const total = candidates.reduce((a, e) => a + (e.weight ?? 1), 0)
    if (total <= 0) continue
    if (candidates.length === 1) { runEntry({ ...candidates[0], conditions: undefined, condition: undefined }, rnd, env, out, depth); continue }
    let r = rnd.nextInt(total)
    const pick = candidates.find(e => (r -= (e.weight ?? 1)) < 0) ?? candidates[0]
    runEntry({ ...pick, conditions: undefined, condition: undefined }, rnd, env, out, depth)
  }
}

function runTable (table: any, rnd: JavaRandom, env: LootEnv, emit: Emit, depth = 0) {
  const out: Emit = (s) => { const r = applyFunctions(table, s, rnd, env); if (r) emit(r) }
  for (const pool of asList<any>(table.pools)) runPool(pool, rnd, env, out, depth)
}

/** `Collections.shuffle` with a java random */
export function shuffle<T> (list: T[], rnd: JavaRandom) {
  for (let i = list.length; i > 1; i--) {
    const j = rnd.nextInt(i);
    [list[i - 1], list[j]] = [list[j], list[i - 1]]
  }
}

/** `LootTable.shuffleAndSplitItems`: big stacks are split so a chest gets spread-out loot, then everything is shuffled */
function shuffleAndSplit (stacks: LootStack[], freeSlots: number, rnd: JavaRandom): LootStack[] {
  const items: LootStack[] = []
  const splittable: LootStack[] = []
  for (const s of stacks) {
    if (s.count <= 0) continue
    if (s.count > 1) splittable.push(s)
    else items.push(s)
  }
  while (freeSlots - items.length - splittable.length > 0 && splittable.length > 0) {
    const s = splittable.splice(rnd.nextInt(splittable.length), 1)[0]
    const n = rnd.intBetween(1, Math.floor(s.count / 2))
    const split: LootStack = { ...s, count: n, enchantments: s.enchantments?.map(e => [...e] as [string, number]) }
    s.count -= n
    if (s.count > 1 && rnd.nextBoolean()) splittable.push(s)
    else items.push(s)
    if (split.count > 1 && rnd.nextBoolean()) splittable.push(split)
    else items.push(split)
  }
  items.push(...splittable)
  shuffle(items, rnd)
  return items
}

/**
 * Evaluates a loot table into a container of `size` slots: returns `[slot, stack]` pairs for the slots in `freeSlots` (default: all).
 * The stack size of each item is respected (a rolled count over the stack size is split over more slots).
 */
export function fillContainer (table: any, size: number, seed: bigint | number | undefined, env: LootEnv, freeSlots?: number[]): Array<[number, LootStack]> {
  const rnd = seed ? new JavaRandom(seed) : new JavaRandom()
  const rolled: LootStack[] = []
  runTable(table, rnd, env, s => {
    // merge into an existing stack of the same item like `LootTable.getRandomItems` does (items over the stack size are cut to stack-size parts)
    const max = env.itemInfo(s.name)?.stackSize ?? 64
    let left = s.count
    while (left > 0) {
      const n = Math.min(left, max)
      rolled.push({ ...s, count: n })
      left -= n
    }
  })
  const slots = freeSlots ? [...freeSlots] : Array.from({ length: size }, (_, i) => i)
  shuffle(slots, rnd)
  const items = shuffleAndSplit(rolled, slots.length, rnd)
  const out: Array<[number, LootStack]> = []
  for (const item of items) {
    if (!slots.length) break
    out.push([slots.shift()!, item])
  }
  return out
}
