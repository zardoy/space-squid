import { Vec3 } from 'vec3'
import { lookDirection } from './projectiles'

/**
 * Buckets and the obsidian that comes with them: pick up a water or lava source, pour it somewhere else.
 *
 * Fluids do not flow in flying-squid, so a poured bucket is one still source block and the standard recipes are replaced by their result:
 *  - water poured onto / next to a lava *source* turns the lava into obsidian, next to *flowing* lava into cobblestone,
 *  - water poured into lava does the same at that spot (no water is placed),
 *  - lava poured next to water becomes obsidian.
 * That makes obsidian (nether portals) obtainable: iron -> bucket, water from any ocean or river, a lava lake in a cave, pour, mine with a pickaxe.
 *
 * Survival players swap the bucket; creative players keep their bucket (like vanilla). Fish / milk / powder snow buckets are not handled.
 */
export const server = function (serv: Server) {
  const mcData = serv.mcData
  const flat = serv.supportFeature('theFlattening')
  const Item = serv.PrismarineItem
  type Kind = 'water' | 'lava'

  if (!mcData.itemsByName.bucket || !mcData.blocksByName.water || !mcData.blocksByName.lava) return

  const stateOf = (name: string) => {
    const b = mcData.blocksByName[name]
    return flat ? b.minStateId! : b.id << 4
  }
  const isFluid = (block: any, kind: Kind) => block?.name === kind || (!flat && block?.name === `flowing_${kind}`)
  /** a full still source block (flattened: `level` 0, before: the still block with data 0) */
  const isSource = (block: any, kind: Kind) => block?.name === kind && (flat ? Number(block.getProperties?.().level ?? 0) === 0 : block.metadata === 0)
  const FLUIDS: Kind[] = ['water', 'lava']
  const kindOf = (block: any): Kind | undefined => FLUIDS.find(k => isFluid(block, k))

  const getBlock = (world: any, p: Vec3) => world.sync.getBlock(p)
  const sound = (world: any, p: Vec3, name: string) => { try { serv.playSound(name, world, p.offset(0.5, 0.5, 0.5)) } catch {} }

  /** first fluid source (`sources`) or solid block along the look ray, with the free cell in front of it */
  const trace = (world: any, from: Vec3, dir: Vec3, range: number, sources: boolean) => {
    let prev: Vec3 | undefined
    for (let d = 0; d <= range; d += 0.05) {
      const pt = from.plus(dir.scaled(d))
      const cell = new Vec3(Math.floor(pt.x), Math.floor(pt.y), Math.floor(pt.z))
      if (prev?.equals(cell)) continue
      const block = getBlock(world, cell)
      if (!block) return undefined // not loaded
      if (sources && FLUIDS.some(k => isSource(block, k))) return { cell, block, prev }
      if (block.boundingBox === 'block') return { cell, block, prev, solid: true }
      prev = cell
    }
    return undefined
  }

  const NEIGHBOURS = [new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, -1, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)]

  /** lava that water touches becomes obsidian (source) or cobblestone (flowing) */
  const hardenLava = async (world: any, pos: Vec3) => {
    const block = getBlock(world, pos)
    if (!isFluid(block, 'lava')) return false
    await serv.setBlock(world, pos, stateOf(isSource(block, 'lava') ? 'obsidian' : 'cobblestone'))
    sound(world, pos, 'block.lava.extinguish')
    return true
  }

  const swap = (player: Player, slot: number, to: string) => {
    if (player.gameMode === 1) return
    const index = slot === 45 ? 45 : 36 + slot
    const held = player.inventory.slots[index]
    const result = new Item(mcData.itemsByName[to].id, 1)
    if (held && held.count > 1) {
      held.count--
      player.inventory.updateSlot(index, held)
      const free = [...Array.from({ length: 9 }, (_, i) => 36 + i), ...Array.from({ length: 27 }, (_, i) => 9 + i)].find(i => !player.inventory.slots[i])
      if (free !== undefined) player.inventory.updateSlot(free, result)
      else serv.dropItem(player.world, player.position.offset(0, 1, 0), to, 1)
    } else player.inventory.updateSlot(index, result)
  }

  const eye = (player: Player) => player.position.offset(0, 1.62, 0)

  serv.once('asap', () => {
    // ---------------------------------------------------------------- empty bucket: picks up a source
    serv.onItemUse('bucket', async ({ player, slot }) => {
      if (player.gameMode >= 2) return
      const world: any = player.world
      const hit = trace(world, eye(player), lookDirection(player), 5, true)
      if (!hit || hit.solid) return
      const kind = FLUIDS.find(k => isSource(hit.block, k))
      if (!kind) return
      await serv.setBlock(world, hit.cell, 0)
      swap(player, slot, `${kind}_bucket`)
      sound(world, hit.cell, kind === 'lava' ? 'item.bucket.fill_lava' : 'item.bucket.fill')
    })

    // ---------------------------------------------------------------- full buckets: pour
    for (const kind of FLUIDS) {
      const bucket = `${kind}_bucket`
      if (!mcData.itemsByName[bucket]) continue
      serv.onItemUse(bucket, async ({ player, slot }) => {
        if (player.gameMode >= 2) return
        const world: any = player.world
        // the ray stops at fluid sources too: aiming at the surface of a lava lake pours onto the surface (vanilla would pour at the bottom of it)
        const hit = trace(world, eye(player), lookDirection(player), 5, true)
        if (!hit) return
        const target = hit.solid ? hit.prev : hit.cell
        if (!target) return
        const block = getBlock(world, target)
        if (!block || block.boundingBox === 'block') return
        const other: Kind = kind === 'water' ? 'lava' : 'water'
        if (isFluid(block, other)) {
          // water into lava / lava into water: the result is solid, nothing is placed
          if (kind === 'water') await hardenLava(world, target)
          else { await serv.setBlock(world, target, stateOf('obsidian')); sound(world, target, 'block.lava.extinguish') }
        } else if (isSource(block, kind)) {
          return // already there
        } else {
          await serv.setBlock(world, target, stateOf(kind))
          sound(world, target, kind === 'lava' ? 'item.bucket.empty_lava' : 'item.bucket.empty')
          for (const d of NEIGHBOURS) {
            const p = target.plus(d)
            const nb = getBlock(world, p)
            if (kind === 'water' && isFluid(nb, 'lava')) await hardenLava(world, p)
            else if (kind === 'lava' && isFluid(nb, 'water')) { await serv.setBlock(world, target, stateOf('obsidian')); sound(world, target, 'block.lava.extinguish'); break }
          }
        }
        swap(player, slot, 'bucket')
      })
    }
  })
}
