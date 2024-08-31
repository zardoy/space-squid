/* global BigInt */
import { Vec3 } from 'vec3'

import * as crypto from 'crypto'
import PrismarineItem from 'prismarine-item'
import * as playerDat from '../playerDat'
import * as convertInventorySlotId from '../convertInventorySlotId'
import { skipMcPrefix } from '../utils'
import { dimensionOverworld, getDimensionCodec } from './dimensionCodec'

export const server = function (serv: Server, options: Options) {
  serv.players ??= []
  serv.uuidToPlayer = {}

  serv._server.on('connection', client => {
    client.on('error', error => {
      serv.emit('clientError', client, error)
    })
  })

  const patchClient = (client) => {
    client.oldAddListener ??= client.on.bind(client)
    client.patchedAddListener = (name, ...args) => {
      client.oldAddListener(name, ...args)
      serv.cleanupFunctions.push(() => client.removeListener(name, ...args))
    }
    client.on = client.patchedAddListener
    client.addListener = client.patchedAddListener
  }

  const addPlayerShared = async (player: Player) => {
    patchClient(player._client)

    for (const plugin of Object.values(serv.plugins)) plugin.player?.(player, serv, options)

    serv.emit('newPlayer', player)
    player.emit('asap')
  }

  // #region hot reload
  serv.on('pluginsReady', () => {
    // add players from old server
    for (const player of serv.players ?? []) {
      addPlayerShared(player)
      player.world = serv.overworld
      player.sendChunkWhenMove()
      player._unloadAllChunks()
      player.sendRestMap()
    }
  })
  // #endregion

  serv._server.on('playerJoin', async (client) => {
    if (client.socket?.listeners('end').length === 0) return // TODO: should be fixed properly in nmp instead
    if (!serv.pluginsReady) {
      client.end('Server is still starting! Please wait before reconnecting.')
      return
    }
    try {
      const player = serv.initEntity('player', null, serv.overworld, new Vec3(0, 0, 0))
      player._client = client as any

      player.profileProperties = player._client.profile ? player._client.profile.properties : []

      await addPlayerShared(player)

      await player.login()
    } catch (err) {
      setTimeout(() => { throw err }, 0)
    }
  })

  serv.hashedSeed = [0, 0]
  serv.on('seed', (seed) => {
    const seedBuf = Buffer.allocUnsafe(8)
    seedBuf.writeBigInt64LE(BigInt(seed))
    const seedHash = crypto.createHash('sha256').update(seedBuf).digest().subarray(0, 8).readBigInt64LE()
    serv.hashedSeed = [Number(BigInt.asIntN(64, seedHash) < 0 ? -(BigInt.asUintN(32, (-seedHash) >> 32n) + 1n) : seedHash >> 32n), Number(BigInt.asIntN(32, seedHash & (2n ** 32n - 1n)))] // convert BigInt to mcpc long
  })
}

export const player = async function (player: Player, serv: Server, settings: Options) {
  const Item = PrismarineItem(settings.version)
  const mcData = serv.mcData

  let playerData

  player.setLoadingStatus = (text) => {
    player.emit('loadingStatus', text)
  }

  async function addPlayer () {
    player.type = 'player'
    player.crouching = false // Needs added in prismarine-entity later
    player.op = settings['everybody-op'] ?? false
    player.username = player._client.username
    player.uuid = player._client.uuid

    player.setLoadingStatus('Findig spawn point')
    await player.findSpawnPoint()

    player.setLoadingStatus('Reading player data')
    playerData = await playerDat.read(player.uuid, player.spawnPoint, settings.worldFolder ?? false)
    Object.keys(playerData.player).forEach(k => { player[k] = playerData.player[k] })

    serv.players.push(player)
    serv.uuidToPlayer[player.uuid] = player
    player.loadedChunks = {}
    player.setLoadingStatus(null)

    player.emit('dataLoaded')
  }

  function updateInventory () {
    playerData.inventory.forEach((item) => {
      if (!item) return
      const registry = mcData
      const itemValue: string | number = item.id.value
      const itemName = typeof itemValue === 'string' ? skipMcPrefix(itemValue) : registry.itemsArray.find(item => item.id === itemValue)?.name
      // todo how it can be block?
      const theItem = registry.itemsByName[itemName] || registry.blocksByName[itemName]
      // todo test with undefined values (need to preserve!)
      if (!theItem) {
        console.warn(`Unknown item ${itemName} (id in player ${player.username} inventory ${itemValue})`)
        return
      }

      let newItem
      // todo use supports
      if (mcData.version['<']('1.13')) newItem = new Item(theItem.id, item.Count.value, item.Damage.value)
      else if (item.tag) newItem = new Item(theItem.id, item.Count.value, item.tag)
      else newItem = new Item(theItem.id, item.Count.value)

      const slot = convertInventorySlotId.fromNBT(item.Slot.value)
      player.inventory.updateSlot(slot, newItem)
    })
    player._client.write('held_item_slot', {
      slot: player.heldItemSlot
    })
  }

  function sendLogin () {
    const MAX_HEIGHT = serv.supportFeature('tallWorld') ? 384 : 256
    // send init data so client will start rendering world
    const viewDistance = (settings['view-distance'] ??= 10)
    const dimensionCodec = getDimensionCodec(MAX_HEIGHT, serv.supportFeature('dimensionDataIsAvailable'), settings.version)
    // const dimensionCodec = serv.mcData.loginPacket.dimensionCodec

    player._client.write('login', {
      ...serv.mcData.loginPacket, // for new fields
      entityId: player.id,
      isHardcore: player.gameMode === 0,
      gameMode: player.gameMode,
      previousGameMode: player.prevGameMode,
      worldNames: Object.values(serv.dimensionNames),
      dimensionCodec,
      levelType: 'default',
      worldType: 'minecraft:overworld',
      worldName: serv.dimensionNames[0],
      dimension: serv.supportFeature('dimensionIsAString') ? serv.dimensionNames[0] : serv.supportFeature('dimensionIsAnInt') ? 0 : dimensionOverworld,
      hashedSeed: serv.hashedSeed,
      difficulty: serv.difficulty,
      viewDistance,
      simulationDistance: viewDistance,
      portalCooldown: 0,
      reducedDebugInfo: false,
      maxPlayers: Math.min(255, serv._server.maxPlayers),
      enableRespawnScreen: true,
      isDebug: false,
      isFlat: settings.generation?.name === 'superflat'
    })
    if (serv.supportFeature('difficultySentSeparately')) {
      player._client.write('difficulty', {
        difficulty: serv.difficulty,
        difficultyLocked: false
      })
    }
  }

  player.sendChunkWhenMove = () => {
    player.on('move', () => {
      if (!player.sendingChunks && player.position.distanceTo(player.lastPositionChunkUpdated) > 16) { player.sendRestMap() }
      if (!serv.supportFeature('updateViewPosition')) {
        return
      }
      const chunkX = Math.floor(player.position.x / 16)
      const chunkZ = Math.floor(player.position.z / 16)
      const lastChunkX = Math.floor(player.lastPositionPlayersUpdated.x / 16)
      const lastChunkZ = Math.floor(player.lastPositionPlayersUpdated.z / 16)
      if (chunkX !== lastChunkX || chunkZ !== lastChunkZ) {
        player._client.write('update_view_position', {
          chunkX,
          chunkZ
        })
      }
    })
  }

  function updateTime () {
    player._client.write('update_time', {
      age: [0, 0],
      time: [0, serv.time]
    })
  }

  player.setGameMode = (gameMode) => {
    if (gameMode !== player.gameMode) player.prevGameMode = player.gameMode
    player.gameMode = gameMode
    player._client.write('game_state_change', {
      reason: 3,
      gameMode: player.gameMode
    })
    serv._writeAll('player_info', {
      action: 1,
      data: [{
        UUID: player.uuid,
        uuid: player.uuid,
        gamemode: player.gameMode
      }]
    })
    player.sendAbilities()
  }

  function fillTabList () {
    player._writeOthers('player_info', {
      action: 0,
      data: [{
        UUID: player.uuid,
        uuid: player.uuid,
        name: player.username,
        properties: player.profileProperties,
        gamemode: player.gameMode,
        ping: player._client.latency
      }]
    })

    player._client.write('player_info', {
      action: 0,
      data: serv.players.map((otherPlayer) => ({
        UUID: otherPlayer.uuid,
        uuid: otherPlayer.uuid,
        name: otherPlayer.username,
        properties: otherPlayer.profileProperties,
        gamemode: otherPlayer.gameMode,
        ping: otherPlayer._client.latency
      }))
    })
    setInterval(() => player._client.write('player_info', {
      action: 2,
      data: serv.players.map(otherPlayer => ({
        UUID: otherPlayer.uuid,
        uuid: otherPlayer.uuid,
        ping: otherPlayer._client.latency
      }))
    }), 5000)
  }

  function announceJoin () {
    serv.broadcast(serv.color.yellow + player.username + ' joined the game.')
    player.emit('connected')
  }

  player.waitPlayerLogin = () => {
    const events = ['flying', 'look']
    return new Promise<void>(function (resolve) {
      const listener = () => {
        events.map(event => player._client.removeListener(event, listener))
        resolve()
      }
      events.map(event => player._client.on(event as any, listener))
    })
  }

  const sendWorldInfo = () => {
    player._client.write('update_view_distance', {
      viewDistance: settings['view-distance']
    })
    // todo cleanup
    if (+settings.version.split('.')[1] >= 18) {
      player._client.write('simulation_distance', {
        distance: settings['view-distance']
      })
    }
    if (serv.supportFeature('updateViewPosition')) {
      player._client.write('update_view_position', {
        chunkX: 0,
        chunkZ: 0
      })
    }
    const worldBorder = settings['worldBorder']?.radius/*  ?? 250_000 */
    // todo still need to be supported
    if (worldBorder) {
      if (+settings.version.split('.')[1] >= 17) {
        player._client.write('initialize_world_border', {
          x: 0,
          z: 0,
          oldDiameter: worldBorder * 2,
          newDiameter: worldBorder * 2,
          speed: 0,
          portalTeleportBoundary: worldBorder,
          warningBlocks: 5,
          warningTime: 15
        })
      }
    }
  }

  player.login = async () => {
    if (serv.uuidToPlayer[player.uuid]) {
      player.kick('You are already connected')
      return
    }
    if (serv.bannedPlayers[player.uuid]) {
      player.kick(serv.bannedPlayers[player.uuid].reason)
      return
    }
    if (serv.bannedIPs[player._client.socket?.remoteAddress as string]) {
      player.kick(serv.bannedIPs[player._client.socket?.remoteAddress as string].reason)
      return
    }

    await addPlayer()
    sendLogin()
    player.sendSpawnPosition()
    player.sendSelfPosition(false)
    player.sendAbilities()
    sendWorldInfo()

    const distance = settings['view-distance']
    player.setLoadingStatus(`Getting initial chunks (distance = ${distance})`)
    await player.sendMap()
    player.setLoadingStatus(null)
    player.setXp(player.xp)
    updateInventory()

    updateTime()
    fillTabList()
    player.updateAndSpawn()

    announceJoin()
    // mineflayer emits spawn event on health update so it needs to be done as last step
    player.updateHealth(player.health)
    player.emit('spawned')

    await player.waitPlayerLogin()
    player.sendRestMap()
    player.sendChunkWhenMove()

    if (playerData.new) { // otherwise we skip unnecessary fs operation
      player.save()
    }
  }


}
declare global {
  interface Server {
    /** @internal */
    "hashedSeed": number[]
  }
  interface Player {
    /** @internal */
    sendChunkWhenMove: () => void
    /** @internal */
    profileProperties: any
    /** @internal */
    loadedChunks: Record<string, number>
    /** @internal */
    crouching: boolean
    /** @internal */
    op: boolean
    /** The username of the player */
    username: string
    /** @internal */
    "setLoadingStatus": (text: any) => void
    /** set player gameMode to `gameMode` */
    "setGameMode": (gameMode: any) => void
    /** @internal */
    "waitPlayerLogin": () => Promise<unknown>
    /** login */
    "login": () => Promise<void>
  }
}
