import { Vec3 } from 'vec3'
import { Body, stepBody } from '../entityPhysics'

export const entity = function (entity: Entity, serv: Server, { version }: Options) {
  entity.calculatePhysics = async (delta) => {
    // the box physics works on a copy: `sendPosition` compares the old and the new position
    const body: Body = {
      position: entity.position.clone(),
      velocity: entity.velocity,
      size: entity.size,
      gravity: entity.noGravity ? undefined : entity.gravity,
      terminalvelocity: entity.terminalvelocity,
      friction: entity.friction,
      buoyant: entity.name === 'item' || entity.name === 'experience_orb',
      flying: entity.isFlyer,
      onGround: entity.onGround
    }
    const moved = stepBody(entity.world, body, delta)
    entity.inWater = body.inWater
    entity.inLava = body.inLava
    entity.hitWall = !!(body.hitX || body.hitZ)
    return { position: moved ? body.position : entity.position, onGround: moved ? !!body.onGround : entity.onGround }
  }

  entity.sendVelocity = (vel, maxVel) => {
    const velocity = vel
    const maxVelocity = maxVel
    let scaledVelocity = velocity.scaled(8000 / 20) // from fixed-position/second to unit => 1/8000 blocks per tick
    if (serv.supportFeature('fixedPointPosition')) {
      scaledVelocity = scaledVelocity.scaled(1 / 32)
    }
    scaledVelocity = scaledVelocity.floored()
    entity._writeNearby('entity_velocity', {
      entityId: entity.id,
      velocityX: scaledVelocity.x,
      velocityY: scaledVelocity.y,
      velocityZ: scaledVelocity.z
    })
    if (entity.type !== 'player') {
      if (maxVelocity) entity.velocity = addVelocityWithMax(entity.velocity, velocity, maxVelocity)
      else entity.velocity.add(velocity)
    }
  }

  function addVelocityWithMax (current, newVel, max) {
    let x, y, z
    if (current.x > max.x || current.x < -max.x) x = current.x
    else x = Math.max(-max.x, Math.min(max.x, current.x + newVel.x))
    if (current.y > max.y || current.y < -max.y) y = current.y
    else y = Math.max(-max.y, Math.min(max.y, current.y + newVel.y))
    if (current.z > max.z || current.z < -max.z) z = current.z
    else z = Math.max(-max.z, Math.min(max.z, current.z + newVel.z))
    return new Vec3(x, y, z)
  }
}

export const server = function (serv: Server) {
  serv.commands.add({
    base: 'velocity',
    info: 'Push velocity on player(s)',
    usage: '/velocity <player> <x> <y> <z>',
    op: true,
    parse (str) {
      return str.match(/(.+?) (\d+) (\d+) (\d+)/) || false
    },
    action (params, ctx) {
      const selector = ctx.player ? ctx.player.selectorString(params[1]) : serv.selectorString(params[1])
      const parsedInt = [parseInt(params[2]), parseInt(params[3]), parseInt(params[4])]
      for (const int of parsedInt) {
        if (int > 81) return 'Too much velocity, max is 81.'
      }
      const vec = new Vec3(parsedInt[0], parsedInt[1], parsedInt[2])
      selector.forEach(e => e.sendVelocity(vec, vec.scaled(5)))
    }
  })
}
declare global {
  interface Entity {
    /** Gravity of entity (non-players) to calculate physics. */
    gravity: Vec3
    /** Deceleration (blocks/s^2) of the horizontal velocity while standing on something */
    friction: Vec3
    /** Flying entities (blaze, dragon) ignore liquids; with `noGravity` they stay in the air */
    isFlyer?: boolean
    /** No gravity (flying mobs, projectiles that fly straight) */
    noGravity?: boolean
    inWater?: boolean
    inLava?: boolean
    /** @internal */
    "calculatePhysics": (delta: any) => Promise<{ position: Vec3; onGround: boolean }>
    /** @internal */
    "sendVelocity": (vel: any, maxVel: any) => void
  }
}
