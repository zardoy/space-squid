const Vec3 = require('vec3').Vec3

function randomInt (low, high) {
  return Math.floor(Math.random() * (high - low) + low)
}

module.exports.server = function (/** @type {Server} */serv, settings) {
  serv.gameMode = settings.gameMode
  serv.difficulty = settings.difficulty
  const mcData = require('minecraft-data')(settings.version)

  const waterBlocks = new Set([mcData.blocksByName.water.id])
  if (mcData.blocksByName.flowing_water !== undefined) {
    waterBlocks.add(mcData.blocksByName.flowing_water.id)
  }

  async function findSpawnZone (world, /** @type {Vec3} */initialPoint) {
    let point = initialPoint
    while ((await (world.getBlockStateId(point))) === 0 && point.y > 0) { point = point.offset(0, -1, 0) }
    let i = 0
    const LIMIT = 150
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

module.exports.player = async function (player, serv) {
  player.prevGameMode = 255
  player.gameMode = serv.gameMode
  player.findSpawnPoint = async () => {
    player.spawnPoint = await serv.getSpawnPoint(player.world)
  }
  player._client.on('settings', ({ viewDistance }) => {
    player.view = viewDistance
  })
}
