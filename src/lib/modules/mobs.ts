import { Vec3 } from 'vec3'

/**
 * Mobs with a small AI: they walk (or fly) at the nearest player and hurt it, wander when nothing is around, take damage, die and drop things.
 * Everything is simplified on purpose: straight line movement with jumping over one block steps (no path finding), no line of sight, no spawning rules
 * (mobs come from spawners, `/summon` and spawn eggs), no persistence.
 *
 *  - `serv.mobDefs`            behaviour table by mob name
 *  - `serv.entityTypeId`       entity type id of a name for this version (`ender_pearl`, `blaze`, ...)
 *  - `serv.dropItem`           drops an item entity
 *  - `serv.hurt`               damage with armour, i-frames and knockback for players and mobs
 *  - `serv.explode`            explosion: damage, knockback and (optionally) broken blocks
 *  - `serv.projectiles`        see projectiles.ts
 */

export type MobAi = 'melee' | 'creeper' | 'skeleton' | 'blaze' | 'wander' | 'neutral' | 'dragon' | 'none'

export interface MobDef {
  health: number
  ai: MobAi
  /** blocks per second */
  speed?: number
  /** half hearts */
  damage?: number
  /** blocks a player is noticed from */
  aggro?: number
  flies?: boolean
  xp?: number
  /** [item, min, max, chance 0..1] */
  drops?: Array<[string, number, number, number?]>
  /** [width, height] when minecraft-data has none */
  size?: [number, number]
}

const MOB_DEFS: Record<string, MobDef> = {
  zombie: { health: 20, ai: 'melee', speed: 3.2, damage: 3, aggro: 35, xp: 5, drops: [['rotten_flesh', 0, 2], ['iron_ingot', 1, 1, 0.025], ['carrot', 1, 1, 0.025], ['potato', 1, 1, 0.025]] },
  husk: { health: 20, ai: 'melee', speed: 3.2, damage: 3, aggro: 35, xp: 5, drops: [['rotten_flesh', 0, 2]] },
  drowned: { health: 20, ai: 'melee', speed: 3.2, damage: 3, aggro: 35, xp: 5, drops: [['rotten_flesh', 0, 2]] },
  zombie_villager: { health: 20, ai: 'melee', speed: 3.2, damage: 3, aggro: 35, xp: 5, drops: [['rotten_flesh', 0, 2]] },
  zombified_piglin: { health: 20, ai: 'neutral', speed: 4.5, damage: 5, aggro: 20, xp: 5, drops: [['rotten_flesh', 0, 1], ['gold_nugget', 0, 1], ['gold_ingot', 1, 1, 0.025]] },
  zombie_pigman: { health: 20, ai: 'neutral', speed: 4.5, damage: 5, aggro: 20, xp: 5, drops: [['rotten_flesh', 0, 1], ['gold_nugget', 0, 1]] },
  skeleton: { health: 20, ai: 'skeleton', speed: 3.2, damage: 3, aggro: 16, xp: 5, drops: [['bone', 0, 2], ['arrow', 0, 2]] },
  stray: { health: 20, ai: 'skeleton', speed: 3.2, damage: 3, aggro: 16, xp: 5, drops: [['bone', 0, 2], ['arrow', 0, 2]] },
  wither_skeleton: { health: 20, ai: 'melee', speed: 3.4, damage: 5, aggro: 16, xp: 5, drops: [['bone', 0, 2], ['coal', 0, 1, 0.33], ['wither_skeleton_skull', 1, 1, 0.025]], size: [0.7, 2.4] },
  spider: { health: 16, ai: 'melee', speed: 5.0, damage: 2, aggro: 16, xp: 5, drops: [['string', 0, 2], ['spider_eye', 1, 1, 0.33]] },
  cave_spider: { health: 12, ai: 'melee', speed: 5.0, damage: 2, aggro: 16, xp: 5, drops: [['string', 0, 2], ['spider_eye', 1, 1, 0.33]] },
  silverfish: { health: 8, ai: 'melee', speed: 4.5, damage: 1, aggro: 12, xp: 5 },
  creeper: { health: 20, ai: 'creeper', speed: 3.4, damage: 0, aggro: 16, xp: 5, drops: [['gunpowder', 0, 2]] },
  enderman: { health: 40, ai: 'neutral', speed: 6, damage: 7, aggro: 64, xp: 5, drops: [['ender_pearl', 0, 1]] },
  blaze: { health: 20, ai: 'blaze', speed: 3.5, damage: 5, aggro: 48, flies: true, xp: 10, drops: [['blaze_rod', 0, 1]] },
  ghast: { health: 10, ai: 'none', flies: true, xp: 5, drops: [['ghast_tear', 0, 1], ['gunpowder', 0, 2]] },
  magma_cube: { health: 16, ai: 'melee', speed: 3, damage: 4, aggro: 16, xp: 4, drops: [['magma_cream', 0, 1, 0.25]] },
  slime: { health: 16, ai: 'melee', speed: 3, damage: 2, aggro: 16, xp: 4, drops: [['slime_ball', 0, 2]] },
  witch: { health: 26, ai: 'melee', speed: 3.2, damage: 3, aggro: 16, xp: 5, drops: [['glass_bottle', 0, 2], ['redstone', 0, 2], ['stick', 0, 2], ['sugar', 0, 2]] },
  piglin: { health: 16, ai: 'neutral', speed: 4.5, damage: 5, aggro: 16, xp: 5, drops: [['gold_ingot', 0, 1, 0.1]] },
  piglin_brute: { health: 50, ai: 'melee', speed: 4.5, damage: 7, aggro: 24, xp: 20, drops: [['gold_ingot', 0, 1, 0.1]] },
  hoglin: { health: 40, ai: 'melee', speed: 5, damage: 6, aggro: 16, xp: 5, drops: [['porkchop', 2, 4], ['leather', 0, 1]] },
  cow: { health: 10, ai: 'wander', speed: 1.5, xp: 2, drops: [['leather', 0, 2], ['beef', 1, 3]] },
  mooshroom: { health: 10, ai: 'wander', speed: 1.5, xp: 2, drops: [['leather', 0, 2], ['beef', 1, 3]] },
  pig: { health: 10, ai: 'wander', speed: 1.5, xp: 2, drops: [['porkchop', 1, 3]] },
  sheep: { health: 8, ai: 'wander', speed: 1.5, xp: 2, drops: [['white_wool', 1, 1], ['mutton', 1, 2]] },
  chicken: { health: 4, ai: 'wander', speed: 1.5, xp: 2, drops: [['feather', 0, 2], ['chicken', 1, 1]] },
  rabbit: { health: 3, ai: 'wander', speed: 3, xp: 2, drops: [['rabbit_hide', 0, 1], ['rabbit', 0, 1]] },
  horse: { health: 22, ai: 'wander', speed: 2, xp: 2, drops: [['leather', 0, 2]] },
  villager: { health: 20, ai: 'wander', speed: 1.2, xp: 0 },
  wolf: { health: 8, ai: 'neutral', speed: 4.5, damage: 4, aggro: 8, xp: 2 },
  ender_dragon: { health: 200, ai: 'dragon', flies: true, xp: 0, size: [16, 8] },
  end_crystal: { health: 1, ai: 'none', xp: 0 }
}

/** names of older versions (1.8: `PigZombie`, `CaveSpider`, `EnderDragon`, ...) */
const norm = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
const ALIASES: Record<string, string> = { pigzombie: 'zombie_pigman', pig_zombie: 'zombie_pigman', ender_crystal: 'end_crystal', endercrystal: 'end_crystal', lavaslime: 'magma_cube', mushroom_cow: 'mooshroom', villager_golem: 'iron_golem' }

export const defOf = (name: string | undefined): MobDef | undefined => {
  if (!name) return undefined
  const n = norm(name)
  return MOB_DEFS[ALIASES[n] ?? n]
}

const ARMOR_POINTS: Record<string, [number, number, number, number]> = { leather: [1, 3, 2, 1], golden: [2, 5, 3, 1], gold: [2, 5, 3, 1], chainmail: [2, 5, 4, 1], iron: [2, 6, 5, 2], diamond: [3, 8, 6, 3], netherite: [3, 8, 6, 3], turtle: [2, 0, 0, 0] }
const ARMOR_PARTS = ['helmet', 'chestplate', 'leggings', 'boots']

/** armour points (half chestplates) of the armour a player wears: the sum over the four armour slots, 5..8 of the inventory window */
export function armorPoints (player: Player): number {
  let total = 0
  for (let slot = 5; slot <= 8; slot++) {
    const name = player.inventory?.slots[slot]?.name
    const m = name && /^(.*)_(helmet|chestplate|leggings|boots)$/.exec(name)
    if (m) total += ARMOR_POINTS[m[1]]?.[ARMOR_PARTS.indexOf(m[2])] ?? 0
  }
  return total
}

/** half hearts of damage a player deals with the item in hand */
export function weaponDamage (name: string | undefined): number {
  if (!name) return 1
  const m = /^(wooden|stone|golden|gold|iron|diamond|netherite)_(sword|axe|pickaxe|shovel|hoe)$/.exec(name)
  if (m) {
    const tier = { wooden: 0, golden: 0, gold: 0, stone: 1, iron: 2, diamond: 3, netherite: 4 }[m[1]] as number
    switch (m[2]) {
      case 'sword': return 4 + tier
      case 'axe': return [7, 9, 9, 9, 10][tier]
      case 'pickaxe': return 2 + tier
      case 'shovel': return 2.5 + tier
      default: return 1
    }
  }
  if (name === 'trident') return 9
  return 1
}

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

export const server = function (serv: Server, options: Options) {
  const mcData = serv.mcData
  const flat = serv.supportFeature('theFlattening')
  serv.mobDefs = MOB_DEFS

  /** entity type id of the first name that exists in this version (`kind`: `object` / `mob` for 1.12 and older, where one name can exist twice) */
  serv.entityTypeId = (names: string | string[], kind?: 'object' | 'mob') => {
    for (const name of Array.isArray(names) ? names : [names]) {
      const want = norm(name.replace(/^minecraft:/, ''))
      for (const e of (mcData.entitiesArray ?? Object.values(mcData.entities)) as any[]) {
        if (norm(e.name) !== want && norm(e.name) !== want.replace(/_/g, '')) continue
        if (kind && flat === false && e.type !== kind) continue
        return e.id as number
      }
    }
    return undefined
  }

  serv.dropItem = (world, position, name, count = 1, velocity) => {
    const item = mcData.itemsByName[name] ?? mcData.blocksByName[name]
    const entity = serv.entityTypeId(['item'], 'object')
    if (!item || entity === undefined || count <= 0) return undefined
    return serv.spawnObject(entity, world, position.clone(), {
      velocity: velocity ?? new Vec3((Math.random() - 0.5) * 3, 4 + Math.random() * 2, (Math.random() - 0.5) * 3),
      itemId: item.id,
      itemCount: count,
      pickupTime: 500,
      deathTime: 5 * 60 * 1000
    })
  }

  // ---------------------------------------------------------------- damage
  /** hurts a player or mob: armour, 0.5 s of damage immunity, knockback away from `from`. Returns false when nothing happened. */
  serv.hurt = (target, damage, { source, from, knockback = 6, maxDamage = Infinity }: { source?: Entity, from?: Vec3, knockback?: number, maxDamage?: number } = {}) => {
    if (!target || target.invincible || (target as any).dead) return false
    const now = Date.now()
    if (target.lastHurt && now - target.lastHurt < 500 && damage <= (target.lastHurtDamage ?? 0)) return false
    if (target.type === 'player') {
      const p = target as Player
      if (p.gameMode === 1 || p.gameMode === 3 || !p.health || p.health <= 0) return false
      damage *= 1 - Math.min(20, armorPoints(p)) / 25
    }
    damage = Math.min(damage, maxDamage)
    target.lastHurt = now
    target.lastHurtDamage = damage
    const dir = from ? target.position.minus(from) : new Vec3(0, 0, 0)
    dir.y = 0
    const len = dir.norm()
    const velocity = len > 0.01 ? new Vec3(dir.x / len * knockback, 5, dir.z / len * knockback) : new Vec3(0, 3, 0)
    target.takeDamage({ damage, velocity, maxVelocity: new Vec3(12, 12, 12), animation: target.type === 'player', source } as any)
    if (target.type !== 'player' && target.health > 0) target._writeOthersNearby('entity_status', { entityId: target.id, entityStatus: 2 })
    return true
  }

  // ---------------------------------------------------------------- explosions
  serv.explode = async (world, pos, power, { breakBlocks = true, source, maxDamage = Infinity, fire = false }: { breakBlocks?: boolean, source?: Entity, maxDamage?: number, fire?: boolean } = {}) => {
    serv._writeNearby('explosion', { x: pos.x, y: pos.y, z: pos.z, radius: power, affectedBlockRecords: [], playerMotionX: 0, playerMotionY: 0, playerMotionZ: 0 } as any, { world, position: pos })
    const reach = power * 2
    for (const e of Object.values(serv.entities)) {
      if (!e.ready || e.world !== world || e === source) continue
      if (e.type !== 'player' && e.type !== 'mob') continue
      const centre = e.position.offset(0, (e.size?.y ?? 1.8) / 2, 0)
      const dist = centre.distanceTo(pos)
      if (dist > reach) continue
      const impact = 1 - dist / reach
      const damage = Math.floor((impact * impact + impact) / 2 * 7 * reach + 1)
      serv.hurt(e, damage, { source, from: pos, knockback: 10 * impact + 2, maxDamage })
    }
    if (!breakBlocks) return
    const r = Math.ceil(power)
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz > power * power) continue
          const p = new Vec3(Math.floor(pos.x) + dx, Math.floor(pos.y) + dy, Math.floor(pos.z) + dz)
          const block = await world.getBlock(p)
          if (!block || block.type === 0 || ['bedrock', 'obsidian', 'end_portal', 'end_portal_frame', 'barrier', 'command_block', 'water', 'lava', 'end_gateway', 'crying_obsidian', 'reinforced_deepslate'].includes(block.name)) continue
          await serv.setBlockType(world, p, 0)
        }
      }
    }
  }

  // ---------------------------------------------------------------- spawning: sizes, health, ai
  const applyDef = (mob: Entity) => {
    const def = defOf(mob.name)
    if (!def) return
    const info = (mcData.entitiesArray as any[] | undefined)?.find(e => e.id === mob.entityType)
    const w = info?.width ?? def.size?.[0] ?? 0.6
    const h = info?.height ?? def.size?.[1] ?? 1.8
    mob.size = new Vec3(w, h, w)
    mob.health = def.health
    mob.maxHealth = def.health
    mob.friction = new Vec3(15, 0, 15)
    if (def.flies) { mob.noGravity = true; mob.isFlyer = true }
    if (def.ai !== 'none') mob.ai = { kind: def.ai, def, state: {} }
  }
  serv.once('asap', () => {
    const spawnMob = serv.spawnMob
    serv.spawnMob = (...args: Parameters<typeof spawnMob>) => {
      const mob = spawnMob(...args)
      applyDef(mob)
      mob.yawDeg = mob.yaw ?? 0
      serv.emit('mobSpawned' as any, mob)
      return mob
    }
  })

  const toByte = (deg: number) => { let b = Math.floor(((deg % 360) + 360) % 360 * 256 / 360); if (b > 127) b -= 256; return b }
  /** turns a mob towards (dx, dz); the rotation packets are only sent when it changed noticeably */
  const face = (mob: Entity, dx: number, dz: number, force = false) => {
    if (Math.abs(dx) < 1e-3 && Math.abs(dz) < 1e-3) return
    const yaw = Math.atan2(-dx, dz) * 180 / Math.PI
    const last = mob.sentYaw
    if (!force && last !== undefined && Math.abs(((yaw - last + 540) % 360) - 180) < 8) return
    mob.sentYaw = yaw
    mob.yawDeg = yaw
    mob.yaw = yaw
    mob._writeOthersNearby('entity_look', { entityId: mob.id, yaw: toByte(yaw), pitch: 0, onGround: !!mob.onGround })
    mob._writeOthersNearby('entity_head_rotation', { entityId: mob.id, headYaw: toByte(yaw) })
  }
  serv.faceTowards = face

  // ---------------------------------------------------------------- death
  const startDeath = (mob: Entity, killer?: Entity) => {
    if (mob.dead) return
    mob.dead = true
    mob.ai = undefined
    mob.velocity = new Vec3(0, 0, 0)
    mob._writeOthersNearby('entity_status', { entityId: mob.id, entityStatus: 3 })
    const def = defOf(mob.name)
    const lootingless = killer?.type === 'player'
    if (def?.drops && (lootingless || !killer)) {
      for (const [item, min, max, chance] of def.drops) {
        if (chance !== undefined && Math.random() > chance) continue
        serv.dropItem(mob.world, mob.position.offset(0, 0.5, 0), item, rand(min, max))
      }
    }
    if (def?.xp && killer?.type === 'player') {
      const p = killer as Player
      p.setXp(p.xp + def.xp)
    }
    serv.emit('mobDied' as any, mob, killer)
    mob.setTimeout(() => { if (serv.entities[mob.id]) mob.destroy() }, mob.deathAnimationMs ?? 900)
  }
  serv.killMob = startDeath

  // ---------------------------------------------------------------- ai
  const targetsOf = (mob: Entity, range: number): Player[] => serv.players.filter(p =>
    p.world === mob.world && (p.gameMode === 0 || p.gameMode === 2) && p.health > 0 && p.position.distanceTo(mob.position) <= range)

  const nearest = (mob: Entity, range: number): Player | undefined => {
    let best: Player | undefined; let bestD = Infinity
    for (const p of targetsOf(mob, range)) {
      const d = p.position.distanceTo(mob.position)
      if (d < bestD) { best = p; bestD = d }
    }
    return best
  }

  const move = (mob: Entity, dx: number, dz: number, speed: number) => {
    const len = Math.hypot(dx, dz)
    if (len < 1e-3 || speed === 0) { mob.velocity.x = 0; mob.velocity.z = 0; return }
    mob.velocity.x = dx / len * speed
    mob.velocity.z = dz / len * speed
    face(mob, dx, dz)
    // a block in the way: hop over it (one block steps), swim up in water
    if (mob.onGround && mob.hitWall) mob.velocity.y = 7.6
    if ((mob.inWater || mob.inLava) && !mob.isFlyer) mob.velocity.y = Math.max(mob.velocity.y, 3)
  }

  const wander = (mob: Entity, speed: number, now: number) => {
    const s = mob.ai!.state
    if (!s.until || now > s.until) {
      s.until = now + 2000 + Math.random() * 4000
      const a = Math.random() * Math.PI * 2
      s.dx = Math.random() < 0.4 ? 0 : Math.cos(a)
      s.dz = Math.random() < 0.4 ? 0 : Math.sin(a)
    }
    move(mob, s.dx, s.dz, speed * 0.5)
  }

  const strike = (mob: Entity, target: Player, damage: number, now: number, cooldown = 1000) => {
    if (now - (mob.ai!.state.lastHit ?? 0) < cooldown) return
    mob.ai!.state.lastHit = now
    mob._writeOthersNearby('animation', { entityId: mob.id, animation: 0 })
    serv.hurt(target, damage, { source: mob, from: mob.position })
  }

  const tickMob = (mob: Entity, now: number) => {
    const ai = mob.ai!
    const def = ai.def
    const speed = def.speed ?? 3
    const provoked = ai.state.angryUntil > now ? (serv.entities[ai.state.angryAt] as Player | undefined) : undefined
    switch (ai.kind) {
      case 'melee': case 'neutral': {
        const target = ai.kind === 'neutral' ? provoked : nearest(mob, def.aggro ?? 16)
        if (!target || target.world !== mob.world) { if (ai.kind === 'neutral') wander(mob, speed, now); else wander(mob, speed * 0.6, now); return }
        const dx = target.position.x - mob.position.x; const dz = target.position.z - mob.position.z
        const dist = Math.hypot(dx, dz)
        const reach = (mob.size.x / 2) + 0.6 + 0.3
        move(mob, dx, dz, dist > reach * 0.8 ? speed : 0)
        face(mob, dx, dz)
        if (dist < reach + 0.4 && Math.abs(target.position.y - mob.position.y) < 1.8) strike(mob, target, def.damage ?? 2, now)
        return
      }
      case 'creeper': {
        const target = nearest(mob, def.aggro ?? 16)
        const s = ai.state
        if (!target) { s.fuse = undefined; wander(mob, speed * 0.6, now); return }
        const dx = target.position.x - mob.position.x; const dz = target.position.z - mob.position.z
        const dist = Math.hypot(dx, dz)
        face(mob, dx, dz)
        if (dist < 3 && Math.abs(target.position.y - mob.position.y) < 2) {
          s.fuse ??= now
          move(mob, 0, 0, 0)
          if (now - s.fuse >= 1500) {
            const world = mob.world; const pos = mob.position.offset(0, 0.5, 0)
            mob.dead = true; mob.ai = undefined
            mob.destroy()
            void serv.explode(world, pos, 3, { source: mob, breakBlocks: (serv.gamerules as any)?.mobGriefing !== false })
          }
        } else { s.fuse = undefined; move(mob, dx, dz, speed) }
        return
      }
      case 'skeleton': {
        const target = nearest(mob, def.aggro ?? 16)
        if (!target) { wander(mob, speed * 0.6, now); return }
        const dx = target.position.x - mob.position.x; const dz = target.position.z - mob.position.z
        const dist = Math.hypot(dx, dz)
        face(mob, dx, dz)
        if (dist > 10) move(mob, dx, dz, speed); else if (dist < 5) move(mob, -dx, -dz, speed); else move(mob, 0, 0, 0)
        if (now - (ai.state.lastShot ?? 0) > 2000 && dist < 14) {
          ai.state.lastShot = now
          serv.projectiles?.shootArrow(mob, target.position.offset(0, 1.2, 0), { damage: 3 })
        }
        return
      }
      case 'blaze': {
        const target = nearest(mob, def.aggro ?? 48)
        const s = ai.state
        if (!target) { mob.velocity.set(0, Math.sin(now / 700) * 0.6, 0); return }
        const dx = target.position.x - mob.position.x; const dz = target.position.z - mob.position.z
        const dist = Math.hypot(dx, dz)
        face(mob, dx, dz)
        // hover 2-5 blocks above the player's feet, drift sideways while shooting, come closer when far away
        const wantY = target.position.y + 2.5 + Math.sin(now / 900 + mob.id) * 1.5
        const vy = Math.max(-3.5, Math.min(3.5, (wantY - mob.position.y) * 2.5))
        const side = Math.sin(now / 1500 + mob.id * 3) * 1.5
        const ux = dist > 0.01 ? dx / dist : 0; const uz = dist > 0.01 ? dz / dist : 0
        const approach = dist > 14 ? speed : dist < 6 ? -speed * 0.7 : 0
        mob.velocity.set(ux * approach - uz * side, vy, uz * approach + ux * side)
        if (mob.hitWall && vy < 1) mob.velocity.y = 3
        // three fireballs in a row, then a pause (Blaze: 3 shots, 100 ticks cooldown)
        if (dist < 20) {
          s.burst ??= 0
          const gap = s.burst > 0 ? 300 : 3000
          if (now - (s.lastShot ?? 0) > gap) {
            s.lastShot = now
            s.burst = s.burst >= 2 ? 0 : s.burst + 1
            serv.projectiles?.shootFireball(mob, target.position.offset(0, 0.9, 0))
          }
        }
        return
      }
      case 'wander': {
        if (ai.state.fleeUntil > now) {
          const a = serv.entities[ai.state.angryAt]
          if (a) { move(mob, mob.position.x - a.position.x, mob.position.z - a.position.z, speed * 2.2); return }
        }
        wander(mob, speed, now)
        return
      }
      default:
    }
  }

  let tickN = 0
  serv.on('tick', () => {
    const now = Date.now()
    tickN++
    for (const mob of Object.values(serv.entities)) {
      if (!mob.ai || !mob.ready || mob.dead || mob.type !== 'mob') continue
      if (mob.ai.kind === 'dragon') continue
      if (mob.stunUntil && now < mob.stunUntil) continue
      try { tickMob(mob, now) } catch (e) { serv.warn?.('mob ai: ' + (e as Error).stack) }
    }
    // mobs far away from every player disappear (their chunks are not simulated)
    if (tickN % 100 === 0) {
      for (const mob of Object.values(serv.entities)) {
        if (!mob.ai || mob.type !== 'mob' || mob.ai.kind === 'dragon' || mob.persistent) continue
        if (!serv.players.some(p => p.world === mob.world && p.position.distanceTo(mob.position) < 128)) mob.destroy()
      }
    }
  })

  serv.on('mobDied' as any, () => {})
}

/** mob side: damage, death, knockback bookkeeping */
export const entity = function (entity: Entity, serv: Server) {
  entity.die = (killer) => { serv.killMob(entity, killer) }
  entity.hitWall = false
}

declare global {
  interface Entity {
    ai?: { kind: MobAi, def: MobDef, state: Record<string, any> }
    dead?: boolean
    maxHealth?: number
    lastHurt?: number
    lastHurtDamage?: number
    stunUntil?: number
    hitWall?: boolean
    yawDeg?: number
    sentYaw?: number
    /** not removed when far from every player */
    persistent?: boolean
    deathAnimationMs?: number
    /** called instead of the default removal when a non-player entity runs out of health */
    die: (killer?: Entity) => void
  }
  interface Server {
    mobDefs: Record<string, MobDef>
    entityTypeId: (names: string | string[], kind?: 'object' | 'mob') => number | undefined
    dropItem: (world: any, position: Vec3, name: string, count?: number, velocity?: Vec3) => Entity | undefined
    hurt: (target: Entity, damage: number, opts?: { source?: Entity, from?: Vec3, knockback?: number, maxDamage?: number }) => boolean
    explode: (world: any, pos: Vec3, power: number, opts?: { breakBlocks?: boolean, source?: Entity, maxDamage?: number, fire?: boolean }) => Promise<void>
    killMob: (mob: Entity, killer?: Entity) => void
    faceTowards: (mob: Entity, dx: number, dz: number, force?: boolean) => void
    projectiles?: {
      shootArrow: (shooter: Entity, at: Vec3, opts?: { damage?: number, speed?: number }) => void
      shootFireball: (shooter: Entity, at: Vec3) => void
    }
  }
}
