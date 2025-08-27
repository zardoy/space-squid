export interface TestConfig {
  playerCount: number
  duration: number // seconds
  worldType: 'flat' | 'default' | 'superflat'
  serverPort: number
  serverHost: string
  version: string
  modules?: {
    [moduleName: string]: boolean
  }
}

export interface PerformanceMetrics {
  timestamp: number
  tps: number
  memoryUsage: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
  }
  cpuUsage: number
  playerCount: number
  entityCount: number
  chunkCount: number
  averageLatency: number
  maxLatency: number
  minLatency: number
}

export interface TestResult {
  scenario: string
  config: TestConfig
  startTime: number
  endTime: number
  duration: number
  metrics: PerformanceMetrics[]
  summary: {
    averageTPS: number
    minTPS: number
    maxTPS: number
    averageMemory: number
    peakMemory: number
    averageLatency: number
    maxLatency: number
    success: boolean
    errors: string[]
  }
}

export interface TestScenario {
  name: string
  description: string
  config: TestConfig
  run(): Promise<TestResult>
  validate(): boolean
}

export interface PerformanceTestRunner {
  run(scenario: TestScenario): Promise<TestResult>
  runAll(scenarios: TestScenario[]): Promise<TestResult[]>
  generateReport(results: TestResult[]): Promise<void>
}

export interface ClientBehavior {
  onSpawn(): Promise<void>
  onTick(): Promise<void>
  onDisconnect(): Promise<void>
  getMetrics(): Partial<PerformanceMetrics>
}

export interface ServerMonitor {
  start(): void
  stop(): void
  getMetrics(): PerformanceMetrics
  onMetrics(callback: (metrics: PerformanceMetrics) => void): void
}