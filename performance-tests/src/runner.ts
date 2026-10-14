#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import figlet from 'figlet'
import boxen from 'boxen'
import ora from 'ora'
import type { TestScenario, TestResult, TestSuite, TestSuiteResult } from './types/index.js'
import { createMovementTest } from './scenarios/movement.js'
import { logger } from './utils/logger.js'

class PerformanceTestRunner {
  private scenarios: TestScenario[] = []
  private results: TestResult[] = []

  constructor() {
    this.initializeDefaultScenarios()
  }

  private initializeDefaultScenarios(): void {
    // Basic movement tests
    this.scenarios.push(
      createMovementTest(10, 60, 'flat'),    // 10 players, 1 minute, flat world
      createMovementTest(25, 120, 'flat'),   // 25 players, 2 minutes, flat world
      createMovementTest(50, 180, 'flat'),   // 50 players, 3 minutes, flat world
      createMovementTest(100, 300, 'flat')   // 100 players, 5 minutes, flat world
    )
  }

  async run(scenario: TestScenario): Promise<TestResult> {
    logger.info(`Running scenario: ${scenario.name}`)
    
    const spinner = ora(`Running ${scenario.name}...`).start()
    
    try {
      const result = await scenario.run()
      spinner.succeed(`Completed ${scenario.name}`)
      
      this.results.push(result)
      this.displayResult(result)
      
      return result
    } catch (error) {
      spinner.fail(`Failed ${scenario.name}`)
      logger.error(`Scenario ${scenario.name} failed`, { error: error instanceof Error ? error.message : 'Unknown error' })
      throw error
    }
  }

  async runAll(scenarios: TestScenario[] = this.scenarios): Promise<TestResult[]> {
    logger.info(`Running ${scenarios.length} scenarios`)
    
    const results: TestResult[] = []
    
    for (const scenario of scenarios) {
      try {
        const result = await this.run(scenario)
        results.push(result)
      } catch (error) {
        logger.error(`Failed to run scenario ${scenario.name}`, { error: error instanceof Error ? error.message : 'Unknown error' })
        // Continue with next scenario
      }
    }
    
    return results
  }

  async runSuite(suite: TestSuite): Promise<TestSuiteResult> {
    logger.info(`Running test suite: ${suite.name}`)
    
    const startTime = Date.now()
    const results: TestResult[] = []
    
    if (suite.config.parallel) {
      // Run scenarios in parallel with concurrency limit
      const chunks = this.chunkArray(suite.scenarios, suite.config.maxConcurrent)
      
      for (const chunk of chunks) {
        const chunkResults = await Promise.allSettled(
          chunk.map(scenario => this.run(scenario))
        )
        
        chunkResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value)
          } else {
            logger.error(`Scenario ${chunk[index].name} failed`, { 
              error: result.reason instanceof Error ? result.reason.message : 'Unknown error' 
            })
          }
        })
        
        if (suite.config.stopOnFailure && results.length < chunk.length) {
          break
        }
      }
    } else {
      // Run scenarios sequentially
      for (const scenario of suite.scenarios) {
        try {
          const result = await this.run(scenario)
          results.push(result)
          
          if (suite.config.stopOnFailure && !result.summary.success) {
            break
          }
        } catch (error) {
          if (suite.config.stopOnFailure) {
            throw error
          }
          // Continue with next scenario
        }
      }
    }
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    const suiteResult: TestSuiteResult = {
      suite,
      results,
      summary: this.generateSuiteSummary(results),
      duration
    }
    
    this.displaySuiteResult(suiteResult)
    return suiteResult
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  private generateSuiteSummary(results: TestResult[]): any {
    if (results.length === 0) {
      return {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        averagePerformanceScore: 0,
        bestPerformer: 'N/A',
        worstPerformer: 'N/A'
      }
    }
    
    const passedTests = results.filter(r => r.summary.success).length
    const failedTests = results.length - passedTests
    
    const performanceScores = results.map(r => r.summary.performanceScore)
    const averagePerformanceScore = performanceScores.reduce((a, b) => a + b, 0) / performanceScores.length
    
    const bestPerformer = results.reduce((best, current) => 
      current.summary.performanceScore > best.summary.performanceScore ? current : best
    )
    
    const worstPerformer = results.reduce((worst, current) => 
      current.summary.performanceScore < worst.summary.performanceScore ? current : worst
    )
    
    return {
      totalTests: results.length,
      passedTests,
      failedTests,
      averagePerformanceScore: Math.round(averagePerformanceScore),
      bestPerformer: bestPerformer.name,
      worstPerformer: worstPerformer.name
    }
  }

  private displayResult(result: TestResult): void {
    const summary = result.summary
    
    console.log('\n' + boxen(
      chalk.cyan.bold(`Test Result: ${result.scenario}`) + '\n' +
      chalk.gray('─'.repeat(40)) + '\n' +
      chalk.white(`Duration: ${result.duration}ms`) + '\n' +
      chalk.white(`Performance Score: ${chalk.bold(summary.performanceScore)}/100`) + '\n' +
      chalk.white(`Average TPS: ${chalk.bold(summary.averageTPS.toFixed(2))}`) + '\n' +
      chalk.white(`Memory Usage: ${chalk.bold((summary.averageMemory / 1024 / 1024).toFixed(2))} MB`) + '\n' +
      chalk.white(`Average Latency: ${chalk.bold(summary.averageLatency.toFixed(2))}ms`) + '\n' +
      chalk.white(`Status: ${summary.success ? chalk.green('✅ PASSED') : chalk.red('❌ FAILED')}`),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: summary.success ? 'green' : 'red'
      }
    ))
  }

  private displaySuiteResult(suiteResult: TestSuiteResult): void {
    const summary = suiteResult.summary
    
    console.log('\n' + boxen(
      chalk.blue.bold(`Test Suite Complete: ${suiteResult.suite.name}`) + '\n' +
      chalk.gray('─'.repeat(50)) + '\n' +
      chalk.white(`Total Tests: ${chalk.bold(summary.totalTests)}`) + '\n' +
      chalk.white(`Passed: ${chalk.green.bold(summary.passedTests)}`) + '\n' +
      chalk.white(`Failed: ${chalk.red.bold(summary.failedTests)}`) + '\n' +
      chalk.white(`Average Performance: ${chalk.bold(summary.averagePerformanceScore)}/100`) + '\n' +
      chalk.white(`Best Performer: ${chalk.green.bold(summary.bestPerformer)}`) + '\n' +
      chalk.white(`Worst Performer: ${chalk.red.bold(summary.worstPerformer)}`) + '\n' +
      chalk.white(`Total Duration: ${chalk.bold((suiteResult.duration / 1000).toFixed(2))}s`),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'blue'
      }
    ))
  }

  getResults(): TestResult[] {
    return [...this.results]
  }

  clearResults(): void {
    this.results = []
  }
}

// CLI interface
async function main(): Promise<void> {
  console.log(chalk.cyan(figlet.textSync('Flying Squid', { horizontalLayout: 'full' })))
  console.log(chalk.blue('Performance Testing Framework\n'))
  
  const program = new Command()
  const runner = new PerformanceTestRunner()
  
  program
    .name('perf-runner')
    .description('Performance testing runner for Flying Squid Minecraft server')
    .version('1.0.0')
  
  program
    .command('movement')
    .description('Run movement performance test')
    .option('-p, --players <number>', 'Number of players', '25')
    .option('-d, --duration <seconds>', 'Test duration in seconds', '120')
    .option('-w, --world <type>', 'World type (flat, default, superflat)', 'flat')
    .action(async (options) => {
      const playerCount = parseInt(options.players)
      const duration = parseInt(options.duration)
      const worldType = options.world as 'flat' | 'default' | 'superflat'
      
      const scenario = createMovementTest(playerCount, duration, worldType)
      
      try {
        await runner.run(scenario)
      } catch (error) {
        logger.error('Movement test failed', { error: error instanceof Error ? error.message : 'Unknown error' })
        process.exit(1)
      }
    })
  
  program
    .command('all')
    .description('Run all performance tests')
    .action(async () => {
      try {
        const suite: TestSuite = {
          name: 'Complete Performance Test Suite',
          description: 'Runs all available performance tests',
          scenarios: runner['scenarios'],
          config: {
            parallel: false,
            maxConcurrent: 1,
            stopOnFailure: false,
            retryFailed: false,
            maxRetries: 0
          }
        }
        
        await runner.runSuite(suite)
      } catch (error) {
        logger.error('Test suite failed', { error: error instanceof Error ? error.message : 'Unknown error' })
        process.exit(1)
      }
    })
  
  program
    .command('list')
    .description('List available test scenarios')
    .action(() => {
      console.log(chalk.cyan.bold('\nAvailable Test Scenarios:\n'))
      runner['scenarios'].forEach((scenario, index) => {
        console.log(chalk.white(`${index + 1}. ${scenario.name}`))
        console.log(chalk.gray(`   ${scenario.description}`))
        console.log(chalk.gray(`   Players: ${scenario.config.playerCount}, Duration: ${scenario.config.duration}s, World: ${scenario.config.worldType}\n`))
      })
    })
  
  await program.parseAsync()
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Runner failed', { error: error instanceof Error ? error.message : 'Unknown error' })
    process.exit(1)
  })
}

export { PerformanceTestRunner }