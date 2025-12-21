/**
 * Shared UIohook manager for coordinating uiohook-napi usage across modules
 * Prevents race conditions and manages lifecycle properly
 */

// Simple logger for production
const logger = {
  debug: (msg: string, ...args: any[]) => process.env.NODE_ENV === 'development' && console.log(msg, ...args),
  info: (msg: string, ...args: any[]) => console.log(msg, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(msg, ...args),
  error: (msg: string, ...args: any[]) => console.error(msg, ...args)
}

// Lazy load uiohook-napi to handle initialization errors
let uIOhook: any = null
let isInitialized = false
let referenceCount = 0

// Track which modules are using uiohook
const activeModules = new Set<string>()

/**
 * Initialize and get the uiohook instance
 * @param moduleName - Name of the module requesting uiohook (for tracking)
 * @returns The uiohook instance or null if unavailable
 */
export function getUIohook(moduleName: string): any {
  if (!isInitialized) {
    try {
      const uiohookModule = require('uiohook-napi')
      uIOhook = uiohookModule.uIOhook
      isInitialized = true
      logger.info(`uiohook-napi loaded successfully for ${moduleName}`)
    } catch (error) {
      logger.error(`Failed to load uiohook-napi for ${moduleName}:`, error)
      return null
    }
  }
  
  return uIOhook
}

/**
 * Start uiohook if not already started
 * @param moduleName - Name of the module starting uiohook
 * @returns true if started successfully or already running
 */
export function startUIohook(moduleName: string): boolean {
  const hook = getUIohook(moduleName)
  if (!hook) return false
  
  activeModules.add(moduleName)
  
  if (referenceCount === 0) {
    try {
      logger.info(`Starting uiohook-napi (first module: ${moduleName})`)
      hook.start()
      referenceCount++
      return true
    } catch (error) {
      logger.error(`Failed to start uiohook for ${moduleName}:`, error)
      activeModules.delete(moduleName)
      return false
    }
  } else {
    referenceCount++
    logger.debug(`uiohook already started, incrementing reference count to ${referenceCount} for ${moduleName}`)
    return true
  }
}

/**
 * Stop uiohook if no other modules are using it
 * @param moduleName - Name of the module stopping uiohook
 */
export function stopUIohook(moduleName: string): void {
  activeModules.delete(moduleName)
  
  if (!uIOhook || referenceCount === 0) return
  
  referenceCount--
  logger.debug(`Decrementing uiohook reference count to ${referenceCount} (stopped by ${moduleName})`)
  
  if (referenceCount === 0) {
    try {
      logger.info(`Stopping uiohook-napi (last module: ${moduleName})`)
      uIOhook.stop()
    } catch (error) {
      logger.error(`Error stopping uiohook for ${moduleName}:`, error)
    }
  }
}

