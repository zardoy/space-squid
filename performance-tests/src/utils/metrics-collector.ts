import { performance } from 'perf_hooks'
import { EventEmitter } from 'events'
import type { PerformanceMetrics, TestConfig } from '../types/index.js'
import { logger } from './logger.js'

export class MetricsCollector extends EventEmitter {
  private metrics: PerformanceMetrics[] = []
  private collectionInterval: NodeJS.Timeout | null = null
  private startTime: number = 0
  private lastCpuUsage: NodeJS.CpuUsage = { user: 0, system: 0 }
  private lastMemoryUsage: NodeJS.MemoryUsage = {
    rss: 0,
    heapTotal: 0,
    heapUsed: 0,
    external: 0,
    arrayBuffers: 0
  }
  private config: TestConfig
  private isCollecting = false

  constructor(config: TestConfig) {
    super()
    this.config = config
    this.lastCpuUsage = process.cpuUsage()
    this.lastMemoryUsage = process.memoryUsage()
  }

  start(): void {
    if (this.isCollecting) return

    this.isCollecting = true
    this.startTime = performance.now()
    this.lastCpuUsage = process.cpuUsage()
    this.lastMemoryUsage = process.memoryUsage()

    logger.info('Starting metrics collection', { 
      interval: 1000, 
      config: this.config.name 
    })

    // Collect metrics every second
    this.collectionInterval = setInterval(() => {
      this.collectMetrics()
    }, 1000)

    this.emit('started')
  }

  stop(): void {
    if (!this.isCollecting) return

    this.isCollecting = false
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval)
      this.collectionInterval = null
    }

    logger.info('Stopped metrics collection', { 
      totalMetrics: this.metrics.length,
      duration: performance.now() - this.startTime 
    })

    this.emit('stopped')
  }

  private collectMetrics(): void {
    try {
      const timestamp = Date.now()
      const currentCpuUsage = process.cpuUsage()
      const currentMemoryUsage = process.memoryUsage()

      // Calculate CPU usage delta
      const cpuDelta = {
        user: currentCpuUsage.user - this.lastCpuUsage.user,
        system: currentCpuUsage.system - this.lastCpuUsage.system
      }
      const totalCpuDelta = cpuDelta.user + cpuDelta.system

      // Calculate memory usage
      const memoryUsage = {
        rss: currentMemoryUsage.rss,
        heapUsed: currentMemoryUsage.heapUsed,
        heapTotal: currentMemoryUsage.heapTotal,
        external: currentMemoryUsage.external,
        arrayBuffers: currentMemoryUsage.arrayBuffers
      }

      // Estimate TPS (this would need to be provided by the server)
      const tps = this.estimateTPS()

      const metrics: PerformanceMetrics = {
        timestamp,
        tps,
        memoryUsage,
        cpuUsage: {
          user: cpuDelta.user,
          system: cpuDelta.system,
          total: totalCpuDelta
        },
        playerCount: this.config.playerCount, // This should be dynamic
        entityCount: 0, // This should be provided by the server
        chunkCount: 0, // This should be provided by the server
        loadedChunks: 0, // This should be provided by the server
        networkStats: {
          bytesIn: 0, // This should be provided by the server
          bytesOut: 0, // This should be provided by the server
          packetsIn: 0, // This should be provided by the server
          packetsOut: 0 // This should be provided by the server
        },
        latency: {
          average: 0, // This should be calculated from client data
          min: 0,
          max: 0,
          p95: 0,
          p99: 0
        }
      }

      this.metrics.push(metrics)
      this.lastCpuUsage = currentCpuUsage
      this.lastMemoryUsage = currentMemoryUsage

      this.emit('metrics', metrics)
      logger.debug('Collected metrics', { timestamp, tps, memoryRSS: memoryUsage.rss })

    } catch (error) {
      logger.error('Error collecting metrics', { error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }

  private estimateTPS(): number {
    // This is a placeholder - in a real implementation, the server would provide TPS
    // For now, we'll return a simulated value based on performance
    const memoryPressure = this.lastMemoryUsage.heapUsed / this.lastMemoryUsage.heapTotal
    const baseTPS = 20
    const memoryPenalty = memoryPressure > 0.8 ? 0.5 : 1.0
    
    return Math.max(1, Math.floor(baseTPS * memoryPenalty))
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics]
  }

  getLatestMetrics(): PerformanceMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null
  }

  getMetricsSummary(): {
    averageTPS: number
    minTPS: number
    maxTPS: number
    averageMemory: number
    peakMemory: number
    memoryGrowth: number
  } {
    if (this.metrics.length === 0) {
      return {
        averageTPS: 0,
        minTPS: 0,
        maxTPS: 0,
        averageMemory: 0,
        peakMemory: 0,
        memoryGrowth: 0
      }
    }

    const tpsValues = this.metrics.map(m => m.tps)
    const memoryValues = this.metrics.map(m => m.memoryUsage.heapUsed)

    const averageTPS = tpsValues.reduce((a, b) => a + b, 0) / tpsValues.length
    const minTPS = Math.min(...tpsValues)
    const maxTPS = Math.max(...tpsValues)
    const averageMemory = memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length
    const peakMemory = Math.max(...memoryValues)
    const memoryGrowth = memoryValues[memoryValues.length - 1] - memoryValues[0]

    return {
      averageTPS,
      minTPS,
      maxTPS,
      averageMemory,
      peakMemory,
      memoryGrowth
    }
  }

  clear(): void {
    this.metrics = []
    this.emit('cleared')
  }

  exportToJSON(): string {
    return JSON.stringify({
      config: this.config,
      metrics: this.metrics,
      summary: this.getMetricsSummary(),
      collectionInfo: {
        startTime: this.startTime,
        endTime: performance.now(),
        totalMetrics: this.metrics.length
      }
    }, null, 2)
  }

  // Method to update server-provided metrics
  updateServerMetrics(serverMetrics: Partial<PerformanceMetrics>): void {
    if (this.metrics.length === 0) return

    const latest = this.metrics[this.metrics.length - 1]
    Object.assign(latest, serverMetrics)
    
    logger.debug('Updated server metrics', serverMetrics)
  }

  // Method to add client latency data
  addClientLatency(clientId: string, latency: number): void {
    if (this.metrics.length === 0) return

    const latest = this.metrics[this.metrics.length - 1]
    
    // Update latency statistics
    if (latest.latency.average === 0) {
      latest.latency.average = latency
      latest.latency.min = latency
      latest.latency.max = latency
    } else {
      latest.latency.average = (latest.latency.average + latency) / 2
      latest.latency.min = Math.min(latest.latency.min, latency)
      latest.latency.max = Math.max(latest.latency.max, latency)
    }
  }
}