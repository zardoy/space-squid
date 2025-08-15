import { Vec3 } from 'vec3'

// Module to make positions safe to move to.
// If a client sends a position outside by more than threshold, ignore and teleport back inside.
// Also includes anti-cheat features for block collision and movement speed.

const THRESHOLD = 0.5
const PLAYER_SIZE = new Vec3(0.6, 1.8, 0.6) // Standard Minecraft player hitbox
const MAX_MOVEMENT_DISTANCE = 10 // Maximum blocks per tick movement (accounting for speed effects)
const BASE_WALKING_SPEED = 0.10000000149011612 // Base movement speed from playerDat.js

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

export const player = (player: Player, serv: Server, { basePositionAntiCheat, logToChatPositionAntiCheat }: Options) => {
  let lastMovementTime = Date.now()
  let lastPosition = player.position?.clone()

  // Enforce safe areas on client-provided movement
  player.on('move_cancel' as any, ({ position, onGround, teleport }: { position: Vec3, onGround: boolean, teleport?: boolean }, cancel: (defaultCancel?: boolean) => void) => {
    // Allow server teleports/moves to pass through
    if (teleport) return

    // Anti-cheat: Block collision detection
    if (basePositionAntiCheat && isPlayerInsideBlock(player, serv, position)) {
      cancel(false)
      if (logToChatPositionAntiCheat) {
        player.chat(`Position anti-cheat: Block collision detected. Teleporting to safe position.`)
      }
      player.teleport(findSafePosition(player, serv, position))
      return
    }

    // Anti-cheat: Movement speed limit
    const currentTime = Date.now()
    const deltaTime = (currentTime - lastMovementTime) / 1000 // Convert to seconds
    if (basePositionAntiCheat && lastPosition && !teleport) {
      const maxAllowedDistance = calculateMaxMovementDistance(player, deltaTime)
      const distance = position.distanceTo(lastPosition)
      if (distance > maxAllowedDistance) {
        if (logToChatPositionAntiCheat) {
          player.chat(`Position anti-cheat: Movement speed limit exceeded. Teleporting to safe position.`)
        }
        cancel(false)
        player.teleport(lastPosition)
        return
      }
    }

    // Update tracking for next movement
    lastMovementTime = currentTime
    lastPosition = position.clone()

    // Safe zones enforcement (original logic)
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
    if (logToChatPositionAntiCheat) {
      player.chat(`Position anti-cheat: Out of bounds. Teleporting to safe position.`)
    }
    cancel(false)
    player.teleport(corrected)
  })
}

// Anti-cheat helper functions

function isPlayerInsideBlock (player: Player, serv: Server, position: Vec3) {
  const blocks = serv.mcData.blocksByStateId
  const chunks = player.world.getColumns()
  const chunk = chunks[position.x >> 4][position.z >> 4]
  if (!chunk) return false

  // Check collision points around player hitbox
  const checkPositions = [
    position, // Center
    position.offset(PLAYER_SIZE.x / 2, 0, PLAYER_SIZE.z / 2), // Top-right corner
    position.offset(-PLAYER_SIZE.x / 2, 0, PLAYER_SIZE.z / 2), // Top-left corner
    position.offset(PLAYER_SIZE.x / 2, 0, -PLAYER_SIZE.z / 2), // Bottom-right corner
    position.offset(-PLAYER_SIZE.x / 2, 0, -PLAYER_SIZE.z / 2), // Bottom-left corner
    position.offset(0, PLAYER_SIZE.y / 2, 0), // Top center
    position.offset(0, PLAYER_SIZE.y, 0) // Head position
  ]

  for (const checkPos of checkPositions) {
    try {
      const pos = new Vec3(Math.floor(checkPos.x) & 15, Math.floor(checkPos.y), Math.floor(checkPos.z) & 15)
      const blockStateId = chunk.getBlockStateId(pos)
      if (blocks[blockStateId]?.boundingBox === 'block') {
        return true
      }
    } catch (error) {
      // If we can't get block type, assume it's safe
      continue
    }
  }

  return false
}

function calculateMaxMovementDistance (player: Player, deltaTime: number): number {
  let walkingSpeed = BASE_WALKING_SPEED

  // Apply speed effect if present (effect ID 1)
  if (player.effects?.[1]) {
    const amplifier = player.effects[1].amplifier || 0
    walkingSpeed = BASE_WALKING_SPEED * (1 + (amplifier + 1) * 0.2)
  }

  // For creative mode or flying, allow higher speed
  if (player.gameMode === 1 || player.gameMode === 3 || player.flying) {
    walkingSpeed *= 10 // Creative/spectator mode multiplier
  }

  // Convert to blocks per second and apply delta time, with maximum limit
  const maxDistance = Math.min(walkingSpeed * 20 * deltaTime, MAX_MOVEMENT_DISTANCE)
  return maxDistance
}

function findSafePosition (player: Player, serv: Server, attemptedPosition: Vec3) {
  // Start from the attempted position and search nearby for a safe spot
  const basePosition = attemptedPosition.floored()
  const chunks = player.world.getColumns()
  const chunk = chunks[basePosition.x >> 4][basePosition.z >> 4]
  if (!chunk) return basePosition

  // Search in expanding radius for a safe position
  for (let radius = 0; radius <= 3; radius++) {
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        if (Math.abs(x) === radius || Math.abs(z) === radius) { // Only check edge positions for efficiency
          const testPos = basePosition.offset(x, 0, z)

          // Check if position is safe (not inside blocks)
          let isSafe = true
          for (let y = 0; y < Math.ceil(PLAYER_SIZE.y); y++) {
            const checkPos = testPos.offset(0, y, 0)
            const pos = new Vec3(Math.floor(checkPos.x) & 15, Math.floor(checkPos.y), Math.floor(checkPos.z) & 15)
            try {
              const blockStateId = chunk.getBlockStateId(pos)
              if (serv.mcData.blocksByStateId[blockStateId]?.boundingBox === 'block') {
                isSafe = false
                break
              }
            } catch {
              // If we can't check, assume unsafe
              isSafe = false
              break
            }
          }

          if (isSafe) {
            return testPos.offset(0.5, 0, 0.5) // Center in block
          }
        }
      }
    }
  }

  // If no safe position found, return player's current position
  return player.position
}

// Original helper functions

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
  interface Options {
    basePositionAntiCheat: boolean
    logToChatPositionAntiCheat: boolean
  }

  interface Server {
    safeZones: AABB[]
    resetSafeZones: () => void
    addSafeZones: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => void
  }
}
