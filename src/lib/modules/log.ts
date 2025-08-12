import fs from 'fs'

import path from 'path'
import chalk from 'chalk'

const timeStarted = Math.floor(Date.now() / 1000).toString()

const isInNode = typeof process !== 'undefined' && !process.browser && process.platform !== 'browser' && !globalThis.__hot_reload

const _servers: Server[] = []

let readline: typeof import("readline")
let rl: import("readline").Interface
if (isInNode) {
  import(/* webpackIgnore: true */ 'exit-hook').then((hook) => {
    hook.default(() => {
      // todo fix, instead use double ctrl+c
      setTimeout(() => {
        console.log('Forcefully shutting down...')
        process.exit(0)
      }, 2000)
      for (const serv of _servers) {
        serv.log('Server shutting down...')
        serv.quit()
      }
    })
  })
  readline = require('readline')
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.setPrompt('> ')
  rl.prompt(true)
}

export const server = function (serv: Server, settings: Options) {
  _servers.push(serv)

  // Keep a rolling buffer of recent logs and errors for debug HTTP endpoints
  serv._logBuffer ??= []
  serv._errorBuffer ??= []
  const MAX_BUFFER_LINES = 1500

  serv.on('error', (error, pluginName) => {
    serv.err('Server: ' + error.stack + (pluginName ? ' (plugin: ' + pluginName + ')' : ''))
  })
  serv.on('clientError', (client, error) => {
    if (error.message.includes('ECONNABORTED') || error.message.includes('ECONNRESET')) return
    serv.err('Client ' + client.socket?.remoteAddress + ':' + client.socket.remotePort + ' : ' + error.stack)
  })
  serv.on('listening', port => serv.info('Server listening on port ' + port))
  serv.on('banned', (banner, bannedUsername, reason) =>
    serv.info(banner.username + ' banned ' + bannedUsername + (reason ? ' (' + reason + ')' : '')))
  serv.on('seed', (seed) => serv.info('World seed: ' + seed))

  const logFile = path.join('logs', timeStarted + '.log')

  serv.log = (message, isError = false) => {
    readline?.cursorTo(process.stdout, 0)
    let date = new Date()
    let formattedDate = `${date.toLocaleString('default', { month: 'long' })} ${date.getDate()} ${date.getFullYear()}, ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
    // Prefix timestamp first
    let fullMessage = formattedDate + ' ' + message // todo use intl
    // Allow user-defined formatting to modify the full line
    fullMessage = serv.formatMessage?.(fullMessage) ?? fullMessage
    if (!fullMessage) return

    // Push to buffers (plain text, with timestamp)
    const plain = fullMessage.replace(/\x1B\[[0-9;]*m/g, '')
    serv._logBuffer!.push(plain)
    if (serv._logBuffer!.length > MAX_BUFFER_LINES) serv._logBuffer!.shift()
    if (isError) {
      serv._errorBuffer!.push(plain)
      if (serv._errorBuffer!.length > MAX_BUFFER_LINES) serv._errorBuffer!.shift()
    }

    if (!settings.noConsoleOutput) console.log(fullMessage)
    if (!settings.logging) return
    fs.appendFile(logFile, plain + '\n', (err) => {
      if (err) console.log(err)
    })
  }

  serv.info = message => {
    const line = '[' + chalk.green('INFO') + ']: ' + message
    serv.log(line)
  }

  serv.err = message => {
    const line = '[' + chalk.red('ERROR') + ']: ' + message
    serv.log(line, true)
  }

  serv.warn = message => {
    const line = '[' + chalk.yellow('WARN') + ']: ' + message
    serv.log(line)
  }

  if (isInNode) {
    console.log = (function () {
      const orig = console.log
      return function () {
        readline.cursorTo(process.stdout, 0)
        // let tmp
        // try {
        //   tmp = process.stdout
        //   // @ts-ignore
        //   process.stdout = process.stderr
        //   orig.apply(console, arguments)
        // } finally {
        //   process.stdout = tmp
        // }
        orig.apply(console, arguments)
        rl.prompt(true)
      }
    })()
  }

  serv.createLog = () => {
    if (!settings.logging) return
    fs.mkdir('logs', {
      recursive: true
    }, (err) => {
      if (err) {
        console.log(err)
        return
      }

      fs.writeFile(logFile, '[INFO]: Started logging...\n',
        (err) => {
          if (err) console.log(err)
        })
    })
  }

  // todo fix hotreload
  rl?.on('line', (data) => {
    serv.handleCommand(data)
    rl.prompt(true)
  })
}

export const player = function (player: Player, serv: Server) {
  player.on('connected', () => serv.info(player.username + ' (' + player._client.socket?.remoteAddress + ') connected'))
  player.on('spawned', () => serv.info('Position written, spawning player...'))
  player.on('disconnected', (reason) => serv.info(player.username + ' disconnected. Reason: ' + reason))
  // player.on('chat', ({ message }) => serv.info('<' + player.username + '>' + ' ' + message))
  player.on('kicked', (kicker, reason) => serv.info(kicker.username + ' kicked ' + player.username + (reason ? ' (' + reason + ')' : '')))
}
declare global {
  interface Server {
    /** You can override this function so you can process the message before sending it to the console. */
    formatMessage (message: any): any
    /** Logs a `message` */
    "log": (message: any, isError?: boolean) => void
    /** Logs a `message` as info */
    "info": (message: any) => void
    /** Logs a `message` as error */
    "err": (message: any) => void
    /** Logs a `message` as warning */
    "warn": (message: any) => void
    /** Creates the log file */
    "createLog": () => void
  }
}
