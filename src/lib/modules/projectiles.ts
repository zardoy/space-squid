import { Vec3 } from 'vec3'
import UUID from 'uuid-1345'
import { PhysicsWorld } from '../entityPhysics'

/**
 * Thrown and shot things, simulated by the server: arrows (skeleton, bow), blaze fireballs, ender pearls and eyes of ender.
 * Every projectile is an entity with `customMotion` (the normal entity physics skips it); each tick it moves along its velocity, is checked against blocks and
 * against the boxes of mobs and players on the way, and then `onBlock` / `onEntity` decide what happens.
 */

interface Projectile {
  entity: Entity
  owner?: Entity
  /** blocks / s^2 pulling it down */
  gravity: number
  /** share of the speed lost per second */
  drag: number
  ticks: number
  maxTicks: number
  radius: number
  onBlock?: (at: Vec3, p: Projectile) => void
  onEntity?: (target: Entity, at: Vec3, p: Projectile) => void
  /** custom motion (eye of ender): runs instead of the straight flight */
  step?: (p: Projectile) => boolean
  hitOwner?: boolean
}

const toDegrees = (v: Vec3) => ({ yaw: Math.atan2(-v.x, v.z) * 180 / Math.PI, pitch: -Math.asin(Math.max(-1, Math.min(1, v.y / (v.norm() || 1)))) * 180 / Math.PI })

/** look direction of a player (the server keeps player yaw / pitch as protocol bytes) */
export const lookDirection = (player: Player): Vec3 => {
  const yaw = player.yaw * 2 * Math.PI / 256
  const pitch = player.pitch * 2 * Math.PI / 256
  return new Vec3(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
}

export const server = function (serv: Server, options: Options) {
  const mcData = serv.mcData
  const projectiles = new Set<Projectile>()

  const typeId = (names: string[]) => serv.entityTypeId(names, 'object')

  // NoGravity (entity metadata 5, boolean, 1.9+): clients (mineflayer integrates ender pearls, snowballs, eggs and falling blocks itself) must not move what the server steers
  const metaTypes = (mcData as any).protocol?.types?.entityMetadataEntry?.[1]?.[1]?.type?.[1]?.mappings as Record<string, string> | undefined
  const boolType = Object.entries(metaTypes ?? {}).find(([, name]) => /^bool/.test(String(name)))?.[0]
  const noGravityMetadata = () => (boolType !== undefined && mcData.version['>=']('1.9') ? [{ key: 5, type: Number(boolType), value: true }] : [])

  const spawn = (names: string[], world: any, position: Vec3, velocity: Vec3, owner: Entity | undefined, size = 0.25): Entity | undefined => {
    const id = typeId(names)
    if (id === undefined) return undefined
    const e = serv.initEntity('object', id, world, position.clone())
    e.uuid = UUID.v4()
    e.name = names[0]
    e.velocity = velocity.clone()
    e.size = new Vec3(size, size, size)
    e.gravity = new Vec3(0, 0, 0)
    e.terminalvelocity = new Vec3(99, 99, 99)
    e.friction = new Vec3(0, 0, 0)
    e.noGravity = true
    e.customMotion = true
    const { yaw, pitch } = toDegrees(velocity)
    e.yaw = yaw; e.pitch = pitch; e.yawDeg = yaw
    e.data = (owner?.id ?? 0)
    e.metadata = noGravityMetadata()
    e.updateAndSpawn()
    return e
  }

  serv.spawnPlain = spawn

  const launch = (p: Omit<Projectile, 'ticks'> & { ticks?: number }) => {
    const proj: Projectile = { ticks: 0, ...p }
    projectiles.add(proj)
    return proj
  }

  const hitsBox = (e: Entity, pt: Vec3, r: number) => {
    const w = (e.size?.x ?? 0.6) / 2 + r; const h = e.size?.y ?? 1.8
    return Math.abs(pt.x - e.position.x) <= w && Math.abs(pt.z - e.position.z) <= (e.size?.z ?? e.size?.x ?? 0.6) / 2 + r && pt.y >= e.position.y - r && pt.y <= e.position.y + h + r
  }

  const finish = (p: Projectile) => {
    projectiles.delete(p)
    if (serv.entities[p.entity.id]) p.entity.destroy()
  }

  serv.on('tick', (_delta: number) => {
    const dt = 0.05
    for (const p of [...projectiles]) {
      const e = p.entity
      if (!serv.entities[e.id]) { projectiles.delete(p); continue }
      p.ticks++
      if (p.ticks > p.maxTicks) { finish(p); continue }
      if (p.step) { if (!p.step(p)) finish(p); continue }
      const v = e.velocity
      v.y -= p.gravity * dt
      const drag = Math.max(0, 1 - p.drag * dt)
      v.x *= drag; v.y *= drag; v.z *= drag
      const from = e.position
      const move = v.scaled(dt)
      const len = move.norm()
      const steps = Math.max(1, Math.ceil(len / 0.25))
      const candidates = Object.values(serv.entities).filter(o => o !== e && o.ready && o.world === e.world && !(o as any).dead && (o.type === 'mob' || o.type === 'player') && o.health !== undefined &&
        (p.hitOwner || o !== p.owner) && o.position.distanceTo(from) < len + 24)
      let last = from.clone()
      let result: { kind: 'block' | 'entity' | 'none', at: Vec3, target?: Entity } = { kind: 'none', at: from.plus(move) }
      for (let i = 1; i <= steps; i++) {
        const pt = from.plus(move.scaled(i / steps))
        const block = (e.world as PhysicsWorld).sync.getBlock(new Vec3(Math.floor(pt.x), Math.floor(pt.y), Math.floor(pt.z)))
        const solid = !block || (block.shapes ? block.shapes.some((s: number[]) => pt.x - Math.floor(pt.x) >= s[0] && pt.x - Math.floor(pt.x) <= s[3] && pt.y - Math.floor(pt.y) >= s[1] && pt.y - Math.floor(pt.y) <= s[4] && pt.z - Math.floor(pt.z) >= s[2] && pt.z - Math.floor(pt.z) <= s[5]) : block.boundingBox === 'block')
        if (solid) { result = { kind: 'block', at: last }; break }
        const hit = candidates.find(o => hitsBox(o, pt, p.radius))
        if (hit) { result = { kind: 'entity', at: pt, target: hit }; break }
        last = pt
      }
      e.sendPosition(result.at.clone(), false).catch(() => {})
      if (result.kind === 'none') continue
      if (result.kind === 'block') p.onBlock?.(result.at, p); else p.onEntity?.(result.target!, result.at, p)
      finish(p)
    }
  })

  // ---------------------------------------------------------------- burning
  serv.ignite = (target, seconds) => {
    if (target.type === 'player' && ((target as Player).gameMode === 1 || (target as Player).gameMode === 3)) return
    target.burnUntil = Math.max(target.burnUntil ?? 0, Date.now() + seconds * 1000)
  }
  serv.on('tick', (_d: number, count: number) => {
    if (count % 20 !== 0) return
    const now = Date.now()
    for (const e of Object.values(serv.entities)) {
      if (!e.burnUntil) continue
      if (now > e.burnUntil || (e as any).dead) { e.burnUntil = undefined; continue }
      serv.hurt(e, 1, { knockback: 0 })
    }
  })

  // ---------------------------------------------------------------- arrows and fireballs
  const arrowNames = ['arrow']
  serv.projectiles = {
    shootArrow: (shooter, at, { damage = 3, speed = 24 } = {}) => {
      const from = shooter.position.offset(0, (shooter.size?.y ?? 1.8) * 0.8, 0)
      const dir = at.minus(from)
      const dist = dir.norm()
      // arrows drop while they fly: aim higher by the drop over the flight time (gravity 20 b/s^2, a little extra for the drag)
      const t = dist / speed
      dir.y += 0.5 * 20 * t * t * 1.1
      const v = dir.normalize().scaled(speed)
      const e = spawn(arrowNames, shooter.world, from, v, shooter, 0.5)
      if (!e) return
      launch({
        entity: e, owner: shooter, gravity: 20, drag: 0.2, maxTicks: 200, radius: 0.15,
        onEntity: (target) => { serv.hurt(target, damage, { source: shooter, from: e.position }) }
      })
    },
    shootFireball: (shooter, at) => {
      const from = shooter.position.offset(0, (shooter.size?.y ?? 1.8) * 0.6, 0)
      const dir = at.minus(from).normalize()
      const e = spawn(['small_fireball', 'smallfireball'], shooter.world, from.plus(dir.scaled(1)), dir.scaled(14), shooter, 0.3125)
      if (!e) return
      launch({
        entity: e, owner: shooter, gravity: 0, drag: 0, maxTicks: 160, radius: 0.1,
        onEntity: (target) => { if (serv.hurt(target, 5, { source: shooter, from: e.position })) serv.ignite(target, 4) }
      })
    }
  }

  // ---------------------------------------------------------------- inventory helpers
  const takeOne = (player: Player, slot: number) => {
    if (player.gameMode === 1) return
    const item = player.inventory.slots[slot]
    if (!item) return
    item.count--
    player.inventory.updateSlot(slot, item.count > 0 ? item : null as any)
  }
  const heldSlot = (player: Player, slot: number) => (slot === 45 ? 45 : 36 + slot)

  // ---------------------------------------------------------------- bow
  serv.once('asap', () => {
    if (mcData.itemsByName.bow) serv.onItemUse('bow', ({ player }) => { player.bowStart = Date.now() })
  })
  /** the use key was released (block_dig status 5): a drawn bow shoots */
  serv.releaseBow = (player) => {
    const held = player.inventory.slots[36 + player.heldItemSlot]
    const started = player.bowStart
    if (held?.name !== 'bow' || !started) return
    player.bowStart = undefined
    const t = Math.min(1, (Date.now() - started) / 1000)
    const power = (t * t + t * 2) / 3
    if (power < 0.1) return
    let arrowSlot = -1
    if (player.gameMode !== 1) {
      arrowSlot = player.inventory.slots.findIndex(i => i && /^(arrow|tipped_arrow|spectral_arrow)$/.test(i.name))
      if (arrowSlot < 0) return
    }
    const eye = player.position.offset(0, 1.62, 0)
    const dir = lookDirection(player)
    const e = spawn(arrowNames, player.world, eye.plus(dir.scaled(0.5)), dir.scaled(power * 60), player, 0.5)
    if (!e) return
    if (arrowSlot >= 0) takeOne(player, arrowSlot)
    const damage = Math.ceil(2 * power * 3) + (power >= 1 ? 1 : 0)
    launch({
      entity: e, owner: player, gravity: 20, drag: 0.2, maxTicks: 400, radius: 0.15,
      onEntity: (target) => { target.attackedBy?.(player, damage); serv.hurt(target, damage, { source: player, from: e.position, knockback: 4 }) }
    })
  }

  // ---------------------------------------------------------------- ender pearl
  const pearlCooldown = new WeakMap<Player, number>()
  /** a spot where a player (feet + 2 blocks) fits, at or just below `at` */
  const standAt = (world: any, at: Vec3): Vec3 => {
    const free = (x: number, y: number, z: number) => {
      const b = world.sync.getBlock(new Vec3(Math.floor(x), Math.floor(y), Math.floor(z)))
      return !!b && b.boundingBox !== 'block'
    }
    for (const dy of [0, -1, 1, -2, 2]) {
      const y = Math.floor(at.y) + dy
      if (free(at.x, y, at.z) && free(at.x, y + 1, at.z)) return new Vec3(at.x, y + (dy === 0 ? at.y - Math.floor(at.y) : 0), at.z)
    }
    return at.clone()
  }
  serv.once('asap', () => {
    serv.onItemUse('ender_pearl', ({ player, slot }) => {
      const now = Date.now()
      if (now - (pearlCooldown.get(player) ?? 0) < 1000) return
      pearlCooldown.set(player, now)
      const eye = player.position.offset(0, 1.62, 0)
      const dir = lookDirection(player)
      const e = spawn(['ender_pearl', 'thrown_enderpearl', 'thrownenderpearl'], player.world, eye.plus(dir.scaled(0.3)), dir.scaled(30), player)
      if (!e) { serv.warn?.('this version has no ender pearl entity'); return }
      takeOne(player, heldSlot(player, slot))
      const land = (at: Vec3) => {
        if (!serv.players.includes(player) || player.world !== e.world) return
        void player.teleport(standAt(e.world, at))
        if (player.gameMode === 0 || player.gameMode === 2) player.takeDamage({ damage: 5, velocity: new Vec3(0, 0, 0), animation: true, sound: 'mob.endermen.portal' } as any)
      }
      launch({ entity: e, owner: player, gravity: 12, drag: 0.2, maxTicks: 400, radius: 0.1, onBlock: land, onEntity: (_t, at) => land(at) })
    })

    // ---------------------------------------------------------------- eye of ender
    serv.onItemUse('ender_eye', ({ player, slot }) => {
      void throwEye(player, slot)
    })
  })

  /** position of the stronghold nearest to (x, z); undefined outside the overworld / when the generator has none */
  const nearestStronghold = async (world: any, x: number, z: number): Promise<[number, number] | undefined> => {
    if (world.environment !== 'normal' || !world.strongholds) return undefined
    const nearest = (list: Array<[number, number]>) => list.reduce<[number, number] | undefined>((best, s) => !best || Math.hypot(s[0] - x, s[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? s : best, undefined)
    // the first rings are enough unless the player is far out (the ring list is ordered from the centre outwards)
    let found = nearest(await world.strongholds(9))
    if (!found || Math.hypot(found[0] - x, found[1] - z) > 3200) found = nearest(await world.strongholds())
    return found
  }
  serv.nearestStronghold = (world, x, z) => nearestStronghold(world, x, z)

  const eyeBusy = new WeakSet<Player>()
  async function throwEye (player: Player, slot: number) {
    if (eyeBusy.has(player)) return
    eyeBusy.add(player)
    try {
      const world: any = player.world
      // say why there is nothing to point at (the eye is not used up in these cases)
      if (world.environment !== 'normal') { player.chat?.('The eye of ender only points to strongholds in the overworld.'); return }
      if (!world.strongholds) { player.chat?.(`This world has no strongholds (world generator: ${world.generatorName ?? 'unknown'}, only the noise generator makes them).`); return }
      let target: [number, number] | undefined
      try { target = await nearestStronghold(world, player.position.x, player.position.z) } catch (e) { serv.warn?.('stronghold search failed: ' + (e as Error).message); player.chat?.('The stronghold search failed: ' + (e as Error).message); return }
      if (!target) { player.chat?.('No stronghold was found in this world.'); return }
      const start = player.position.offset(0, 1.62 * 0.5 + 0.2, 0)
      const e = spawn(['eye_of_ender', 'eye_of_ender_signal', 'eyeofendersignal'], player.world, start, new Vec3(0, 0, 0), player)
      if (!e) { serv.warn?.('this version has no eye of ender entity'); return }
      takeOne(player, heldSlot(player, slot))
      // EyeOfEnder.signalTo: further than 12 blocks away it flies 12 blocks towards the target and 8 up, otherwise it flies to it
      const dx = target[0] - start.x; const dz = target[1] - start.z
      const d = Math.hypot(dx, dz)
      const goal = d > 12 ? new Vec3(start.x + dx / d * 12, start.y + 8, start.z + dz / d * 12) : new Vec3(target[0], 30, target[1])
      const survives = Math.floor(Math.random() * 5) > 0
      launch({
        entity: e, owner: player, gravity: 0, drag: 0, maxTicks: 90, radius: 0,
        step: (p) => {
          const ent = p.entity
          const v = ent.velocity
          const gx = goal.x - ent.position.x; const gz = goal.z - ent.position.z
          const horiz = Math.hypot(gx, gz)
          const angle = Math.atan2(gz, gx)
          // per tick (20/s): speed eases towards the remaining distance, y towards the goal height (blocks per tick -> per second)
          const hspeed = Math.hypot(v.x, v.z) / 20
          let speed = hspeed + 0.0025 * (horiz - hspeed)
          let vy = v.y / 20
          if (horiz < 1) { speed *= 0.8; vy *= 0.8 }
          const dir = ent.position.y < goal.y ? 1 : -1
          vy += (dir - vy) * 0.015
          v.set(Math.cos(angle) * speed * 20, vy * 20, Math.sin(angle) * speed * 20)
          void ent.sendPosition(ent.position.plus(v.scaled(0.05)), false)
          if (p.ticks > 80) {
            if (survives) serv.dropItem(ent.world, ent.position, 'ender_eye', 1, new Vec3(0, 2, 0))
            return false
          }
          return true
        }
      })
    } finally { eyeBusy.delete(player) }
  }
}

export const player = function (player: Player, serv: Server) {
  player._client.on('block_dig', (packet: { status: number }) => { if (packet.status === 5) serv.releaseBow(player) })
}

declare global {
  interface Entity {
    /** moved by its own module (projectiles), not by the entity physics */
    customMotion?: boolean
    burnUntil?: number
  }
  interface Server {
    /** sets the target on fire for a few seconds (1 half heart per second, none for creative players) */
    ignite: (target: Entity, seconds: number) => void
    /** block position (x, z) of the stronghold nearest to a point of a world, if it has any */
    nearestStronghold: (world: any, x: number, z: number) => Promise<[number, number] | undefined>
    releaseBow: (player: Player) => void
  }
  interface Player {
    bowStart?: number
  }
}
