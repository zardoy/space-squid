import { Vec3 } from 'vec3'
import { collisionBoxes, PhysicsWorld } from '../entityPhysics'

/**
 * Mob spawner blocks (nether fortress blazes, dungeons, mineshaft cave spiders, stronghold silverfish, spawners of vanilla saves).
 *
 * Like `BaseSpawner`: while a survival player is within `RequiredPlayerRange` (16) blocks the delay counts down; at zero up to `SpawnCount` mobs appear at random spots within
 * `SpawnRange` blocks (x, z) and +-1 block (y), unless `MaxNearbyEntities` mobs of that type are around already; then a new delay of `MinSpawnDelay`..`MaxSpawnDelay` ticks starts.
 * Light levels and the spawn rules of the individual mobs are ignored. Blazes (and every other flying mob) can spawn in the air.
 *
 * The state lives in the block entity of the chunk (`Delay` is written back every few seconds), so it survives saving.
 */

const num = (tag: any, fallback: number): number => (typeof tag?.value === 'number' ? tag.value : fallback)

/** entity id of a spawner block entity (1.21 `SpawnData.entity.id`, 1.18 `SpawnData.id`, 1.8 `EntityId`, `SpawnPotentials`) */
export function spawnerEntityOf (be: any): string | undefined {
  const sd = be?.SpawnData?.value
  const id = sd?.entity?.value?.id?.value ?? sd?.id?.value ?? be?.EntityId?.value
  if (typeof id === 'string') return id
  const pot = be?.SpawnPotentials?.value?.value?.[0]
  const pid = pot?.data?.value?.entity?.value?.id?.value ?? pot?.data?.value?.id?.value ?? pot?.Entity?.value?.id?.value ?? pot?.Type?.value
  return typeof pid === 'string' ? pid : undefined
}

export const server = function (serv: Server, options: Options) {
  const mcData = serv.mcData
  const spawnerBlocks = new Set(['spawner', 'mob_spawner'])
  const delays = new Map<string, number>()
  const every = 2 // ticks between checks

  const keyOf = (world: any, pos: { x: number, y: number, z: number }) => `${world.worldName ?? 'world'}:${pos.x},${pos.y},${pos.z}`
  const strip = (id: string) => id.replace(/^minecraft:/, '')

  const spotFree = (world: PhysicsWorld, p: Vec3, size: Vec3) => collisionBoxes(world, [p.x - size.x / 2 + 1e-3, p.y + 1e-3, p.z - size.z / 2 + 1e-3, p.x + size.x / 2 - 1e-3, p.y + size.y - 1e-3, p.z + size.z / 2 - 1e-3]).length === 0

  const trySpawn = (world: any, pos: Vec3, be: any, entityName: string) => {
    const typeId = serv.entityTypeId(entityName, 'mob')
    if (typeId === undefined) return false
    const range = num(be.SpawnRange, 4)
    const count = num(be.SpawnCount, 4)
    const maxNearby = num(be.MaxNearbyEntities, 6)
    const name = strip(entityName)
    const nearby = Object.values(serv.entities).filter(e => e.world === world && e.type === 'mob' && !(e as any).dead && (e.name ?? '').toLowerCase() === name &&
      Math.abs(e.position.x - pos.x) <= range + 4 && Math.abs(e.position.z - pos.z) <= range + 4 && Math.abs(e.position.y - pos.y) <= range + 4).length
    if (nearby >= maxNearby) return false
    const info = (mcData.entitiesArray as any[]).find(e => e.id === typeId)
    const size = new Vec3(info?.width ?? 0.6, info?.height ?? 1.8, info?.width ?? 0.6)
    let spawned = 0
    for (let i = 0; i < count && nearby + spawned < maxNearby; i++) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const p = new Vec3(pos.x + 0.5 + (Math.random() - Math.random()) * range, pos.y + Math.floor(Math.random() * 3) - 1, pos.z + 0.5 + (Math.random() - Math.random()) * range)
        if (!spotFree(world, p, size)) continue
        serv.spawnMob(typeId, world, p, { yaw: Math.random() * 360 }).spawnerKey = keyOf(world, pos)
        spawned++
        break
      }
    }
    if (spawned) serv.emitParticle?.(mcData.particlesByName?.flame?.id ?? 0, world, pos.offset(0.5, 0.5, 0.5), { count: 10, size: new Vec3(1, 1, 1) })
    return spawned > 0
  }

  let tick = 0
  serv.on('tick', () => {
    tick++
    if (tick % every !== 0) return
    const done = new Set<any>()
    for (const player of serv.players) {
      if (player.gameMode === 1 || player.gameMode === 3 || !player.world) continue
      const world: any = player.world
      const cx = Math.floor(player.position.x / 16); const cz = Math.floor(player.position.z / 16)
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const column: any = world.getLoadedColumn(cx + dx, cz + dz)
          if (!column || done.has(column)) continue
          done.add(column)
          for (const [key, be] of Object.entries<any>(column.blockEntities ?? {})) {
            const entityName = spawnerEntityOf(be)
            if (!entityName) continue
            const [x, y, z] = key.split(',').map(Number)
            const pos = new Vec3(x, y, z)
            // a spawner whose block is gone does nothing
            const block = world.sync.getBlock(pos)
            if (!block || !spawnerBlocks.has(block.name)) continue
            const range = num(be.RequiredPlayerRange, 16)
            const near = serv.players.some(p => p.world === world && p.gameMode !== 1 && p.gameMode !== 3 && p.position.distanceTo(pos.offset(0.5, 0.5, 0.5)) <= range)
            if (!near) continue
            const k = keyOf(world, pos)
            let delay = delays.get(k) ?? num(be.Delay, 20)
            delay -= every
            if (delay <= 0) {
              trySpawn(world, pos, be, entityName)
              const min = num(be.MinSpawnDelay, 200); const max = num(be.MaxSpawnDelay, 800)
              delay = min + Math.floor(Math.random() * (Math.max(max, min) - min + 1))
              if (be.Delay) be.Delay.value = delay
            }
            delays.set(k, delay)
          }
        }
      }
    }
  })
}

declare global {
  interface Entity {
    /** key of the spawner block that made this mob */
    spawnerKey?: string
  }
}
