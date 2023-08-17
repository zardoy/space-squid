//@ts-check
'use strict'

const DefaultServerImpl = require('minecraft-protocol/src/server')
const NodeRSA = require('node-rsa')
const plugins = [
  require('minecraft-protocol/src/server/handshake.js'),
  require('minecraft-protocol/src/server/keepalive'),
  require('minecraft-protocol/src/server/login'),
  require('minecraft-protocol/src/server/ping')
]

module.exports = (options = {}) => {
  const {
    host = undefined, // undefined means listen to all available ipv4 and ipv6 adresses
    // (see https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback for details)
    port = 25565,
    motd = 'A Minecraft server',
    maxPlayers = 20,
    Server = DefaultServerImpl,
    version,
    favicon,
    customPackets,
    motdMsg, // This is when you want to send formated motd's from ChatMessage instances
    socketType = 'tcp'
  } = options

  const optVersion = version === undefined || version === false ? require('./version').defaultVersion : version

  const mcData = require('minecraft-data')(optVersion)
  if (!mcData) throw new Error(`unsupported protocol version: ${optVersion}`)
  const mcversion = mcData.version
  const hideErrors = options.hideErrors || false

  const server = new Server(mcversion.minecraftVersion, customPackets, hideErrors)
  server.mcversion = mcversion
  server.motd = motd
  server.motdMsg = motdMsg
  server.maxPlayers = maxPlayers
  server.playerCount = 0
  server.onlineModeExceptions = Object.create(null)
  server.favicon = favicon
  server.options = options

  // The RSA keypair can take some time to generate
  // and is only needed for online-mode
  // So we generate it lazily when needed
  Object.defineProperty(server, 'serverKey', {
    configurable: true,
    get () {
      this.serverKey = new NodeRSA({ b: 1024 })
      return this.serverKey
    },
    set (value) {
      delete this.serverKey
      this.serverKey = value
    }
  })

  server.on('connection', function (client) {
    plugins.forEach(plugin => plugin(client, server, options))
  })
  if (socketType === 'ipc') {
    server.listen(host)
  } else {
    server.listen(port, host)
  }
  return server
}
