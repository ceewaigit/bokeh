import { WebContents } from 'electron'
import { getUIohook, startUIohook, stopUIohook } from '../utils/uiohook-manager'
import { SCROLL_DIRECTION } from '../utils/constants'

// Simple logger for production
const logger = {
  debug: (msg: string, ...args: any[]) => process.env.NODE_ENV === 'development' && console.log(msg, ...args),
  info: (msg: string, ...args: any[]) => console.log(msg, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(msg, ...args),
  error: (msg: string, ...args: any[]) => console.error(msg, ...args)
}

// Get uiohook instance from shared manager
const uIOhook = getUIohook('scroll-tracking')

// Scroll tracking state
let scrollEventSender: WebContents | null = null
let isScrollTracking = false

/**
 * Start scroll detection using uiohook wheel events
 * @param sender - WebContents to send scroll events to
 */
export function startScrollDetection(sender: WebContents): void {
  if (isScrollTracking && scrollEventSender === sender) {
    logger.debug('Scroll detection already active for this sender')
    return
  }
  
  if (!uIOhook) {
    logger.warn('uiohook-napi not available, scroll detection disabled')
    return
  }

  try {
    if (!startUIohook('scroll-detection')) {
      logger.error('Failed to start uiohook for scroll detection')
      return
    }

    scrollEventSender = sender
    isScrollTracking = true

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

      scrollEventSender.send('scroll-event', {
        timestamp: Date.now(),
        deltaX,
        deltaY
      })
    }

    // Remove any existing handler first
    if ((global as any).uiohookWheelHandler) {
      uIOhook.off('wheel', (global as any).uiohookWheelHandler)
    }

    // Register new handler
    uIOhook.on('wheel', handleWheel)
    ;(global as any).uiohookWheelHandler = handleWheel

    logger.info('Scroll detection started')
  } catch (error) {
    logger.error('Failed to start scroll detection:', error)
    isScrollTracking = false
    scrollEventSender = null
  }
}

/**
 * Stop scroll detection and cleanup
 */
export function stopScrollDetection(): void {
  if (!isScrollTracking) return
  
  isScrollTracking = false
  scrollEventSender = null
  
  try {
    if (uIOhook && (global as any).uiohookWheelHandler) {
      uIOhook.off('wheel', (global as any).uiohookWheelHandler)
      ;(global as any).uiohookWheelHandler = null
    }
    
    // Stop uiohook for this module
    stopUIohook('scroll-detection')
    
    logger.info('Scroll detection stopped')
  } catch (error) {
    logger.error('Failed to stop scroll detection:', error)
  }
}

