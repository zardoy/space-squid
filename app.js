#!/usr/bin/env node

const crypto = require('crypto')
const promisify = require('util').promisify

crypto.createPublicKey = () => {}

const fs = require('fs');
fs.promises.open = async (...args) => {
  const fd = await promisify(fs.open)(...args)
  return {
    ...Object.fromEntries(['read', 'write', 'close'].map(x => [x, async (...args) => {
      return await new Promise(resolve => {
        if (x === 'write') {
          return resolve({ buffer: Buffer.from([]), bytesRead: 0 })
        }

        fs[x](fd, ...args, (err, bytesRead, buffer) => {
          if (err) throw err
          // todo if readonly probably there is no need to open at all (return some mocked version - check reload)?
          if (x === 'write') {
            // flush data, though alternatively we can rely on close in unload
            fs.fsync(fd, () => { })
          }
          resolve({ buffer, bytesRead })
        })
      })
    }])),
    // for debugging
    fd,
    filename: args[0],
    close: () => {
      return new Promise(resolve => {
        fs.close(fd, (err) => {
          if (err) {
            throw err
          } else {
            resolve()
          }
        })
      })
    }
  }
}

const argv = require('yargs')(process.argv.slice(2))
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
  .argv

const mcServer = require('./')

const defaultSettings = require('./config/default-settings.json')

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

module.exports = mcServer.createMCServer(settings)

process.on('unhandledRejection', err => {
  console.log(err.stack)
})
