import { Vec3 } from 'vec3'
import type { Item } from 'prismarine-item'
import { fuelTicks, CookingRecipe } from '../containers/gameData'
import { getRenamedData } from '../../blockRenames'

/**
 * Furnaces, blast furnaces and smokers: fuel burns, the input cooks into the output with the cooking recipes of the datapack (see `GameData`), the window shows the
 * progress, the stored experience goes to the player who takes the result. State is the vanilla block entity (`Items`, `BurnTime`, `CookTime`, `CookTimeTotal`), so
 * furnaces of a vanilla world keep working and a running furnace survives a restart. Furnaces cook only while their chunk is loaded (like vanilla).
 */

const KIND_OF: Record<string, CookingRecipe['kind']> = { furnace: 'smelting', lit_furnace: 'smelting', blast_furnace: 'blasting', smoker: 'smoking' }
const BASE_NAME = (name: string) => name.replace(/^lit_/, '')
/** the NBT of a vanilla furnace stores the numbers as shorts */
const short = (value: number) => ({ type: 'short', value })

interface FurnaceState {
  world: any
  pos: Vec3
  blockName: string
  kind: CookingRecipe['kind']
  slots: Array<Item | null>
  burnTime: number
  burnDuration: number
  cookTime: number
  cookTotal: number
  /** experience waiting for the player who takes the output */
  xp: number
  lit: boolean
  dirty: boolean
  /** a window slot is being updated by the server (its slot event is not a click) */
  syncing: boolean
  busy: boolean
  viewers: Set<Player>
  /** windows of the viewers, kept in step with `slots` */
  windows: Map<Player, any>
}

export const server = (serv: Server, options: Options) => {
  const mcData = serv.mcData
  const flat = serv.supportFeature('theFlattening')
  const newWindows = serv.supportFeature('village&pillageInventoryWindows')
  const PBlock = serv.PrismarineBlock
  const active = new Map<string, FurnaceState>()
  const stateKey = (world: any, pos: Vec3) => `${world.worldName ?? 'world'}:${pos.x},${pos.y},${pos.z}`

  const renameItem = (name: string): string => {
    try { return flat ? (getRenamedData('items', name, '26.3', options.version) as string) ?? name : name } catch { return name }
  }

  // ---------------------------------------------------------------- recipes
  let recipeIndex: Map<string, Map<number, CookingRecipe & { resultId: number }>> | undefined
  const recipesFor = (kind: CookingRecipe['kind']) => {
    if (!recipeIndex) {
      recipeIndex = new Map()
      const { gameData } = serv.containers
      for (const r of gameData.recipes()) {
        const result = mcData.itemsByName[r.result] ?? mcData.itemsByName[renameItem(r.result)]
        if (!result) continue
        let byItem = recipeIndex.get(r.kind)
        if (!byItem) recipeIndex.set(r.kind, byItem = new Map())
        const names = r.ingredients.flatMap(i => i.startsWith('#') ? gameData.itemTag(i.slice(1)) : [i])
        for (const n of names) {
          const item = mcData.itemsByName[n] ?? mcData.itemsByName[renameItem(n)]
          if (item && !byItem.has(item.id)) byItem.set(item.id, { ...r, resultId: result.id })
        }
      }
    }
    return recipeIndex.get(kind)
  }
  const recipeOf = (st: FurnaceState, item: Item | null) => item ? recipesFor(st.kind)?.get(item.type) : undefined
  const fuelOf = (item: Item | null) => item ? fuelTicks(item.name) : 0

  const canCook = (st: FurnaceState) => {
    const recipe = recipeOf(st, st.slots[0])
    if (!recipe) return undefined
    const out = st.slots[2]
    if (!out) return recipe
    const same = out.type === recipe.resultId && (out.metadata ?? 0) === 0 && !out.nbt
    return same && out.count + recipe.count <= (out.stackSize ?? 64) ? recipe : undefined
  }

  // ---------------------------------------------------------------- block entity <-> state
  async function loadState (world: any, pos: Vec3, blockName: string): Promise<FurnaceState> {
    const key = stateKey(world, pos)
    const existing = active.get(key)
    if (existing) return existing
    const { containers } = serv
    const entity = await containers.entityAt(world, pos)
    const num = (...names: string[]) => { for (const n of names) if (typeof entity?.[n]?.value === 'number') return entity[n].value as number; return 0 }
    const st: FurnaceState = {
      world, pos: pos.clone(), blockName: BASE_NAME(blockName), kind: KIND_OF[BASE_NAME(blockName)],
      slots: entity ? containers.readSlots(entity, 3) : [null, null, null],
      burnTime: num('BurnTime', 'lit_time_remaining'), burnDuration: num('lit_total_time') || 0,
      cookTime: num('CookTime', 'cooking_time_spent'), cookTotal: num('CookTimeTotal', 'cooking_total_time'),
      xp: typeof entity?.flyingsquidXp?.value === 'number' ? entity.flyingsquidXp.value : 0,
      lit: false, dirty: false, syncing: false, busy: false, viewers: new Set(), windows: new Map()
    }
    st.lit = st.burnTime > 0
    if (!st.burnDuration) st.burnDuration = st.burnTime
    active.set(key, st)
    return st
  }

  async function flush (st: FurnaceState) {
    if (!st.dirty) return
    st.dirty = false
    const entity = (await serv.containers.entityAt(st.world, st.pos, st.blockName))!
    serv.containers.writeSlots(entity, st.slots)
    entity.BurnTime = short(st.burnTime)
    entity.CookTime = short(st.cookTime)
    entity.CookTimeTotal = short(st.cookTotal)
    entity.flyingsquidXp = { type: 'float', value: st.xp }
    st.world.saveAt?.(st.pos)
  }

  async function setLit (st: FurnaceState, lit: boolean) {
    st.lit = lit
    const block = await st.world.getBlock(st.pos)
    if (!block) return
    if (flat) {
      if (!BASE_NAME(block.name).endsWith(st.blockName) || String(block.getProperties().lit) === String(lit)) return
      await serv.setBlock(st.world, st.pos, PBlock.fromProperties(block.name, { ...block.getProperties(), lit }, 0).stateId)
    } else {
      const target = mcData.blocksByName[lit ? 'lit_furnace' : 'furnace']
      if (target && block.type !== target.id) await serv.setBlock(st.world, st.pos, (target.id << 4) | (block.metadata ?? 0))
    }
  }

  // ---------------------------------------------------------------- the furnace tick
  async function tick (st: FurnaceState) {
    const wasLit = st.burnTime > 0
    if (wasLit) { st.burnTime--; st.dirty = true }
    const fuel = st.slots[1]
    const input = st.slots[0]
    if (wasLit || (fuel && input)) {
      let recipe = canCook(st)
      if (st.burnTime <= 0 && recipe && fuelOf(fuel) > 0) {
        st.burnTime = st.burnDuration = fuelOf(fuel)
        if (fuel!.name === 'lava_bucket') st.slots[1] = new serv.PrismarineItem(mcData.itemsByName.bucket.id, 1)
        else if (--fuel!.count <= 0) st.slots[1] = null
        syncSlot(st, 1)
        st.dirty = true
      }
      if (st.burnTime > 0 && recipe) {
        if (st.cookTotal === 0) st.cookTotal = recipe.time
        st.cookTime++
        if (st.cookTime >= st.cookTotal) {
          st.cookTime = 0
          st.cookTotal = recipe.time
          const out = st.slots[2]
          if (out) out.count += recipe.count
          else st.slots[2] = new serv.PrismarineItem(recipe.resultId, recipe.count, 0)
          if (--st.slots[0]!.count <= 0) st.slots[0] = null
          st.xp += recipe.experience * recipe.count
          syncSlot(st, 0); syncSlot(st, 2)
        }
        st.dirty = true
      } else if (st.cookTime !== 0) {
        st.cookTime = 0; st.dirty = true
      }
    } else if (st.cookTime > 0) {
      st.cookTime = Math.max(0, st.cookTime - 2); st.dirty = true
    }
    if ((st.burnTime > 0) !== st.lit) { st.dirty = true; await setLit(st, st.burnTime > 0) }
    sendProgress(st)
  }

  const syncSlot = (st: FurnaceState, slot: number) => {
    for (const [p, win] of st.windows) {
      st.syncing = true
      try { win.updateSlot(slot, st.slots[slot] as any) } finally { st.syncing = false }
      p.writePacket('set_slot', { windowId: p.windowId, stateId: 1, slot, item: serv.PrismarineItem.toNotch(st.slots[slot]) })
    }
  }
  const sendProgress = (st: FurnaceState) => {
    for (const p of st.viewers) {
      const props: Array<[number, number]> = [[0, st.burnTime], [1, st.burnDuration], [2, st.cookTime], [3, st.cookTotal || 200]]
      for (const [property, value] of props) p.writePacket('craft_progress_bar', { windowId: p.windowId, property, value })
    }
  }

  serv.on('tick', (_delta, count) => {
    for (const [key, st] of active) {
      if (st.busy) continue
      st.busy = true
      tick(st).then(async () => {
        if (count % 20 === 0) await flush(st)
        // a furnace with nothing to do and nobody looking is forgotten until it is touched again
        if (st.burnTime <= 0 && st.cookTime <= 0 && !st.viewers.size && !(st.slots[0] && st.slots[1])) { await flush(st); active.delete(key) }
        else if (!(await st.world.getBlock(st.pos)) || !KIND_OF[(await st.world.getBlock(st.pos)).name]) { active.delete(key) }
      }).catch(e => serv.warn(`furnace at ${st.pos}: ${(e as Error).message}`)).finally(() => { st.busy = false })
    }
  })

  // furnaces that were burning when their chunk loaded start again
  const watched = new WeakSet<object>()
  const watchWorld = (world: any) => {
    if (watched.has(world)) return
    watched.add(world)
    world.on?.('chunkColumnLoad', async (corner: Vec3) => {
      try {
        const column = world.getLoadedColumn?.(corner.x >> 4, corner.z >> 4)
        for (const [key, entity] of Object.entries<any>(column?.blockEntities ?? {})) {
          const id = String(entity?.id?.value ?? '').replace(/^minecraft:/, '').toLowerCase()
          if (!['furnace', 'blast_furnace', 'smoker'].includes(id)) continue
          const [x, y, z] = key.split(',').map(Number)
          if ((entity.BurnTime?.value ?? 0) > 0 || (entity.CookTime?.value ?? 0) > 0) await loadState(world, new Vec3(x, y, z), id)
        }
      } catch {}
    })
  }
  serv.once('pluginsReady', () => {
    for (const w of Object.values(serv.worlds ?? {})) watchWorld(w)
    // a furnace used before the datapack layers were read indexed the built-in recipes only
    void serv.containers.gameData.ready.then(() => { recipeIndex = undefined })
  })
  serv.on('worldCreated' as any, watchWorld)

  // ---------------------------------------------------------------- window
  async function open (player: Player, world: any, pos: Vec3, blockName: string) {
    const st = await loadState(world, pos, blockName)
    const inventoryType = newWindows ? `minecraft:${st.blockName}` : 'minecraft:furnace'
    const windowSlots: Record<number, Item> = {}
    st.slots.forEach((item, i) => { if (item) windowSlots[i] = item })
    const window = player.openCustomWindow({
      inventoryType: inventoryType as any,
      title: { translate: `container.${st.blockName}` },
      windowSlots,
      onSlotClick: (slot, oldItem, newItem) => {
        if (slot > 2 || st.syncing) return
        const revert = () => {
          st.slots[slot] = oldItem
          syncSlot(st, slot)
        }
        if (slot === 2 && newItem && (!oldItem || newItem.count > oldItem.count || newItem.type !== oldItem.type)) return revert() // the output is take-only
        if (slot === 1 && newItem && !fuelOf(newItem) && newItem.name !== 'bucket') return revert()
        st.slots[slot] = newItem
        st.dirty = true
        if (slot === 2 && oldItem && (!newItem || newItem.count < oldItem.count)) {
          // the experience of the cooked items goes to the one who takes them
          const taken = oldItem.count - (newItem?.count ?? 0)
          const share = newItem ? st.xp * taken / oldItem.count : st.xp
          st.xp -= share
          const xp = Math.floor(share) + (Math.random() < share - Math.floor(share) ? 1 : 0)
          if (xp > 0) player.setXp(player.xp + xp)
        }
      },
      onClose: () => {
        st.viewers.delete(player)
        st.windows.delete(player)
        void flush(st)
      }
    })
    st.viewers.add(player)
    st.windows.set(player, window)
    player.once('disconnected', () => { st.viewers.delete(player); st.windows.delete(player) })
    sendProgress(st)
    return true
  }

  serv.once('asap', () => {
    const blocks = ['furnace', 'blast_furnace', 'smoker'].filter(n => mcData.blocksByName[n])
    for (const name of blocks) {
      serv.onBlockInteraction(name, ({ block, player }) => open(player, player.world, block.position, name))
    }
    if (!flat) serv.onBlockInteraction('lit_furnace', ({ block, player }) => open(player, player.world, block.position, 'furnace'))
  })

  // a furnace that is broken drops its contents
  serv.furnaceBroken = async (world: any, pos: Vec3, blockName: string, drop: boolean) => {
    const key = stateKey(world, pos)
    const st = active.get(key)
    if (st) {
      st.dirty = true
      await flush(st)
      for (const p of st.viewers) (st.windows.get(p) as any)?.close?.()
      active.delete(key)
    }
    const entity = await serv.containers.entityAt(world, pos)
    if (!entity) return
    if (drop) {
      const items = serv.containers.readSlots(entity, 3)
      serv.containers.dropStacks?.(world, pos, items)
    }
    await serv.containers.removeEntity(world, pos)
  }
}

declare global {
  interface Server {
    /** @internal */
    furnaceBroken: (world: any, pos: Vec3, blockName: string, drop: boolean) => Promise<void>
  }
}

export const player = (player: Player, serv: Server) => {
  player.on('dug', ({ position, block }: any, cancelled: boolean) => {
    if (cancelled || !block || !KIND_OF[block.name]) return
    void serv.furnaceBroken(player.world, position, block.name, player.gameMode !== 1).catch((e: Error) => serv.warn(`furnace break: ${e.message}`))
  })
}
