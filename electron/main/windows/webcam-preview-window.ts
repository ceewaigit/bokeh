/**
 * Webcam Preview Window
 * 
 * Floating window showing live webcam feed during recording.
 * Appears in bottom right corner, draggable, always on top.
 */

import { BrowserWindow, screen } from 'electron'
import { getAppURL } from '../config'

let webcamPreviewWindow: BrowserWindow | null = null

export function showWebcamPreview(deviceId: string): void {
    if (webcamPreviewWindow && !webcamPreviewWindow.isDestroyed()) {
        webcamPreviewWindow.show()
        webcamPreviewWindow.webContents.send('set-device', deviceId)
        return
    }

    const display = screen.getPrimaryDisplay()
    const size = 200
    const margin = 20

    webcamPreviewWindow = new BrowserWindow({
        width: size,
        height: size,
        x: display.workAreaSize.width - size - margin,
        y: display.workAreaSize.height - size - margin,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: true,
        movable: true,
        skipTaskbar: true,
        hasShadow: true,
        webPreferences: {
            preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    webcamPreviewWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    webcamPreviewWindow.setAspectRatio(1) // Keep it square

    const url = getAppURL(`/webcam-preview?deviceId=${encodeURIComponent(deviceId)}`)
    console.log('[WebcamPreview] Loading URL:', url)
    webcamPreviewWindow.loadURL(url)

    webcamPreviewWindow.on('closed', () => {
        webcamPreviewWindow = null
    })
}

export function hideWebcamPreview(): void {
    if (webcamPreviewWindow && !webcamPreviewWindow.isDestroyed()) {
        webcamPreviewWindow.close()
        webcamPreviewWindow = null
    }
}

export function isWebcamPreviewVisible(): boolean {
    return webcamPreviewWindow !== null && !webcamPreviewWindow.isDestroyed() && webcamPreviewWindow.isVisible()
}
