import { Vec3 } from 'vec3'

// Module to make positions safe to move to.
// If a client sends a position outside by more than threshold, ignore and teleport back inside.
// Also includes anti-cheat features for block collision and movement speed.

const THRESHOLD = 0.5
const PLAYER_SIZE = new Vec3(0.6, 1.8, 0.6) // Standard Minecraft player hitbox
const BASE_WALKING_SPEED = 0.10000000149011612 // Base movement speed from playerDat.js
const KNOCKBACK_VELOCITY = 8 // From pvp.ts KNOCKBACK_MULTIPLIER
const MAX_MOVEMENT_DISTANCE = Math.max(KNOCKBACK_VELOCITY * 2, 10) // Allow for knockback velocity + some buffer
const STANDARD_GRAVITY = -0.0784000015258789 // Standard Minecraft gravity from mineflayer
const BASE_SPEED_MULTIPLIER = 45 // Adjusted based on observed normal movement speeds
const FALLING_SPEED_BUFFER = 1.5 // Extra allowance for falling speed variations

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

export const player = (player: Player, serv: Server, { basePositionAntiCheat = false, positionAntiCheatNotifyPlayer = false }: Options) => {
  let lastMovementTime = Date.now()

  player.onReady.then(() => {
    player.knownPosition ??= player.position.clone()
  })

  // Enforce safe areas on client-provided movement
  player.on('move_cancel' as any, ({ position, onGround, teleport }: { position: Vec3, onGround: boolean, teleport?: boolean }, cancel: (defaultCancel?: boolean) => void) => {
    const lastPosition = player.knownPosition
    // Allow server teleports/moves to pass through
    const currentTime = Date.now()
    // Check if this is a response to our teleport
    if (player.pendingTeleport) {
      if (position.distanceTo(player.pendingTeleport) < 0.1) {
        lastMovementTime = currentTime
        player.knownPosition = position.clone()
        player.pendingTeleport = null
      }
      return
    }
    // Allow server teleports
    if (teleport) {
      lastMovementTime = currentTime
      return
    }
    const deltaTime = (currentTime - lastMovementTime) / 1000 // Convert to seconds
    lastMovementTime = currentTime

    // Anti-cheat: Block collision detection
    if (basePositionAntiCheat && isPlayerInsideBlock(player, serv, position)) {
      cancel(false)
      if (positionAntiCheatNotifyPlayer) {
        player.chat(`[safeZones] Block collision detected. Teleporting to safe position.`)
      }
      player.teleport(lastPosition ?? findSafePosition(player, serv, position))
      return
    }

    // Anti-cheat: Movement speed limit
    if (basePositionAntiCheat && lastPosition && !teleport) {
      const velocityCheck = calculateVelocity(player, lastPosition, position, deltaTime)
      if (velocityCheck.currentSpeed > velocityCheck.maxAllowedSpeed) {
        if (positionAntiCheatNotifyPlayer) {
          const excessSpeed = velocityCheck.currentSpeed - velocityCheck.maxAllowedSpeed
          player.chat(
            `[safeZones] Speed limit exceeded by ${excessSpeed.toFixed(1)} b/s ` +
            `(dt=${deltaTime.toFixed(3)}s, ` +
            `(current=${velocityCheck.currentSpeed.toFixed(1)}, ` +
            `max=${velocityCheck.maxAllowedSpeed.toFixed(1)}, ` +
            `mode=${velocityCheck.reason})`
          )
        }
        cancel(false)
        player.teleport(lastPosition)
        return
      }
    }

    // lastPosition = position.clone()

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
    if (positionAntiCheatNotifyPlayer) {
      player.chat(`[safeZones] Out of bounds. Teleporting to safe position.`)
    }
    cancel(false)
    player.teleport(corrected)
  })
}

// Anti-cheat helper functions

function isPlayerInsideBlock (player: Player, serv: Server, position: Vec3) {
  const blocks = serv.mcData.blocksByStateId
  const chunk = player.world.getLoadedColumnAt(position)
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

interface VelocityCheck {
  maxAllowedSpeed: number // blocks per second
  currentSpeed: number // blocks per second
  reason: string
}

function calculateVelocity (player: Player, lastPosition: Vec3, newPosition: Vec3, deltaTime: number): VelocityCheck {

  // Calculate horizontal and vertical speeds separately
  const horizontalDiff = new Vec3(newPosition.x - lastPosition.x, 0, newPosition.z - lastPosition.z)
  const horizontalSpeed = horizontalDiff.norm() / deltaTime
  const verticalSpeed = Math.abs(newPosition.y - lastPosition.y) / deltaTime

  // Base speed check is only for horizontal movement
  let maxHorizontalSpeed = BASE_WALKING_SPEED * BASE_SPEED_MULTIPLIER
  let maxVerticalSpeed = Math.abs(STANDARD_GRAVITY) * 20 * FALLING_SPEED_BUFFER // Convert to blocks/s and add buffer

  // Apply speed effect if present (effect ID 1)
  if (player.effects?.[1]) {
    const amplifier = player.effects[1].amplifier || 0
    maxHorizontalSpeed *= (1 + (amplifier + 1) * 0.2)
  }

  // For creative mode or flying, allow higher speed
  if (player.gameMode === 1 || player.gameMode === 3 || player.flying) {
    maxHorizontalSpeed *= 10 // Creative/spectator mode multiplier
    maxVerticalSpeed *= 10
  }

  // Check if player was recently knocked back (within last 2 seconds)
  const now = Date.now()
  const lastDamageTime = player.lastDamageTime || 0
  if (now - lastDamageTime < 2000) {
    // Allow much higher speed right after taking damage (knockback)
    maxHorizontalSpeed = Math.max(maxHorizontalSpeed, KNOCKBACK_VELOCITY * 20)
    maxVerticalSpeed = Math.max(maxVerticalSpeed, KNOCKBACK_VELOCITY * 20)
  }

  // Use the appropriate speed comparison based on movement type
  const verticalDiff = newPosition.y - lastPosition.y
  const currentSpeed = verticalDiff < 0 ? verticalSpeed : horizontalSpeed
  const maxAllowedSpeed = verticalDiff < 0 ? maxVerticalSpeed : maxHorizontalSpeed

  let reason = ''
  if (currentSpeed > maxAllowedSpeed) {
    reason = (player.gameMode === 1 || player.gameMode === 3) ? 'creative' :
      player.flying ? 'flying' :
        verticalDiff < 0 ? 'falling' :
          player.effects?.[1] ? `speed ${player.effects[1].amplifier}` :
            now - lastDamageTime < 2000 ? 'knockback' : 'walking'
  }

  return {
    maxAllowedSpeed,
    currentSpeed,
    reason
  }
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
    basePositionAntiCheat?: boolean
    positionAntiCheatNotifyPlayer?: boolean
  }

  interface Server {
    safeZones: AABB[]
    resetSafeZones: () => void
    addSafeZones: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => void
  }
}
