/**
 * Centralized logging utility with proper log levels
 * Replaces console.log statements throughout the app
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LoggerConfig {
  enabledInProduction: boolean
  minLevel: LogLevel
}

class Logger {
  private config: LoggerConfig = {
    enabledInProduction: false,
    minLevel: 'info'
  }

  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  }

  private isProduction = process.env.NODE_ENV === 'production'

  private shouldLog(level: LogLevel): boolean {
    if (this.isProduction && !this.config.enabledInProduction) {
      return level === 'error' // Only log errors in production
    }
    return this.levels[level] >= this.levels[this.config.minLevel]
  }

  debug(...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug('[DEBUG]', ...args)
    }
  }

  info(...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info('[INFO]', ...args)
    }
  }

  warn(...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn('[WARN]', ...args)
    }
  }

  error(...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error('[ERROR]', ...args)
    }
  }

  // Performance logging
  time(label: string): void {
    if (this.shouldLog('debug')) {
      console.time(label)
    }
  }

  timeEnd(label: string): void {
    if (this.shouldLog('debug')) {
      console.timeEnd(label)
    }
  }

  // Group logging for better organization
  group(label: string): void {
    if (this.shouldLog('debug')) {
      console.group(label)
    }
  }

  groupEnd(): void {
    if (this.shouldLog('debug')) {
      console.groupEnd()
    }
  }

  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// Export singleton instance
export const logger = new Logger()

// Export for testing
export { Logger }