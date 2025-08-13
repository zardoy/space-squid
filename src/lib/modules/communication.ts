import { Vec3 } from 'vec3'
import { ServerPacketBridger } from 'mc-bridge'
import { ClientOnMap } from 'mc-bridge/dist/protocol.generated'

export const server = function (serv: Server, options: Options) {
  serv.bridge = new ServerPacketBridger(options.version, (packetName, data) => {
    serv._writeAll(packetName, data)
  })

  serv.toClientPacketProcessors ??= {}

  serv._server.on('connection', (client) => {
    const oldWrite = client.write.bind(client)
    client.write = (packetName, packetFields) => {
      for (const processor of [
        ...(serv.toClientPacketProcessors[packetName] ?? []),
        ...(serv.toClientPacketProcessors['*'] ?? [])
      ]) {
        packetFields = processor(packetFields, packetName) ?? packetFields
      }
      return oldWrite(packetName, packetFields)
    }
  })

  serv.addToClientPacketProcessor = (packet, processor) => {
    serv.toClientPacketProcessors[packet ?? '*'] ??= []
    serv.toClientPacketProcessors[packet ?? '*'].push(processor)
  }

  serv._writeAll = (packetName, packetFields) =>
    serv.players.forEach((player) => player._client.write(packetName, packetFields))

  serv._writeArray = (packetName, packetFields, players) =>
    players.forEach((player) => player._client.write(packetName, packetFields))

  serv._writeNearby = (packetName, packetFields, loc) =>
    serv._writeArray(packetName, packetFields, serv.getNearby(loc))

  serv.getNearby = ({ world, position, radius = 8 * 16 }) => serv.players.filter(player =>
    player.world === world &&
    player.position.distanceTo(position) <= radius
  )

  serv.getNearbyEntities = ({ world, position, radius = 8 * 16 }) => Object.keys(serv.entities)
    .map(eId => serv.entities[eId])
    .filter(entity =>
      entity.ready &&
      entity.world === world &&
      entity.position.distanceTo(position) <= radius
    )
}

export const entity = function (entity: Entity, serv: Server) {
  entity.getNearby = () => serv
    .getNearbyEntities({
      world: entity.world,
      position: entity.position,
      radius: entity.viewDistance
    })
    .filter((e) => e !== entity)

  entity.getOtherPlayers = () => serv.players.filter((p) => p !== entity)

  entity.getOthers = () => Object.fromEntries(Object.entries(serv.entities).filter(([id]) => id !== entity.id && serv.entities[id].ready))

  entity.getNearbyPlayers = (radius = entity.viewDistance) => entity.getNearby()
    .filter((e) => e.type === 'player' && entity.position.distanceTo(entity.position) <= radius) as Player[]

  entity.nearbyPlayers = (radius = entity.viewDistance) => entity.nearbyEntities
    .filter(e => e.type === 'player' && entity.position.distanceTo(entity.position) <= radius) as Player[]

  entity._writeOthers = (packetName, packetFields) =>
    serv._writeArray(packetName, packetFields, entity.getOtherPlayers())

  entity._writeOthersNearby = (packetName, packetFields) =>
    serv._writeArray(packetName, packetFields, entity.getNearbyPlayers())

  entity._writeNearby = (packetName, packetFields) =>
    serv._writeArray(packetName, packetFields, [...entity.getNearbyPlayers(), ...entity.type === 'player' ? [entity] : []])
}

export const player = function (player: Player, serv: Server) {
  player.writePacket = (packetName, data) => {
    if (!serv.mcData.protocol.play.toClient.types[`packet_${packetName}`]) return
    try {
      player._client.write(packetName, data)
    } catch (err) {
      serv.emit('error', err, { type: 'toPlayerPacket', name: packetName, data, player: player })
    }
  }
  player.bridge = new ServerPacketBridger(serv.mcData.version.minecraftVersion!, (packetName, data) => {
    player.writePacket(packetName as keyof ClientOnMap, data)
  })
}

export type PacketProcessor = (packet: any, packetName: string/* , player: Player */) => any

declare global {
  interface Server {
    toClientPacketProcessors: Record<string, PacketProcessor[]>
    addToClientPacketProcessor: (packet: string | null, processor: PacketProcessor) => void

    "_writeAll": (packetName: any, packetFields: any) => void
    "_writeArray": (packetName: any, packetFields: any, players: any) => void
    '_writeNearby': (packetName: any, packetFields: any, loc: { world: Player['world'], position: Vec3, radius?: number }) => void
    /** Returns array of players within loc. loc is a required paramater. The object contains:
     *
     * * world: World position is in
     * * position: Center position
     * * radius: Distance from position
     */
    'getNearby': (params: { world: Player['world'], position: Vec3, radius?: number }) => Player[]
    "getNearbyEntities": (params: { world: Player['world']; position: Vec3; radius?: number }) => Entity[]
    "bridge": ServerPacketBridger
  }
  interface Entity {
    /** Gets all entities nearby (within entity.viewDistance) */
    "getNearby": () => Entity[]
    /** Gets every player other than self (all players if entity is not a player) */
    "getOtherPlayers": () => Player[]
    /**
     * Get every other entity other than self
     * Should not be used repeatedly as it is a slow operation

     */
    "getOthers": () => Server['entities']
    /** Gets all nearby players regardless of what client thinks */
    "getNearbyPlayers": (radius?: number) => Player[]
    /** Gets all nearby players that client can see */
    "nearbyPlayers": (radius?: number) => Player[]
    "_writeOthers": (packetName: any, packetFields: any) => void
    "_writeOthersNearby": (packetName: any, packetFields: any) => void
    "_writeNearby": (packetName: any, packetFields: any) => void
  }

  interface Player {
    "bridge": ServerPacketBridger
    "writePacket": (packetName: keyof ClientOnMap, data: any) => void
  }
}
