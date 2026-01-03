class Logger {
  private isDev = process.env.NODE_ENV === 'development'

  debug(...args: unknown[]): void {
    if (this.isDev) {
      console.debug('[DEBUG]', ...args)
    }
  }

  info(...args: unknown[]): void {
    console.info('[INFO]', ...args)
  }

  warn(...args: unknown[]): void {
    console.warn('[WARN]', ...args)
  }

  error(...args: unknown[]): void {
    console.error('[ERROR]', ...args)
  }
}

export const logger = new Logger()
