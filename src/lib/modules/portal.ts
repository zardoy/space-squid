import { Vec3 } from 'vec3'
import UserError from '../user_error'
import MinecraftData from 'minecraft-data'
import portalDetector from '../portal_detector'

export const player = function (player: Player, serv: Server, { version }: Options) {
  const mcData = MinecraftData(version)

  const obsidianType = mcData.blocksByName.obsidian.id
  const portalType = serv.supportFeature('theFlattening') ? mcData.blocksByName.nether_portal.id : mcData.blocksByName.portal.id

  // player.on('dug', ({ position, block }) => {
  //   function destroyPortal (portal, positionAlreadyDone = null) {
  //     player.world.portals = player.world.portals.splice(player.world.portals.indexOf(portal), 1)
  //     portal
  //       .air
  //       .filter(ap => positionAlreadyDone === null || !ap.equals(positionAlreadyDone))
  //       .forEach(ap => serv.setBlock(player.world, ap, 0))
  //   }

  //   if (block.type === obsidianType) {
  //     const p = player.world.portals.filter(({ bottom, top, left, right }) =>
  //       [...bottom, ...left, ...right, ...top]
  //         .reduce((acc, pos) => acc || pos.equals(position), false))
  //     p.forEach(portal => destroyPortal(portal, position))
  //   }

  //   if (block.type === portalType) {
  //     const p = player.world.portals.filter(({ air }) => air.reduce((acc, pos) => acc || pos.equals(position), false))
  //     p.forEach(portal => destroyPortal(portal, position))
  //   }
  // })
}

export const server = function (serv: Server, { version }: Options) {
  const { generatePortal, addPortalToWorld, detectFrame } = portalDetector(version)
  const mcData = MinecraftData(version)

  const obsidianType = mcData.blocksByName.obsidian.id
  const fireType = mcData.blocksByName.fire.id

  let portalX: number
  let portalZ: number
  if (serv.supportFeature('theFlattening')) {
    const portalBlock = mcData.blocksByName.nether_portal
    portalX = portalBlock.minStateId!
    portalZ = portalBlock.minStateId! + 1
  } else {
    const portalBlock = mcData.blocksByName.portal
    portalX = portalBlock.id << 4 + 1
    portalZ = portalBlock.id << 4 + 2
  }

  serv.on('asap', () => {
    serv.onItemPlace('flint_and_steel', async ({ player, referencePosition, directionVector }) => {
      const block = await player.world.getBlock(referencePosition)
      if (block.type === obsidianType) {
        const frames = await detectFrame(player.world, referencePosition, directionVector)
        if (frames.length !== 0) {
          const air = frames[0].air
          const stateId = (frames[0].bottom[0].x - frames[0].bottom[1].x) !== 0 ? portalX : portalZ
          air.forEach(pos => {
            player.setBlock(pos, stateId)
          })
          player.world.portals.push(frames[0])
          return { id: -1, data: 0 }
        }
      }
      return { id: fireType, data: 0 }
    })
  })

  // ---------------------------------------------------------------------------------------------- travelling
  const Block = require('prismarine-block')(require('prismarine-registry')(version))
  const netherPortalName = serv.supportFeature('theFlattening') ? 'nether_portal' : 'portal'
  const solidType = (type: number) => type !== 0 && !['water', 'lava', 'bubble_column', 'kelp', 'seagrass', 'tall_seagrass'].includes(mcData.blocks[type]?.name)
  const MAX_Y = (world: any) => (world['min_y'] ?? 0) + (world['height'] ?? 256) - 1

  /** first standable position near the column: above the first solid block with two free blocks over it (nether: searched from the middle of the world) */
  async function findStandY (world: any, x: number, z: number): Promise<number> {
    const min = world['min_y'] ?? 0; const max = MAX_Y(world)
    const free = async (y: number) => (await world.getBlockType(new Vec3(x, y, z))) === 0
    const ok = async (y: number) => solidType(await world.getBlockType(new Vec3(x, y - 1, z))) && await free(y) && await free(y + 1) && await free(y + 2)
    if (world.environment === 'nether') {
      for (let y = 70; y <= max - 8; y++) if (await ok(y)) return y
      for (let y = 69; y >= min + 8; y--) if (await ok(y)) return y
      return 70
    }
    for (let y = max - 3; y > min + 1; y--) if (await ok(y)) return y
    return 80
  }

  /** a 4x5 obsidian frame (plane x) with portal blocks inside, a platform below and free space around; returns the portal record */
  async function buildNetherPortal (world: any, x: number, y: number, z: number) {
    const bottom: Vec3[] = []; const left: Vec3[] = []; const right: Vec3[] = []; const top: Vec3[] = []; const air: Vec3[] = []
    const obsidian = mcData.blocksByName.obsidian.id
    for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 4; dy++) {
      const pos = new Vec3(x + dx, y + dy, z + dz)
      const onFrame = dz === 0 && (dx === -1 || dx === 2 || dy === -1 || dy === 3)
      if (dy === -1 && dz !== 0) await serv.setBlockType(world, pos, obsidian)
      else if (onFrame && dy <= 3) {
        await serv.setBlockType(world, pos, obsidian)
        if (dy === -1 && dx >= 0 && dx <= 1) bottom.push(pos)
        else if (dy === 3 && dx >= 0 && dx <= 1) top.push(pos)
        else if (dx === -1 && dy >= 0 && dy <= 2) left.push(pos)
        else if (dx === 2 && dy >= 0 && dy <= 2) right.push(pos)
      } else if (dz === 0 && dx >= 0 && dx <= 1 && dy >= 0 && dy <= 2) {
        await serv.setBlock(world, pos, portalX)
        air.push(pos)
      } else await serv.setBlockType(world, pos, 0)
    }
    const portal = { bottom, left, right, top, air }
    world.portals.push(portal)
    return portal
  }

  /** nearest registered portal of `world` around (x, z), or a new one at the column's standable height */
  async function portalNear (world: any, x: number, z: number, radius: number): Promise<Vec3> {
    let best: Vec3 | undefined; let bestD = Infinity
    for (const portal of world.portals ?? []) {
      const air: Vec3[] = portal.air
      if (!air?.length) continue
      // standing spot: centre of the portal's free blocks at their lowest level
      const y = Math.min(...air.map(a => a.y))
      const c = new Vec3(air.reduce((a, p) => a + p.x, 0) / air.length + 0.5, y, air.reduce((a, p) => a + p.z, 0) / air.length + 0.5)
      const d = Math.hypot(c.x - x, c.z - z)
      if (d <= radius && d < bestD) { best = c; bestD = d }
    }
    if (best) return best
    await world.getColumn(x >> 4, z >> 4)
    const y = await findStandY(world, Math.floor(x), Math.floor(z))
    await buildNetherPortal(world, Math.floor(x), y, Math.floor(z))
    return new Vec3(Math.floor(x) + 1, y, Math.floor(z) + 0.5)
  }
  serv.netherPortalNear = portalNear

  const portalState = new WeakMap<object, { ticks: number, locked: boolean, busy: boolean }>()
  const endPortalType = mcData.blocksByName.end_portal?.id
  const netherPortalType = mcData.blocksByName[netherPortalName]?.id

  async function checkPlayer (player: Player) {
    const st = portalState.get(player) ?? { ticks: 0, locked: false, busy: false }
    portalState.set(player, st)
    if (st.busy || !player.world) return
    st.busy = true
    try {
      const feet = new Vec3(Math.floor(player.position.x), Math.floor(player.position.y), Math.floor(player.position.z))
      const here = await player.world.getBlockType(feet)
      const inNether = here === netherPortalType || (await player.world.getBlockType(feet.offset(0, 1, 0))) === netherPortalType
      const inEnd = endPortalType !== undefined && here === endPortalType
      if (!inNether && !inEnd) { st.ticks = 0; st.locked = false; return }
      if (st.locked) return
      const world: any = player.world
      if (inEnd) {
        st.locked = true
        if (world.environment === 'end') await player.changeWorld(serv.overworld, { dimension: serv.overworld.dimensionId })
        else await player.changeWorld(serv.endworld, { dimension: serv.endworld.dimensionId, position: new Vec3(100.5, 49, 0.5) })
        return
      }
      st.ticks += 4
      if (st.ticks < (player.gameMode === 1 ? 4 : 80)) return
      st.locked = true; st.ticks = 0
      const toNether = world.environment === 'normal'
      const dest: any = toNether ? serv.netherworld : serv.overworld
      if (!dest || dest === world || world.environment === 'end') return
      const f = toNether ? 1 / 8 : 8
      const pos = await portalNear(dest, player.position.x * f, player.position.z * f, toNether ? 128 : 16)
      await player.changeWorld(dest, { dimension: dest.dimensionId, position: pos })
    } catch (e) {
      serv.warn('portal travel failed: ' + (e as Error).message)
    } finally {
      st.busy = false
    }
  }

  serv.on('tick', (_delta, count) => {
    if (count % 4 !== 0) return
    for (const p of serv.players) void checkPlayer(p)
  })

  // an eye of ender in an end portal frame; the twelfth eye opens the portal
  if (mcData.blocksByName.end_portal_frame && serv.supportFeature('theFlattening')) {
    const frame = mcData.blocksByName.end_portal_frame
    const ringOffsets: Array<[number, number]> = []
    for (let i = -1; i <= 1; i++) ringOffsets.push([i, -2], [i, 2], [-2, i], [2, i])
    serv.onBlockInteraction('end_portal_frame', async ({ block, player }) => {
      if (player.heldItem?.name !== 'ender_eye') return false
      const props = block.getProperties?.() ?? {}
      if (String(props.eye) === 'true') return false
      const world: any = player.world
      await serv.setBlock(world, block.position, Block.fromProperties('end_portal_frame', { ...props, eye: true }, 0).stateId)
      // look for a complete ring of eyes around any centre within reach and fill its 3x3 interior
      for (let cx = block.position.x - 3; cx <= block.position.x + 3; cx++) {
        for (let cz = block.position.z - 3; cz <= block.position.z + 3; cz++) {
          let complete = true
          for (const [dx, dz] of ringOffsets) {
            const b = await world.getBlock(new Vec3(cx + dx, block.position.y, cz + dz))
            if (b.type !== frame.id || String(b.getProperties?.().eye) !== 'true') { complete = false; break }
          }
          if (!complete) continue
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) await serv.setBlockType(world, new Vec3(cx + dx, block.position.y, cz + dz), mcData.blocksByName.end_portal.id)
          return true
        }
      }
      return true
    })
  }

  serv.commands.add({
    base: 'portal',
    info: 'Create a portal frame',
    usage: '/portal <bottomLeft:<x> <y> <z>> <direction:x|z> <width> <height>',
    onlyPlayer: true,
    op: true,
    parse (str, ctx) {
      const pars = str.split(' ')
      if (pars.length !== 6) { return false }
      let [x, y, z, directionStr, width, height] = pars;
      [x, y, z] = [x, y, z].map((val, i) => serv.posFromString(val, ctx.player.position[['x', 'y', 'z'][i]]))
      const bottomLeft = new Vec3(+x, +y, +z)
      if (directionStr !== 'x' && directionStr !== 'z') { throw new UserError('Wrong Direction') }
      const direction = directionStr === 'x' ? new Vec3(1, 0, 0) : new Vec3(0, 0, 1)
      return { bottomLeft, direction, width: +width, height: +height }
    },
    async action ({ bottomLeft, direction, width, height }, ctx) {
      if (width > 21 || height > 21) { throw new UserError('Portals can only be 21x21!') }
      const portal = generatePortal(bottomLeft, direction, width, height)
      await addPortalToWorld(ctx.player.world, portal, [], [], async (pos, type) => {
        await serv.setBlockType(ctx.player.world, pos, type)
      })
    }
  })
}
declare global {
  interface Server {
    /** nearest registered portal of `world` within `radius` blocks of (x, z) - a new nether portal is built when there is none; returns the standing position */
    netherPortalNear: (world: any, x: number, z: number, radius: number) => Promise<Vec3>
  }
}
