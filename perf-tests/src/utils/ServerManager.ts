import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { TestConfig } from '../types/TestTypes'
import * as path from 'path'

export class ServerManager extends EventEmitter {
  private serverProcess: ChildProcess | null = null
  private serverReady = false
  private config: TestConfig
  private serverPath: string

  constructor(config: TestConfig, serverPath?: string) {
    super()
    this.config = config
    this.serverPath = serverPath || path.resolve(__dirname, '../../../..')
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('Starting Flying Squid server...')
      
      // Build the server first
      const buildProcess = spawn('pnpm', ['build'], {
        cwd: this.serverPath,
        stdio: 'pipe'
      })

      buildProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Build failed with code ${code}`))
          return
        }

        // Start the server
        const args = [
          'start',
          '--port', this.config.serverPort.toString(),
          '--ver', this.config.version,
          '--world', this.config.worldType === 'flat' ? 'false' : 'default'
        ]

        this.serverProcess = spawn('pnpm', args, {
          cwd: this.serverPath,
          stdio: 'pipe'
        })

        this.serverProcess.stdout?.on('data', (data) => {
          const output = data.toString()
          console.log(`[Server] ${output}`)
          
          // Check if server is ready
          if (output.includes('Server started') || output.includes('Listening on port')) {
            this.serverReady = true
            this.emit('ready')
            resolve()
          }
        })

        this.serverProcess.stderr?.on('data', (data) => {
          const output = data.toString()
          console.error(`[Server Error] ${output}`)
        })

        this.serverProcess.on('close', (code) => {
          console.log(`Server process closed with code ${code}`)
          this.serverReady = false
          this.emit('closed', code)
        })

        this.serverProcess.on('error', (error) => {
          console.error('Failed to start server:', error)
          reject(error)
        })

        // Timeout after 30 seconds
        setTimeout(() => {
          if (!this.serverReady) {
            reject(new Error('Server startup timeout'))
          }
        }, 30000)
      })

      buildProcess.on('error', (error) => {
        reject(new Error(`Build error: ${error.message}`))
      })
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.serverProcess) {
        resolve()
        return
      }

      console.log('Stopping server...')
      
      this.serverProcess.on('close', () => {
        this.serverProcess = null
        this.serverReady = false
        resolve()
      })

      this.serverProcess.kill('SIGTERM')
      
      // Force kill after 10 seconds
      setTimeout(() => {
        if (this.serverProcess) {
          this.serverProcess.kill('SIGKILL')
        }
      }, 10000)
    })
  }

  isReady(): boolean {
    return this.serverReady
  }

  getConfig(): TestConfig {
    return this.config
  }

  async waitForReady(): Promise<void> {
    if (this.serverReady) return
    
    return new Promise((resolve) => {
      this.once('ready', resolve)
    })
  }
}