import type { Bot } from 'mineflayer'
import type { Vec3 } from 'vec3'

// Core test configuration
export interface TestConfig {
  name: string
  description: string
  playerCount: number
  duration: number // seconds
  worldType: 'flat' | 'default' | 'superflat'
  serverPort: number
  serverHost: string
  version: string
  modules?: Record<string, boolean>
  worldSeed?: string
  maxViewDistance?: number
  spawnProtection?: boolean
}

// Performance metrics
export interface PerformanceMetrics {
  timestamp: number
  tps: number
  memoryUsage: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
    arrayBuffers: number
  }
  cpuUsage: {
    user: number
    system: number
    total: number
  }
  playerCount: number
  entityCount: number
  chunkCount: number
  loadedChunks: number
  networkStats: {
    bytesIn: number
    bytesOut: number
    packetsIn: number
    packetsOut: number
  }
  latency: {
    average: number
    min: number
    max: number
    p95: number
    p99: number
  }
}

// Test results
export interface TestResult {
  id: string
  scenario: string
  config: TestConfig
  startTime: number
  endTime: number
  duration: number
  metrics: PerformanceMetrics[]
  summary: TestSummary
  errors: TestError[]
  warnings: string[]
}

export interface TestSummary {
  averageTPS: number
  minTPS: number
  maxTPS: number
  tpsStability: number // standard deviation
  averageMemory: number
  peakMemory: number
  memoryGrowth: number
  averageLatency: number
  maxLatency: number
  latencyStability: number
  success: boolean
  performanceScore: number // 0-100
}

export interface TestError {
  timestamp: number
  type: 'connection' | 'timeout' | 'crash' | 'validation' | 'performance'
  message: string
  details?: unknown
}

// Test scenarios
export interface TestScenario {
  readonly name: string
  readonly description: string
  readonly config: TestConfig
  run(): Promise<TestResult>
  validate(): boolean
  cleanup(): Promise<void>
}

// Client behavior patterns
export interface ClientBehavior {
  onSpawn(bot: Bot): Promise<void>
  onTick(bot: Bot): Promise<void>
  onDisconnect(bot: Bot): Promise<void>
  getMetrics(bot: Bot): Partial<PerformanceMetrics>
}

export interface MovementPattern {
  type: 'random' | 'circular' | 'linear' | 'zigzag' | 'custom'
  params: Record<string, unknown>
  generatePosition(bot: Bot, tick: number): Vec3
}

export interface BuildingPattern {
  type: 'tower' | 'house' | 'wall' | 'random' | 'custom'
  params: Record<string, unknown>
  execute(bot: Bot): Promise<void>
}

// Server management
export interface ServerManager {
  start(): Promise<void>
  stop(): Promise<void>
  isReady(): boolean
  getMetrics(): PerformanceMetrics
  onMetrics(callback: (metrics: PerformanceMetrics) => void): void
  waitForReady(): Promise<void>
}

// Test runner
export interface TestRunner {
  run(scenario: TestScenario): Promise<TestResult>
  runAll(scenarios: TestScenario[]): Promise<TestResult[]>
  runSuite(suite: TestSuite): Promise<TestSuiteResult>
  stop(): Promise<void>
}

export interface TestSuite {
  name: string
  description: string
  scenarios: TestScenario[]
  config: SuiteConfig
}

export interface SuiteConfig {
  parallel: boolean
  maxConcurrent: number
  stopOnFailure: boolean
  retryFailed: boolean
  maxRetries: number
}

export interface TestSuiteResult {
  suite: TestSuite
  results: TestResult[]
  summary: SuiteSummary
  duration: number
}

export interface SuiteSummary {
  totalTests: number
  passedTests: number
      failedTests: number
  averagePerformanceScore: number
  bestPerformer: string
  worstPerformer: string
}

// Reporting
export interface ReportGenerator {
  generateReport(results: TestResult[]): Promise<void>
  generateSuiteReport(suiteResult: TestSuiteResult): Promise<void>
  exportMetrics(results: TestResult[], format: 'json' | 'csv' | 'html'): Promise<string>
}

// Configuration management
export interface ConfigManager {
  loadConfig(path: string): TestConfig
  validateConfig(config: TestConfig): boolean
  mergeConfigs(base: TestConfig, overrides: Partial<TestConfig>): TestConfig
  getDefaultConfig(): TestConfig
}

// Logging
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
  debug(message: string, meta?: Record<string, unknown>): void
  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void
}