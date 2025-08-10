import { createServer } from 'minecraft-protocol'

import { supportedVersions } from './lib/version'
import Command from './lib/command'
import * as builtinModules from './lib/modules'
import { EventEmitter } from 'events'
import { Server as ProtocolServer } from 'minecraft-protocol'
import { IndexedData } from 'minecraft-data'
import './types' // include Server declarations from all modules
import './modules'
import { TimerManager } from './lib/utils/timerManager'

// #region RUNTIME PREPARE
if (typeof process !== 'undefined' && !process.browser && process.platform !== 'browser' && parseInt(process.versions.node.split('.')[0]) < 18) {
  console.error('[\x1b[31mCRITICAL\x1b[0m] Node.JS 18 or newer is required')
  console.error('[\x1b[31mCRITICAL\x1b[0m] You can download the new version from https://nodejs.org/')
  console.error(`[\x1b[31mCRITICAL\x1b[0m] Your current Node.JS version is: ${process.versions.node}`)
  process.exit(1)
}

require('emit-then').register()
if (process.env.NODE_ENV === 'dev') {
  require('longjohn')
}
// #endregion

// types

export interface FullServer extends Server { }
export interface FullPlayer extends Player { }
export interface FullEntity extends Entity { }
export interface ServerEventsMap extends ServerEvents { }
export interface PlayerEventsMap extends PlayerEvents { }
// export interface EntityEventsMap extends ServerEvents {}
export type InputOptions = Partial<Options> & Pick<Options, 'version'>

export function createMCServer (options: InputOptions): FullServer {
  const mcServer = new MCServer()
  mcServer.connect({
    // defaults
    "max-entities": 100,
    ...options
  })
  return mcServer as unknown as Server
}

export { supportedVersions }

class MCServer extends EventEmitter {
  pluginsReady = false
  private abortController = new AbortController()

  constructor() {
    super()
  }

  connect (options: Options) {
    if (globalThis.server) {
      // don't call quit so we don't disconnect players
      globalThis.server.cleanupFunctions.forEach(fn => fn())
    }

    const server = this as unknown as Server
    server.abortSignal = this.abortController.signal
    server.cleanupFunctions = [
      () => this.abortController.abort()
    ]
    const mcData = require('minecraft-data')(options.version)
    server.mcData = mcData
    if (mcData === null) throw new Error(`Version ${options.version} is not supported as it doesn't have the data.`)
    const version = mcData.version
    if (!supportedVersions.some(v => v.includes(version.majorVersion))) {
      console.warn(`Version ${version.minecraftVersion} is not supported.`)
    }
    server.supportFeature = feature => {
      if (feature === 'theFlattening') feature = 'blockStateId' as any
      if (feature === 'dimensionDataIsAvailable') return +options.version.split('.')[1] >= 16
      return mcData.supportFeature(feature)
    }
    server.commands = new Command({})
    // pass version, motd, port, max-players, online-mode
    const oldServer = options.oldServerData
    server._server = oldServer?._server ?? createServer(options)
    patchServerSocket(server._server['socketServer'], server)
    if (oldServer) {
      server.players = oldServer.players!
      for (const [key, value] of Object.entries(oldServer.oldData)) {
        server[key] = value
      }
    }

    const patchServer = (server) => {
      server.oldAddListener ??= server.on.bind(server)
      server.patchedAddListener = (name, ...args) => {
        server.oldAddListener(name, ...args)
        server.cleanupFunctions.push(() => server.removeListener(name, ...args))
      }
      server.on = server.patchedAddListener
      server.addListener = server.patchedAddListener
    }

    patchServer(server)

    const promises: Promise<any>[] = []
    const coreModules = ['utils', 'communication', 'tick', 'commands', 'settings']
    server.modules = builtinModules.builtinPlugins

    // Sort modules so core modules are first in specified order
    const sortedModules = {}
    // Add core modules first
    for (const moduleName of coreModules) {
      if (server.modules[moduleName]) {
        sortedModules[moduleName] = server.modules[moduleName]
        server.modules[moduleName].name = moduleName
      }
    }
    // Add remaining modules
    for (const [name, module] of Object.entries(server.modules)) {
      if (!coreModules.includes(name)) {
        sortedModules[name] = module
        server.modules[name].name = name
      }
    }
    server.modules = sortedModules

    for (const plugin of Object.values(server.modules)) {
      promises.push(plugin.server?.(server, options))
    }
    const requiredModules = [...coreModules, 'blocks', 'world', 'login', 'players']
    Promise.allSettled(promises).then((values) => {
      for (const rejected of values.map((value, index) => ({ value, index })).filter(value => value.value.status === 'rejected')) {
        const moduleName = Object.keys(server.modules)[rejected.index]
        if (requiredModules.includes(moduleName)) {
          const err = new Error(`Module ${moduleName} is required for the server to work. Error: ${(rejected.value as any).reason}`)
          err.stack = (rejected.value as any).reason.stack
          throw err
        }
        server._server.emit('error', (rejected.value as any).reason, moduleName)
      }
      // handle successful results of promises
      for (const value of values.filter(value => value.status === 'fulfilled')) {
        // todo remove when updated to typescript 5.5
        //@ts-ignore
        if (value.value) {
          //@ts-ignore
          server.cleanupFunctions.push(value.value)
        }
      }
      server.emit('pluginsReady')
      server.pluginsReady = true
    })

    if (options.logging === true) server.createLog()
    server._server.on('error', error => {
      server.emit('error', error)
    })
    server._server.on('listening', () => {
      server.emit('listening', (server._server as any).socketServer.address().port)
    })
    server.emit('asap')
  }
}

const patchServerSocket = (socket: any, server: Server) => {
  if (!socket) return
  const oldConnection = socket._events.connection as (clientSocket: any) => void

  socket._events.connection = (clientSocket) => {
    let buffer = Buffer.alloc(0)
    let handled = false

    // Listen for initial data to determine protocol
    clientSocket.once('data', (data) => {
      if (handled) return
      handled = true
      buffer = Buffer.concat([buffer, data])

      // Check if it's an HTTP request
      if (buffer.toString().match(/^(GET|POST|HEAD|OPTIONS)/)) {
        handleHttp(clientSocket, buffer)
      } else {
        // Pass to original Minecraft handler with initial data
        clientSocket.unshift(buffer)
        oldConnection(clientSocket)
      }
    })

    // Handle timeout and errors
    clientSocket.on('error', (error) => {
      if (!handled) {
        handled = true
        socket.emit('error', error)
      }
    })

    clientSocket.on('timeout', () => {
      clientSocket.end()
    })
  }

  function handleHttp (clientSocket, buffer) {
    // Create server info response
    const response = {
      version: {
        name: server.mcData.version.minecraftVersion,
        protocol: server.mcData.version.version
      },
      players: {
        online: server.players?.length || 0
      },
      // description: {
      //   text: server.motd || 'A Minecraft Server'
      // },
      // favicon: server.favicon || undefined
    }

    // Send HTTP response
    const httpResponse = [
      'HTTP/1.1 200 OK',
      'Content-Type: application/json; charset=utf-8',
      'Connection: close',
      'Access-Control-Allow-Origin: *',
      `Content-Length: ${Buffer.byteLength(JSON.stringify(response))}`,
      '',
      JSON.stringify(response)
    ].join('\r\n')

    clientSocket.end(httpResponse)
  }

  return socket
}

type Cleanup = () => void
type MaybePromise<T> = T | Promise<T>

declare global {
  interface Server {
    commands: Command
    pluginsReady: boolean
    _server: ProtocolServer
    supportFeature: IndexedData['supportFeature']
    abortSignal: AbortSignal
    cleanupFunctions: Cleanup[]
  }

  type ServerModule = (server: Server, options: Options) => MaybePromise<void | Cleanup>
}

export * as Behavior from './lib/behavior'
export * as Command from './lib/command'
export { default as generations } from './lib/generations'
export * as experience from './lib/experience'
export * as UserError from './lib/user_error'
export { default as portal_detector } from './lib/portal_detector'
