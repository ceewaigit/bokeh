/**
 * IPC handlers for desktop capture source management.
 * Handles screen/window enumeration, permissions, and capture constraints.
 */

import { ipcMain, desktopCapturer, BrowserWindow, dialog, systemPreferences, screen, IpcMainInvokeEvent } from 'electron'
import { exec } from 'child_process'

interface DesktopSourceOptions {
  types?: string[]
  thumbnailSize?: { width: number; height: number }
}

interface MediaConstraints {
  audio: boolean | { mandatory: { chromeMediaSource: string; chromeMediaSourceId?: string } }
  video: {
    mandatory: {
      chromeMediaSource: string
      chromeMediaSourceId: string
    }
  }
}

export function registerSourceHandlers(): void {
  // Return constraints that work with all Electron versions
  ipcMain.handle('get-desktop-stream', async (_event: IpcMainInvokeEvent, sourceId: string, hasAudio: boolean = false): Promise<MediaConstraints> => {
    try {
      // For desktop audio capture, explicitly request 'desktop' as chromeMediaSource
      const audioConstraints = hasAudio
        ? {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        }
        : false

      const constraints: MediaConstraints = {
        audio: audioConstraints,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        }
      }

      console.log(`[Sources] Desktop stream constraints created - Audio: ${hasAudio}, Source: ${sourceId}`)
      return constraints
    } catch (error) {
      console.error('[Sources] Failed to create stream constraints:', error)
      throw error
    }
  })

  ipcMain.handle('get-desktop-sources', async (event: IpcMainInvokeEvent, options: DesktopSourceOptions = {}) => {
    try {
      // Check permissions on macOS
      if (process.platform === 'darwin') {
        const status = systemPreferences.getMediaAccessStatus('screen')

        if (status !== 'granted') {
          const parentWindow = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()

          if (parentWindow) {
            const result = await dialog.showMessageBox(parentWindow, {
              type: 'warning',
              title: 'Screen Recording Permission Required',
              message: 'Bokeh needs permission to record your screen.',
              detail: 'To enable screen recording:\n\n1. Open System Settings\n2. Go to Privacy & Security > Screen Recording\n3. Check the box next to Bokeh\n4. Restart Bokeh if needed\n\nClick "Open System Settings" to go there now.',
              buttons: ['Open System Preferences', 'Cancel'],
              defaultId: 0,
              cancelId: 1
            })

            if (result.response === 0) {
              exec('open x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
            }
          }

          const permissionError: any = new Error('Screen recording permission denied')
          permissionError.code = 'PERMISSION_DENIED'
          throw permissionError
        }
      }

      const types = options.types || ['screen', 'window']
      const thumbnailSize = options.thumbnailSize || { width: 150, height: 150 }

      try {
        const sources = await desktopCapturer.getSources({
          types: types as any,
          thumbnailSize: thumbnailSize,
          fetchWindowIcons: false
        })

        // Import window bounds helper dynamically
        const { getWindowBoundsForSource, getAllWindowBounds } = await import('../native/window-bounds')

        // Get all visible windows from native API (uses .optionOnScreenOnly)
        await getAllWindowBounds()
        // Get all displays for enhanced information
        const displays = screen.getAllDisplays()
        const primaryDisplay = screen.getPrimaryDisplay()

        // Filter and map the sources - be more lenient to capture Electron apps
        const filteredSources = sources.filter(source => {
          // Always keep screen sources
          if (source.id.startsWith('screen:')) {
            return true
          }

          // For window sources, include if it has a non-empty name from desktopCapturer
          // The desktopCapturer API already filters for visible windows
          // We only do light filtering here to catch obvious system windows
          const sourceName = source.name.toLowerCase()

          // Skip empty names
          if (!source.name.trim()) {
            console.log(`[Sources] Filtering out empty name window`)
            return false
          }

          // Skip obvious system UI elements that slip through
          const systemPatterns = ['menubar', 'menu bar', 'notification center', 'control center']
          if (systemPatterns.some(pattern => sourceName.includes(pattern))) {
            console.log(`[Sources] Filtering out system window: ${source.name}`)
            return false
          }

          return true
        })

        // Map the sources to our format with bounds information
        const mappedSources = await Promise.all(filteredSources.map(async source => {
          // Get window bounds for window sources
          let bounds = undefined
          let displayInfo = undefined

          if (source.id.startsWith('screen:')) {
            // For screen sources, get display information
            const screenIdMatch = source.id.match(/screen:(\d+):/)
            const screenId = screenIdMatch ? parseInt(screenIdMatch[1]) : undefined
            const rawDisplayId = typeof source.display_id === 'string' ? Number(source.display_id) : source.display_id

            let display =
              Number.isFinite(rawDisplayId) ? displays.find(d => d.id === rawDisplayId) : undefined

            if (!display && typeof screenId === 'number') {
              display = displays.find(d => d.id === screenId)
            }

            if (!display && typeof screenId === 'number') {
              if (screenId >= 0 && screenId < displays.length) {
                display = displays[screenId]
              } else if (screenId > 0 && screenId - 1 < displays.length) {
                display = displays[screenId - 1]
              }
            }

            if (display) {
              bounds = display.bounds
              displayInfo = {
                id: display.id,
                isPrimary: display.id === primaryDisplay.id,
                isInternal: display.internal,
                bounds: display.bounds,
                workArea: display.workArea,
                scaleFactor: display.scaleFactor
              }

              // Create better display names
              if (display.id === primaryDisplay.id) {
                source.name = 'Primary Display'
              } else if (display.internal) {
                source.name = 'Built-in Display'
              } else {
                const index = displays.findIndex(d => d.id === display.id)
                source.name = `Display ${index + 1}`
              }
            }
          } else {
            // For window sources
            bounds = await getWindowBoundsForSource(source.name)
          }

          return {
            id: source.id,
            name: source.name,
            display_id: source.display_id,
            thumbnail: source.thumbnail?.toDataURL() || undefined,
            bounds,
            displayInfo
          }
        }))

        if (mappedSources.length === 0) {
          throw new Error('No sources found. Please check screen recording permissions.')
        }

        return mappedSources
      } catch (captureError) {
        console.error('[Sources] desktopCapturer failed:', captureError)
        throw new Error('Failed to capture desktop sources. Please check screen recording permissions.')
      }

    } catch (error: any) {
      console.error('[Sources] Error getting desktop sources:', error)

      if (error?.message?.includes('Failed to get sources') || !error?.message) {
        const permissionError: any = new Error(
          'Screen recording permission required. Please go to System Preferences > Security & Privacy > Privacy > Screen Recording and enable access for this app.'
        )
        permissionError.code = 'PERMISSION_DENIED'
        throw permissionError
      }
      throw error
    }
  })

  ipcMain.handle('get-screens', async () => {
    return screen.getAllDisplays().map(display => ({
      id: display.id,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      internal: display.internal
    }))
  })

  // Get window bounds for a specific source
  ipcMain.handle('get-source-bounds', async (_event: IpcMainInvokeEvent, sourceId: string) => {
    try {
      // For screens, return the display bounds
      if (sourceId.startsWith('screen:')) {
        const screenIdMatch = sourceId.match(/screen:(\d+):/)
        if (screenIdMatch) {
          const screenId = parseInt(screenIdMatch[1])
          const allDisplays = screen.getAllDisplays()
          let display = allDisplays.find(d => d.id === screenId)
          if (!display) {
            if (screenId >= 0 && screenId < allDisplays.length) {
              display = allDisplays[screenId]
            } else if (screenId > 0 && screenId - 1 < allDisplays.length) {
              display = allDisplays[screenId - 1]
            }
          }
          if (display) {
            return {
              x: display.bounds.x,
              y: display.bounds.y,
              width: display.bounds.width,
              height: display.bounds.height
            }
          }
        }
      } else {
        // For windows, get the actual window bounds
        const sources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 1, height: 1 }
        })

        const source = sources.find(s => s.id === sourceId)
        if (source) {
          const { getWindowBoundsForSource } = await import('../native/window-bounds')
          const bounds = await getWindowBoundsForSource(source.name)
          if (bounds) {
            return {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height
            }
          }
        }
      }

      return null
    } catch (error) {
      console.error('[Sources] Failed to get source bounds:', error)
      return null
    }
  })

  ipcMain.handle('get-platform', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.getSystemVersion?.() || 'unknown'
    }
  })
}
