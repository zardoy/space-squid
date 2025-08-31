import { Vec3 } from 'vec3'

export const player = function (player: Player) {
  player._client.on('look', ({ yaw, pitch, onGround } = {} as never) => {
    receivedLook(yaw, pitch, onGround)
  })

  // float (degrees) --> byte (1/256 "degrees")
  function convFromClient (f) {
    let b = Math.floor((f % 360) * 256 / 360)
    if (b < -128) b += 256
    else if (b > 127) b -= 256
    return b
  }

  // byte (1/256 "degrees") --> float (degrees)
  function convToClient (b) {
    let f = (b * 360 / 256)
    if (f < 0) f += 360
    return f
  }

  function receivedLook (yaw, pitch, onGround) {
    player.behavior('look', {
      yaw,
      pitch,
      onGround
    }, () => {
      const convYaw = convFromClient(yaw)
      const convPitch = convFromClient(pitch)
      if (convYaw === player.yaw && convPitch === player.pitch) return
      player._writeOthersNearby('entity_look', {
        entityId: player.id,
        yaw: convYaw,
        pitch: convPitch,
        onGround
      })
      player.yaw = convYaw
      player.pitch = convPitch
      player.onGround = onGround
      player._writeOthersNearby('entity_head_rotation', {
        entityId: player.id,
        headYaw: convYaw
      })
    }, () => {
      player.sendSelfPosition()
    })
  }

  player._client.on('position', ({ x, y, z, onGround } = {} as never) => {
    player.sendPosition((new Vec3(x, y, z)), onGround)
  })

  player._client.on('position_look', ({ x, y, z, onGround, yaw, pitch } = {} as never) => {
    player.sendPosition((new Vec3(x, y, z)), onGround)
    receivedLook(yaw, pitch, onGround)
  })

  player.lastTeleportId ??= 0
  player.sendSelfPosition = (sendChunks = true) => {
    // double position in all versions
    player._client.write('position', {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: convToClient(player.yaw),
      pitch: convToClient(player.pitch),
      flags: 0x00,
      teleportId: ++player.lastTeleportId
    })
    if (sendChunks) player.sendChunkWhenMove()
  }

  player.teleport = async (position) => {
    const notCancelled = await player.sendPosition(position, false, true)
    if (!notCancelled) return
    player.sendSelfPosition()

    player.pendingTeleport = {
      position: position.clone(),
      teleportId: player.lastTeleportId
    }
  }

  player.onPacket('teleport_confirm', ({ teleportId }) => {
    if (teleportId === player.lastTeleportId && player.pendingTeleport) {
      // validate the position
      player.validateNextPosition = player.pendingTeleport.position
      player.pendingTeleport = undefined
    } else {
      console.log('Invalid teleport confirm packet received', player.pendingTeleport, 'received:', teleportId)
    }
  })

  player.sendAbilities = () => {
    const isInvulnerable = player.gameMode === 1 || player.gameMode === 3 // Creative or Spectator
    const canFly = player.gameMode === 1 || player.gameMode === 3
    const isFlying = player.flying && canFly
    const canInstantlyBuild = player.gameMode === 1 // Creative mode
    // Flags:
    // 0x1 = Invulnerable
    // 0x2 = Flying
    // 0x4 = Allow Flying
    // 0x8 = Creative Mode (Instant Break)
    const f = (+isInvulnerable * 1) + (+isFlying * 2) + (+canFly * 4) + (+canInstantlyBuild * 8)
    // const walkingSpeed = 0.2 * (1 + (player.effects[1] !== null ? (player.effects[1].amplifier + 1) : 0) * 0.2)
    const flyingSpeed = 0.05000000074505806 // todo calculate instead
    const walkingSpeed = 0.10000000149011612 // todo use actual abilities from level.dat
    player.writePacket('abilities', {
      flags: f,
      walkingSpeed,
      flyingSpeed
    })
  }
}

export const entity = function (entity: Entity, serv: Server) {
  entity.sendPosition = async (position, onGround, teleport = false) => {
    if (typeof position === 'undefined') throw new Error('position is undefined')
    if (entity.position.equals(position) && entity.onGround === onGround) return true
    let cancelled = false
    await entity.behavior('move', {
      position,
      onGround,
      teleport
    }, ({ position, onGround }) => {
      // known position is very important because the diff (/delta) send to players is floored hence is not precise enough
      // storing the known position allows to compensate next time a diff is sent
      // without the known position, the error accumulate fast and player position is incorrect from the point of view
      // of other players
      entity.knownPosition = entity.knownPosition === undefined ? entity.position : entity.knownPosition

      const diff = position.minus(entity.knownPosition)

      let maxDelta = 0
      if (serv.supportFeature('fixedPointDelta')) {
        maxDelta = 3
      } else if (serv.supportFeature('fixedPointDelta128')) {
        maxDelta = 7
      }

      if (diff.abs().x > maxDelta || diff.abs().y > maxDelta || diff.abs().z > maxDelta) {
        let entityPosition

        if (serv.supportFeature('fixedPointPosition')) {
          entityPosition = position.scaled(32).floored()
        } else if (serv.supportFeature('doublePosition')) {
          entityPosition = position
        }
        entity._writeOthersNearby('entity_teleport', {
          entityId: entity.id,
          x: entityPosition.x,
          y: entityPosition.y,
          z: entityPosition.z,
          yaw: entity.yaw,
          pitch: entity.pitch,
          onGround
        })
        entity.knownPosition = position
      } else if (diff.distanceTo(new Vec3(0, 0, 0)) !== 0) {
        let delta
        if (serv.supportFeature('fixedPointDelta')) {
          delta = diff.scaled(32).floored()
          entity.knownPosition = entity.knownPosition.plus(delta.scaled(1 / 32))
        } else if (serv.supportFeature('fixedPointDelta128')) {
          delta = diff.scaled(32).scaled(128).floored()
          entity.knownPosition = entity.knownPosition.plus(delta.scaled(1 / 32 / 128))
        }
        entity._writeOthersNearby('rel_entity_move', {
          entityId: entity.id,
          dX: delta.x,
          dY: delta.y,
          dZ: delta.z,
          onGround
        })
      }

      entity.position = position
      entity.onGround = onGround
    }, () => {
      cancelled = true
      if (entity.type === 'player') entity.sendSelfPosition()
    })
    return !cancelled
  }

  entity.teleport = (pos) => { // Overwritten in players inject above
    entity.sendPosition(pos, false, true)
  }
}
declare global {
  interface Player {
    lastTeleportId: number
    validateNextPosition?: Vec3
    "sendAbilities": () => void
    /** Position we're expecting the client to move to after teleport */
    pendingTeleport?: { position: Vec3, teleportId: number }
  }
  interface Entity {
    /** ID of entity on server */
    id: number // do we need 2 ids?
    /** @internal */
    uuid: string
    /** Current position (currently in fixed position (x32 what you'd expect) so do entity.position.scaled(1/32) to get normal position) */
    position: Vec3
    /** @internal */
    velocity: Vec3
    /** Used to calculate collisions for server-side entities */
    size: Vec3
    knownPosition: Vec3
    /** Yaw of entity (rotation looking up and down) */
    yaw: number
    /** Pitch of entity (rotation sideways) */
    pitch: number
    /** @internal */
    onGround: boolean
    /**
     * Using to actually update player's position, that's why it also sends chunks by default
     * @internal */
    "sendSelfPosition": (sendChunks?: boolean) => void
    /** @internal */
    "sendPosition": (position: Vec3, onGround: boolean, teleport?: boolean) => Promise<boolean>
    "teleport": (pos: Vec3) => void
  }

  interface PlayerBehaviorInputMap {
    'move': {
      _input: {
        position: Vec3
        onGround: boolean
        teleport: boolean
      }
    }
    'look': {
      _input: {
        yaw: number
        pitch: number
        onGround: boolean
      }
    }
  }
}
