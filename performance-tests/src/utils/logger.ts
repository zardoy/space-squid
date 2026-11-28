import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import chalk from 'chalk'
import type { Logger } from '../types/index.js'

class ModernLogger implements Logger {
  private logger: winston.Logger
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'

  constructor() {
    this.logger = winston.createLogger({
      level: this.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'performance-tests' },
      transports: [
        // Console transport with colors
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
              return `${timestamp} [${level}]: ${message}${metaStr}`
            })
          )
        }),
        // File transport with rotation
        new DailyRotateFile({
          filename: 'logs/performance-tests-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      ]
    })
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(chalk.blue(message), meta)
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(chalk.yellow(message), meta)
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(chalk.red(message), meta)
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(chalk.gray(message), meta)
  }

  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.logLevel = level
    this.logger.level = level
  }

  // Performance-specific logging methods
  logTestStart(testName: string, config: Record<string, unknown>): void {
    this.info(`🚀 Starting test: ${testName}`, { testName, config })
  }

  logTestComplete(testName: string, duration: number, success: boolean): void {
    const status = success ? '✅' : '❌'
    this.info(`${status} Test completed: ${testName} (${duration}ms)`, { 
      testName, 
      duration, 
      success 
    })
  }

  logMetrics(metrics: Record<string, unknown>): void {
    this.debug('📊 Performance metrics collected', metrics)
  }

  logError(error: Error, context?: Record<string, unknown>): void {
    this.error(`💥 Error occurred: ${error.message}`, { 
      error: error.stack, 
      context 
    })
  }

  logPerformanceWarning(metric: string, value: number, threshold: number): void {
    this.warn(`⚠️ Performance warning: ${metric} = ${value} (threshold: ${threshold})`, {
      metric,
      value,
      threshold
    })
  }
}

// Export singleton instance
export const logger = new ModernLogger()

// Export class for testing
export { ModernLogger }