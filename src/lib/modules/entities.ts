import { Vec3 } from 'vec3'

const isPlayer = (arg: Entity): arg is Player => arg.type === 'player'

export const server = function (serv: Server) {
  let ticking = false
  serv.on('tick', function (delta) {
    if (ticking || delta > 1) { return }
    ticking = true
    Promise.all(
      Object.keys(serv.entities).map(async (id) => {
        const entity = serv.entities[id]
        if (!entity.ready) return
        if (entity.deathTime && Date.now() - entity.bornTime >= entity.deathTime) {
          entity.destroy()
          return
        } else if (entity.pickupTime && Date.now() - entity.bornTime >= entity.pickupTime) {
          const players = serv.getNearby({
            world: entity.world,
            position: entity.position,
            radius: 1.75 // Seems good for now
          })
          if (players.length) {
            players[0].collect(entity as any)
          }
        }
        // if (isPlayer(entity) && entity.isFake && !entity.size) {
        //   entity.size = new Vec3(0.6, 1.8, 0.6)
        //   entity.gravity = new Vec3(0, -20, 0)
        //   entity.friction = new Vec3(0.6, 0.6, 0.6)
        //   entity.terminalvelocity = new Vec3(27, 27, 27)
        // }
        // every half second (spread over the ticks by id) the clients get the absolute position of moving mobs and objects: clients that predict movement themselves drift (see sendAbsolute)
        if (entity.type !== 'player' && entity.velocity && (serv.tickCount + entity.id) % 10 === 0 && (!entity.onGround || entity.velocity.norm() > 0.01)) entity.sendAbsolute()
        if (!entity.velocity || !entity.size || entity.customMotion) return
        const { position, onGround } = await entity.calculatePhysics(delta)
        // sendPosition does nothing when neither the position nor onGround changed; an object that just landed has no velocity left but still has to be moved
        if (entity.type === 'mob' || entity.type === 'player' || entity.type === 'object') await entity.sendPosition(position, onGround)
      })
    )
      .then(() => { ticking = false })
      .catch((err) => setTimeout(() => { throw err }, 0))
  })
}

export const entity = function (entity) {
  entity.sendMetadata = (data) => {
    entity._writeOthersNearby('entity_metadata', {
      entityId: entity.id,
      metadata: data
    })
  }

  entity.setAndUpdateMetadata = (data) => {
    entity.metadata = data
    entity.sendMetadata(data)
  }
}
declare global {
  interface Entity {
    /** How much time before an entity despawns (in ms) */
    deathTime?: number
    /** How long before an entity can be picked up (in ms) */
    pickupTime?: number
    /** Sub-category of entity. For mobs, this is which mob (Zombie/Skeleton, etc). For objects, this is which object (Arrow/Dropped item, etc) */
    name?: string
    /** Either "player", "mob", or "object" (currently) */
    type: string
    /** @internal */
    "sendMetadata": (data: any) => void
    /** @internal */
    "setAndUpdateMetadata": (data: any) => void
  }
}
