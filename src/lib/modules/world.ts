import { gzip } from 'node-gzip'
import nbt from 'prismarine-nbt'

import { promisify } from 'util'
import fs from 'fs'
import { level, Anvil as AnvilLoader } from 'prismarine-provider-anvil'

import * as playerDat from '../playerDat'
import { Chunk, World } from 'prismarine-world/types/world'
import WorldLoader from 'prismarine-world'
import ChunkLoader from 'prismarine-chunk'
import RegistryLoader from 'prismarine-registry'
import { LevelDatFull } from 'prismarine-provider-anvil/src/level'
import generations from '../generations'
import { Vec3 } from 'vec3'
import { generateSpiralMatrix } from '../../utils'

const fsStat = promisify(fs.stat)
const fsMkdir = promisify(fs.mkdir)

export const server = async function (serv: Server, options: Options) {
  const { version, worldSaveVersion, worldFolder, generation = { name: 'diamond_square', options: { worldHeight: 80 } } } = options
  generation.options.worldHeight = serv.supportFeature('tallWorld') ? 384 : 256
  generation.options.minY = serv.supportFeature('tallWorld') ? -64 : 0

  const World = WorldLoader(version)
  const registry = RegistryLoader(version)
  const Anvil = worldFolder ? AnvilLoader(worldSaveVersion ?? version) : undefined

  const newSeed = generation.options.seed || Math.floor(Math.random() * Math.pow(2, 31))
  let seed
  let regionFolder
  if (worldFolder) {
    regionFolder = worldFolder + '/region'
    try {
      await fsStat(regionFolder)
    } catch (err) {
      await fsMkdir(regionFolder, { recursive: true })
    }

    try {
      const levelData = await level.readLevel(worldFolder + '/level.dat')
      serv.levelData = levelData
      // destruct SpawnY, SpawnX, SpawnZ
      const { SpawnY, SpawnX, SpawnZ } = levelData
      if ([SpawnY, SpawnX, SpawnZ].every(x => x !== undefined)) {
        serv.spawnPoint = new Vec3(SpawnX, SpawnY, SpawnZ)
      }
      seed = levelData.RandomSeed[0]
    } catch (err) {
      seed = newSeed
      await level.writeLevel(worldFolder + '/level.dat', {
        RandomSeed: [seed, 0],
        Version: { Name: options.version },
        generatorName: generation.name === 'superflat' ? 'flat' : generation.name === 'diamond_square' ? 'default' : 'customized',
        LevelName: options.levelName!, // todo fix typing
        allowCommands: 1
      })
    }
  } else { seed = newSeed }
  const generationOptions = {
    ...generation.options,
    seed,
    version,
  }
  serv.emit('seed', generationOptions.seed)
  const generationModule: (options) => any = generations[generation.name] ? generations[generation.name] : require(generation.name)
  serv.overworld = new World(generationModule(generationOptions), regionFolder === undefined || !Anvil ? null : new Anvil(regionFolder), options.savingInterval as any) as CustomWorld
  serv.overworld.seed = generationOptions.seed
  serv.netherworld = new World(generations.nether(generationOptions)) as CustomWorld
  // serv.endworld = new World(generations["end"]({}));

  serv.dimensionNames = {
    '-1': 'minecraft:nether',
    0: 'minecraft:overworld'
    // 1: 'minecraft:end'
  }

  // WILL BE REMOVED WHEN ACTUALLY IMPLEMENTED
  serv.overworld.blockEntityData = {}
  serv.netherworld.blockEntityData = {}
  serv.overworld.portals = []
  serv.netherworld.portals = []
  /// ///////////

  serv.pregenWorld = (world, size = 3) => {
    const promises: Promise<Chunk>[] = []
    for (let x = -size; x < size; x++) {
      for (let z = -size; z < size; z++) {
        promises.push(world.getColumn(x, z))
      }
    }
    return Promise.all(promises)
  }

  serv.setBlock = async (world, position, stateId) => {
    serv.players
      .filter(p => p.world === world)
      .forEach(player => player.sendBlock(position, stateId))
    await world.setBlockStateId(position, stateId)
    if (stateId === 0) serv.notifyNeighborsOfStateChange(world, position, serv.tickCount, serv.tickCount, true)
    else serv.updateBlock(world, position, serv.tickCount, serv.tickCount, true)
  }

  if (serv.supportFeature('theFlattening')) {
    serv.setBlockType = async (world, position, id) => {
      serv.setBlock(world, position, registry.blocks[id].minStateId!)
    }
  } else {
    serv.setBlockType = async (world, position, id) => {
      serv.setBlock(world, position, id << 4)
    }
  }

  serv.setBlockAction = async (world, position, actionId, actionParam) => {
    const location = new Vec3(position.x, position.y, position.z)
    const blockType = await world.getBlockType(location)

    serv.players
      .filter(p => p.world === world)
      .forEach(player => player.sendBlockAction(position, actionId, actionParam, blockType))
  }

  serv.reloadChunks = (world, chunks) => {
    serv.players
      .filter(player => player.world === world)
      .forEach(oPlayer => {
        chunks
          .filter(({ chunkX, chunkZ }) => oPlayer.loadedChunks[chunkX + ',' + chunkZ] !== undefined)
          .forEach(({ chunkX, chunkZ }) => oPlayer._unloadChunk(chunkX, chunkZ))
        oPlayer.sendRestMap()
      })
  }

  serv.chunksUsed = {}
  serv._loadPlayerChunk = (chunkX, chunkZ, player) => {
    const id = chunkX + ',' + chunkZ
    if (!serv.chunksUsed[id]) {
      serv.chunksUsed[id] = 0
    }
    serv.chunksUsed[id]++
    const loaded = player.loadedChunks[id]
    if (!loaded) player.loadedChunks[id] = 1
    return !loaded
  }
  serv._unloadPlayerChunk = (chunkX, chunkZ, player) => {
    const id = chunkX + ',' + chunkZ
    delete player.loadedChunks[id]
    if (serv.chunksUsed[id] > 0) {
      serv.chunksUsed[id]--
    }
    if (!serv.chunksUsed[id]) {
      player.world.unloadColumn(chunkX, chunkZ)
      return true
    }
    return false
  }

  // serv.pregenWorld(serv.overworld).then(() => serv.info('Pre-Generated Overworld'));
  // serv.pregenWorld(serv.netherworld).then(() => serv.info('Pre-Generated Nether'));
  serv.commands.add({
    base: 'changeworld',
    info: 'to change world',
    usage: '/changeworld overworld|nether',
    onlyPlayer: true,
    op: true,
    action (world, ctx) {
      if (world === 'nether') ctx.player.changeWorld(serv.netherworld, { dimension: -1 })
      if (world === 'overworld') ctx.player.changeWorld(serv.overworld, { dimension: 0 })
    }
  })
  serv.commands.add({
    base: 'seed',
    info: 'Get world\'s seed',
    usage: '/seed',
    action (data, ctx) {
      const world = ctx.player?.world ?? serv.overworld
      // todo need concept of command output
      const message = `Seed: ${world.seed}`
      if (ctx.player) {
        ctx.player.chat(message)
      } else {
        console.log(message)
      }
    },
  })

  serv.savePlayersSingleplayer = async () => {
    if (!worldFolder) return
    const savedData = await serv.players[0].save()
    // if we ever support level.dat saving this function needs to be changed i guess
    const levelDatContent = await fs.promises.readFile(worldFolder + '/level.dat')
    const { parsed } = await nbt.parse(levelDatContent)
    //@ts-ignore
    parsed.value.Data.value.Player = savedData
    const newDataCompressed = await gzip(nbt.writeUncompressed(parsed))
    await fs.promises.writeFile(worldFolder + '/level.dat', newDataCompressed)

    await Promise.all(serv.players.slice(1).map(async player => player.save()))
  }

  // serv.commands.add({
  //   base: 'data',
  //   info: 'Gets, merges, modifies and removes block entity and entity NBT data',
  //   usage: '/data',
  //   parse(string, ctx) {
  //     const [action, action2, arg3] = string.split(' ')
  //     return {
  //       action,
  //       action2,
  //       arg3
  //     }
  //   },
  //   action(data, ctx) {
  //   },
  // })

  serv.commands.add({
    // temp
    base: 'setdata',
    info: 'Set entity data - for testing',
    usage: '/setdata',
    tab: [
      'blockX', 'blockY', 'blockZ'
    ],
    parse (string, ctx) {
      return string.split(' ')
    },
    async action (data, ctx) {
      const [blockX, blockY, blockZ, ..._data] = data
      const dataString = _data.join(' ')
      const pos = new Vec3(+blockX, +blockY, +blockZ)
      const block = await ctx.player!.world.getBlock(pos)
      if (block.name !== 'command_block') return
      const key = `${pos.x},${pos.y},${pos.z}`
      //@ts-ignore
      const { blockEntities, setBlock } = await ctx.player!.world.getColumnAt(pos)
      blockEntities[key] ??= {
        name: '',
        value: {}
      }
      blockEntities[key].value ??= {
        id: { type: 'string', value: 'command_block' },
        Command: { type: 'string', value: '' },
        auto: { type: 'byte', value: 0 },
        powered: { type: 'byte', value: 0 },
        conditionMet: { type: 'byte', value: 0 },
        UpdateLastExecution: { type: 'byte', value: 0 },
        LastExecution: { type: 'long', value: 0 },
        LastOutput: { type: 'string', value: '' },
        TrackOutput: { type: 'byte', value: 0 },
        SuccessCount: { type: 'int', value: 0 },
        CustomName: { type: 'string', value: '' },
        color: { type: 'string', value: 'white' },
        x: { type: 'int', value: pos.x },
        y: { type: 'int', value: pos.y },
        z: { type: 'int', value: pos.z },
      }
      blockEntities[key].value.Command = { type: 'string', value: dataString }
      ctx.player!.world.blockEntityData[key] = blockEntities[key]
    },
  })
}

export const player = function (player: Player, serv: Server, settings: Options) {
  const registry = RegistryLoader(settings.version)

  player.flying = 0
  player._client.on('abilities', ({ flags }) => {
    // todo check can fly!!
    player.flying = flags & 2
  })

  player.save = async () => {
    return await playerDat.save(player, settings.worldFolder, serv.supportFeature('attributeSnakeCase'), serv.supportFeature('theFlattening'))
  }

  player._unloadChunk = (chunkX, chunkZ) => {
    serv._unloadPlayerChunk(chunkX, chunkZ, player)

    if (serv.supportFeature('unloadChunkByEmptyChunk')) {
      player._client.write('map_chunk', {
        x: chunkX,
        z: chunkZ,
        groundUp: true,
        bitMap: 0x0000,
        chunkData: Buffer.alloc(0)
      })
    } else if (serv.supportFeature('unloadChunkDirect')) {
      player._client.write('unload_chunk', {
        chunkX,
        chunkZ
      })
    }
  }

  player.sendChunk = async (chunkX, chunkZ, column) => {
    await player.behavior('sendChunk', {
      x: chunkX,
      z: chunkZ,
      chunk: column
    }, ({ x, z, chunk }/* : {x, z, chunk: import('prismarine-chunk').PCChunk} */) => {
      const newLightsFormat = serv.supportFeature('newLightingDataFormat')
      const dumpedLights = chunk.dumpLight()
      const newLightsData = newLightsFormat ? { skyLight: dumpedLights.skyLight, blockLight: dumpedLights.blockLight } : undefined
      const chunkBuffer = chunk.dump()
      player._client.write('map_chunk', {
        x,
        z,
        groundUp: true,
        //note: it's a flag that tells the client to trust the edges of the chunk, meaning that the client can render the chunk without having to wait for the edges to be sent
        trustEdges: true, // should be false when a chunk section is updated instead of the whole chunk being overwritten, do we ever do that?
        bitMap: chunk.getMask(),
        ...serv.supportFeature('blockStateId') ? {
          // groundUp: false,
          // bitMap: undefined // use full mask (e.g. 0xffff is default). workaround for https://github.com/PrismarineJS/prismarine-chunk/issues/205
        } : {},
        biomes: chunk.dumpBiomes(),
        ignoreOldData: true, // should be false when a chunk section is updated instead of the whole chunk being overwritten, do we ever do that?
        heightmaps: {
          type: 'compound',
          name: '',
          value: {
            MOTION_BLOCKING: { type: 'longArray', value: new Array(37).fill([0, 0]) },
            WORLD_SURFACE: { type: 'longArray', value: new Array(37).fill([0, 0]) },
          }
        }, // FIXME: fake heightmap
        chunkData: chunkBuffer,
        blockEntities: [],
        skyLightMask: chunk.skyLightMask,
        // skyLightMask: [chunk.skyLightMask.data],
        emptySkyLightMask: chunk.emptySkyLightMask,
        blockLightMask: chunk.blockLightMask,
        emptyBlockLightMask: chunk.emptyBlockLightMask,
        ...newLightsData
      })
      if (serv.supportFeature('lightSentSeparately') && !serv.supportFeature('newLightingDataFormat')) {
        player._client.write('update_light', {
          chunkX: x,
          chunkZ: z,
          trustEdges: true, // should be false when a chunk section is updated instead of the whole chunk being overwritten, do we ever do that?
          skyLightMask: chunk.skyLightMask,
          blockLightMask: chunk.blockLightMask,
          emptySkyLightMask: chunk.emptySkyLightMask,
          emptyBlockLightMask: chunk.emptyBlockLightMask,
          ...newLightsData ? newLightsData : {
            data: dumpedLights
          }
        })
      }
      Object.assign(serv.overworld.blockEntityData, column.blockEntities)
      for (const key in column.blockEntities ?? []) {
        const blockEntity = column.blockEntities[key]
        const actionPerId = {
          MobSpawner: 1,
          Control: 2
        }
        const value = blockEntity.value?.id?.value
        if (value) {
          let action = actionPerId[value]
          if (action === undefined) {
            if (serv.looseProtocolMode) { // eg mineflayer don't care of action passed here, so lets always send tile entity
              action = 0
            } else {
              continue
            }
          }
          const [x, y, z] = key.split(',').map(a => parseInt(a))
          blockEntity.name = ''
          player._client.write('tile_entity_data', {
            location: {
              x,
              y,
              z
            },
            action,
            nbtData: blockEntity
          })
        }
      }
      return Promise.resolve()
    })
  }

  player.sendNearbyChunks = (viewDistance, group = false) => {
    player.lastPositionChunkUpdated = player.position
    const playerChunkX = Math.floor(player.position.x / 16)
    const playerChunkZ = Math.floor(player.position.z / 16)

    Object.keys(player.loadedChunks)
      .map((key) => key.split(',').map(a => parseInt(a)))
      .filter(([x, z]) => Math.abs(x - playerChunkX) > viewDistance || Math.abs(z - playerChunkZ) > viewDistance)
      .forEach(([x, z]) => player._unloadChunk(x, z))

    return generateSpiralMatrix(viewDistance)
      .map(t => ({
        chunkX: playerChunkX + t[0],
        chunkZ: playerChunkZ + t[1]
      }))
      .filter(({ chunkX, chunkZ }) => serv._loadPlayerChunk(chunkX, chunkZ, player))
      .reduce((acc, { chunkX, chunkZ }) => {
        const p = acc
          .then(() => player.world.getColumn(chunkX, chunkZ))
          .then((column) => player.sendChunk(chunkX, chunkZ, column))
        return group ? p.then(() => sleep(5)) : p
      }, Promise.resolve())
  }

  function sleep (ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  player.sendMap = () => {
    return player.sendNearbyChunks(settings['view-distance'])
      .catch((err) => setTimeout(() => { throw err }))
  }

  player.sendRestMap = () => {
    player.sendingChunks = true
    player.sendNearbyChunks(Math.min(player.view, settings['max-view-distance'] ?? player.view), true)
      .then(() => { player.sendingChunks = false })
      .catch((err) => setTimeout(() => { throw err }))
  }

  player.sendSpawnPosition = () => {
    player._client.write('spawn_position', {
      location: player.spawnPoint,
      angle: 0,
    })
  }

  player._unloadAllChunks = () => {
    Object.keys(player.loadedChunks)
      .map((key) => key.split(',').map(a => parseInt(a)))
      .forEach(([x, z]) => player._unloadChunk(x, z))
  }

  player.changeWorld = async (world, opt) => {
    if (player.world === world) return Promise.resolve()
    opt = opt || {}
    player.world = world
    player._unloadAllChunks()
    if (typeof opt.gamemode !== 'undefined') {
      if (opt.gamemode !== player.gameMode) player.prevGameMode = player.gameMode
      player.gameMode = opt.gamemode
    }
    player._client.write('respawn', {
      previousGameMode: player.prevGameMode,
      dimension: serv.supportFeature('dimensionIsAString') ? serv.dimensionNames[opt.dimension || 0] : opt.dimension || 0,
      worldName: serv.dimensionNames[opt.dimension || 0],
      difficulty: opt.difficulty || serv.difficulty,
      hashedSeed: serv.hashedSeed,
      gamemode: opt.gamemode || player.gameMode,
      levelType: 'default',
      isDebug: false,
      isFlat: false,
      copyMetadata: true
    })
    await player.findSpawnPoint()
    player.position = player.spawnPoint
    player.sendSpawnPosition()
    player.updateAndSpawn()

    await player.sendMap()

    player.sendSelfPosition(false)
    player.emit('change_world')

    await player.waitPlayerLogin()
    player.sendRestMap()
  }
}

export interface CustomWorld extends World {
  blockEntityData: Record<string, any>
  portals: any[]
  seed: number
}

export const usedServerPathsV1 = [
  'region',
  'level.dat',
  'playerdata',
  'Warp files',
  'icon.png'
]

declare global {
  interface Server {
    /** @internal */
    looseProtocolMode: any
    /** @internal */
    lastPositionChunkUpdated: Vec3
    /** Global spawn and respawn point for every player */
    spawnPoint?: Vec3
    /** Parsed level.dat of the loaded world (only if worldFolder is specificed) */
    levelData?: LevelDatFull
    /** Contains the overworld world. This is where the default spawn point is */
    "overworld": CustomWorld
    /** Contains the nether world. This **WILL** be used when a player travels through a portal if they are in the overworld! */
    "netherworld": CustomWorld
    /** @internal */
    "dimensionNames": { '-1': string; 0: string }
    /** @internal */
    "pregenWorld": (world: CustomWorld, size?: number) => Promise<Chunk[]>
    /** Saves block in world and sends block update to all players of the same world. */
    "setBlock": (world: CustomWorld, position: Vec3, stateId: number) => Promise<void>
    /** @internal */
    "setBlockType": (world: CustomWorld, position: Vec3, id: number) => Promise<void>
    /** Sends a block action to all players of the same world. */
    "setBlockAction": (world: CustomWorld, position: Vec3, actionId: number, actionParam: any) => Promise<void>
    /** @internal */
    "reloadChunks": (world: CustomWorld, chunks: any) => void
    /** @internal */
    "chunksUsed": {}
    /** @internal */
    "_loadPlayerChunk": (chunkX: number, chunkZ: number, player: Player) => boolean
    /** @internal */
    "_unloadPlayerChunk": (chunkX: number, chunkZ: number, player: Player) => boolean
    /** @internal */
    "savePlayersSingleplayer": () => Promise<void>
  }
  interface Player {
    /** @internal */
    lastPositionChunkUpdated: Vec3
    /** @internal */
    sendingChunks: boolean
    /** @internal */
    world: CustomWorld
    /** @internal */
    'flying': number
    /** If `worldFolder` option is set, save player's data into `<worldFolder>/playerdata/<UUID>.dat`. Returns promise.
     * Example: save all players data to disk:
     *
     * ```js
     * for (const player of serv.players) {
     *   player.save()
     * }
     * ```
     */
    'save': () => Promise<any>
    /** @internal */
    "_unloadChunk": (chunkX: any, chunkZ: any) => void
    /** @internal */
    "sendChunk": (chunkX: any, chunkZ: any, column: any) => Promise<void>
    /** @internal */
    "sendNearbyChunks": (viewDistance: any, group?) => Promise<any>
    /** @internal */
    "sendMap": () => any
    /** @internal */
    "sendRestMap": () => void
    /** @internal */
    "sendSpawnPosition": () => void
    /** @internal */
    '_unloadAllChunks': () => void
    /** The world object which the player is in (use serv.overworld, serv.netherworld, serv.endworld, or a custom world). Options:
     *
     * - gamemode: Gamemode of the world (Default is player gamemode)
     * - difficulty: Difficulty of world. Default is 0 (easiest)
     * - dimension: Dimension of world. 0 is Overworld, -1 is Nether, 1 is End (Default is 0)
     */
    'changeWorld': (world: any, opt: any) => Promise<void>
  }
}
