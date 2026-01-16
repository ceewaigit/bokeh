/**
 * IPC handlers for recording-related window management.
 * Handles countdown, recording overlays, and recording state.
 */

import { ipcMain, BrowserWindow, IpcMainInvokeEvent, globalShortcut } from 'electron'
import { createCountdownWindow, showCountdown } from '../windows/countdown-window'
import { showRecordingOverlay, hideRecordingOverlay, hideMonitorOverlay } from '../windows/monitor-overlay'

let countdownWindow: BrowserWindow | null = null
let countdownWindowDisplayId: number | undefined = undefined
let countdownEscapeRegistered = false

/**
 * Register global Escape shortcut to abort countdown.
 * Sends abort-countdown event to the record button window.
 */
function registerCountdownEscapeShortcut(): void {
  if (countdownEscapeRegistered) return

  try {
    globalShortcut.register('Escape', () => {
      console.log('[RecordingWindows] Global Escape pressed - sending abort-countdown')
      // Notify the record button window to abort countdown
      if (global.recordButton && !global.recordButton.isDestroyed()) {
        global.recordButton.webContents.send('abort-countdown')
      }
    })
    countdownEscapeRegistered = true
    console.log('[RecordingWindows] Registered global Escape shortcut for countdown')
  } catch (error) {
    console.error('[RecordingWindows] Failed to register Escape shortcut:', error)
  }
}

/**
 * Unregister global Escape shortcut when countdown ends.
 */
function unregisterCountdownEscapeShortcut(): void {
  if (!countdownEscapeRegistered) return

  try {
    globalShortcut.unregister('Escape')
    countdownEscapeRegistered = false
    console.log('[RecordingWindows] Unregistered global Escape shortcut')
  } catch (error) {
    console.error('[RecordingWindows] Failed to unregister Escape shortcut:', error)
  }
}

export function registerRecordingWindowHandlers(): void {
  // Set recording state - called by renderer when recording starts/stops
  ipcMain.handle('set-recording-state', (_event, isRecording: boolean) => {
    global.isRecordingActive = isRecording
    console.log('[RecordingWindows] Recording state set to:', isRecording)
    return { success: true }
  })

  ipcMain.handle('show-countdown', async (_event: IpcMainInvokeEvent, number: number, displayId?: number) => {
    // Hide any overlay when countdown starts
    hideMonitorOverlay()

    // Register Escape shortcut for countdown abort
    registerCountdownEscapeShortcut()

    const needsNewWindow =
      !countdownWindow ||
      countdownWindow.isDestroyed() ||
      countdownWindowDisplayId !== displayId

    if (needsNewWindow) {
      if (countdownWindow && !countdownWindow.isDestroyed()) {
        countdownWindow.close()
      }
      countdownWindow = createCountdownWindow(displayId)
      countdownWindowDisplayId = displayId
    }

    if (!countdownWindow) {
      unregisterCountdownEscapeShortcut()
      return { success: false, error: 'Countdown window not available' }
    }

    await showCountdown(countdownWindow, number)
    return { success: true }
  })

  ipcMain.handle('hide-countdown', async () => {
    // Unregister Escape shortcut when countdown ends
    unregisterCountdownEscapeShortcut()

    if (countdownWindow) {
      if (!countdownWindow.isDestroyed()) {
        countdownWindow.hide()
      }
    }
    return { success: true }
  })

  ipcMain.handle(
    'show-recording-overlay',
    async (
      _event,
      bounds: { x: number; y: number; width: number; height: number },
      label?: string,
      options?: { displayId?: number; relativeToDisplay?: boolean; mode?: 'full' | 'dots' | 'hidden' }
    ) => {
      try {
        showRecordingOverlay(bounds, label, options)
        return { success: true }
      } catch (error) {
        console.error('[RecordingWindows] Failed to show recording overlay:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('hide-recording-overlay', async () => {
    try {
      hideRecordingOverlay()
      return { success: true }
    } catch (error) {
      console.error('[RecordingWindows] Failed to hide recording overlay:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}
