import { WebContents } from 'electron'
import { getUIohook, startUIohook, stopUIohook, registerHandler, unregisterHandler } from '../utils/uiohook-manager'
import { SCROLL_DIRECTION } from '../utils/constants'
import { logger as Logger } from '../utils/logger'

// Get uiohook instance from shared manager
const uIOhook = getUIohook('scroll-tracking')

// Scroll tracking state
let scrollEventSender: WebContents | null = null
let scrollEventSenderId: number | null = null  // Track by ID for reliable comparison
let isScrollTracking = false

// Throttling for performance - reduces IPC overhead
const SCROLL_THROTTLE_MS = 100 // Send accumulated scroll every 100ms
let accumulatedDeltaX = 0
let accumulatedDeltaY = 0
let scrollFlushTimer: NodeJS.Timeout | null = null
let lastScrollTimestamp = 0

function flushScrollEvents(): void {
  if (!scrollEventSender || (accumulatedDeltaX === 0 && accumulatedDeltaY === 0)) return

  scrollEventSender.send('scroll-event', {
    timestamp: lastScrollTimestamp,
    deltaX: accumulatedDeltaX,
    deltaY: accumulatedDeltaY
  })

  accumulatedDeltaX = 0
  accumulatedDeltaY = 0
}

/**
 * Start scroll detection using uiohook wheel events
 * @param sender - WebContents to send scroll events to
 */
export function startScrollDetection(sender: WebContents): void {
  // Use sender.id for reliable comparison instead of object reference
  const senderId = sender.id

  // Check if already tracking for this exact sender (by ID)
  if (isScrollTracking && scrollEventSenderId === senderId) {
    Logger.debug('Scroll detection already active for this sender')
    return
  }

  if (!uIOhook) {
    Logger.warn('uiohook-napi not available, scroll detection disabled')
    return
  }

  // CRITICAL: Clean up any existing scroll detection before starting new one
  // This prevents duplicate timers and handlers when sender changes
  if (isScrollTracking || scrollFlushTimer) {
    Logger.debug('Cleaning up existing scroll detection before starting new one')
    stopScrollDetection()
  }

  try {
    if (!startUIohook('scroll-detection')) {
      Logger.error('Failed to start uiohook for scroll detection')
      return
    }

    scrollEventSender = sender
    scrollEventSenderId = senderId
    isScrollTracking = true

    // Clean up when sender is destroyed to prevent orphaned timers
    sender.once('destroyed', () => {
      if (scrollEventSenderId === senderId) {
        Logger.debug('Scroll detection sender destroyed, cleaning up')
        stopScrollDetection()
      }
    })

    const handleWheel = (event: any) => {
      if (!isScrollTracking || !scrollEventSender) return

      // Normalize platform-specific wheel event data to deltaX/deltaY
      const sign = event.direction === SCROLL_DIRECTION.UP ? -1 : 1
      const deltaX = typeof event.deltaX === 'number' ? event.deltaX : 0
      const deltaY = typeof event.deltaY === 'number'
        ? event.deltaY
        : (typeof event.amount === 'number'
            ? event.amount * sign
            : (typeof event.rotation === 'number' ? event.rotation * sign : 0))

      // Accumulate scroll deltas for throttled sending
      accumulatedDeltaX += deltaX
      accumulatedDeltaY += deltaY
      lastScrollTimestamp = Date.now()
    }

    // Register handler using type-safe registry (automatically removes existing handler)
    registerHandler('scroll-detection', 'wheel', handleWheel)

    // Start throttle timer to flush accumulated scroll events
    scrollFlushTimer = setInterval(flushScrollEvents, SCROLL_THROTTLE_MS)

    Logger.info('Scroll detection started with throttling')
  } catch (error) {
    Logger.error('Failed to start scroll detection:', error)
    isScrollTracking = false
    scrollEventSender = null
    scrollEventSenderId = null
  }
}

/**
 * Stop scroll detection and cleanup
 */
export function stopScrollDetection(): void {
  // Clear throttle timer first (even if not tracking, might have orphaned timer)
  if (scrollFlushTimer) {
    clearInterval(scrollFlushTimer)
    scrollFlushTimer = null
  }

  if (!isScrollTracking) return

  // Flush any remaining accumulated scroll events
  flushScrollEvents()

  isScrollTracking = false
  scrollEventSender = null
  scrollEventSenderId = null
  accumulatedDeltaX = 0
  accumulatedDeltaY = 0

  // Unregister handler using type-safe registry
  unregisterHandler('scroll-detection', 'wheel')

  // Stop uiohook for this module
  stopUIohook('scroll-detection')

  Logger.info('Scroll detection stopped')
}
