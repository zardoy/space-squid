import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { v4 as uuidv4 } from 'uuid'
import type { TestConfig, TestScenario, TestResult, PerformanceMetrics, ClientBehavior, MovementPattern } from '../types/index.js'
import { FlyingSquidServerManager } from '../utils/server-manager.js'
import { MetricsCollector } from '../utils/metrics-collector.js'
import { logger } from '../utils/logger.js'

// Movement pattern implementations
class RandomMovementPattern implements MovementPattern {
  type = 'random' as const
  params = { radius: 50, heightVariation: 10 }

  generatePosition(bot: Bot, tick: number): Vec3 {
    const basePos = bot.entity.position
    const radius = this.params.radius as number
    const heightVar = this.params.heightVariation as number
    
    const angle = (tick * 0.1) % (2 * Math.PI)
    const distance = Math.random() * radius
    const height = basePos.y + (Math.random() - 0.5) * heightVar
    
    return new Vec3(
      basePos.x + Math.cos(angle) * distance,
      Math.max(0, height),
      basePos.z + Math.sin(angle) * distance
    )
  }
}

class CircularMovementPattern implements MovementPattern {
  type = 'circular' as const
  params = { radius: 30, speed: 0.05 }

  generatePosition(bot: Bot, tick: number): Vec3 {
    const basePos = bot.entity.position
    const radius = this.params.radius as number
    const speed = this.params.speed as number
    
    const angle = (tick * speed) % (2 * Math.PI)
    
    return new Vec3(
      basePos.x + Math.cos(angle) * radius,
      basePos.y,
      basePos.z + Math.sin(angle) * radius
    )
  }
}

class LinearMovementPattern implements MovementPattern {
  type = 'linear' as const
  params = { distance: 100, direction: new Vec3(1, 0, 1) }

  generatePosition(bot: Bot, tick: number): Vec3 {
    const basePos = bot.entity.position
    const distance = this.params.distance as number
    const direction = this.params.direction as Vec3
    
    const progress = (tick % 200) / 200 // 0 to 1 over 200 ticks
    const currentDistance = progress * distance
    
    return basePos.plus(direction.normalize().scaled(currentDistance))
  }
}

// Client behavior implementation
class MovementClientBehavior implements ClientBehavior {
  private pattern: MovementPattern
  private tickCount = 0
  private lastMoveTime = 0
  private moveInterval = 20 // Move every 20 ticks (1 second)

  constructor(pattern: MovementPattern) {
    this.pattern = pattern
  }

  async onSpawn(bot: Bot): Promise<void> {
    logger.debug(`Bot ${bot.username} spawned at ${bot.entity.position}`)
    
    // Set initial position if it's a flat world
    if (bot.game.dimension === 'overworld') {
      await bot.waitForChunksToLoad()
      const spawnPos = new Vec3(0, 64, 0)
      await bot.entity.position.set(spawnPos)
    }
  }

  async onTick(bot: Bot): Promise<void> {
    this.tickCount++
    
    // Move every moveInterval ticks
    if (this.tickCount % this.moveInterval === 0) {
      try {
        const targetPos = this.pattern.generatePosition(bot, this.tickCount)
        
        // Check if position is valid
        if (this.isValidPosition(targetPos)) {
          await this.moveToPosition(bot, targetPos)
        }
      } catch (error) {
        logger.debug(`Movement error for ${bot.username}: ${error}`)
      }
    }
  }

  async onDisconnect(bot: Bot): Promise<void> {
    logger.debug(`Bot ${bot.username} disconnected`)
  }

  getMetrics(bot: Bot): Partial<PerformanceMetrics> {
    return {
      playerCount: 1,
      latency: {
        average: bot.client.latency || 0,
        min: bot.client.latency || 0,
        max: bot.client.latency || 0,
        p95: bot.client.latency || 0,
        p99: bot.client.latency || 0
      }
    }
  }

  private isValidPosition(pos: Vec3): boolean {
    return pos.x >= -29999999 && pos.x <= 29999999 &&
           pos.y >= 0 && pos.y <= 4096 &&
           pos.z >= -29999999 && pos.z <= 29999999
  }

  private async moveToPosition(bot: Bot, targetPos: Vec3): Promise<void> {
    try {
      // Use pathfinding if available, otherwise direct movement
      if (bot.pathfinder) {
        await bot.pathfinder.goto(new (bot.pathfinder as any).goals.GoalBlock(
          Math.floor(targetPos.x),
          Math.floor(targetPos.y),
          Math.floor(targetPos.z)
        ))
      } else {
        // Simple movement without pathfinding
        const currentPos = bot.entity.position
        const direction = targetPos.minus(currentPos).normalize()
        const speed = 0.2
        
        await bot.entity.position.set(
          currentPos.plus(direction.scaled(speed))
        )
      }
    } catch (error) {
      logger.debug(`Movement failed for ${bot.username}: ${error}`)
    }
  }
}

// Main movement test scenario
export class MovementTestScenario implements TestScenario {
  public readonly name: string
  public readonly description: string
  public readonly config: TestConfig
  private serverManager: FlyingSquidServerManager
  private metricsCollector: MetricsCollector
  private bots: Bot[] = []
  private patterns: MovementPattern[] = []

  constructor(config: TestConfig) {
    this.name = config.name
    this.description = config.description
    this.config = config
    this.serverManager = new FlyingSquidServerManager(config)
    this.metricsCollector = new MetricsCollector(config)
    
    // Initialize movement patterns
    this.patterns = [
      new RandomMovementPattern(),
      new CircularMovementPattern(),
      new LinearMovementPattern()
    ]
  }

  validate(): boolean {
    if (this.config.playerCount < 1 || this.config.playerCount > 100) {
      logger.error('Invalid player count', { playerCount: this.config.playerCount })
      return false
    }
    
    if (this.config.duration < 10 || this.config.duration > 3600) {
      logger.error('Invalid test duration', { duration: this.config.duration })
      return false
    }
    
    return true
  }

  async run(): Promise<TestResult> {
    if (!this.validate()) {
      throw new Error('Invalid test configuration')
    }

    const startTime = Date.now()
    const testId = uuidv4()
    
    logger.logTestStart(this.name, this.config)
    
    try {
      // Start server
      await this.serverManager.start()
      await this.serverManager.waitForReady()
      
      // Start metrics collection
      this.metricsCollector.start()
      
      // Spawn bots
      await this.spawnBots()
      
      // Run test for specified duration
      await this.runTest()
      
      // Collect final metrics
      const finalMetrics = this.metricsCollector.getMetrics()
      
      // Stop everything
      await this.cleanup()
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Generate test result
      const result: TestResult = {
        id: testId,
        scenario: this.name,
        config: this.config,
        startTime,
        endTime,
        duration,
        metrics: finalMetrics,
        summary: this.generateSummary(finalMetrics),
        errors: [],
        warnings: []
      }
      
      logger.logTestComplete(this.name, duration, true)
      return result
      
    } catch (error) {
      logger.logError(error as Error, { testName: this.name })
      await this.cleanup()
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      return {
        id: testId,
        scenario: this.name,
        config: this.config,
        startTime,
        endTime,
        duration,
        metrics: this.metricsCollector.getMetrics(),
        summary: this.generateSummary([]),
        errors: [{
          timestamp: Date.now(),
          type: 'performance',
          message: error instanceof Error ? error.message : 'Unknown error'
        }],
        warnings: []
      }
    }
  }

  private async spawnBots(): Promise<void> {
    logger.info(`Spawning ${this.config.playerCount} bots...`)
    
    const spawnPromises = Array.from({ length: this.config.playerCount }, async (_, index) => {
      const username = `perf_bot_${index + 1}`
      const pattern = this.patterns[index % this.patterns.length]
      const behavior = new MovementClientBehavior(pattern)
      
      try {
        const bot = new Bot({
          host: this.config.serverHost,
          port: this.config.serverPort,
          username,
          version: this.config.version,
          auth: 'offline'
        })
        
        // Set up bot event handlers
        bot.on('spawn', () => behavior.onSpawn(bot))
        bot.on('tick', () => behavior.onTick(bot))
        bot.on('end', () => behavior.onDisconnect(bot))
        
        // Wait for bot to spawn
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Bot spawn timeout')), 30000)
          
          bot.once('spawn', () => {
            clearTimeout(timeout)
            resolve()
          })
          
          bot.once('error', (error) => {
            clearTimeout(timeout)
            reject(error)
          })
        })
        
        this.bots.push(bot)
        logger.debug(`Bot ${username} spawned successfully`)
        
      } catch (error) {
        logger.error(`Failed to spawn bot ${username}`, { error: error instanceof Error ? error.message : 'Unknown error' })
        throw error
      }
    })
    
    await Promise.all(spawnPromises)
    logger.info(`Successfully spawned ${this.bots.length} bots`)
  }

  private async runTest(): Promise<void> {
    logger.info(`Running movement test for ${this.config.duration} seconds...`)
    
    return new Promise((resolve) => {
      const testTimeout = setTimeout(() => {
        logger.info('Test duration completed')
        resolve()
      }, this.config.duration * 1000)
      
      // Set up metrics collection from bots
      const metricsInterval = setInterval(() => {
        this.bots.forEach((bot, index) => {
          try {
            const botMetrics = new MovementClientBehavior(this.patterns[index % this.patterns.length])
              .getMetrics(bot)
            
            if (botMetrics.latency) {
              this.metricsCollector.addClientLatency(
                bot.username,
                botMetrics.latency.average
              )
            }
          } catch (error) {
            logger.debug(`Error collecting bot metrics: ${error}`)
          }
        })
      }, 1000)
      
      // Clean up interval when test completes
      testTimeout.unref()
      metricsInterval.unref()
    })
  }

  private generateSummary(metrics: PerformanceMetrics[]): any {
    if (metrics.length === 0) {
      return {
        averageTPS: 0,
        minTPS: 0,
        maxTPS: 0,
        averageMemory: 0,
        peakMemory: 0,
        averageLatency: 0,
        maxLatency: 0,
        success: true,
        performanceScore: 0
      }
    }
    
    const summary = this.metricsCollector.getMetricsSummary()
    
    // Calculate performance score (0-100)
    const tpsScore = Math.min(100, (summary.averageTPS / 20) * 100)
    const memoryScore = Math.max(0, 100 - (summary.memoryGrowth / 1024 / 1024) * 10)
    const latencyScore = Math.max(0, 100 - (summary.averageLatency / 100) * 10)
    
    const performanceScore = Math.round((tpsScore + memoryScore + latencyScore) / 3)
    
    return {
      ...summary,
      success: true,
      performanceScore
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up movement test...')
    
    // Stop metrics collection
    this.metricsCollector.stop()
    
    // Disconnect all bots
    for (const bot of this.bots) {
      try {
        bot.quit()
      } catch (error) {
        logger.debug(`Error disconnecting bot ${bot.username}: ${error}`)
      }
    }
    this.bots = []
    
    // Stop server
    await this.serverManager.stop()
    
    logger.info('Movement test cleanup completed')
  }
}

// Factory function to create movement test scenarios
export function createMovementTest(
  playerCount: number,
  duration: number,
  worldType: 'flat' | 'default' | 'superflat' = 'flat'
): MovementTestScenario {
  const config: TestConfig = {
    name: `Movement Test - ${playerCount} players`,
    description: `Tests movement performance with ${playerCount} players on ${worldType} world`,
    playerCount,
    duration,
    worldType,
    serverPort: 25566, // Use different port to avoid conflicts
    serverHost: 'localhost',
    version: '1.20.1'
  }
  
  return new MovementTestScenario(config)
}