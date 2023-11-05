import { Vec3 } from 'vec3'

function randomInt (low, high) {
  return Math.floor(Math.random() * (high - low) + low)
}

export const server = function (serv: Server, settings: Options) {
  serv.gameMode = settings.gameMode
  serv.difficulty = settings.difficulty
  const mcData = serv.mcData

  const waterBlocks = new Set([mcData.blocksByName.water.id])
  if (mcData.blocksByName.flowing_water !== undefined) {
    waterBlocks.add(mcData.blocksByName.flowing_water.id)
  }

  async function findSpawnZone (world, initialPoint: Vec3) {
    let point = initialPoint
    while ((await (world.getBlockStateId(point))) === 0 && point.y > 0) { point = point.offset(0, -1, 0) }
    let i = 0
    const LIMIT = 300
    while (true) {
      i++
      const p = await world.getBlockStateId(point)
      if (!waterBlocks.has(p) || i > LIMIT) { break }
      point = point.offset(1, 0, 0)
    }
    // i guess infinite loop is not possible here
    while ((await world.getBlockStateId(point)) !== 0) { point = point.offset(0, 1, 0) }

    return point
  }

  serv.getSpawnPoint = async (world) => {
    if (serv.spawnPoint) return serv.spawnPoint
    return findSpawnZone(world, new Vec3(randomInt(0, 30), 81, randomInt(0, 30)))
  }
}

export const player = function (player: Player, serv: Server) {
  player.prevGameMode = 255
  player.gameMode = serv.gameMode
  player.findSpawnPoint = async () => {
    player.spawnPoint = await serv.getSpawnPoint(player.world)
  }
  player._client.on('settings', ({ viewDistance }) => {
    player.view = viewDistance
    player.sendRestMap()
  })
}
declare global {
  interface Server {
    /** @internal */
    "gameMode": any
    /** @internal */
    "difficulty": any
    /** @internal */
    "getSpawnPoint": (world: any) => Promise<any>
  }
  interface Player {
    /** @internal */
    spawnPoint: Vec3
    /** The view size of the player, for example 8 for 16x16 */
    view: number
    /** @internal */
    "prevGameMode": number
    /** @internal */
    "gameMode": any
    /** @internal */
    "findSpawnPoint": () => Promise<void>
  }
}
