import { createServer } from 'minecraft-protocol'

import { supportedVersions } from './lib/version'
import Command from './lib/command'
import * as modules from './lib/modules'
import { EventEmitter } from 'events'
import { Server as ProtocolServer } from 'minecraft-protocol'
import { IndexedData } from 'minecraft-data'
import './types' // include Server declarations from all modules
import './modules'

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
  constructor() {
    modules.initPlugins()
    super()
  }

  connect (options: Options) {
    const server = this as unknown as Server
    const mcData = require('minecraft-data')(options.version)
    server.mcData = mcData
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
    server._server = createServer(options)

    const promises: Promise<any>[] = []
    for (const plugin of modules.builtinPlugins) {
      promises.push(plugin.server?.(server, options))
    }
    Promise.allSettled(promises).then((values) => {
      for (const rejected of values.filter(value => value.status === 'rejected')) {
        server._server.emit('error', (rejected as any).reason)
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

declare global {
  interface Server {
    commands: Command
    pluginsReady: boolean
    _server: ProtocolServer
    supportFeature: IndexedData['supportFeature']
  }
}

export * as Behavior from './lib/behavior'
export * as Command from './lib/command'
export { default as generations } from './lib/generations'
export * as experience from './lib/experience'
export * as UserError from './lib/user_error'
export { default as portal_detector } from './lib/portal_detector'
