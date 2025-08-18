import { Vec3 } from 'vec3'

// Module to make positions safe to move to.
// If a client sends a position outside by more than threshold, ignore and teleport back inside.
// Also includes anti-cheat features for block collision and movement speed.

const THRESHOLD = 0.5
const PLAYER_SIZE = new Vec3(0.6, 1.8, 0.6) // Standard Minecraft player hitbox
// Vanilla-like movement validation constants (from ServerGamePacketListenerImpl.java)
const VANILLA_SPEED_LIMIT_NORMAL = 100.0 // Normal movement limit (squared distance)
const VANILLA_SPEED_LIMIT_FLYING = 300.0 // Elytra/flying limit (squared distance)
const KNOCKBACK_VELOCITY = 8 // From pvp.ts KNOCKBACK_MULTIPLIER
const KNOCKBACK_GRACE_PERIOD = 2000 // Allow higher speed for 2 seconds after damage

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
  let packetCount = 0 // Track move packets per tick (vanilla approach)
  serv.on('tick', (deltaTime, tickCount) => {
    packetCount = 0
  })

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
    // if (basePositionAntiCheat && isPlayerInsideBlock(player, serv, position)) {
    //   cancel(false)
    //   if (positionAntiCheatNotifyPlayer) {
    //     player.chat(`[safeZones] Block collision detected. Teleporting to safe position.`)
    //   }
    //   player.teleport(lastPosition ?? findSafePosition(player, serv, position))
    //   return
    // }

    // Anti-cheat: Movement speed limit (vanilla-like approach)
    if (basePositionAntiCheat && lastPosition && !teleport) {
      packetCount++

      // Limit packet count per tick like vanilla (max 5 meaningful packets)
      if (packetCount > 5) {
        packetCount = 1
      }

      const speedCheck = validateMovementSpeed(player, lastPosition, position, packetCount)
      if (!speedCheck.isValid) {
        if (positionAntiCheatNotifyPlayer) {
          player.chat(
            `[safeZones] ${speedCheck.reason} ` +
            `(distance²=${speedCheck.distanceSquared.toFixed(2)}, ` +
            `limit=${speedCheck.speedLimit.toFixed(2)}, ` +
            `velocity²=${speedCheck.currentVelocitySquared.toFixed(2)})`
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

interface SpeedValidationResult {
  isValid: boolean
  reason: string
  distanceSquared: number
  speedLimit: number
  currentVelocitySquared: number
}

function validateMovementSpeed (player: Player, lastPosition: Vec3, newPosition: Vec3, packetCount: number): SpeedValidationResult {
  // Calculate movement delta (like vanilla)
  const deltaX = newPosition.x - lastPosition.x
  const deltaY = newPosition.y - lastPosition.y
  const deltaZ = newPosition.z - lastPosition.z

  // Calculate squared distance moved (vanilla approach for efficiency)
  const distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ

  // Get player's current velocity squared (would be from entity.getDeltaMovement().lengthSqr() in vanilla)
  // Since we don't track this exactly, we'll use a reasonable estimate
  // Vanilla subtracts current velocity from distance to allow for momentum
  // We'll use a moderate estimate to allow for normal sprinting movement
  const estimatedVelocitySquared = Math.min(distanceSquared * 0.6, 50) // Allow some momentum, capped

  // Determine speed limit based on player state
  let speedLimit = VANILLA_SPEED_LIMIT_NORMAL
  let mode = 'walking'

  // Assume player is always sprinting (as requested) - increases speed by ~30%
  // Sprinting in vanilla increases movement by 1.3x, so squared distance by 1.69x
  speedLimit *= 1.69 // 1.3^2 for sprinting
  mode = 'sprinting'

  // Check if player is flying/creative (higher limit)
  if (player.gameMode === 1 || player.gameMode === 3 || player.flying) {
    speedLimit = VANILLA_SPEED_LIMIT_FLYING * 1.69 // Also apply sprinting to creative
    mode = 'creative/flying+sprint'
  }

  // Apply speed effect multiplier if present (effect ID 1 = speed)
  if (player.effects?.[1]) {
    const amplifier = player.effects[1].amplifier || 0
    const speedMultiplier = 1 + (amplifier + 1) * 0.2
    speedLimit *= speedMultiplier * speedMultiplier // Square it since we're comparing squared distances
    mode = `speed ${amplifier}`
  }

  // Check if player was recently damaged (allow higher speed for knockback)
  const now = Date.now()
  const lastDamageTime = player.lastDamageTime || 0
  if (now - lastDamageTime < KNOCKBACK_GRACE_PERIOD) {
    speedLimit = Math.max(speedLimit, KNOCKBACK_VELOCITY * KNOCKBACK_VELOCITY * 4) // Very generous for knockback
    mode = 'knockback'
  }

  // Apply packet count multiplier (vanilla does this)
  const adjustedLimit = speedLimit * packetCount

  // Vanilla check: distanceSquared - currentVelocitySquared > limit
  const excessMovement = distanceSquared - estimatedVelocitySquared
  const isValid = excessMovement <= adjustedLimit

  return {
    isValid,
    reason: isValid ? 'valid' : `Movement too fast (${mode})`,
    distanceSquared,
    speedLimit: adjustedLimit,
    currentVelocitySquared: estimatedVelocitySquared
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
