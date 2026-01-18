import { app, BrowserWindow } from 'electron'
import { getAppURL } from '../config'
import { createMainWindow } from './main-window'
import { hideMonitorOverlay } from './monitor-overlay'

function sendToMainWindow(channel: string, data?: unknown): void {
  if (!global.mainWindow) return
  const webContents = global.mainWindow.webContents
  if (webContents.isLoadingMainFrame()) {
    webContents.once('did-finish-load', () => {
      webContents.send(channel, data)
    })
    return
  }
  webContents.send(channel, data)
}

function shouldPreventCloseToHide(): boolean {
  if (process.platform !== 'darwin') return false
  return !Boolean((app as any).__bokehIsQuitting)
}

function ensureMainWindowCloseHidesToRecorder(window: BrowserWindow): void {
  if ((window as any).__bokehCloseToHideInstalled) return
  ;(window as any).__bokehCloseToHideInstalled = true

  window.on('close', (event) => {
    if (!shouldPreventCloseToHide()) return
    event.preventDefault()
    window.hide()
    if (global.recordButton && !global.recordButton.isDestroyed()) {
      global.recordButton.show()
    }
  })
}

export function openWorkspaceWindow(options?: { openSettings?: boolean; projectPath?: string }): void {
  try {
    console.log('[WorkspaceWindow] Opening workspace...', options)

    hideMonitorOverlay()

    const openSettings = options?.openSettings ?? false
    const projectPath = options?.projectPath

    if (!global.mainWindow) {
      console.log('[WorkspaceWindow] Creating new main window')
      global.mainWindow = createMainWindow()
      ensureMainWindowCloseHidesToRecorder(global.mainWindow)

      const url = getAppURL()
      console.log('[WorkspaceWindow] Loading URL:', url)
      global.mainWindow.loadURL(url)

      global.mainWindow.once('ready-to-show', () => {
        console.log('[WorkspaceWindow] Main window ready to show - waiting for renderer signal')
        if (!global.mainWindow) return
        if (process.platform === 'darwin') {
          try {
            global.mainWindow.setBackgroundColor('#00000000')
          } catch { }
        }

        // Don't show immediately - wait for renderer to signal it's ready
        // This allows the renderer to set vibrancy before the window becomes visible
        // Fallback: show after 500ms if renderer doesn't signal (shouldn't happen)
        const showTimeout = setTimeout(() => {
          if (global.mainWindow && !global.mainWindow.isVisible()) {
            console.log('[WorkspaceWindow] Fallback: showing window after timeout')
            global.mainWindow.show()
            global.mainWindow.focus()
          }
        }, 500)

        // Clear timeout if window is shown by renderer signal
        global.mainWindow.once('show', () => {
          clearTimeout(showTimeout)
        })

        // Send project path if provided, otherwise refresh library
        if (projectPath) {
          sendToMainWindow('open-project-from-path', projectPath)
        } else {
          global.mainWindow.webContents.send('refresh-library')
        }

        if (openSettings) sendToMainWindow('open-settings-dialog')
        if (global.recordButton) global.recordButton.hide()
      })

      global.mainWindow.on('closed', () => {
        console.log('[WorkspaceWindow] Main window closed')
        global.mainWindow = null
        if (global.recordButton && !global.recordButton.isDestroyed()) {
          global.recordButton.show()
        }
      })
    } else {
      console.log('[WorkspaceWindow] Showing existing main window')
      hideMonitorOverlay()
      if (process.platform === 'darwin') {
        try {
          global.mainWindow.setBackgroundColor('#00000000')
        } catch { }
      }
      global.mainWindow.show()
      global.mainWindow.focus()

      // Send project path if provided, otherwise refresh library
      if (projectPath) {
        sendToMainWindow('open-project-from-path', projectPath)
      } else {
        global.mainWindow.webContents.send('refresh-library')
      }

      if (openSettings) sendToMainWindow('open-settings-dialog')
      if (global.recordButton) global.recordButton.hide()
    }
  } catch (error) {
    console.error('[WorkspaceWindow] Failed to open workspace:', error)
  }
}

