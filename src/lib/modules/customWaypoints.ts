const ADD_CHANNEL = 'minecraft-web-client:waypoint-add'
const DELETE_CHANNEL = 'minecraft-web-client:waypoint-delete'

export const server = (serv: Server) => {
  const module = {
    customWaypoints: {} as Record<string, Waypoint>,
    customAddWaypoint: (id: string, waypoint: Waypoint) => {
      serv.customWaypoints.customWaypoints[id] = waypoint
      // Broadcast add/update to all online players
      for (const player of serv.players ?? []) {
        sendAddWaypoint(player, id, waypoint)
      }
    },
    customRemoveWaypoint: (id: string) => {
      delete serv.customWaypoints.customWaypoints[id]
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
  const entries = Object.entries(serv.customWaypoints.customWaypoints ?? {})
  for (const [id, waypoint] of entries) {
    sendAddWaypoint(player, id, waypoint)
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
}

declare global {
  interface Server {
    customWaypoints: ReturnType<typeof server>
  }
}
