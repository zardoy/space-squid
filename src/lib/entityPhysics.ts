import { Vec3 } from 'vec3'

/**
 * Axis aligned box physics for server side entities (items, mobs, projectiles).
 *
 * The old physics probed a single point per axis, so a falling item could end up inside a block and then keep sinking, and anything moving diagonally clipped corners. This
 * moves the entity's box one axis at a time (y, x, z like vanilla) against the real collision shapes of the blocks it sweeps through:
 *  - unloaded chunks count as solid, nothing falls into the void while its chunk is not there,
 *  - an entity that starts inside blocks (spawned in a wall, a block was placed on it) is lifted out through the top,
 *  - liquids slow entities down and let light things float.
 */
export type Box = [number, number, number, number, number, number]

const EPS = 1e-7
const FULL: Box = [0, 0, 0, 1, 1, 1]

export interface PhysicsWorld {
  sync: { getBlock (pos: Vec3): any }
}

export interface Body {
  position: Vec3
  velocity: Vec3
  /** width (x), height (y), depth (z) */
  size: Vec3
  /** m/s^2 on each axis (negative y = down) */
  gravity?: Vec3
  terminalvelocity?: Vec3
  /** deceleration (m/s^2) of x / z while standing on something */
  friction?: Vec3
  /** floats up in liquids (items, boats) */
  buoyant?: boolean
  /** ignores liquid drag (flying mobs) */
  flying?: boolean
  onGround?: boolean
  inWater?: boolean
  inLava?: boolean
  /** set by the step: velocity components that were stopped by a block */
  hitX?: boolean
  hitY?: boolean
  hitZ?: boolean
}

const boxesOfBlock = (block: any): Box[] => {
  if (!block) return [FULL]
  const shapes: Box[] | undefined = block.shapes
  if (shapes) return shapes
  return block.boundingBox === 'block' ? [FULL] : []
}

const tmp = new Vec3(0, 0, 0)

/** world space collision boxes of the blocks overlapping `aabb` */
export function collisionBoxes (world: PhysicsWorld, aabb: Box, out: Box[] = []): Box[] {
  const x0 = Math.floor(aabb[0] + EPS); const x1 = Math.floor(aabb[3] - EPS)
  const y0 = Math.floor(aabb[1] + EPS); const y1 = Math.floor(aabb[4] - EPS)
  const z0 = Math.floor(aabb[2] + EPS); const z1 = Math.floor(aabb[5] - EPS)
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        tmp.set(x, y, z)
        const block = world.sync.getBlock(tmp)
        for (const s of boxesOfBlock(block)) out.push([x + s[0], y + s[1], z + s[2], x + s[3], y + s[4], z + s[5]])
      }
    }
  }
  return out
}

const overlapsOn = (a: Box, b: Box, skip: 0 | 1 | 2) => {
  for (let i = 0; i < 3; i++) if (i !== skip && !(a[i] < b[i + 3] - EPS && a[i + 3] > b[i] + EPS)) return false
  return true
}

const isLiquid = (block: any, name: 'water' | 'lava') => !!block && (block.name === name || (name === 'water' && (block.name === 'bubble_column' || block.name === 'seagrass' || block.name === 'tall_seagrass' || block.name === 'kelp' || block.name === 'kelp_plant')) || (block.name === 'flowing_' + name))

/** advances `body` by `dt` seconds; returns false when its chunk is not loaded (nothing moved) */
export function stepBody (world: PhysicsWorld, body: Body, dt: number): boolean {
  dt = Math.min(dt, 0.1)
  const { position: p, velocity: v, size } = body
  const hw = size.x / 2; const hd = size.z / 2; const h = size.y

  // the block the entity is in decides about liquids; an unloaded chunk freezes it
  tmp.set(Math.floor(p.x), Math.floor(p.y + Math.min(h, 1) / 2), Math.floor(p.z))
  const here = world.sync.getBlock(tmp)
  if (!here) return false
  body.inWater = isLiquid(here, 'water')
  body.inLava = isLiquid(here, 'lava')
  const liquid = (body.inWater || body.inLava) && !body.flying

  if (body.gravity) {
    const g = liquid ? 0.15 : 1
    const t = body.terminalvelocity
    v.x += body.gravity.x * dt * g
    v.y += body.gravity.y * dt * g
    v.z += body.gravity.z * dt * g
    if (t) { v.y = Math.max(-t.y, Math.min(t.y, v.y)) }
  }
  if (liquid) {
    const drag = body.inLava ? 0.5 : 0.8
    v.x *= drag; v.z *= drag; v.y *= drag
    if (body.buoyant) v.y = Math.min(2, v.y + 12 * dt)
  }

  let aabb: Box = [p.x - hw, p.y, p.z - hd, p.x + hw, p.y + h, p.z + hd]

  // started inside blocks: lift out through the top (at most a few blocks, so a wall of rock does not launch the entity into the sky)
  const inside = collisionBoxes(world, [aabb[0] + 1e-3, aabb[1] + 1e-3, aabb[2] + 1e-3, aabb[3] - 1e-3, aabb[4] - 1e-3, aabb[5] - 1e-3])
  if (inside.length) {
    let top = p.y
    for (let i = 0; i < 6; i++) {
      const probe: Box = [aabb[0] + 1e-3, top + 1e-3, aabb[2] + 1e-3, aabb[3] - 1e-3, top + h - 1e-3, aabb[5] - 1e-3]
      const hits = collisionBoxes(world, probe)
      if (!hits.length) break
      top = Math.max(...hits.map(b => b[4]))
    }
    p.y = top
    if (v.y < 0) v.y = 0
    aabb = [p.x - hw, p.y, p.z - hd, p.x + hw, p.y + h, p.z + hd]
  }

  body.hitX = body.hitY = body.hitZ = false
  let onGround = false
  const axes: Array<[0 | 1 | 2, 'x' | 'y' | 'z']> = [[1, 'y'], [0, 'x'], [2, 'z']]
  for (const [i, k] of axes) {
    let d = v[k] * dt
    if (d === 0) continue
    const sweep: Box = [...aabb]
    if (d > 0) sweep[i + 3] += d; else sweep[i] += d
    const boxes = collisionBoxes(world, sweep)
    let clipped = false
    for (const b of boxes) {
      if (!overlapsOn(aabb, b, i)) continue
      if (d > 0 && b[i] >= aabb[i + 3] - EPS) { const gap = b[i] - aabb[i + 3]; if (gap < d) { d = Math.max(0, gap); clipped = true } } else if (d < 0 && b[i + 3] <= aabb[i] + EPS) { const gap = b[i + 3] - aabb[i]; if (gap > d) { d = Math.min(0, gap); clipped = true } }
    }
    p[k] += d
    aabb[i] += d; aabb[i + 3] += d
    if (clipped) {
      if (k === 'y') { body.hitY = true; if (v.y < 0) onGround = true } else if (k === 'x') body.hitX = true; else body.hitZ = true
      v[k] = 0
    }
  }
  body.onGround = onGround

  if (onGround && body.friction && (v.x !== 0 || v.z !== 0)) {
    const speed = Math.hypot(v.x, v.z)
    const slow = Math.max(0, speed - Math.max(body.friction.x, body.friction.z) * dt)
    const f = speed > 0 ? slow / speed : 0
    v.x *= f; v.z *= f
    if (Math.abs(v.x) < 1e-3) v.x = 0
    if (Math.abs(v.z) < 1e-3) v.z = 0
  }
  return true
}

/** first solid block face hit by the segment `from` -> `to` (swept point); `at` is the last free position before it */
export function raycastBlocks (world: PhysicsWorld, from: Vec3, to: Vec3): { hit: boolean, at: Vec3, block?: Vec3 } {
  const d = to.minus(from)
  const len = d.norm()
  if (len === 0) return { hit: false, at: from.clone() }
  const steps = Math.ceil(len / 0.2)
  let last = from.clone()
  for (let i = 1; i <= steps; i++) {
    const pt = from.plus(d.scaled(i / steps))
    tmp.set(Math.floor(pt.x), Math.floor(pt.y), Math.floor(pt.z))
    const block = world.sync.getBlock(tmp)
    if (!block) return { hit: true, at: last, block: tmp.clone() }
    for (const s of boxesOfBlock(block)) {
      if (pt.x >= tmp.x + s[0] && pt.x <= tmp.x + s[3] && pt.y >= tmp.y + s[1] && pt.y <= tmp.y + s[4] && pt.z >= tmp.z + s[2] && pt.z <= tmp.z + s[5]) return { hit: true, at: last, block: tmp.clone() }
    }
    last = pt
  }
  return { hit: false, at: to.clone() }
}
