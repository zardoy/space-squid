import { Vec3 } from 'vec3'
import type { Item } from 'prismarine-item'
import { GameData } from './gameData'
import { fillContainer, LootEnv, LootStack } from './loot'
import { getRenamedData } from '../../blockRenames'

/** names of the block entity of each container block (flattened id, pre-1.11 id) */
const LEGACY_IDS: Record<string, string> = { chest: 'Chest', trapped_chest: 'Chest', ender_chest: 'EnderChest', hopper: 'Hopper', dispenser: 'Trap', dropper: 'Dropper', furnace: 'Furnace', shulker_box: 'ShulkerBox' }

const str = (value: string) => ({ type: 'string', value })
const int = (value: number) => ({ type: 'int', value })

const skipMc = (id: string) => id.replace(/^minecraft:/, '')

/** `[hi, lo]` / bigint / number NBT long as a bigint */
export function longToBigint (v: any): bigint {
  if (Array.isArray(v)) return (BigInt(v[0]) << 32n) | BigInt(v[1] >>> 0)
  return BigInt(v ?? 0)
}

export interface ContainerStore {
  gameData: GameData
  keyOf (pos: { x: number, y: number, z: number }): string
  /** the block entity (field map) of a position, created when `create` (block name) is given */
  entityAt (world: any, pos: Vec3, create?: string): Promise<any | undefined>
  removeEntity (world: any, pos: Vec3): Promise<any | undefined>
  readSlots (entity: any, size: number): Array<Item | null>
  writeSlots (entity: any, slots: Array<Item | null>): void
  itemToNbt (item: Item, slot: number): any
  itemFromNbt (nbtItem: any): Item | null
  stackToItem (stack: LootStack): Item | undefined
  /** replaces a `LootTable` of the block entity by the generated items; returns false when there is no table or it is unknown */
  unpackLoot (world: any, pos: Vec3, size: number): Promise<boolean>
  /** puts a loot table (and optionally its seed) into a container, the items are generated when it is opened or broken */
  setLootTable (world: any, pos: Vec3, blockName: string, table: string, seed?: bigint): Promise<void>
  /** the slots of a container block entity as a list of items (unpacks loot first) */
  itemsOf (world: any, pos: Vec3, size: number): Promise<Array<Item | null>>
  /** items fall out of a container block at `pos` (set by the containers module) */
  dropStacks?: (world: any, pos: Vec3, items: Array<Item | null>) => void
  setSlot (world: any, pos: Vec3, blockName: string, size: number, slot: number, item: Item | null): Promise<void>
}

export function createContainerStore (serv: Server, options: Options): ContainerStore {
  const mcData = serv.mcData
  const ItemClass = serv.PrismarineItem
  const flat = serv.supportFeature('theFlattening')
  const withComponents = serv.supportFeature('itemsWithComponents')
  const version = options.version

  const gameData = new GameData({ gameDataJars: (options as any).gameDataJars, worldFolder: options.worldFolder, lootTables: (options as any).lootTables, version }, undefined)

  const keyOf = (pos: { x: number, y: number, z: number }) => `${pos.x},${pos.y},${pos.z}`
  const renameItem = (name: string): string => {
    try { return flat ? (getRenamedData('items', name, '26.3', version) as string) ?? name : name } catch { return name }
  }
  const itemDef = (name: string) => mcData.itemsByName[name] ?? mcData.itemsByName[renameItem(name)] ?? (mcData.blocksByName[name] && mcData.itemsByName[mcData.blocksByName[name].name])

  const env: LootEnv = {
    getTable: id => gameData.lootTable(id),
    itemInfo: name => { const d = itemDef(name); return d ? { stackSize: d.stackSize ?? 64, maxDurability: (d as any).maxDurability } : undefined },
    enchantments: ((mcData as any).enchantmentsArray ?? []).map((e: any) => ({ name: e.name, maxLevel: e.maxLevel, weight: e.weight, minCost: e.minCost, maxCost: e.maxCost, category: e.category, exclude: e.exclude })),
    getItemTag: id => gameData.itemTag(id)
  }

  const store: ContainerStore = {
    gameData,
    keyOf,

    async entityAt (world, pos, create) {
      const column: any = await world.getColumnAt(pos)
      if (!column) return undefined
      column.blockEntities ??= {}
      const key = keyOf(pos)
      let entity = column.blockEntities[key]
      if (!entity && create) {
        entity = column.blockEntities[key] = {
          id: str(flat ? `minecraft:${create}` : LEGACY_IDS[create] ?? create),
          x: int(pos.x),
          y: int(pos.y),
          z: int(pos.z),
          Items: { type: 'list', value: { type: 'end', value: [] } }
        }
        world.saveAt?.(pos)
      }
      return entity
    },

    async removeEntity (world, pos) {
      const column: any = await world.getColumnAt(pos)
      const key = keyOf(pos)
      const entity = column?.blockEntities?.[key]
      if (entity) {
        delete column.blockEntities[key]
        world.saveAt?.(pos)
      }
      return entity
    },

    itemToNbt (item, slot) {
      const out: any = { Slot: { type: 'byte', value: slot }, id: str(`minecraft:${item.name}`) }
      if (withComponents) out.count = int(item.count)
      else out.Count = { type: 'byte', value: item.count }
      if (!flat) out.Damage = { type: 'short', value: item.metadata ?? 0 }
      else if (!withComponents && item.nbt && Object.keys((item.nbt as any).value ?? {}).length) out.tag = item.nbt
      return out
    },

    itemFromNbt (nbtItem) {
      const name = skipMc(String(nbtItem?.id?.value ?? ''))
      const def = mcData.itemsByName[name] ?? mcData.blocksByName[name]
      if (!def) return null
      const count = (nbtItem.Count ?? nbtItem.count)?.value ?? 1
      if (!flat) return new ItemClass(def.id, count, nbtItem.Damage?.value ?? 0)
      const tag = nbtItem.tag
      if (tag && !tag.name) tag.name = ''
      return withComponents || !tag ? new ItemClass(def.id, count) : new ItemClass(def.id, count, 0, tag)
    },

    readSlots (entity, size) {
      const slots: Array<Item | null> = new Array(size).fill(null)
      for (const nbtItem of entity?.Items?.value?.value ?? []) {
        const slot = nbtItem.Slot?.value
        if (typeof slot !== 'number' || slot < 0 || slot >= size) continue
        slots[slot] = store.itemFromNbt(nbtItem)
      }
      return slots
    },

    writeSlots (entity, slots) {
      const items = slots.flatMap((item, slot) => item ? [store.itemToNbt(item, slot)] : [])
      entity.Items = items.length ? { type: 'list', value: { type: 'compound', value: items } } : { type: 'list', value: { type: 'end', value: [] } }
    },

    stackToItem (s) {
      let name = s.name
      if (name === 'book' && s.enchantments?.length) name = 'enchanted_book'
      const def = itemDef(name)
      if (!def) return undefined
      if (!flat) return new ItemClass(def.id, s.count, s.damage ?? 0)
      if (withComponents) return new ItemClass(def.id, s.count)
      const value: any = {}
      if (s.damage !== undefined) value.Damage = int(s.damage)
      const known = (s.enchantments ?? []).filter(([n]) => (mcData as any).enchantmentsByName?.[n])
      if (known.length) {
        value[name === 'enchanted_book' ? 'StoredEnchantments' : 'Enchantments'] = {
          type: 'list',
          value: { type: 'compound', value: known.map(([n, lvl]) => ({ id: str(`minecraft:${n}`), lvl: { type: 'short', value: lvl } })) }
        }
      }
      if (s.potion) value.Potion = str(`minecraft:${s.potion}`)
      if (s.customName) value.display = { type: 'compound', value: { Name: str(JSON.stringify({ translate: s.customName })) } }
      return new ItemClass(def.id, s.count, 0, Object.keys(value).length ? { type: 'compound', name: '', value } as any : undefined)
    },

    async unpackLoot (world, pos, size) {
      const entity = await store.entityAt(world, pos)
      const tableId = entity?.LootTable?.value
      if (!tableId) return false
      await gameData.ready
      const table = gameData.lootTable(String(tableId))
      if (!table) return false
      const seed = entity.LootTableSeed ? longToBigint(entity.LootTableSeed.value) : undefined
      const existing = store.readSlots(entity, size)
      const free = existing.flatMap((it, i) => it ? [] : [i])
      const slots = existing
      for (const [slot, stack] of fillContainer(table, size, seed, env, free)) {
        const item = store.stackToItem(stack)
        if (item) slots[slot] = item
      }
      store.writeSlots(entity, slots)
      delete entity.LootTable
      delete entity.LootTableSeed
      world.saveAt?.(pos)
      return true
    },

    async setLootTable (world, pos, blockName, table, seed) {
      const entity = (await store.entityAt(world, pos, blockName))!
      entity.LootTable = str(table.includes(':') ? table : `minecraft:${table}`)
      if (seed) entity.LootTableSeed = { type: 'long', value: [Number(BigInt.asIntN(32, seed >> 32n)), Number(BigInt.asIntN(32, seed))] }
      else delete entity.LootTableSeed
      world.saveAt?.(pos)
    },

    async itemsOf (world, pos, size) {
      await store.unpackLoot(world, pos, size)
      const entity = await store.entityAt(world, pos)
      return entity ? store.readSlots(entity, size) : new Array(size).fill(null)
    },

    async setSlot (world, pos, blockName, size, slot, item) {
      const entity = (await store.entityAt(world, pos, blockName))!
      // edited in the raw list: items of this version the server does not know stay untouched
      const raw: any[] = (entity.Items?.value?.value ?? []).filter((n: any) => n.Slot?.value !== slot)
      if (item) raw.push(store.itemToNbt(item, slot))
      raw.sort((a, b) => a.Slot.value - b.Slot.value)
      entity.Items = raw.length ? { type: 'list', value: { type: 'compound', value: raw } } : { type: 'list', value: { type: 'end', value: [] } }
      world.saveAt?.(pos)
    }
  }
  return store
}

export type { LootStack }
