#!/usr/bin/env node

const yargs = require('yargs/yargs')(process.argv.slice(2))

const argv = yargs
  .usage('Usage: $0 <command> [options]')
  .help('h')
  .option('config', {
    alias: 'c',
    type: 'string',
    default: './config',
    description: 'Configuration directory'
  })
  .option('offline', {
    type: 'boolean',
    default: 'false'
  })
  .option('log', {
    description: 'Enable logging: When true create log file in logs folder',
    type: 'boolean',
    default: 'true'
  })
  .option('op', {
    description: 'Useful for testing. When true gives everybody op (administrative permissions)',
    type: 'boolean',
    default: 'false'
  })
  .option('port', {
    description: 'Port to run the server on',
    type: 'number',
    default: '25565'
  })
  .option('ver', {
    description: 'The version of the server to run (for clients and world)',
    type: 'string',
  })
  .option('world', {
    description: 'Path to Java world save folder',
    type: 'string',
  })
  .argv

const defaultSettings = require('../config/default-settings.json')
const mcServer = require('./index')

/** @type {Options} */
let settings

try {
  settings = require(`${argv.config}/settings.json`)
} catch (err) {
  settings = {}
}

settings = Object.assign(settings, defaultSettings, settings)
if (argv.offline) settings['online-mode'] = false
if (argv.log) settings.logging = true
if (argv.op) settings['everybody-op'] = true
if (argv.port) settings.port = +argv.port
if (argv.ver) settings.version = argv.ver
if (argv.world) settings.worldFolder = argv.world === 'false' ? false : argv.world

if (!require('./lib/version').supportedVersions.includes(settings.version)) {
  // throw new Error(`Version ${settings.version} is not supported.`)
  console.warn(`Version ${settings.version} is not supported.`)
}

if (globalThis.server) {
  globalThis.__hot_reload = true
  settings.oldServerData = globalThis.server
}

const server = mcServer.createMCServer(settings)

globalThis.server = {
  _server: server._server,
  cleanupFunctions: server.cleanupFunctions,
  players: server.players,
  oldData: {}
}
module.exports = server

const saveData = ['time']
server.on('tick', () => {
  for (const data of saveData) {
    globalThis.server.oldData[data] = server[data]
  }
})

process.on('unhandledRejection', err => {
  console.log(err.stack)
})
