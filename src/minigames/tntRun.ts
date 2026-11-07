import { Vec3 } from 'vec3'

export const minigame = (server: Server) => {
  server.spawnPoint = new Vec3(1, 1, 0)

  server.on('newPlayer', (player) => {
    // if player's inventory is empty give a TNT
    if (player.inventory.slots.length === 0) {
      server.handleCommand(`give ${player.name} tnt 1`)
    }
  })
}
