/* global BigInt */
import { Vec3 } from 'vec3'

import * as crypto from 'crypto'
import PrismarineItem from 'prismarine-item'
import * as playerDat from '../playerDat'
import * as convertInventorySlotId from '../convertInventorySlotId'
import { skipMcPrefix } from '../utils'
import { dimensionOverworld, getDimensionCodec } from './dimensionCodec'
import { Client } from 'minecraft-protocol'

export const server = function (serv: Server, options: Options) {
  serv.players ??= []
  serv.uuidToPlayer = {}

  const startLatencyInterval = () => {
    serv.setInterval(() => {
      serv.bridge.player_info({
        action: {
          update_latency: true,
        },
        data: serv.players.map(player => ({
          uuid: player.uuid,
          latency: player._client.latency,
        }))
      })
    }, 5000)
  }

  startLatencyInterval()

  serv._server.on('connection', client => {
    client.on('error', error => {
      serv.emit('clientError', client, error)
    })
  })

  const patchClient = (client: any, player: Player) => {
    client.oldAddListener ??= client.on.bind(client)
    client.patchedAddListener = (name, ...args) => {
      if (name !== 'packet') {
        const listener = args[0]
        client.oldAddListener(name, (...args) => {
          if (args.length !== 1) {
            listener(...args)
          } else {
            // PATCHED PACKET EMIT
            const data = args[0]
            const catchErr = (err) => {
              serv.emit('error', err, { type: 'fromPlayerPacket', name, data, player: player })
            }
            try {
              listener(data)?.catch(catchErr)
            } catch (err) {
              catchErr(err)
            }
          }
        })
      } else {
        client.oldAddListener(name, ...args)
      }
      serv.cleanupFunctions.push(() => client.removeListener(name, ...args))
    }
    client.on = client.patchedAddListener
    client.addListener = client.patchedAddListener
  }

  const addPlayerShared = async (player: Player) => {
    player.serv = serv
    patchClient(player._client, player)

    for (const plugin of Object.values({ ...serv.modules, ...serv.plugins })) plugin.player?.(player, serv, options)

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

  const playerJoined = async (client: Client, assignProps?: { isFake?: boolean }) => {
    if (client.socket?.listeners && client.socket.listeners('end').length === 0) return // TODO: should be fixed properly in nmp instead
    if (!serv.pluginsReady) {
      client.end('Server is still starting! Please wait before reconnecting.')
      return
    }
    let player: Player
    try {
      player = serv.initEntity('player', null, serv.overworld, new Vec3(0, 0, 0))
      Object.assign(player, assignProps)
      Object.defineProperty(player, 'position', {
        get () {
          throw new Error('Position of the player is not ready yet and is going to be restored (possibly) from playerdata or from world spawn point. Update or use it after player is ready (player.onReady promise is resolved).')
        },
        set (value) {
          throw new Error('Position of the player is not ready yet and is going to be restored (possibly) from playerdata or from world spawn point. Update or use it after player is ready (player.onReady promise is resolved).')
        },
      })
      player._client = client as any

      player.profileProperties = player._client.profile ? player._client.profile.properties : []

      await addPlayerShared(player)

      await player.login()
      return player
    } catch (err) {
      serv.emit('error', err, { type: 'playerLogin', player: player! })
      client.end(`Internal server error during login phase: ${err.message}`)
    }
  }

  serv._addPlayer = playerJoined

  if (serv.supportFeature('hasConfigurationState')) {
    serv._server.on('playerJoin', async (client) => {
      await playerJoined(client)
    })
  } else {
    serv._server.on('login', async (client) => {
      await playerJoined(client)
    })
  }

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

  player.stopChunkUpdates ??= false

  player.setLoadingStatus = (text) => {
    player.emit('loadingStatus', text)
  }

  async function addPlayer () {
    player.type = 'player'
    player.crouching = false // Needs added in prismarine-entity later
    player.op = settings['everybody-op'] ?? false
    player.username = player._client.username
    player.uuid = player._client.uuid
    player.getDisplayName = (location?: string) => player.displayName ?? player.username

    player.setLoadingStatus('Findig spawn point')

    player.setLoadingStatus('Reading player data')
    //@ts-ignore remove position only-getter
    delete player.position
    playerData = await playerDat.read(player.uuid, async () => {
      // when data does not exist
      player.world = serv.overworld
      await player.findSpawnPoint()
      return player.spawnPoint
    }, settings.worldFolder ?? false, settings.useInMemoryStorage ?? true)
    Object.keys(playerData.player).forEach(k => { player[k] = playerData.player[k] })
    await player.findSpawnPoint()

    // Set world based on saved dimension data, fallback to overworld
    const savedDimension = (playerData?.player?.Dimension?.value ?? 'overworld').replace('minecraft:', '')
    player.world = (savedDimension === 'the_nether' || savedDimension === 'nether') ? serv.netherworld : (serv.worlds[savedDimension] ?? serv.overworld)

    serv.players.push(player)
    serv.uuidToPlayer[player.uuid] = player
    player.loadedChunks = {}
    player.setLoadingStatus(null)

    player.emit('dataLoaded')
    player.makeReady() // Resolve ready state when data is loaded
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

    const worldState = (serv.mcData.loginPacket as any).worldState
    if (worldState) {
      worldState.gamemode = {
        0: 'survival',
        1: 'creative',
        2: 'adventure',
        3: 'spectator'
      }[player.gameMode]
      worldState.previousGamemode = player.prevGameMode
    }

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
    player.emit('login')
    if (serv.supportFeature('difficultySentSeparately')) {
      player._client.write('difficulty', {
        difficulty: serv.difficulty,
        difficultyLocked: false
      })
    }
  }

  const getXYPos = (pos) => {
    return new Vec3(pos.x, 0, pos.z)
  }

  player.sendChunkWhenMove = () => {
    player.on('move', () => {
      if (player.stopChunkUpdates) return
      if (getXYPos(player.position).distanceTo(getXYPos(player.lastPositionChunkUpdated)) > 16) {
        player.sendRestMap()
      }
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
    serv.bridge.player_info({
      action: {
        update_game_mode: true,
      },
      data: [{
        uuid: player.uuid,
        gamemode: player.gameMode
      }]
    })
    player.sendAbilities()
  }

  function fillTabList () {
    serv.bridge.player_info({
      action: {
        add_player: true,
        initialize_chat: true,
        update_listed: true,
        update_latency: true,
        update_display_name: true,
        update_hat: true,
        update_list_order: true,
        update_game_mode: true,
      },
      data: [{
        uuid: player.uuid,
        player: {
          name: player.getDisplayName('tab'),
          properties: player.profileProperties,
        },
        gamemode: player.gameMode,
        latency: player._client.latency,
        displayName: undefined,
        chatSession: undefined,
        listed: 1,
        listPriority: 0,
        showHat: false,
      }]
    })

    player.bridge.player_info({
      action: {
        add_player: true,
        initialize_chat: true,
        update_game_mode: true,
        update_listed: true,
        update_latency: true,
        update_display_name: true,
        update_hat: true,
        update_list_order: true
      },
      data: serv.players.map((otherPlayer) => ({
        uuid: otherPlayer.uuid,
        player: {
          name: otherPlayer.getDisplayName('tab'),
          properties: otherPlayer.profileProperties,
        },
        gamemode: otherPlayer.gameMode,
        latency: otherPlayer._client.latency,
        displayName: undefined,
        chatSession: undefined,
        listed: 1,
        listPriority: 0,
        showHat: false,
      }))
    })

  }

  function announceJoin () {
    serv.broadcast(serv.chatColor.yellow + player.getDisplayName('chat') + ' joined the game.')
    player.emit('connected')
  }

  player.waitPlayerLogin = () => {
    const events = ['flying', 'look', 'position_look', 'position']
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

    if (!settings.noInitialChunksSend) {
      const distance = settings['view-distance']
      player.setLoadingStatus(`Getting initial chunks (distance = ${distance})`)
      await player.sendMap()
    }
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

    if (!player.isFake) {
      await player.waitPlayerLogin()
    }
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
    _addPlayer: (client: Client, assignProps?: { isFake?: boolean }) => Promise<Player | undefined>
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
    /** Optional display name of the player */
    displayName?: string
    /** Get the display name of the player, falls back to username if not set
     * @param location Optional location where the display name will be used (e.g. 'chat', 'tab', 'log')
     */
    getDisplayName: (location?: string) => string
    /** @internal */
    "setLoadingStatus": (text: any) => void
    /** set player gameMode to `gameMode` */
    "setGameMode": (gameMode: any) => void
    /** @internal */
    "waitPlayerLogin": () => Promise<unknown>
    /** login */
    "login": () => Promise<void>
    stopChunkUpdates: boolean
    serv: Server
  }

  interface Options {
    /** Whether to use in-memory storage when worldFolder is falsey. Defaults to true. */
    useInMemoryStorage?: boolean
  }
}
