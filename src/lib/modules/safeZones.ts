import { Vec3 } from 'vec3'

// Module to make positions safe to move to.
// If a client sends a position outside by more than threshold, ignore and teleport back inside.

const THRESHOLD = 0.5

export const server = (serv: Server) => {
  serv.safeZones ??= []

  serv.resetSafeZones = () => {
    serv.safeZones = []
  }

  serv.addSafeZones = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
    const min = new Vec3(
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.min(z1, z2)
    )
    const max = new Vec3(
      Math.max(x1, x2),
      Math.max(y1, y2),
      Math.max(z1, z2)
    )
    serv.safeZones.push({ min, max })
  }
}

export const player = (player: Player, serv: Server) => {
  // Enforce safe areas on client-provided movement
  player.on('move_cancel' as any, ({ position, onGround, teleport }: { position: Vec3, onGround: boolean, teleport?: boolean }, cancel: (defaultCancel?: boolean) => void) => {
    // Allow server teleports/moves to pass through
    if (teleport) return

    const zones = serv.safeZones ?? []
    if (zones.length === 0) return

    // Determine the reference area: prefer the box containing the player's current position
    let zone = zones.find(box => isInsideStrict(player.position, box))
    if (!zone) {
      // Fallback: choose closest box to current position
      let best: { box: AABB, dist: number } | undefined
      for (const box of zones) {
        const d = distanceToAABB(player.position, box)
        if (!best || d < best.dist) best = { box, dist: d }
      }
      zone = best?.box
      if (!zone) return
    }

    // If new position is within expanded bounds (threshold), allow it
    if (isInsideExpanded(position, zone, THRESHOLD)) return

    // Otherwise, clamp back inside from direction of attempted position
    const corrected = clampToAABBFromDirection(position, zone)

    // Prevent default cancel handling and perform corrective teleport ourselves
    cancel(false)
    player.teleport(corrected)
  })
}

function isInsideStrict (pos: Vec3, box: AABB): boolean {
  return pos.x >= box.min.x && pos.x <= box.max.x &&
    pos.y >= box.min.y && pos.y <= box.max.y &&
    pos.z >= box.min.z && pos.z <= box.max.z
}

function isInsideExpanded (pos: Vec3, box: AABB, threshold: number): boolean {
  return pos.x >= (box.min.x - threshold) && pos.x <= (box.max.x + threshold) &&
    pos.y >= (box.min.y - threshold) && pos.y <= (box.max.y + threshold) &&
    pos.z >= (box.min.z - threshold) && pos.z <= (box.max.z + threshold)
}

function clampToAABBFromDirection (pos: Vec3, box: AABB): Vec3 {
  const epsilon = 0.01
  let x = pos.x
  let y = pos.y
  let z = pos.z

  if (pos.x < box.min.x - THRESHOLD) x = box.min.x + epsilon
  else if (pos.x > box.max.x + THRESHOLD) x = box.max.x - epsilon
  else x = clamp(pos.x, box.min.x + epsilon, box.max.x - epsilon)

  if (pos.y < box.min.y - THRESHOLD) y = box.min.y + epsilon
  else if (pos.y > box.max.y + THRESHOLD) y = box.max.y - epsilon
  else y = clamp(pos.y, box.min.y + epsilon, box.max.y - epsilon)

  if (pos.z < box.min.z - THRESHOLD) z = box.min.z + epsilon
  else if (pos.z > box.max.z + THRESHOLD) z = box.max.z - epsilon
  else z = clamp(pos.z, box.min.z + epsilon, box.max.z - epsilon)

  return new Vec3(x, y, z)
}

function clamp (v: number, min: number, max: number): number {
  if (min > max) return v // degenerate box; shouldn't happen
  return Math.max(min, Math.min(max, v))
}

function distanceToAABB (p: Vec3, box: AABB): number {
  // Squared distance from point to AABB
  const dx = dist1D(p.x, box.min.x, box.max.x)
  const dy = dist1D(p.y, box.min.y, box.max.y)
  const dz = dist1D(p.z, box.min.z, box.max.z)
  return dx * dx + dy * dy + dz * dz
}

function dist1D (v: number, min: number, max: number): number {
  if (v < min) return min - v
  if (v > max) return v - max
  return 0
}

// Types
export type AABB = { min: Vec3, max: Vec3 }

declare global {
  interface Server {
    safeZones: AABB[]
    resetSafeZones: () => void
    addSafeZones: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => void
  }
}
