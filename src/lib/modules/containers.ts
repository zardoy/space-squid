import { Vec3 } from 'vec3'
import type { Item } from 'prismarine-item'
import UserError from '../user_error'
import { createContainerStore, ContainerStore } from '../containers/store'

/**
 * Containers with real contents: chests (single and double), trapped chests, barrels, shulker boxes, hoppers, dispensers, droppers and the ender chest.
 *
 * The contents live in the block entity of the chunk column (`column.blockEntities['x,y,z'].Items`, vanilla format), so they are saved with the chunk by the
 * Anvil storage and a world made by vanilla Minecraft opens with its chests filled. A container that still has a `LootTable` (a chest of a vanilla world that
 * nobody opened, or a chest given a table with `/loot`) gets its loot generated when it is opened or broken, like in vanilla (`LootTableSeed` makes it repeatable).
 * Furnaces are in `smelting.ts` and use the same store.
 */

type Kind = 'chest' | 'barrel' | 'shulker_box' | 'hopper' | 'dispenser' | 'dropper' | 'ender_chest'

interface ContainerRef {
  kind: Kind
  world: any
  blockName: string
  /** block positions of the parts: 1, or 2 for a double chest (slots 0-26 are the first part) */
  parts: Vec3[]
  partSize: number
  size: number
  title: any
}

const HORIZONTAL: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }
const CLOCKWISE: Record<string, string> = { north: 'east', east: 'south', south: 'west', west: 'north' }
const COUNTER_CLOCKWISE = Object.fromEntries(Object.entries(CLOCKWISE).map(([a, b]) => [b, a]))

const kindOf = (name: string): Kind | undefined => {
  if (name === 'chest' || name === 'trapped_chest') return 'chest'
  if (name === 'ender_chest') return 'ender_chest'
  if (name === 'barrel' || name === 'hopper' || name === 'dispenser' || name === 'dropper') return name
  if (name === 'shulker_box' || name.endsWith('_shulker_box')) return 'shulker_box'
  return undefined
}
const SIZES: Record<Kind, number> = { chest: 27, ender_chest: 27, barrel: 27, shulker_box: 27, hopper: 5, dispenser: 9, dropper: 9 }

export const server = (serv: Server, options: Options) => {
  const store: ContainerStore = serv.containers = createContainerStore(serv, options)
  const mcData = serv.mcData
  const flat = serv.supportFeature('theFlattening')
  const newWindows = serv.supportFeature('village&pillageInventoryWindows')
  const PBlock = serv.PrismarineBlock

  /** viewers of every container part: `${world}:${x},${y},${z}` -> windows that show it */
  const viewers = new Map<string, Set<{ player: Player, window: any, refresh: (slot: number, item: Item | null) => void }>>()
  const viewKey = (world: any, pos: Vec3) => `${world.worldName ?? 'world'}:${store.keyOf(pos)}`

  // ----------------------------------------------------------------- what a block is
  const chestPartner = (props: Record<string, any>, pos: Vec3): Vec3 | undefined => {
    if (props.type !== 'left' && props.type !== 'right') return undefined
    const dir = props.type === 'left' ? CLOCKWISE[props.facing] : COUNTER_CLOCKWISE[props.facing]
    const [dx, dz] = HORIZONTAL[dir] ?? [0, 0]
    return pos.offset(dx, 0, dz)
  }

  async function describe (world: any, pos: Vec3): Promise<ContainerRef | undefined> {
    const block = await world.getBlock(pos)
    const kind = block && kindOf(block.name)
    if (!kind) return undefined
    const partSize = SIZES[kind]
    let parts = [pos.clone()]
    if (kind === 'chest') {
      if (flat) {
        const props = block.getProperties?.() ?? {}
        const partner = chestPartner(props, pos)
        if (partner) parts = props.type === 'left' ? [pos.clone(), partner] : [partner, pos.clone()]
      } else {
        // before 1.13 there is no chest type: a neighbour chest of the same block makes it double, the one with the lower coordinate is the first half
        for (const [dx, dz] of Object.values(HORIZONTAL)) {
          const n = pos.offset(dx, 0, dz)
          if ((await world.getBlock(n))?.type === block.type) {
            parts = n.x + n.z < pos.x + pos.z || (n.x + n.z === pos.x + pos.z && n.x < pos.x) ? [n, pos.clone()] : [pos.clone(), n]
            break
          }
        }
      }
    }
    const translate = kind === 'chest' ? (parts.length > 1 ? 'container.chestDouble' : 'container.chest')
      : kind === 'ender_chest' ? 'container.enderchest' : kind === 'shulker_box' ? 'container.shulkerBox' : `container.${kind}`
    return { kind, world, blockName: block.name, parts, partSize, size: partSize * parts.length, title: { translate } }
  }

  // ----------------------------------------------------------------- opening
  const windowTypeOf = (ref: ContainerRef): { inventoryType: any, slotCount?: number } => {
    if (newWindows) {
      if (ref.kind === 'shulker_box') return { inventoryType: 'minecraft:shulker_box' }
      if (ref.kind === 'hopper') return { inventoryType: 'minecraft:hopper' }
      if (ref.kind === 'dispenser' || ref.kind === 'dropper') return { inventoryType: 'minecraft:generic_3x3' }
      return { inventoryType: ref.size > 27 ? 'minecraft:generic_9x6' : 'minecraft:generic_9x3' }
    }
    if (ref.kind === 'shulker_box') return { inventoryType: 'minecraft:shulker_box' }
    if (ref.kind === 'hopper' || ref.kind === 'dispenser' || ref.kind === 'dropper') return { inventoryType: `minecraft:${ref.kind}` }
    return { inventoryType: 'minecraft:chest', slotCount: ref.size }
  }

  const playSound = (world: any, pos: Vec3, sound: string) => {
    try { serv.playSound(sound, world, pos.offset(0.5, 0.5, 0.5), {}) } catch {}
  }
  const soundGroup = (ref: ContainerRef) => ref.kind === 'shulker_box' ? 'block.shulker_box' : ref.kind === 'barrel' ? 'block.barrel' : ref.kind === 'ender_chest' ? 'block.ender_chest' : 'block.chest'
  /** lid animation (chests, shulker boxes) / open state (barrels) */
  const setOpen = async (ref: ContainerRef, count: number) => {
    for (const pos of ref.parts) {
      if (ref.kind === 'chest' || ref.kind === 'ender_chest' || ref.kind === 'shulker_box') {
        serv.setBlockAction(ref.world, pos, 1, count)
      } else if (ref.kind === 'barrel' && flat) {
        const block = await ref.world.getBlock(pos)
        if (block?.name === 'barrel' && String(block.getProperties().open) !== String(count > 0)) {
          await serv.setBlock(ref.world, pos, PBlock.fromProperties('barrel', { ...block.getProperties(), open: count > 0 }, 0).stateId)
        }
      }
    }
  }

  /**
   * Opens a window with the contents of a container for a player. `load` / `store` abstract where the slots live (block entity or the ender chest of the player).
   */
  async function showWindow (player: Player, ref: ContainerRef, items: Array<Item | null>, writeSlot: (slot: number, item: Item | null) => void, watch: string[]) {
    const { inventoryType, slotCount } = windowTypeOf(ref)
    const windowSlots: Record<number, Item> = {}
    items.forEach((item, i) => { if (item) windowSlots[i] = item })
    let applyingRemote = false
    const viewer: { player: Player, window: any, refresh: (slot: number, item: Item | null) => void } = { player, window: undefined, refresh: () => {} }
    const open = (key: string) => { (viewers.get(key) ?? viewers.set(key, new Set()).get(key)!).add(viewer) }
    const close = (key: string) => { viewers.get(key)?.delete(viewer); if (!viewers.get(key)?.size) viewers.delete(key) }
    const viewerCount = () => Math.max(...watch.map(k => viewers.get(k)?.size ?? 0), 0)

    const window = player.openCustomWindow({
      inventoryType,
      slotCount,
      title: ref.title,
      windowSlots,
      onSlotClick: (slot, _old, newItem) => {
        if (slot >= ref.size || applyingRemote) return
        writeSlot(slot, newItem)
        // the other players that look into the same container
        for (const k of watch) {
          for (const other of viewers.get(k) ?? []) if (other !== viewer) other.refresh(slot, newItem)
        }
      },
      onClose: () => finish()
    } as any)
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      watch.forEach(close)
      void setOpen(ref, viewerCount())
      playSound(ref.world, ref.parts[0], `${soundGroup(ref)}.close`)
    }
    player.once('disconnected', finish)
    viewer.window = window
    viewer.refresh = (slot, item) => {
      applyingRemote = true
      try { window.updateSlot(slot, item as any) } finally { applyingRemote = false }
      player.writePacket('set_slot', { windowId: player.windowId, stateId: 1, slot, item: serv.PrismarineItem.toNotch(item) })
    }
    watch.forEach(open)
    await setOpen(ref, viewerCount())
    playSound(ref.world, ref.parts[0], `${soundGroup(ref)}.open`)
    return window
  }

  async function openContainer (player: Player, world: any, pos: Vec3) {
    const ref = await describe(world, pos)
    if (!ref) return false
    // a block over a chest (solid, or any block for the ender chest) keeps it closed
    if (ref.kind === 'chest' || ref.kind === 'ender_chest') {
      for (const p of ref.parts) {
        const above = await world.getBlock(p.offset(0, 1, 0))
        if (above && above.boundingBox === 'block' && !/glass|slab|stairs|leaves|carpet|trapdoor/.test(above.name)) return true
      }
    }
    player.windowPos = pos
    player.windowType = ref.kind

    if (ref.kind === 'ender_chest') {
      const items = player.enderChest
      await showWindow(player, ref, items, (slot, item) => { player.enderChest[slot] = item }, [`ender:${player.uuid}`])
      return true
    }
    let items: Array<Item | null> = []
    for (const p of ref.parts) {
      try { items = items.concat(await store.itemsOf(world, p, ref.partSize)) } catch (e) { serv.warn(`container at ${p}: ${(e as Error).message}`); items = items.concat(new Array(ref.partSize).fill(null)) }
    }
    await showWindow(player, ref, items, (slot, item) => {
      const part = ref.parts[Math.floor(slot / ref.partSize)]
      void store.setSlot(world, part, ref.blockName, ref.partSize, slot % ref.partSize, item).catch(e => serv.warn(`container save failed: ${(e as Error).message}`))
    }, ref.parts.map(p => viewKey(world, p)))
    return true
  }
  serv.openContainer = openContainer

  // ----------------------------------------------------------------- breaking
  const dropStacks = (world: any, pos: Vec3, items: Array<Item | null>) => {
    const entityId = mcData.entitiesByName[mcData.version['<']('1.11') ? 'Item' : 'item']?.id
    if (entityId === undefined) return
    for (const item of items) {
      if (!item) continue
      serv.spawnObject(entityId, world, pos.offset(0.5, 0.5, 0.5), {
        velocity: new Vec3(Math.random() * 2 - 1, Math.random() * 2 + 1, Math.random() * 2 - 1),
        itemId: item.type,
        itemDamage: item.metadata,
        itemCount: item.count,
        pickupTime: 500,
        deathTime: 60 * 5 * 1000
      })
    }
  }

  store.dropStacks = dropStacks

  /** the container block at `pos` is gone: its items fall out (not in creative), the entity is removed, the other half of a double chest becomes single */
  async function containerBroken (world: any, pos: Vec3, blockName: string, props: Record<string, any>, drop: boolean) {
    const kind = kindOf(blockName)
    if (!kind || kind === 'ender_chest') return
    const size = SIZES[kind]
    const entity = await store.entityAt(world, pos)
    if (entity) {
      if (drop) dropStacks(world, pos, await store.itemsOf(world, pos, size))
      await store.removeEntity(world, pos)
    }
    const partner = chestPartner(props, pos)
    if (partner) {
      const other = await world.getBlock(partner)
      if (other?.name === blockName) await serv.setBlock(world, partner, PBlock.fromProperties(blockName, { ...other.getProperties(), type: 'single' }, 0).stateId)
    }
    // a closed lid for the viewers that still look into it
    for (const set of [viewers.get(viewKey(world, pos))]) for (const v of set ?? []) (v.window as any).close?.()
  }
  serv.containerBroken = containerBroken

  // ----------------------------------------------------------------- registration
  serv.once('asap', () => {
    const names = mcData.blocksArray.map(b => b.name).filter(n => kindOf(n))
    for (const name of names) {
      serv.onBlockInteraction(name, async ({ block, player }) => openContainer(player, player.world, block.position))
    }

    // placing: chests face the player and join a chest next to them into a double chest; every container starts empty (no entity of a former block left over)
    if (flat) {
      for (const name of names) {
        const block = mcData.blocksByName[name]
        serv.onItemPlace(name, async ({ player, placedPosition, properties }) => {
          void store.removeEntity(player.world, placedPosition)
          const base = PBlock.fromStateId(block.defaultState!, 0).getProperties() as Record<string, any>
          // the same rules as the default block placement: every property the placement knows (facing, ...) that the block has
          const props: Record<string, any> = { ...base }
          for (const k of Object.keys(properties)) if (k in base && k !== 'type' && k !== 'half') props[k] = properties[k]
          if (name === 'chest' || name === 'trapped_chest') {
            const facing = properties.facing as string
            props.facing = facing
            props.type = 'single'
            if (!player.crouching) {
              for (const [side, type, partnerType] of [[CLOCKWISE[facing], 'left', 'right'], [COUNTER_CLOCKWISE[facing], 'right', 'left']] as const) {
                const [dx, dz] = HORIZONTAL[side]
                const npos = placedPosition.offset(dx, 0, dz)
                const n = await player.world.getBlock(npos)
                if (n?.name === name && n.getProperties().facing === facing && n.getProperties().type === 'single') {
                  props.type = type
                  await serv.setBlock(player.world, npos, PBlock.fromProperties(name, { ...n.getProperties(), type: partnerType }, 0).stateId)
                  break
                }
              }
            }
          }
          const state = PBlock.fromProperties(block.name, props, 0).stateId
          return { id: block.id, data: state - block.minStateId! }
        }, false)
      }
    }

  })

  // ----------------------------------------------------------------- /loot
  serv.commands.add({
    base: 'loot',
    info: 'Puts a loot table into the container at a position (generated when it is opened)',
    usage: '/loot <x> <y> <z> <loot_table> [seed]   e.g. /loot ~ ~-1 ~ chests/simple_dungeon',
    op: true,
    parse (str, ctx) {
      const [x, y, z, table, seed] = str.trim().split(/\s+/)
      if (!table) return false
      const at = (v: string, c: number) => serv.posFromString(v, c)
      const p = ctx.player?.position
      return { pos: new Vec3(Math.floor(+at(x, p?.x ?? 0)), Math.floor(+at(y, p?.y ?? 0)), Math.floor(+at(z, p?.z ?? 0))), table, seed }
    },
    async action ({ pos, table, seed }, ctx) {
      const world = ctx.player?.world ?? serv.overworld
      const block = await world.getBlock(pos)
      const kind = kindOf(block.name)
      if (!kind || kind === 'ender_chest') throw new UserError(`No container at ${pos.x} ${pos.y} ${pos.z} (${block.name})`)
      const id = table.includes(':') ? table : `minecraft:${table}`
      await store.gameData.ready
      if (!store.gameData.lootTable(id)) throw new UserError(`Unknown loot table ${id}. Loot tables come from the vanilla client jar, datapacks in <world>/datapacks, __MC_GAMEDATA_URL or the lootTables option`)
      await store.setLootTable(world, pos, block.name, id, seed ? BigInt(seed) : undefined)
      return `${block.name} at ${pos.x} ${pos.y} ${pos.z} now holds ${id}`
    }
  })
}

export const player = (player: Player, serv: Server) => {
  const store = () => serv.containers
  /** the 27 slots of the ender chest of the player (saved in the player data as `EnderItems`) */
  player.enderChest = new Array(27).fill(null)
  player.enderChestToNbt = () => player.enderChest.flatMap((item, slot) => item ? [store().itemToNbt(item, slot)] : [])
  player.loadEnderChest = (nbtItems: any[]) => {
    player.enderChest = new Array(27).fill(null)
    for (const n of nbtItems ?? []) {
      const slot = n?.Slot?.value
      if (typeof slot === 'number' && slot >= 0 && slot < 27) player.enderChest[slot] = store().itemFromNbt(n)
    }
  }

  // items of a broken container fall out
  player.on('dug', ({ position, block }: any, cancelled: boolean) => {
    if (cancelled || !block) return
    const props = block.getProperties?.() ?? {}
    void serv.containerBroken(player.world, position, block.name, props, player.gameMode !== 1).catch((e: Error) => serv.warn(`container break: ${e.message}`))
  })
}

declare global {
  interface Server {
    /** contents of containers: the store of block entities, loot tables and recipes */
    containers: ContainerStore
    /** opens the container block at `pos` for the player (chest, barrel, shulker box, hopper, dispenser, dropper, ender chest); false when there is none */
    openContainer: (player: Player, world: any, pos: Vec3) => Promise<boolean>
    /** @internal */
    containerBroken: (world: any, pos: Vec3, blockName: string, props: Record<string, any>, drop: boolean) => Promise<void>
  }
  interface Player {
    /** the ender chest of the player (27 slots), saved with the player */
    enderChest: Array<Item | null>
    /** @internal */
    enderChestToNbt: () => any[]
    /** @internal */
    loadEnderChest: (nbtItems: any[]) => void
  }
  interface Options {
    /** zips / jars with `data/<ns>/loot_table` and `recipe` (default: the vanilla client jar of minecraft-worldgen, see GameData) */
    gameDataJars?: string[]
    /** loot tables given directly (`{ 'minecraft:chests/foo': {...} }` or a function) */
    lootTables?: Record<string, any> | ((id: string) => any)
  }
}
