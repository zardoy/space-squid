import { Vec3 } from 'vec3'

/**
 * Beds set the respawn point (Java: right click, "Respawn point set"). Simplified sleeping: at night the click also skips to the morning, there is no lying-in-bed animation
 * and no wait for the other players. In the Nether and the End beds do nothing here (vanilla: they explode). A respawn goes to the bed while it is still there with free space
 * above it, else to the world spawn (vanilla "Your home bed was missing or obstructed"). The bed is saved in the player data (`SpawnX/Y/Z`, `SpawnDimension`).
 */
export const server = function (serv: Server) {
  const mcData = serv.mcData
  const isBedName = (name: string) => name === 'bed' || name.endsWith('_bed')

  serv.once('asap', () => {
    for (const name of mcData.blocksArray.map(b => b.name).filter(isBedName)) {
      serv.onBlockInteraction(name, async ({ block, player }) => {
        const world: any = player.world
        if (world.environment !== 'normal') {
          player.chat('§cBeds only work in the overworld')
          return true
        }
        player.bedSpawn = block.position.clone()
        player.chat('Respawn point set')
        const night = serv.time >= 12542 && serv.time <= 23459
        if (night) {
          serv.setTime(0)
          serv.broadcast?.(`${player.username} slept through the night`, { whitelist: serv.players })
        }
        return true
      })
    }
  })
}

export const player = function (player: Player, serv: Server) {
  const free = async (world: any, p: Vec3) => (await world.getBlock(p)).boundingBox !== 'block' && (await world.getBlock(p.offset(0, 1, 0))).boundingBox !== 'block'

  /** where a respawn puts the player: next to the bed (or on it) when it is still there, else the spawn point of the world */
  player.respawnPosition = async () => {
    const bed = player.bedSpawn
    if (bed) {
      const world: any = serv.overworld
      try {
        await world.getColumnAt(bed)
        const block = await world.getBlock(bed)
        if (isBed(block.name)) {
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
            const p = bed.offset(dx, 0, dz)
            const below = await world.getBlock(p.offset(0, -1, 0))
            if (below.boundingBox === 'block' && await free(world, p)) return p.offset(0.5, 0, 0.5)
          }
          if (await free(world, bed.offset(0, 1, 0))) return bed.offset(0.5, 0.5625, 0.5)
        }
      } catch {}
      player.bedSpawn = undefined
      player.chat('§cYour home bed was missing or obstructed')
    }
    await player.findSpawnPoint()
    return player.spawnPoint
  }
}

const isBed = (name: string) => name === 'bed' || name.endsWith('_bed')

declare global {
  interface Player {
    /** position of the bed that sets the respawn point (overworld), saved in the player data */
    bedSpawn?: Vec3
    /** position a respawn puts the player at: the bed while it exists, else the spawn point */
    respawnPosition: () => Promise<Vec3>
  }
}
