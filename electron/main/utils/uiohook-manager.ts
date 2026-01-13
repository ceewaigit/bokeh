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

// Type-safe event handler types
export type UIohookEventType = 'mousedown' | 'mouseup' | 'keydown' | 'keyup' | 'wheel'

// Type-safe handler registry (replaces global storage pattern)
const handlerRegistry: Record<UIohookEventType, Map<string, (event: any) => void>> = {
  mousedown: new Map(),
  mouseup: new Map(),
  keydown: new Map(),
  keyup: new Map(),
  wheel: new Map()
}

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
      // Initialize heartbeat tracking
      heartbeat(moduleName)
      startHeartbeatMonitor()
      return true
    } catch (error) {
      logger.error(`Failed to start uiohook for ${moduleName}:`, error)
      activeModules.delete(moduleName)
      return false
    }
  } else {
    referenceCount++
    // Update heartbeat for existing modules
    heartbeat(moduleName)
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
  // CRITICAL: Clean up heartbeat entry to prevent unbounded map growth
  moduleHeartbeats.delete(moduleName)

  if (!uIOhook || referenceCount === 0) return

  referenceCount--
  logger.debug(`Decrementing uiohook reference count to ${referenceCount} (stopped by ${moduleName})`)

  if (referenceCount === 0) {
    try {
      logger.info(`Stopping uiohook-napi (last module: ${moduleName})`)
      uIOhook.stop()
      // Stop heartbeat monitor when no modules active
      if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval)
        heartbeatCheckInterval = null
      }
    } catch (error) {
      logger.error(`Error stopping uiohook for ${moduleName}:`, error)
    }
  }
}

/**
 * Register an event handler with the uiohook instance.
 * Handlers are tracked by module name for proper cleanup.
 * If a handler already exists for this module/event, it will be replaced.
 *
 * @param moduleName - Name of the module registering the handler
 * @param eventType - The uiohook event type to listen for
 * @param handler - The handler function to call when the event fires
 * @returns true if registered successfully, false if uiohook unavailable
 */
export function registerHandler(
  moduleName: string,
  eventType: UIohookEventType,
  handler: (event: any) => void
): boolean {
  const hook = getUIohook(moduleName)
  if (!hook) return false

  // Remove existing handler for this module if present
  unregisterHandler(moduleName, eventType)

  handlerRegistry[eventType].set(moduleName, handler)
  hook.on(eventType, handler)
  logger.debug(`Registered ${eventType} handler for ${moduleName}`)
  return true
}

/**
 * Unregister an event handler for a specific module and event type.
 *
 * @param moduleName - Name of the module to unregister
 * @param eventType - The event type to stop listening for
 */
export function unregisterHandler(
  moduleName: string,
  eventType: UIohookEventType
): void {
  const handler = handlerRegistry[eventType].get(moduleName)
  if (handler && uIOhook) {
    try {
      uIOhook.off(eventType, handler)
      handlerRegistry[eventType].delete(moduleName)
      logger.debug(`Unregistered ${eventType} handler for ${moduleName}`)
    } catch (error) {
      logger.error(`Error unregistering ${eventType} handler for ${moduleName}:`, error)
    }
  }
}

/**
 * Unregister all event handlers for a module.
 * Call this during module cleanup to ensure all handlers are removed.
 *
 * @param moduleName - Name of the module to cleanup
 */
export function unregisterAllHandlers(moduleName: string): void {
  const eventTypes: UIohookEventType[] = ['mousedown', 'mouseup', 'keydown', 'keyup', 'wheel']
  for (const eventType of eventTypes) {
    unregisterHandler(moduleName, eventType)
  }
}

// ============= Heartbeat-Based Auto-Cleanup =============

// Track module heartbeats for stale module detection
const moduleHeartbeats = new Map<string, number>()
const HEARTBEAT_TIMEOUT_MS = 30000 // 30 seconds
let heartbeatCheckInterval: NodeJS.Timeout | null = null

/**
 * Update heartbeat timestamp for a module.
 * Call this periodically from tracking modules to indicate they're still active.
 * Modules that don't send heartbeats within HEARTBEAT_TIMEOUT_MS will be cleaned up.
 *
 * @param moduleName - Name of the module sending the heartbeat
 */
export function heartbeat(moduleName: string): void {
  moduleHeartbeats.set(moduleName, Date.now())
}

/**
 * Start the heartbeat monitor if not already running.
 * The monitor checks for stale modules and cleans them up automatically.
 */
function startHeartbeatMonitor(): void {
  if (heartbeatCheckInterval) return

  heartbeatCheckInterval = setInterval(() => {
    const now = Date.now()

    for (const [moduleName, lastBeat] of moduleHeartbeats.entries()) {
      if (now - lastBeat > HEARTBEAT_TIMEOUT_MS && activeModules.has(moduleName)) {
        logger.warn(`Module ${moduleName} appears stale (no heartbeat for ${HEARTBEAT_TIMEOUT_MS}ms), cleaning up`)
        unregisterAllHandlers(moduleName)
        stopUIohook(moduleName)
        moduleHeartbeats.delete(moduleName)
      }
    }

    // Stop monitor if no modules active
    if (activeModules.size === 0 && heartbeatCheckInterval) {
      clearInterval(heartbeatCheckInterval)
      heartbeatCheckInterval = null
      logger.debug('Stopped heartbeat monitor (no active modules)')
    }
  }, HEARTBEAT_TIMEOUT_MS / 2) // Check every 15 seconds
}


