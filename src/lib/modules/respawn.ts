import { Vec3 } from 'vec3'

export const player = function (player: Player, serv: Server) {
  player._client.on('client_command', (data) => {
    let actionId

    if (serv.supportFeature('respawnIsPayload')) {
      actionId = data.payload
    } else if (serv.supportFeature('respawnIsActionId')) {
      actionId = data.actionId
    }

    if (actionId === 0) {
      player.behavior('requestRespawn', {}, () => {
        player.position = player.spawnPoint
        player._client.write('respawn', {
          previousGameMode: player.prevGameMode,
          dimension: serv.supportFeature('dimensionIsAWorld') ? {
            type: 'compound',
            name: '',
            value: {
              name: {
                type: 'string',
                value: 'minecraft:overworld'
              },
              bed_works: {
                type: 'byte',
                value: 1
              },
              shrunk: {
                type: 'byte',
                value: 0
              },
              piglin_safe: {
                type: 'byte',
                value: 0
              },
              has_ceiling: {
                type: 'byte',
                value: 0
              },
              has_skylight: {
                type: 'byte',
                value: 1
              },
              infiniburn: {
                type: 'string',
                value: 'minecraft:infiniburn_overworld'
              },
              ultrawarm: {
                type: 'byte',
                value: 0
              },
              ambient_light: {
                type: 'float',
                value: 0
              },
              logical_height: {
                type: 'int',
                value: player.world['height'] ?? 256
              },
              min_y: {
                type: 'int',
                value: player.world['min_y'] ?? 0
              },
              height: {
                type: 'int',
                value: player.world['height'] ?? 256
              },
              has_raids: {
                type: 'byte',
                value: 1
              },
              natural: {
                type: 'byte',
                value: 1
              },
              respawn_anchor_works: {
                type: 'byte',
                value: 0
              }
            }
          } : serv.supportFeature('dimensionIsAString') ? serv.dimensionNames[0] : 0,
          worldName: serv.dimensionNames[0],
          difficulty: serv.difficulty,
          hashedSeed: serv.hashedSeed,
          gamemode: player.gameMode,
          levelType: 'default',
          isDebug: false,
          isFlat: false,
          copyMetadata: false
        })
        player.sendSelfPosition()
        player.updateHealth(20)
        player.nearbyEntities = []
        player.updateAndSpawn()
      })
    }
  })
}
declare global {
  interface PlayerBehaviorInputMap {
    'requestRespawn': {
      _input: {
        previousGameMode: number
        dimension: number
      }
    }
  }
}
