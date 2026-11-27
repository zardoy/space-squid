import fs from 'fs'
import path from 'path'
import { Vec3 } from 'vec3'
import { spikesFor as endSpikes } from 'minecraft-worldgen/dist/feature/endSpikes'
import { parseWorldSeed } from 'minecraft-worldgen/dist/rng/random'
import { BossBarColor, BossBarDividers, BossBarFlags } from './bossBars'

/**
 * The End: arrival platform, end crystals on the ten obsidian pillars, the ender dragon and what happens after it dies.
 *
 * Simplified compared to vanilla:
 *  - the dragon circles above the island (radius 32, about 10 blocks/s) and now and then dives at a player (10 damage on contact, knockback); it stays within 60 blocks of the centre; it does not perch, breathe or destroy blocks,
 *  - each crystal within 32 blocks heals it 2 hp per second; breaking a crystal blows up (power 6, capped damage) and the dragon hurts,
 *  - the first kill gives 12000 xp (500 later) and builds the exit portal with the dragon egg; the portal leads back to the overworld (no credits),
 *  - the fight starts when a player is in the End and the dragon was not killed in this world before (`flyingsquid-end.json` in the world folder).
 */

const SPAWN_HEIGHT = 128
/** flight circle around the middle island (the island is ~100 blocks wide), the furthest it may drift, and the furthest a dive may reach */
const CIRCLE_RADIUS = 32
const LEASH_RADIUS = 60
const ISLAND_RADIUS = 48

export const server = function (serv: Server, options: Options) {
  const mcData = serv.mcData
  const flat = serv.supportFeature('theFlattening')
  const block = (name: string) => mcData.blocksByName[name]
  const stateFile = options.worldFolder && !options.noWorldRegion ? path.join(options.worldFolder, 'flyingsquid-end.json') : undefined
  const state: { dragonKilled: boolean } = { dragonKilled: false }
  try { if (stateFile) Object.assign(state, JSON.parse(fs.readFileSync(stateFile, 'utf8'))) } catch {}
  const save = () => { if (stateFile) fs.promises.writeFile(stateFile, JSON.stringify(state)).catch(() => {}) }

  const fight: { dragon?: Entity, crystals: Entity[], starting: boolean, bar?: any, ticksSinceHeal: number } = { crystals: [], starting: false, ticksSinceHeal: 0 }
  serv.endFight = {
    get dragon () { return fight.dragon },
    get crystals () { return fight.crystals },
    get killed () { return state.dragonKilled }
  }

  const setBlockName = async (world: any, x: number, y: number, z: number, name: string, props?: Record<string, any>) => {
    const b = block(name)
    if (!b) return
    let stateId = flat ? b.minStateId! : b.id << 4
    if (props && flat) {
      const Block = serv.PrismarineBlock
      try { stateId = Block.fromProperties(name, props, 0).stateId } catch {}
    }
    await serv.setBlock(world, new Vec3(x, y, z), stateId)
  }

  // ---------------------------------------------------------------- arrival platform (ServerLevel.makeObsidianPlatform)
  serv.makeEndPlatform = async () => {
    const world = serv.endworld
    await world.getColumn(6, 0)
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        await setBlockName(world, 100 + dx, 48, dz, 'obsidian')
        for (let dy = 1; dy <= 3; dy++) await setBlockName(world, 100 + dx, 48 + dy, dz, 'air')
      }
    }
  }

  // ---------------------------------------------------------------- starting the fight
  async function startFight () {
    if (fight.starting || fight.dragon || state.dragonKilled) return
    fight.starting = true
    try {
      const world = serv.endworld
      const spikes = endSpikes(parseWorldSeed(world.seed ?? serv.seed ?? 0))
      // the pillars (and the island) have to exist before crystals float above them
      const chunks = new Set<string>(['0,0'])
      for (const s of spikes) chunks.add(`${s.cx >> 4},${s.cz >> 4}`)
      await Promise.all([...chunks].map(c => { const [x, z] = c.split(',').map(Number); return world.getColumn(x, z) }))
      for (const s of spikes) {
        const crystal = serv.spawnPlain(['end_crystal', 'endercrystal', 'ender_crystal'], world, new Vec3(s.cx + 0.5, s.height + 1, s.cz + 0.5), new Vec3(0, 0, 0), undefined, 2)
        if (!crystal) continue
        crystal.health = 1
        crystal.maxHealth = 1
        crystal.persistent = true
        crystal.name = 'end_crystal'
        fight.crystals.push(crystal)
      }
      const typeId = serv.entityTypeId(['ender_dragon', 'enderdragon'], 'mob')
      if (typeId === undefined) return
      const dragon = serv.spawnMob(typeId, world, new Vec3(0, SPAWN_HEIGHT, 0), {})
      dragon.name = 'ender_dragon'
      dragon.persistent = true
      dragon.customMotion = true
      dragon.noGravity = true
      dragon.deathAnimationMs = 10_000
      dragon.ai = { kind: 'dragon', def: serv.mobDefs.ender_dragon, state: { angle: Math.random() * Math.PI * 2, phase: 'circle', nextDive: Date.now() + 12_000 } }
      fight.dragon = dragon
      fight.bar = serv.createBossBar(undefined, 'Ender Dragon', 1, BossBarColor.PURPLE, BossBarDividers.NONE, BossBarFlags.DRAGON_BAR)
    } finally { fight.starting = false }
  }

  // ---------------------------------------------------------------- the dragon each tick
  const toByte = (deg: number) => { let b = Math.floor(((deg % 360) + 360) % 360 * 256 / 360); if (b > 127) b -= 256; return b }
  let tickNo = 0
  serv.on('tick', () => {
    tickNo++
    const world = serv.endworld
    const inEnd = serv.players.filter(p => p.world === world)
    if (inEnd.length && !fight.dragon && !state.dragonKilled && !fight.starting) void startFight()
    const dragon = fight.dragon
    if (!dragon || !serv.entities[dragon.id]) {
      if (dragon && !serv.entities[dragon.id]) fight.dragon = undefined
      return
    }
    if (dragon.dead) return
    const dt = 0.05
    const ai = dragon.ai!
    const s = ai.state
    const now = Date.now()
    const targets = inEnd.filter(p => (p.gameMode === 0 || p.gameMode === 2) && p.health > 0)

    // phases: circle the island, now and then dive at the nearest player and fly out again
    let goal: Vec3
    let speed = 11
    if (s.phase === 'dive' && targets.length) {
      const t = s.target && targets.includes(s.target) ? s.target as Player : targets[0]
      s.target = t
      // never further out than the island: a player on the edge is attacked from above the edge
      const gx = t.position.x; const gz = t.position.z
      const out = Math.hypot(gx, gz)
      const k = out > ISLAND_RADIUS ? ISLAND_RADIUS / out : 1
      goal = new Vec3(gx * k, Math.max(t.position.y + 1, 62), gz * k)
      speed = 18
      if (dragon.position.distanceTo(goal) < 5 || now - s.diveStart > 7000) { s.phase = 'circle'; s.nextDive = now + 15_000 + Math.random() * 10_000; s.angle = Math.atan2(dragon.position.z, dragon.position.x) }
    } else {
      s.phase = 'circle'
      // the goal on the circle moves at ~8 blocks/s; the dragon follows it with a little lag
      s.angle += (8 / CIRCLE_RADIUS) * dt
      goal = new Vec3(Math.cos(s.angle) * CIRCLE_RADIUS, 80 + Math.sin(s.angle * 2.3) * 8, Math.sin(s.angle) * CIRCLE_RADIUS)
      if (targets.length && now > s.nextDive) { s.phase = 'dive'; s.diveStart = now }
    }
    // leash: whatever happened, it comes back when it is far from the island
    if (Math.hypot(dragon.position.x, dragon.position.z) > LEASH_RADIUS) {
      goal = new Vec3(Math.cos(s.angle) * CIRCLE_RADIUS, 80, Math.sin(s.angle) * CIRCLE_RADIUS)
      speed = 16
      s.phase = 'circle'
    }
    const to = goal.minus(dragon.position)
    const dist = to.norm()
    const v = dist > 0.01 ? to.scaled(Math.min(speed, dist * 3) / dist) : new Vec3(0, 0, 0)
    // turn smoothly: the velocity follows the wanted one
    dragon.velocity.x += (v.x - dragon.velocity.x) * 0.12
    dragon.velocity.y += (v.y - dragon.velocity.y) * 0.12
    dragon.velocity.z += (v.z - dragon.velocity.z) * 0.12
    const next = dragon.position.plus(dragon.velocity.scaled(dt))
    void dragon.sendPosition(next, false)
    if (Math.hypot(dragon.velocity.x, dragon.velocity.z) > 1) {
      // the dragon model looks the other way round
      const yaw = Math.atan2(-dragon.velocity.x, dragon.velocity.z) * 180 / Math.PI + 180
      if (tickNo % 4 === 0) {
        dragon.yawDeg = yaw; dragon.yaw = yaw
        dragon._writeOthersNearby('entity_look', { entityId: dragon.id, yaw: toByte(yaw), pitch: 0, onGround: false })
        dragon._writeOthersNearby('entity_head_rotation', { entityId: dragon.id, headYaw: toByte(yaw) })
      }
    }

    // bumping into players
    if (tickNo % 4 === 0) {
      for (const p of targets) {
        const dx = p.position.x - dragon.position.x; const dz = p.position.z - dragon.position.z
        if (Math.hypot(dx, dz) < 8 && p.position.y + 1.8 > dragon.position.y - 2 && p.position.y < dragon.position.y + 6) {
          serv.hurt(p, 10, { source: dragon, from: dragon.position, knockback: 14 })
        }
      }
    }

    // crystals heal the dragon
    fight.crystals = fight.crystals.filter(c => serv.entities[c.id] && !(c as any).dead)
    if (tickNo % 10 === 0 && fight.crystals.some(c => c.position.distanceTo(dragon.position) < 40) && dragon.health < (dragon.maxHealth ?? 200)) {
      dragon.health = Math.min(dragon.maxHealth ?? 200, dragon.health + 1)
    }
    if (fight.bar && tickNo % 10 === 0) serv.updateBossBar(fight.bar, { health: Math.max(0, dragon.health / (dragon.maxHealth ?? 200)) })
  })

  // ---------------------------------------------------------------- crystals blow up, the dragon dies
  serv.on('mobDied' as any, (mob: Entity, killer?: Entity) => {
    if (mob.name === 'end_crystal') {
      fight.crystals = fight.crystals.filter(c => c !== mob)
      void serv.explode(mob.world, mob.position.offset(0, 0.5, 0), 6, { source: mob, maxDamage: 14 })
      // the bedrock under it burns: the fire above it is gone with the crystal
      return
    }
    if (mob !== fight.dragon) return
    const first = !state.dragonKilled
    state.dragonKilled = true
    save()
    if (fight.bar) { serv.removeBossBar(fight.bar); fight.bar = undefined }
    for (const c of fight.crystals) c.destroy()
    fight.crystals = []
    const players = serv.players.filter(p => p.world === mob.world)
    // the dragon falls apart after its death animation; the xp goes to every player in the End
    mob.setTimeout(() => {
      for (const p of players) if (serv.players.includes(p)) p.setXp(p.xp + (first ? 12000 : 500))
      void buildExitPortal(mob.world, first)
      serv.broadcast?.('§dThe Ender Dragon has been defeated!', { whitelist: serv.players.filter(p => p.world === mob.world) })
      fight.dragon = undefined
    }, 9500)
  })

  // ---------------------------------------------------------------- exit portal + egg (EndPodiumFeature)
  async function buildExitPortal (world: any, egg: boolean) {
    await world.getColumn(0, 0)
    // the podium sits on the island surface in the middle
    let y0 = 64
    for (let y = 120; y > 30; y--) { if ((await world.getBlockType(new Vec3(0, y, 0))) !== 0) { y0 = y + 1; break } }
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        const d2 = dx * dx + dz * dz
        if (d2 > 3.5 * 3.5) continue
        for (let y = y0 - 1; y <= y0 + 8; y++) {
          if (y < y0) await setBlockName(world, dx, y, dz, 'bedrock')
          else if (y > y0) await setBlockName(world, dx, y, dz, 'air')
          else if (d2 > 2.5 * 2.5) await setBlockName(world, dx, y, dz, 'bedrock')
          else await setBlockName(world, dx, y, dz, 'end_portal')
        }
      }
    }
    for (let i = 0; i < 3; i++) await setBlockName(world, 0, y0 + i, 0, 'bedrock')
    const torch = block('wall_torch') ? 'wall_torch' : 'torch'
    for (const [dx, dz, facing] of [[0, -1, 'north'], [0, 1, 'south'], [-1, 0, 'west'], [1, 0, 'east']] as Array<[number, number, string]>) await setBlockName(world, dx, y0 + 2, dz, torch, { facing })
    await setBlockName(world, 0, y0 + 3, 0, 'bedrock')
    if (egg) await setBlockName(world, 0, y0 + 4, 0, 'dragon_egg')
  }
  serv.buildExitPortal = (world, egg = false) => buildExitPortal(world, egg)

  serv.commands.add({
    base: 'enderfight',
    info: 'Starts / resets the ender dragon fight',
    usage: '/enderfight <start|reset|state>',
    op: true,
    parse: (str) => (['start', 'reset', 'state'].includes(str.trim()) ? str.trim() : false),
    async action (what: string) {
      if (what === 'state') return `dragon: ${fight.dragon ? Math.round(fight.dragon.health) + ' hp' : 'none'}, crystals: ${fight.crystals.length}, killed before: ${state.dragonKilled}`
      if (what === 'reset') { state.dragonKilled = false; save(); return 'The dragon will come back the next time somebody is in the End (kill the current one first).' }
      state.dragonKilled = false
      if (fight.dragon) return 'The fight is running'
      await startFight()
      return 'The fight started'
    }
  })
}

declare global {
  interface Server {
    endFight: { readonly dragon?: Entity, readonly crystals: Entity[], readonly killed: boolean }
    /** 5x5 obsidian platform where players arrive in the End (100, 48, 0) */
    makeEndPlatform: () => Promise<void>
    /** exit portal (bedrock fountain, torches, optionally the dragon egg) on the middle island */
    buildExitPortal: (world: any, egg?: boolean) => Promise<void>
    /** an entity without own physics and without item data (end crystals) */
    spawnPlain: (names: string[], world: any, position: Vec3, velocity: Vec3, owner?: Entity, size?: number) => Entity | undefined
  }
}
