import { BrowserWindow, screen, ipcMain } from 'electron'
import * as path from 'path'
import { getAppURL } from '../config'

interface AreaSelectionResult {
  success: boolean
  cancelled?: boolean
  error?: string
  area?: {
    x: number
    y: number
    width: number
    height: number
    displayId: number
  }
}

interface SelectionBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Service for handling screen area selection.
 * Creates a transparent fullscreen overlay for users to drag-select a region.
 * Follows the same patterns as monitor-overlay.ts for window management.
 */
class AreaSelectionService {
  private overlayWindows: BrowserWindow[] = []
  private resolvePromise: ((result: AreaSelectionResult) => void) | null = null
  private completeHandler: ((event: any, bounds: SelectionBounds) => void) | null = null
  private cancelHandler: (() => void) | null = null
  private selectionResolved = false

  /**
   * Opens the area selection overlay and returns the selected region.
   * Returns a promise that resolves when selection is complete or cancelled.
   */
  async selectArea(): Promise<AreaSelectionResult> {
    // Check macOS version requirement (12.3+ for ScreenCaptureKit)
    if (!this.checkMacOSVersion()) {
      return { success: false, error: 'macOS 12.3+ required for area selection' }
    }

    // Cleanup any existing overlay (handles rapid re-selection)
    this.cleanup()
    this.selectionResolved = false

    return new Promise((resolve) => {
      this.resolvePromise = resolve
      this.createOverlay()
    })
  }

  /**
   * Checks if running on macOS 12.3 or later (required for ScreenCaptureKit).
   */
  private checkMacOSVersion(): boolean {
    if (process.platform !== 'darwin') {
      return true // Allow on non-macOS for development
    }

    const systemVersion = process.getSystemVersion?.() || '0.0.0'
    const [major, minor] = systemVersion.split('.').map(Number)

    if (major < 12 || (major === 12 && minor < 3)) {
      console.warn('[AreaSelection] Requires macOS 12.3+ for ScreenCaptureKit')
      return false
    }

    return true
  }

  /**
   * Creates the fullscreen transparent overlay window.
   */
  private createOverlay(): void {
    const primaryDisplay = screen.getPrimaryDisplay()

    // Get the correct preload path from webpack environment
    // Electron Forge sets MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY as an env var
    // Fallback tries various paths based on webpack output structure
    let preloadPath = process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY

    if (!preloadPath) {
      // Try to find preload.js in webpack output structure
      const possiblePaths = [
        path.join(__dirname, '../renderer/main_window/preload.js'),  // Webpack dev structure
        path.join(__dirname, '../../preload.js'),                     // Legacy/packaged structure
        path.join(__dirname, '../preload.js'),                        // Alternative structure
      ]

      const fs = require('fs')
      for (const p of possiblePaths) {
        console.log('[AreaSelection] Checking preload path:', p, 'exists:', fs.existsSync(p))
        if (fs.existsSync(p)) {
          preloadPath = p
          break
        }
      }
    }

    console.log('[AreaSelection] Final preload path:', preloadPath)
    console.log('[AreaSelection] __dirname:', __dirname)

    // Get all displays to create one overlay per screen.
    // macOS "Displays have separate Spaces" prevents a single window from spanning monitors reliably.
    const allDisplays = screen.getAllDisplays()

    console.log('[AreaSelection] Primary display:', {
      bounds: primaryDisplay.bounds,
      workArea: primaryDisplay.workArea,
      scaleFactor: primaryDisplay.scaleFactor
    })
    console.log('[AreaSelection] All displays count:', allDisplays.length)

    this.overlayWindows = allDisplays.map((display) => {
      console.log('[AreaSelection] Overlay bounds:', { displayId: display.id, bounds: display.bounds })
      const overlayWindow = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        focusable: true,
        hasShadow: false,
        // Enable high DPI support
        enableLargerThanScreen: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: preloadPath,
          zoomFactor: 1.0  // Prevent scaling issues
        }
      })

      // Ensure visible on all workspaces and above everything
      overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1000)
      return overlayWindow
    })

    this.setupEventListeners(primaryDisplay.id, primaryDisplay.scaleFactor)
    this.loadContent()
  }
  /**
   * Sets up IPC listeners for selection completion/cancellation.
   */
  private setupEventListeners(_defaultDisplayId: number, _defaultScaleFactor: number = 1): void {
    if (!this.overlayWindows.length) return

    // Handle successful selection
    this.completeHandler = (_event: any, bounds: SelectionBounds) => {
      if (this.selectionResolved) return
      this.selectionResolved = true
      console.log('[AreaSelection] IPC: area-selection-complete received')
      console.log('[AreaSelection] Raw selection bounds (window CSS pixels):', bounds)

      const senderWindow = BrowserWindow.fromWebContents(_event.sender)
      const senderBounds = senderWindow?.getBounds()

      const globalBounds = senderBounds ? {
        x: bounds.x + senderBounds.x,
        y: bounds.y + senderBounds.y,
        width: bounds.width,
        height: bounds.height
      } : bounds

      const displayFromWindow = senderBounds ? screen.getDisplayMatching(senderBounds) : null
      const centerX = globalBounds.x + globalBounds.width / 2
      const centerY = globalBounds.y + globalBounds.height / 2
      const targetDisplay = displayFromWindow ?? screen.getDisplayNearestPoint({ x: centerX, y: centerY })

      console.log('[AreaSelection] Selection center:', { x: centerX, y: centerY })
      console.log('[AreaSelection] Target display:', {
        id: targetDisplay.id,
        bounds: targetDisplay.bounds,
        scaleFactor: targetDisplay.scaleFactor
      })

      // IMPORTANT: ScreenCaptureKit expects coordinates relative to the display origin
      // in LOGICAL POINTS (not physical pixels). The native code handles scale factor internally.
      let displayRelativeBounds = {
        x: Math.round(globalBounds.x - targetDisplay.bounds.x),
        y: Math.round(globalBounds.y - targetDisplay.bounds.y),
        width: Math.round(globalBounds.width),
        height: Math.round(globalBounds.height)
      }

      // Normalize for cases where overlay events are already in backing pixels.
      const scaleFactor = targetDisplay.scaleFactor || 1
      const maxWidth = targetDisplay.bounds.width
      const maxHeight = targetDisplay.bounds.height
      if (scaleFactor > 1) {
        const looksScaled = displayRelativeBounds.width > maxWidth + 1 ||
          displayRelativeBounds.height > maxHeight + 1 ||
          displayRelativeBounds.x > maxWidth ||
          displayRelativeBounds.y > maxHeight
        if (looksScaled) {
          displayRelativeBounds = {
            x: Math.round(displayRelativeBounds.x / scaleFactor),
            y: Math.round(displayRelativeBounds.y / scaleFactor),
            width: Math.round(displayRelativeBounds.width / scaleFactor),
            height: Math.round(displayRelativeBounds.height / scaleFactor)
          }
        }
      }

      // Clamp to the target display bounds (points) to avoid out-of-bounds crops.
      const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
      const clampedX = clamp(displayRelativeBounds.x, 0, maxWidth - 1)
      const clampedY = clamp(displayRelativeBounds.y, 0, maxHeight - 1)
      const clampedWidth = clamp(displayRelativeBounds.width, 1, maxWidth)
      const clampedHeight = clamp(displayRelativeBounds.height, 1, maxHeight)
      if (clampedX + clampedWidth > maxWidth) {
        displayRelativeBounds.width = maxWidth - clampedX
      } else {
        displayRelativeBounds.width = clampedWidth
      }
      if (clampedY + clampedHeight > maxHeight) {
        displayRelativeBounds.height = maxHeight - clampedY
      } else {
        displayRelativeBounds.height = clampedHeight
      }
      displayRelativeBounds.x = clampedX
      displayRelativeBounds.y = clampedY

      console.log('[AreaSelection] Display-relative bounds (logical points):', displayRelativeBounds)

      this.resolvePromise?.({
        success: true,
        area: { ...displayRelativeBounds, displayId: targetDisplay.id }
      })
      this.cleanup()
    }

    // Handle cancellation (Escape key or click outside)
    this.cancelHandler = () => {
      console.log('[AreaSelection] IPC: area-selection-cancelled received')
      console.log('[AreaSelection] Selection cancelled')
      if (!this.selectionResolved) {
        this.selectionResolved = true
        this.resolvePromise?.({
          success: false,
          cancelled: true
        })
      }
      this.cleanup()
    }

    // Use once() to prevent listener accumulation
    console.log('[AreaSelection] Setting up IPC listeners for area-selection-complete and area-selection-cancelled')
    ipcMain.once('area-selection-complete', this.completeHandler)
    ipcMain.once('area-selection-cancelled', this.cancelHandler)

    // Handle load failures
    for (const overlayWindow of this.overlayWindows) {
      overlayWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
        console.error('[AreaSelection] Failed to load:', { errorCode, errorDescription, validatedURL })
        if (!this.selectionResolved) {
          this.selectionResolved = true
          this.resolvePromise?.({
            success: false,
            error: `Failed to load area selection: ${errorDescription}`
          })
        }
        this.cleanup()
      })

      overlayWindow.webContents.on('did-finish-load', () => {
        console.log('[AreaSelection] Content loaded successfully')
        // Focus the webContents to ensure it receives keyboard events
        overlayWindow?.webContents.focus()
      })

      // Handle window being closed directly (e.g., by user or system)
      overlayWindow.on('closed', () => {
        // If closed without completion, resolve as cancelled
        if (this.resolvePromise && !this.selectionResolved) {
          console.log('[AreaSelection] Window closed without selection')
          this.selectionResolved = true
          this.resolvePromise({ success: false, cancelled: true })
          this.resolvePromise = null
        }
        if (!this.selectionResolved) {
          this.cleanup()
          return
        }
        this.removeListeners()
      })
    }
  }

  /**
   * Loads the area selection React component.
   */
  private loadContent(): void {
    if (!this.overlayWindows.length) return

    const url = getAppURL('/area-selection')
    console.log('[AreaSelection] Loading URL:', url)

    for (const overlayWindow of this.overlayWindows) {
      overlayWindow.loadURL(url)

      // Show and focus when ready
      overlayWindow.once('ready-to-show', () => {
        console.log('[AreaSelection] Window ready to show')
        overlayWindow?.show()
        overlayWindow?.focus()
      })
    }
  }

  /**
   * Removes IPC listeners if they haven't already been removed.
   */
  private removeListeners(): void {
    if (this.completeHandler) {
      ipcMain.removeListener('area-selection-complete', this.completeHandler)
      this.completeHandler = null
    }
    if (this.cancelHandler) {
      ipcMain.removeListener('area-selection-cancelled', this.cancelHandler)
      this.cancelHandler = null
    }
  }

  /**
   * Cleans up the overlay window and listeners.
   */
  private cleanup(): void {
    this.removeListeners()

    for (const overlayWindow of this.overlayWindows) {
      if (!overlayWindow.isDestroyed()) {
        overlayWindow.close()
      }
    }

    this.overlayWindows = []
    this.resolvePromise = null
  }
}

// Export singleton instance
export const areaSelectionService = new AreaSelectionService()
