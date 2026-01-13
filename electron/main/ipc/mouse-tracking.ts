import { ipcMain, screen, IpcMainInvokeEvent, WebContents } from 'electron'
import { initializeCursorDetector } from '../utils/cursor-detector'
import type { MouseTrackingOptions } from '../../types/electron-shared'
import { logger as Logger } from '../utils/logger'
import { getUIohook, startUIohook, stopUIohook, registerHandler, unregisterAllHandlers } from '../utils/uiohook-manager'
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
    // CRITICAL: Clear any existing interval to prevent memory leaks from duplicate intervals
    if (mouseTrackingInterval) {
      Logger.debug('Clearing existing mouse tracking interval before starting new one')
      clearInterval(mouseTrackingInterval)
      mouseTrackingInterval = null
    }

    // Also clean up any existing click/scroll detection
    if (isMouseTracking) {
      stopClickDetection()
      stopScrollDetection()
    }

    // Reset state
    mouseHistory = []

    try {
      // Check accessibility permissions when starting mouse tracking
      if (cursorDetector && !cursorDetector.hasAccessibilityPermissions()) {
        Logger.warn('⚠️ No accessibility permissions for cursor detection')
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

      // CRITICAL: Register destroyed listener BEFORE setting state to prevent race condition
      // If sender is destroyed between state change and listener registration, cleanup would never happen
      const onDestroyed = () => {
        Logger.debug('Sender webContents destroyed, cleaning up mouse tracking')
        cleanupMouseTracking()
      }
      event.sender.once('destroyed', onDestroyed)

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
            Logger.debug(`[CURSOR] Type changed: ${(global as any).lastLoggedCursor || 'none'} -> ${finalCursorType}`)
              ; (global as any).lastLoggedCursor = finalCursorType
          }

          // Only log in development mode
          if (process.env.NODE_ENV === 'development' && mouseHistory.length % 500 === 0) {
            Logger.debug('Mouse tracking active')
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
          Logger.error('Error tracking mouse:', error)
        }
      }, intervalMs)


      return {
        success: true,
        nativeTracking: true,
        fps: Math.round(1000 / intervalMs)
      }
    } catch (error: any) {
      Logger.error('Error starting mouse tracking:', error)
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
      Logger.error('Error stopping mouse tracking:', error)
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
      Logger.error('Error getting mouse position:', error)
      return { success: false, error: error.message }
    }
  })

}

function startClickDetection(sourceType?: 'screen' | 'window', sourceId?: string): void {
  if (clickDetectionActive) return

  // Check if uiohook is available
  if (!uIOhook) {
    Logger.warn('uiohook-napi not available, click detection disabled')
    return
  }

  clickDetectionActive = true

  try {
    // Start uiohook using the shared manager
    if (!startUIohook('mouse-click-detection')) {
      Logger.error('Failed to start uiohook for click detection')
      clickDetectionActive = false
      return
    }

    // Register global mouse event handlers
    const handleMouseDown = (event: any) => {
      if (!isMouseTracking || !mouseEventSender) return

      // Get current display info for coordinate transformation
      const currentDisplay = screen.getDisplayNearestPoint({ x: event.x, y: event.y })
      const scaleFactor = currentDisplay.scaleFactor || 1

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
        cursorType: clickCursorType,
        sourceType: sourceType || 'screen',
        sourceId: sourceId,
        logicalX: event.x,
        logicalY: event.y
      })

      Logger.debug(`Mouse down at (${event.x}, ${event.y})`)
    }

    const handleMouseUp = (event: any) => {
      if (!isMouseTracking) return
      Logger.debug(`Mouse up at (${event.x}, ${event.y})`)
    }

    // Register handlers using type-safe registry
    registerHandler('mouse-click-detection', 'mousedown', handleMouseDown)
    registerHandler('mouse-click-detection', 'mouseup', handleMouseUp)

    Logger.info('Mouse event handlers registered successfully')

  } catch (error) {
    Logger.error('Failed to start global click detection:', error)
    clickDetectionActive = false
  }
}

function stopClickDetection(): void {
  clickDetectionActive = false
  // Unregister handlers using type-safe registry
  unregisterAllHandlers('mouse-click-detection')
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
