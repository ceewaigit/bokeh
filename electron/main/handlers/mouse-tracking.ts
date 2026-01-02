import { ipcMain, screen, IpcMainInvokeEvent, WebContents } from 'electron'
import { initializeCursorDetector } from '../utils/cursor-detector'
import type { MouseTrackingOptions } from '../../types/electron-shared'
// Simple logger for production
const logger = {
  debug: (msg: string, ...args: any[]) => process.env.NODE_ENV === 'development' && console.log(msg, ...args),
  info: (msg: string, ...args: any[]) => console.log(msg, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(msg, ...args),
  error: (msg: string, ...args: any[]) => console.error(msg, ...args)
}
import { getUIohook, stopUIohook } from '../utils/uiohook-manager'
import { startScrollDetection, stopScrollDetection } from './scroll-tracking'
import { TIMING, MOUSE_BUTTONS } from '../utils/constants'

// Get uiohook instance from shared manager
const uIOhook = getUIohook('mouse-tracking')

// Initialize cursor detector for cursor type detection
const cursorDetector = initializeCursorDetector('cursor type detection')


let mouseTrackingInterval: NodeJS.Timeout | null = null
let mouseEventSender: WebContents | null = null
let isMouseTracking = false
let clickDetectionActive = false
let mouseHistory: Array<{ x: number; y: number; time: number }> = []
let uiohookStarted = false
interface MousePosition {
  x: number
  y: number
  timestamp: number
  velocity?: { x: number; y: number }
  acceleration?: { x: number; y: number }
  displayBounds?: { x: number; y: number; width: number; height: number }
  scaleFactor?: number
  cursorType?: string
  sourceType?: 'screen' | 'window' | 'area'
  sourceId?: string
}

export function registerMouseTrackingHandlers(): void {
  ipcMain.handle('start-mouse-tracking', async (event: IpcMainInvokeEvent, options: MouseTrackingOptions = {}) => {

    try {
      // Check accessibility permissions when starting mouse tracking
      if (cursorDetector && !cursorDetector.hasAccessibilityPermissions()) {
        logger.warn('⚠️ No accessibility permissions for cursor detection')
        // Request permissions
        const { dialog, shell, BrowserWindow } = require('electron')
        const win = BrowserWindow.getFocusedWindow()
        dialog.showMessageBox(win || null, {
          type: 'info',
          title: 'Accessibility Permissions Required',
          message: 'Grant accessibility permissions for accurate cursor detection',
          detail: 'This allows Bokeh to detect when your cursor changes to text selection, pointer, and other states',
          buttons: ['Open System Settings', 'Not Now']
        }).then((result: any) => {
          if (result.response === 0) {
            shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
          }
        })
      }

      const intervalMs = Math.max(TIMING.MIN_MOUSE_INTERVAL, Math.min(TIMING.MAX_MOUSE_INTERVAL, parseInt(String(options.intervalMs)) || TIMING.DEFAULT_MOUSE_INTERVAL))
      const sourceType = options.sourceType || 'screen'
      const sourceId = options.sourceId

      mouseEventSender = event.sender
      isMouseTracking = true


      // Start click detection using global mouse hooks with source info
      startClickDetection(sourceType, sourceId)

      // Start scroll detection
      startScrollDetection(event.sender)


      let lastPosition: Electron.Point | null = null
      let lastVelocity = { x: 0, y: 0 }
      let lastTime = Date.now()
      // Stabilize cursor transitions to avoid rapid pointer/text flips
      let stableCursorType = 'default'
      let candidateCursorType: string | null = null
      let candidateSince = 0
      const cursorStabilizeMs = TIMING.CURSOR_STABILIZE_MS

      mouseTrackingInterval = setInterval(() => {
        if (!isMouseTracking || !mouseEventSender) return

        try {
          const currentPosition = screen.getCursorScreenPoint()
          const now = Date.now()

          // Compute velocity using previous lastPosition before updating it
          if (lastPosition) {
            const dt = Math.max(TIMING.MIN_TIME_DELTA, now - lastTime)
            const vx = (currentPosition.x - lastPosition.x) / dt
            const vy = (currentPosition.y - lastPosition.y) / dt
            const smoothing = TIMING.VELOCITY_SMOOTHING_FACTOR
            lastVelocity = {
              x: lastVelocity.x + (vx - lastVelocity.x) * smoothing,
              y: lastVelocity.y + (vy - lastVelocity.y) * smoothing
            }
          }

          // Update lastPosition and lastTime after computing velocity
          lastPosition = currentPosition
          lastTime = now

          // Determine display and scale factor
          const display = screen.getDisplayNearestPoint(currentPosition)
          const scaleFactor = display.scaleFactor || 1

          // Keep coordinates in Electron's global screen space (DIP / points).
          // Conversion to capture-relative physical pixels happens in the renderer-side tracking service
          // using the capture area's fixed scaleFactor to avoid jitter on high-DPI / mixed-DPI setups.
          const positionData = {
            x: currentPosition.x,
            y: currentPosition.y,
            displayBounds: display.bounds,
            scaleFactor
          }

          // Store history for smoothing and acceleration calculation
          mouseHistory.push({ x: positionData.x, y: positionData.y, time: now })
          if (mouseHistory.length > TIMING.MOUSE_HISTORY_SIZE) mouseHistory.shift()

          // Calculate acceleration (simple diff of velocities)
          let acceleration = { x: 0, y: 0 }
          if (mouseHistory.length >= 3) {
            const v1x = (mouseHistory[2].x - mouseHistory[1].x) / (mouseHistory[2].time - mouseHistory[1].time)
            const v1y = (mouseHistory[2].y - mouseHistory[1].y) / (mouseHistory[2].time - mouseHistory[1].time)
            const v0x = (mouseHistory[1].x - mouseHistory[0].x) / (mouseHistory[1].time - mouseHistory[0].time)
            const v0y = (mouseHistory[1].y - mouseHistory[0].y) / (mouseHistory[1].time - mouseHistory[0].time)
            acceleration = { x: v1x - v0x, y: v1y - v0y }
          }

          // Detect cursor type using native module when available
          let usedCursorType = 'default'
          if (cursorDetector) {
            try {
              usedCursorType = cursorDetector.getCurrentCursorType()
            } catch {
              // ignore
            }
          }

          // Stabilize cursor transitions (debounce)
          if (usedCursorType === stableCursorType) {
            candidateCursorType = null
          } else {
            if (candidateCursorType !== usedCursorType) {
              candidateCursorType = usedCursorType
              candidateSince = now
            } else if (now - candidateSince >= cursorStabilizeMs) {
              stableCursorType = usedCursorType
              candidateCursorType = null
            }
          }

          const finalCursorType = stableCursorType

          // Only log on stable changes
          if ((global as any).lastLoggedCursor !== finalCursorType) {
            logger.debug(`[CURSOR] Type changed: ${(global as any).lastLoggedCursor || 'none'} -> ${finalCursorType}`)
              ; (global as any).lastLoggedCursor = finalCursorType
          }

          // Only log in development mode
          if (process.env.NODE_ENV === 'development' && mouseHistory.length % 500 === 0) {
            logger.debug('Mouse tracking active')
          }

          // Send enhanced mouse data with velocity for smooth interpolation
          mouseEventSender.send('mouse-move', {
            x: positionData.x,
            y: positionData.y,
            timestamp: now,
            velocity: lastVelocity,
            acceleration,
            displayBounds: positionData.displayBounds,
            scaleFactor: positionData.scaleFactor,
            cursorType: finalCursorType,
            sourceType: sourceType,
            sourceId: sourceId
          } as MousePosition)

        } catch (error) {
          logger.error('Error tracking mouse:', error)
        }
      }, intervalMs)


      return {
        success: true,
        nativeTracking: true,
        fps: Math.round(1000 / intervalMs)
      }
    } catch (error: any) {
      logger.error('Error starting mouse tracking:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('stop-mouse-tracking', async () => {
    try {
      if (mouseTrackingInterval) {
        clearInterval(mouseTrackingInterval)
        mouseTrackingInterval = null
      }

      isMouseTracking = false

      // Stop click detection
      stopClickDetection()

      // Stop scroll detection
      stopScrollDetection()

      // Reset mouse history
      mouseHistory = []

      mouseEventSender = null

      return { success: true }
    } catch (error: any) {
      logger.error('Error stopping mouse tracking:', error)
      return { success: false, error: error.message }
    }
  })


  ipcMain.handle('get-mouse-position', async () => {
    try {
      const position = screen.getCursorScreenPoint()
      return {
        success: true,
        position: {
          x: position.x,
          y: position.y
        }
      }
    } catch (error: any) {
      logger.error('Error getting mouse position:', error)
      return { success: false, error: error.message }
    }
  })

}

function startClickDetection(sourceType?: 'screen' | 'window', sourceId?: string): void {
  if (clickDetectionActive) return

  // Check if uiohook is available
  if (!uIOhook) {
    logger.warn('uiohook-napi not available, click detection disabled')
    return
  }

  clickDetectionActive = true

  try {
    // Start uiohook if not already started
    if (!uiohookStarted) {
      logger.info('Starting uiohook-napi...')
      uIOhook.start()
      uiohookStarted = true
      logger.info('uiohook-napi started successfully')
    }

    // Register global mouse event handlers
    const handleMouseDown = (event: any) => {
      if (!isMouseTracking || !mouseEventSender) return

      // Get current display info for coordinate transformation
      const currentDisplay = screen.getDisplayNearestPoint({ x: event.x, y: event.y })
      const scaleFactor = currentDisplay.scaleFactor || 1

      // Track mouse down state for cursor detection
      // Get cursor type at click position
      let clickCursorType = 'pointer' // Default for clicks
      if (cursorDetector) {
        try {
          clickCursorType = cursorDetector.getCurrentCursorType()
        } catch {
          // Keep pointer as default
        }
      }

      mouseEventSender.send('mouse-click', {
        x: event.x,
        y: event.y,
        timestamp: Date.now(),
        button: event.button === MOUSE_BUTTONS.LEFT ? 'left' : event.button === MOUSE_BUTTONS.RIGHT ? 'right' : 'middle',
        displayBounds: currentDisplay.bounds,
        scaleFactor: scaleFactor,
        cursorType: clickCursorType,  // Use detected cursor type
        sourceType: sourceType || 'screen',
        sourceId: sourceId,
        // Store logical coordinates for debugging
        logicalX: event.x,
        logicalY: event.y
      })


      logger.debug(`Mouse down at (${event.x}, ${event.y})`)
    }

    const handleMouseUp = (event: any) => {
      if (!isMouseTracking) return

      logger.debug(`Mouse up at (${event.x}, ${event.y})`)
    }

    // Register the mouse event listeners
    uIOhook.on('mousedown', handleMouseDown)
    uIOhook.on('mouseup', handleMouseUp)

      // Store the handlers for cleanup
      ; (global as any).uiohookMouseDownHandler = handleMouseDown
      ; (global as any).uiohookMouseUpHandler = handleMouseUp

    logger.info('Mouse event handlers registered successfully')

  } catch (error) {
    logger.error('Failed to start global click detection:', error)
    clickDetectionActive = false
  }
}

function stopClickDetection(): void {
  clickDetectionActive = false
  try {
    if (uIOhook) {
      if ((global as any).uiohookMouseDownHandler) {
        uIOhook.off('mousedown', (global as any).uiohookMouseDownHandler)
          ; (global as any).uiohookMouseDownHandler = null
      }
      if ((global as any).uiohookMouseUpHandler) {
        uIOhook.off('mouseup', (global as any).uiohookMouseUpHandler)
          ; (global as any).uiohookMouseUpHandler = null
      }
    }
  } catch (error) {
    logger.error('Error stopping click detection:', error)
  }
}



export function cleanupMouseTracking(): void {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval)
    mouseTrackingInterval = null
    isMouseTracking = false
  }
  stopClickDetection()
  stopScrollDetection()

  // Stop uiohook for mouse tracking modules via manager
  stopUIohook('mouse-click-detection')
}
