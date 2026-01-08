import { ipcMain, BrowserWindow, IpcMainInvokeEvent, app, desktopCapturer } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createMainWindow } from '../windows/main-window'
import { getAppURL } from '../config'
import { createCountdownWindow, showCountdown } from '../windows/countdown-window'
import { showMonitorOverlay, hideMonitorOverlay, showRecordingOverlay, hideRecordingOverlay } from '../windows/monitor-overlay'
import { showTeleprompterWindow, hideTeleprompterWindow, toggleTeleprompterWindow } from '../windows/teleprompter-window'

const execAsync = promisify(exec)
let countdownWindow: BrowserWindow | null = null
// Track if we hid desktop icons so we can restore them
let desktopIconsHiddenByApp = false
// Cache for source information
const sourceCache = new Map<string, { name: string; type: string }>()

// Helper to update source cache
async function updateSourceCache() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 1, height: 1 }
    })

    sourceCache.clear()
    sources.forEach(source => {
      sourceCache.set(source.id, {
        name: source.name,
        type: source.id.startsWith('screen:') ? 'screen' : 'window'
      })
    })
  } catch (error) {
    console.error('[WindowControls] Failed to update source cache:', error)
  }
}

function sendToMainWindow(channel: string): void {
  if (!global.mainWindow) return
  const webContents = global.mainWindow.webContents
  if (webContents.isLoadingMainFrame()) {
    webContents.once('did-finish-load', () => {
      webContents.send(channel)
    })
    return
  }
  webContents.send(channel)
}

function openWorkspaceWindow(options?: { openSettings?: boolean }): void {
  try {
    console.log('[WindowControls] Opening workspace...')

    // Hide any overlay when opening workspace
    hideMonitorOverlay()

    const openSettings = options?.openSettings ?? false

    if (!global.mainWindow) {
      console.log('[WindowControls] Creating new main window')
      global.mainWindow = createMainWindow()

      const url = getAppURL()
      console.log('[WindowControls] Loading URL:', url)
      global.mainWindow.loadURL(url)

      global.mainWindow.once('ready-to-show', () => {
        console.log('[WindowControls] Main window ready to show')
        if (global.mainWindow) {
          if (process.platform === 'darwin') {
            try {
              global.mainWindow.setBackgroundColor('#00000000')
            } catch { }
          }
          global.mainWindow.show()
          global.mainWindow.focus()
          global.mainWindow.webContents.send('refresh-library')
          if (openSettings) {
            sendToMainWindow('open-settings-dialog')
          }
          // Hide record button when main window is shown
          if (global.recordButton) {
            global.recordButton.hide()
          }
        }
      })

      global.mainWindow.on('closed', () => {
        console.log('[WindowControls] Main window closed')
        global.mainWindow = null
        // Show record button when main window is closed
        if (global.recordButton && !global.recordButton.isDestroyed()) {
          global.recordButton.show()
        }
      })
    } else {
      console.log('[WindowControls] Showing existing main window')
      // Hide any overlay when showing existing main window
      hideMonitorOverlay()
      if (process.platform === 'darwin') {
        try {
          global.mainWindow.setBackgroundColor('#00000000')
        } catch { }
      }
      global.mainWindow.show()
      global.mainWindow.focus()
      global.mainWindow.webContents.send('refresh-library')
      if (openSettings) {
        sendToMainWindow('open-settings-dialog')
      }
      // Hide record button when main window is shown
      if (global.recordButton) {
        global.recordButton.hide()
      }
    }
  } catch (error) {
    console.error('[WindowControls] Failed to open workspace:', error)
  }
}

export function registerWindowControlHandlers(): void {
  // Handle opening workspace - using ipcMain.on for send/receive pattern
  ipcMain.on('open-workspace', () => {
    openWorkspaceWindow()
  })

  ipcMain.on('open-workspace-settings', () => {
    openWorkspaceWindow({ openSettings: true })
  })

  // Set recording state - called by renderer when recording starts/stops
  ipcMain.handle('set-recording-state', (_event, isRecording: boolean) => {
    global.isRecordingActive = isRecording
    console.log('[WindowControls] Recording state set to:', isRecording)
    return { success: true }
  })

  ipcMain.handle('minimize-record-button', () => {
    // Hide any overlay when minimizing record button
    hideMonitorOverlay()
    // Hide record button
    if (global.recordButton) {
      global.recordButton.hide()
    }
    // Only show main window if NOT actively recording
    if (global.mainWindow && !global.isRecordingActive) {
      global.mainWindow.show()
      global.mainWindow.focus()
    }
  })

  ipcMain.handle('show-record-button', (_event, options?: { hideMainWindow?: boolean }) => {
    // Show record button
    if (global.recordButton) {
      global.recordButton.show()
    }

    // Handle main window visibility based on includeAppWindows setting
    // Note: The actual window visibility in screen recordings is controlled by
    // the includeAppWindows option passed to the native recorder, not by this handler.
    // This handler just controls whether the window is shown/hidden in the UI.
    const shouldHide = options?.hideMainWindow !== false

    if (shouldHide) {
      if (global.mainWindow) {
        global.mainWindow.hide()
      }
    } else {
      // Include App Windows mode: keep the main window visible
      if (global.mainWindow) {
        if (global.mainWindow.isMinimized()) {
          global.mainWindow.restore()
        }
        global.mainWindow.show()
      }
    }
  })

  ipcMain.handle('get-main-window-id', () => {
    return global.mainWindow?.id
  })

  // Dynamic content-based sizing
  ipcMain.handle('set-window-content-size', (event: IpcMainInvokeEvent, dimensions: { width: number; height: number }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window && dimensions.width > 0 && dimensions.height > 0) {
      const { screen } = require('electron')
      const display = screen.getPrimaryDisplay()

      // Set size constraints
      window.setMinimumSize(dimensions.width, dimensions.height)
      window.setMaximumSize(dimensions.width, dimensions.height)

      // Position: centered X, anchored to bottom of screen
      const newX = Math.floor(display.workAreaSize.width / 2 - dimensions.width / 2)
      // Keep 24px gap from bottom edge of work area
      const newY = display.workAreaSize.height - dimensions.height - 24

      window.setBounds({
        x: newX,
        y: newY,
        width: Math.round(dimensions.width),
        height: Math.round(dimensions.height)
      }, true)

      window.setResizable(false)
      return { success: true }
    }
    return { success: false }
  })

  // Glassmorphism handlers removed (feature disabled).

  ipcMain.handle('show-countdown', async (event: IpcMainInvokeEvent, number: number, displayId?: number) => {
    // Hide any overlay when countdown starts
    hideMonitorOverlay()

    if (countdownWindow) {
      countdownWindow.close()
      countdownWindow = null
    }
    countdownWindow = createCountdownWindow(displayId)
    showCountdown(countdownWindow, number)
    return { success: true }
  })

  ipcMain.handle('hide-countdown', async () => {
    if (countdownWindow) {
      countdownWindow.hide()
      countdownWindow.close()
      countdownWindow = null
    }
    return { success: true }
  })

  // Monitor overlay handlers
  ipcMain.handle('show-monitor-overlay', async (event: IpcMainInvokeEvent, displayId?: number) => {
    try {
      showMonitorOverlay(displayId)
      return { success: true }
    } catch (error) {
      console.error('[WindowControls] Failed to show monitor overlay:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('show-window-overlay', async (event: IpcMainInvokeEvent, windowId: string) => {
    try {
      // Update source cache to get latest window information
      await updateSourceCache()

      // Get the window source information
      const sourceInfo = sourceCache.get(windowId)

      if (sourceInfo && sourceInfo.name) {
        try {
          const { getWindowBoundsForSource, bringAppToFront, isWindowAvailable } = await import('../native/window-bounds')
          const { showWindowBoundsOverlay } = await import('../windows/monitor-overlay')

          // Extract app name from source name (e.g., "Spotify - Song Title" -> "Spotify")
          const appName = sourceInfo.name.split(' - ')[0].split(' — ')[0].trim()

          // Check if window is still available (not closed)
          const available = await isWindowAvailable(sourceInfo.name)
          if (!available) {
            console.warn('[WindowControls] Window not available (may be closed or minimized)')
            // Still show overlay on primary display as fallback
            showMonitorOverlay(undefined, `${appName} (Window unavailable)`)
            return { success: true, warning: 'Window not available' }
          }

          // Bring the app to front FIRST
          await bringAppToFront(appName)

          // Wait a brief moment for the window to come to front
          await new Promise(resolve => setTimeout(resolve, 100))

          // Now get the updated window bounds
          const windowBounds = await getWindowBoundsForSource(sourceInfo.name)

          if (windowBounds) {
            // Show overlay positioned exactly on the window
            showWindowBoundsOverlay(
              { x: windowBounds.x, y: windowBounds.y, width: windowBounds.width, height: windowBounds.height },
              appName
            )
            return { success: true }
          }
        } catch (err) {
          console.warn('[WindowControls] Failed to get window bounds:', err)
        }
      }

      // Fallback to showing overlay on primary display if window bounds not available
      showMonitorOverlay(undefined, sourceInfo?.name || 'Application')

      return { success: true }
    } catch (error) {
      console.error('[WindowControls] Failed to show window overlay:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('hide-monitor-overlay', async () => {
    try {
      hideMonitorOverlay()
      return { success: true }
    } catch (error) {
      console.error('[WindowControls] Failed to hide monitor overlay:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'show-recording-overlay',
    async (
      _event,
      bounds: { x: number; y: number; width: number; height: number },
      label?: string,
      options?: { displayId?: number; relativeToDisplay?: boolean }
    ) => {
      try {
        showRecordingOverlay(bounds, label, options)
        return { success: true }
      } catch (error) {
        console.error('[WindowControls] Failed to show recording overlay:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('hide-recording-overlay', async () => {
    try {
      hideRecordingOverlay()
      return { success: true }
    } catch (error) {
      console.error('[WindowControls] Failed to hide recording overlay:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Teleprompter window handlers
  ipcMain.handle('toggle-teleprompter-window', async () => {
    try {
      const isVisible = toggleTeleprompterWindow()
      return { success: true, isVisible }
    } catch (error) {
      console.error('[WindowControls] Failed to toggle teleprompter:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('show-teleprompter-window', async () => {
    try {
      showTeleprompterWindow()
      return { success: true }
    } catch (error) {
      console.error('[WindowControls] Failed to show teleprompter:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('hide-teleprompter-window', async () => {
    try {
      hideTeleprompterWindow()
      return { success: true }
    } catch (error) {
      console.error('[WindowControls] Failed to hide teleprompter:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Desktop icons and widgets visibility handlers (macOS only)
  ipcMain.handle('hide-desktop-icons', async () => {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'Only supported on macOS' }
    }

    try {
      // Hide desktop icons by setting CreateDesktop to false
      await execAsync('defaults write com.apple.finder CreateDesktop false')

      // Hide desktop widgets (macOS Sonoma+)
      await execAsync('defaults write com.apple.WindowManager StandardHideWidgets -bool true')
      await execAsync('defaults write com.apple.WindowManager StageManagerHideWidgets -bool true')

      // Close all Finder windows first to prevent them from reopening
      await execAsync('osascript -e \'tell application "Finder" to close every window\'').catch(() => { })

      // Restart Finder and Dock to apply changes
      await execAsync('killall Finder')
      await execAsync('killall Dock')

      desktopIconsHiddenByApp = true
      console.log('[WindowControls] Desktop icons and widgets hidden')
      return { success: true }
    } catch (error) {
      console.error('[WindowControls] Failed to hide desktop icons/widgets:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('show-desktop-icons', async () => {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'Only supported on macOS' }
    }

    try {
      // Show desktop icons by setting CreateDesktop to true
      await execAsync('defaults write com.apple.finder CreateDesktop true')

      // Show desktop widgets (macOS Sonoma+)
      await execAsync('defaults write com.apple.WindowManager StandardHideWidgets -bool false')
      await execAsync('defaults write com.apple.WindowManager StageManagerHideWidgets -bool false')

      // Close all Finder windows first to prevent them from reopening
      await execAsync('osascript -e \'tell application "Finder" to close every window\'').catch(() => { })

      // Restart Finder and Dock to apply changes
      await execAsync('killall Finder')
      await execAsync('killall Dock')

      desktopIconsHiddenByApp = false
      console.log('[WindowControls] Desktop icons and widgets shown')
      return { success: true }
    } catch (error) {
      console.error('[WindowControls] Failed to show desktop icons/widgets:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Restore desktop icons and widgets when the app quits (if we hid them)
  app.on('before-quit', async () => {
    if (desktopIconsHiddenByApp) {
      try {
        await execAsync('defaults write com.apple.finder CreateDesktop true')
        await execAsync('defaults write com.apple.WindowManager StandardHideWidgets -bool false')
        await execAsync('defaults write com.apple.WindowManager StageManagerHideWidgets -bool false')
        await execAsync('osascript -e \'tell application "Finder" to close every window\'').catch(() => { })
        await execAsync('killall Finder')
        await execAsync('killall Dock')
        console.log('[WindowControls] Desktop icons and widgets restored on app quit')
      } catch (error) {
        console.error('[WindowControls] Failed to restore desktop icons/widgets on quit:', error)
      }
    }
  })
}
