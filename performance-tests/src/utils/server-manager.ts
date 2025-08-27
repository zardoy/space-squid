import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { promises as fs } from 'fs'
import * as path from 'path'
import type { TestConfig, ServerManager as IServerManager } from '../types/index.js'
import { logger } from './logger.js'

export class FlyingSquidServerManager extends EventEmitter implements IServerManager {
  private serverProcess: ChildProcess | null = null
  private serverReady = false
  private config: TestConfig
  private serverPath: string
  private metricsCallback?: (metrics: any) => void
  private startupTimeout: NodeJS.Timeout | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null

  constructor(config: TestConfig, serverPath?: string) {
    super()
    this.config = config
    this.serverPath = serverPath || path.resolve(process.cwd(), '../..')
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.serverProcess) {
        reject(new Error('Server is already running'))
        return
      }

      logger.info('🚀 Starting Flying Squid server', {
        path: this.serverPath,
        port: this.config.serverPort,
        version: this.config.version
      })

      // Validate server path
      this.validateServerPath()
        .then(() => this.buildServer())
        .then(() => this.startServer())
        .then(() => this.waitForReady())
        .then(() => {
          this.serverReady = true
          this.startHealthCheck()
          this.emit('ready')
          resolve()
        })
        .catch(reject)
    })
  }

  private async validateServerPath(): Promise<void> {
    const packageJsonPath = path.join(this.serverPath, 'package.json')
    try {
      await fs.access(packageJsonPath)
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
      if (packageJson.name !== '@zardoy/flying-squid') {
        throw new Error('Invalid server path: package.json does not contain flying-squid')
      }
    } catch (error) {
      throw new Error(`Invalid server path: ${this.serverPath}`)
    }
  }

  private async buildServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('🔨 Building server...')
      
      const buildProcess = spawn('pnpm', ['build'], {
        cwd: this.serverPath,
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production' }
      })

      let buildOutput = ''
      buildProcess.stdout?.on('data', (data) => {
        buildOutput += data.toString()
      })

      buildProcess.stderr?.on('data', (data) => {
        buildOutput += data.toString()
      })

      buildProcess.on('close', (code) => {
        if (code === 0) {
          logger.info('✅ Server build completed successfully')
          resolve()
        } else {
          reject(new Error(`Build failed with code ${code}\nOutput: ${buildOutput}`))
        }
      })

      buildProcess.on('error', (error) => {
        reject(new Error(`Build error: ${error.message}`))
      })
    })
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        'start',
        '--port', this.config.serverPort.toString(),
        '--ver', this.config.version,
        '--world', this.config.worldType === 'flat' ? 'false' : 'default',
        '--offline',
        '--op'
      ]

      logger.info('🎮 Starting server process', { args })

      this.serverProcess = spawn('pnpm', args, {
        cwd: this.serverPath,
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production' }
      })

      let serverOutput = ''
      this.serverProcess.stdout?.on('data', (data) => {
        const output = data.toString()
        serverOutput += output
        logger.debug(`[Server] ${output.trim()}`)
      })

      this.serverProcess.stderr?.on('data', (data) => {
        const output = data.toString()
        logger.warn(`[Server Error] ${output.trim()}`)
      })

      this.serverProcess.on('close', (code) => {
        logger.info(`Server process closed with code ${code}`)
        this.serverReady = false
        this.emit('closed', code)
        this.cleanup()
      })

      this.serverProcess.on('error', (error) => {
        logger.error('Failed to start server', { error: error.message })
        reject(error)
      })

      // Set startup timeout
      this.startupTimeout = setTimeout(() => {
        if (!this.serverReady) {
          reject(new Error('Server startup timeout after 30 seconds'))
          this.cleanup()
        }
      }, 30000)

      resolve()
    })
  }

  private async waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.serverProcess) {
        reject(new Error('Server process not started'))
        return
      }

      const checkReady = (data: Buffer) => {
        const output = data.toString()
        if (output.includes('Server started') || 
            output.includes('Listening on port') || 
            output.includes('Server is ready')) {
          this.serverProcess?.stdout?.removeListener('data', checkReady)
          resolve()
        }
      }

      this.serverProcess.stdout?.on('data', checkReady)
    })
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      if (!this.serverProcess || this.serverProcess.killed) {
        this.serverReady = false
        this.emit('crashed')
        this.cleanup()
      }
    }, 5000)
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.serverProcess) {
        resolve()
        return
      }

      logger.info('🛑 Stopping server...')
      
      this.serverProcess.on('close', () => {
        this.serverProcess = null
        this.serverReady = false
        this.cleanup()
        resolve()
      })

      // Graceful shutdown
      this.serverProcess.kill('SIGTERM')
      
      // Force kill after 10 seconds
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          logger.warn('Force killing server process')
          this.serverProcess.kill('SIGKILL')
        }
      }, 10000)
    })
  }

  private cleanup(): void {
    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout)
      this.startupTimeout = null
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  isReady(): boolean {
    return this.serverReady
  }

  getMetrics(): any {
    // This would need to be implemented to get actual server metrics
    // For now, return basic process info
    if (!this.serverProcess) {
      return null
    }

    return {
      pid: this.serverProcess.pid,
      killed: this.serverProcess.killed,
      exitCode: this.serverProcess.exitCode,
      ready: this.serverReady
    }
  }

  onMetrics(callback: (metrics: any) => void): void {
    this.metricsCallback = callback
  }

  async waitForReady(): Promise<void> {
    if (this.serverReady) return
    
    return new Promise((resolve) => {
      this.once('ready', resolve)
    })
  }

  // Method to send commands to the server
  async sendCommand(command: string): Promise<string> {
    if (!this.serverProcess || !this.serverReady) {
      throw new Error('Server is not running')
    }

    // This is a simplified implementation
    // In a real scenario, you'd need to implement proper command execution
    logger.info(`Sending command to server: ${command}`)
    return 'Command sent'
  }

  // Method to get server logs
  getLogs(): string[] {
    // This would need to be implemented to capture server logs
    return []
  }
}