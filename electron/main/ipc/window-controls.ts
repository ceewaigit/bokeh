/**
 * IPC handlers for core window control operations.
 * Handles titlebar actions, window sizing, and workspace navigation.
 */

import { ipcMain, BrowserWindow, IpcMainInvokeEvent, systemPreferences } from 'electron'
import { hideMonitorOverlay } from '../windows/monitor-overlay'
import { openWorkspaceWindow } from '../windows/workspace-window'

export function registerWindowControlHandlers(): void {
  ipcMain.on('titlebar-double-click', (event) => {
    if (process.platform !== 'darwin') return
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return

    const action = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string')
    if (action === 'Minimize') {
      window.minimize()
      return
    }

    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })

  // Handle opening workspace - using ipcMain.on for send/receive pattern
  ipcMain.on('open-workspace', () => {
    openWorkspaceWindow()
  })

  ipcMain.on('open-workspace-settings', () => {
    openWorkspaceWindow({ openSettings: true })
  })

  ipcMain.handle('minimize-record-button', () => {
    // Hide any overlay when minimizing record button
    hideMonitorOverlay()
    // Hide record button
    if (global.recordButton) {
      global.recordButton.hide()
    }
    return { success: true }
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
      const currentBounds = window.getBounds()
      const newWidth = Math.round(dimensions.width)
      const newHeight = Math.round(dimensions.height)

      if (newWidth === currentBounds.width && newHeight === currentBounds.height) {
        return { success: true }
      }

      // Calculate height difference to anchor bottom edge
      // When expanding (picker appears), move window UP by the difference
      // When collapsing (picker closes), move window DOWN
      const heightDiff = newHeight - currentBounds.height

      const isRecordButton = !!global.recordButton && window.id === global.recordButton.id

      // Anchor to bottom edge and preserve center (until user drags).
      const currentCenterX = currentBounds.x + currentBounds.width / 2
      const userMoved = isRecordButton ? Boolean((window as any).__bokehUserMoved) : true
      const newX = (isRecordButton && !userMoved)
        ? Math.round(currentCenterX - newWidth / 2)
        : currentBounds.x

      const newY = currentBounds.y - heightDiff

      // Resize with bottom-edge anchoring, preserve horizontal position
      if (isRecordButton) (window as any).__bokehBoundsUpdateInProgress = true
      try {
        window.setBounds({
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight
        }, false)
      } finally {
        if (isRecordButton) (window as any).__bokehBoundsUpdateInProgress = false
      }

      return { success: true }
    }
    return { success: false }
  })
}
