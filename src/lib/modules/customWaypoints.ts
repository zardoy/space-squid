const ADD_CHANNEL = 'minecraft-web-client:waypoint-add'
const DELETE_CHANNEL = 'minecraft-web-client:waypoint-delete'

export const server = (serv: Server) => {
  const module = {
    waypoints: {} as Record<string, Waypoint>,
    addWaypoint: (id: string, waypoint: Waypoint, players?: Player[]) => {
      module.waypoints[id] = { ...waypoint, _players: players ? players.map(p => p.uuid) : undefined }
      // Broadcast add/update to all online players
      for (const player of (players ?? serv.players ?? [])) {
        sendAddWaypoint(player, id, waypoint)
      }
    },
    removeWaypoint: (id: string) => {
      delete module.waypoints[id]
      // Broadcast delete to all online players
      for (const player of serv.players ?? []) {
        sendDeleteWaypoint(player, id)
      }
    }
  }

  serv.customWaypoints = module

  return module
}

function sendAddWaypoint (player: Player, id: string, waypoint: Waypoint) {
  player._client.writeChannel(ADD_CHANNEL, {
    id,
    x: waypoint.x,
    y: waypoint.y,
    z: waypoint.z,
    minDistance: waypoint.minDistance ?? 0,
    label: waypoint.label ?? '',
    color: waypoint.color ?? 0
  })
}

function sendDeleteWaypoint (player: Player, id: string) {
  player._client.writeChannel(DELETE_CHANNEL, { id })
}

function sendAllWaypoints (player: Player, serv: Server) {
  const entries = Object.entries(serv.customWaypoints.waypoints ?? {})
  for (const [id, waypoint] of entries) {
    if (!waypoint._players || waypoint._players.includes(player.uuid)) {
      sendAddWaypoint(player, id, waypoint)
    }
  }
}

export const player = async (player: Player, serv: Server) => {
  // Register channels expected by the client
  player._client.registerChannel(
    ADD_CHANNEL,
    ['container', [
      { name: 'id', type: ['pstring', { countType: 'i16' }] },
      { name: 'x', type: 'f32' },
      { name: 'y', type: 'f32' },
      { name: 'z', type: 'f32' },
      { name: 'minDistance', type: 'i32' },
      {
        name: 'label',
        type: ['pstring', { countType: 'i16' }]
      },
      {
        name: 'color',
        type: 'i32'
      }
    ]]
  )

  player._client.registerChannel(
    DELETE_CHANNEL,
    ['container', [
      { name: 'id', type: ['pstring', { countType: 'i16' }] },
    ]]
  )

  // Send current server waypoints on join
  player.on('login', () => {
    sendAllWaypoints(player, serv)
  })
}

export type Waypoint = {
  x: number
  y: number
  z: number
  minDistance?: number
  label?: string
  color?: number

  _players?: string[]
}

declare global {
  interface Server {
    customWaypoints: ReturnType<typeof server>
  }
}
