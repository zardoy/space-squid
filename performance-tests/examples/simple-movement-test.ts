#!/usr/bin/env tsx

import { runMovementTest, logger } from '../src/index.js'

async function main() {
  try {
    logger.info('🚀 Starting simple movement performance test...')
    
    // Run a simple movement test with 10 players for 1 minute
    const result = await runMovementTest(10, 60, 'flat')
    
    logger.info('✅ Test completed successfully!')
    logger.info(`Performance Score: ${result.summary.performanceScore}/100`)
    logger.info(`Average TPS: ${result.summary.averageTPS.toFixed(2)}`)
    logger.info(`Memory Usage: ${(result.summary.averageMemory / 1024 / 1024).toFixed(2)} MB`)
    logger.info(`Average Latency: ${result.summary.averageLatency.toFixed(2)}ms`)
    
  } catch (error) {
    logger.error('❌ Test failed', { error: error instanceof Error ? error.message : 'Unknown error' })
    process.exit(1)
  }
}

// Run the example
main().catch((error) => {
  logger.error('Example failed', { error: error instanceof Error ? error.message : 'Unknown error' })
  process.exit(1)
})