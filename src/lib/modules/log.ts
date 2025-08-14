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

  // Initialize log streams
  let logStream: fs.WriteStream | null = null
  let logPath: string | null = null

  // Setup logging if enabled
  if (settings.logging) {
    try {
      // Determine log file path based on settings type
      if (typeof settings.logging === 'string') {
        const logPathStr = (settings.logging as string).trim()
        // If string provided, use as direct file path or directory
        if (logPathStr.toLowerCase().endsWith('.log')) {
          logPath = logPathStr
        } else {
          // Create logs in specified directory with timestamp
          logPath = path.join(logPathStr, `${timeStarted}.log`)
        }
      } else {
        // Default to logs directory in current path when boolean true
        logPath = path.join('logs', `${timeStarted}.log`)
      }

      if (logPath) {
        // Ensure directory exists
        fs.mkdirSync(path.dirname(logPath), { recursive: true })

        // Create write stream
        logStream = fs.createWriteStream(logPath, {
          flags: 'a', // Append mode
          encoding: 'utf8',
          autoClose: true
        })

        // Write initial log entry
        logStream.write(`[INFO]: Started logging to ${logPath} at ${new Date().toISOString()}\n`)

        // Handle stream errors
        logStream.on('error', (err) => {
          console.error('Error writing to log file:', err)
          // Disable logging on error
          // logStream = null
        })

        serv.cleanupFunctions.push(() => {
          if (logStream) {
            logStream.end('\n[INFO]: Logging ended\n')
            logStream.close()
          }
        })
      }
    } catch (err) {
      console.error('Failed to initialize logging:', err)
      logStream = null
    }
  }

  serv.on('error', (error, { type, pluginName, name } = {}) => {
    let msg = 'Server'
    if (type === 'fromPlayerPacket') msg = `Player packet ${name ?? ''}`
    if (type === 'toPlayerPacket') msg = `Server packet ${name ?? ''}`
    serv.err(msg + ': ' + error.stack + (pluginName ? ' (plugin: ' + pluginName + ')' : ''))
  })
  serv.on('clientError', (client, error) => {
    if (error.message.includes('ECONNABORTED') || error.message.includes('ECONNRESET')) return
    serv.err('Client ' + client.socket?.remoteAddress + ':' + client.socket.remotePort + ' : ' + error.stack)
  })
  serv.on('listening', port => serv.info('Server listening on port ' + port))
  serv.on('banned', (banner, bannedUsername, reason) =>
    serv.info(banner.username + ' banned ' + bannedUsername + (reason ? ' (' + reason + ')' : '')))
  serv.on('seed', (seed) => serv.info('World seed: ' + seed))

  serv.log = (message, isError = false) => {
    readline?.cursorTo(process.stdout, 0)
    let date = new Date()
    let formattedDate = `${date.toLocaleString('default', { month: 'long' })} ${date.getDate()} ${date.getFullYear()}, ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
    // Prefix timestamp first
    let fullMessage = formattedDate + ' ' + message
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

    // Write to log file if stream is available
    if (logStream?.writable) {
      logStream.write(plain + '\n')
    }
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

  // Return current log file path
  serv.getLogPath = () => logPath

  // // Allow changing log file at runtime
  // serv.setLogFile = (newPath: string) => {
  //   try {
  //     // Close existing stream
  //     if (logStream) {
  //       logStream.end('\n[INFO]: Switching log file\n')
  //       logStream.close()
  //     }

  //     // Setup new stream
  //     fs.mkdirSync(path.dirname(newPath), { recursive: true })
  //     logStream = fs.createWriteStream(newPath, {
  //       flags: 'a',
  //       encoding: 'utf8',
  //       autoClose: true
  //     })
  //     logPath = newPath

  //     logStream.write(`[INFO]: Continued logging from ${new Date().toISOString()}\n`)
  //     return true
  //   } catch (err) {
  //     console.error('Failed to change log file:', err)
  //     return false
  //   }
  // }

  // Handle command input
  rl?.on('line', (data) => {
    serv.handleCommand(data)
    rl.prompt(true)
  })
}

export const player = function (player: Player, serv: Server) {
  player.on('connected', () => serv.info(player.getDisplayName('log') + ' (' + player._client.socket?.remoteAddress + ') connected'))
  player.on('spawned', () => serv.info('Position written, spawning player...'))
  player.on('disconnected', (reason) => serv.info(player.getDisplayName('log') + ' disconnected. Reason: ' + reason))
  player.on('kicked', (kicker, reason) => serv.info(kicker.getDisplayName('log') + ' kicked ' + player.getDisplayName('log') + (reason ? ' (' + reason + ')' : '')))
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
    /** Get current log file path */
    "getLogPath": () => string | null
    /** Change log file at runtime */
    // "setLogFile": (path: string) => boolean
  }
}
