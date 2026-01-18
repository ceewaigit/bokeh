/**
 * IPC handlers for utility window management.
 * Handles teleprompter and webcam preview windows.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { showTeleprompterWindow, hideTeleprompterWindow, toggleTeleprompterWindow } from '../windows/teleprompter-window'
import { showWebcamPreview, hideWebcamPreview } from '../windows/webcam-preview-window'
import { assertTrustedIpcSender } from '../utils/ipc-security'

export function registerUtilityWindowHandlers(): void {
  // Teleprompter window handlers
  ipcMain.handle('toggle-teleprompter-window', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'toggle-teleprompter-window')
    try {
      const isVisible = toggleTeleprompterWindow()
      return { success: true, isVisible }
    } catch (error) {
      console.error('[UtilityWindows] Failed to toggle teleprompter:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('show-teleprompter-window', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'show-teleprompter-window')
    try {
      showTeleprompterWindow()
      return { success: true }
    } catch (error) {
      console.error('[UtilityWindows] Failed to show teleprompter:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('hide-teleprompter-window', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'hide-teleprompter-window')
    try {
      hideTeleprompterWindow()
      return { success: true }
    } catch (error) {
      console.error('[UtilityWindows] Failed to hide teleprompter:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Webcam preview window handlers
  ipcMain.handle('show-webcam-preview', async (event: IpcMainInvokeEvent, deviceId: string) => {
    assertTrustedIpcSender(event, 'show-webcam-preview')
    try {
      showWebcamPreview(deviceId)
      return { success: true }
    } catch (error) {
      console.error('[UtilityWindows] Failed to show webcam preview:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('hide-webcam-preview', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'hide-webcam-preview')
    try {
      hideWebcamPreview()
      return { success: true }
    } catch (error) {
      console.error('[UtilityWindows] Failed to hide webcam preview:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}
