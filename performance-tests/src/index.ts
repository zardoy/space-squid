// Core types and interfaces
export * from './types/index.js'

// Utility classes
export { ModernLogger, logger } from './utils/logger.js'
export { MetricsCollector } from './utils/metrics-collector.js'
export { FlyingSquidServerManager } from './utils/server-manager.js'

// Test scenarios
export { MovementTestScenario, createMovementTest } from './scenarios/movement.js'

// Test runner
export { PerformanceTestRunner } from './runner.js'

// Main entry point for programmatic usage
export async function runPerformanceTest(
  scenarioName: string,
  config: Partial<import('./types/index.js').TestConfig>
): Promise<import('./types/index.js').TestResult> {
  const runner = new PerformanceTestRunner()
  
  let scenario: import('./types/index.js').TestScenario
  
  switch (scenarioName.toLowerCase()) {
    case 'movement':
      const { playerCount = 25, duration = 120, worldType = 'flat' } = config
      scenario = createMovementTest(playerCount, duration, worldType)
      break
    default:
      throw new Error(`Unknown scenario: ${scenarioName}`)
  }
  
  return await runner.run(scenario)
}

// Convenience function for running movement tests
export async function runMovementTest(
  playerCount: number,
  duration: number,
  worldType: 'flat' | 'default' | 'superflat' = 'flat'
): Promise<import('./types/index.js').TestResult> {
  const scenario = createMovementTest(playerCount, duration, worldType)
  const runner = new PerformanceTestRunner()
  return await runner.run(scenario)
}

// Default export for common usage
export default {
  runPerformanceTest,
  runMovementTest,
  PerformanceTestRunner,
  createMovementTest,
  logger
}