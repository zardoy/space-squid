import once from '@tootallnate/once'

export const server = function (serv: Server) {
  serv.quit = async (reason = 'Server closed') => {
    serv.cleanupFunctions.forEach(fn => fn())
    await Promise.all(serv.players.map((player) => {
      player.kick(reason)
      return once(player, 'disconnected')
    }))
    serv._server.close()
    await once(serv._server, 'close' as any)
  }
}

export const player = function (player: Player, serv: Server, { worldFolder }: Options) {
  player.despawnEntities = entities => player._client.write('entity_destroy', {
    entityIds: entities.map(e => e.id)
  })

  player._client.on('end', async (endReason) => {
    if (!player.disconnected) {
      player._unloadAllChunks?.()
      if (player.username) {
        serv.broadcast(serv.chatColor.yellow + player.username + ' left the game.')
        player.bridge.player_info({
          action: {
            remove_player: true,
          },
          data: [{
            uuid: player.uuid
          }]
        })
        player.nearbyPlayers().forEach(otherPlayer => otherPlayer.despawnEntities([player]))
        player.emit('disconnected', endReason)
      }

      delete serv.entities[player.id]
      const index = serv.players.indexOf(player)
      if (index > -1) {
        serv.players.splice(index, 1)
      }
      delete serv.uuidToPlayer[player.uuid]
      player.disconnected = true
    }

    player.save?.()
  })
}
declare global {
  interface Server {
    /**
     * Stop and dispose the server
     */
    "quit": (reason?: string) => Promise<void>
  }
  interface Player {
    /** @internal */
    "despawnEntities": (entities: any) => void
  }
}
