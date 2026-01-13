/**
 * IPC handlers for monitor and window overlay management.
 * Handles showing/hiding overlays that highlight capture areas.
 */

import { ipcMain, IpcMainInvokeEvent, desktopCapturer } from 'electron'
import { showMonitorOverlay, hideMonitorOverlay, showWindowBoundsOverlay } from '../windows/monitor-overlay'

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
    console.error('[OverlayWindows] Failed to update source cache:', error)
  }
}

export function registerOverlayWindowHandlers(): void {
  // Monitor overlay handlers
  ipcMain.handle('show-monitor-overlay', async (_event: IpcMainInvokeEvent, displayId?: number) => {
    try {
      showMonitorOverlay(displayId)
      return { success: true }
    } catch (error) {
      console.error('[OverlayWindows] Failed to show monitor overlay:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('show-window-overlay', async (_event: IpcMainInvokeEvent, windowId: string) => {
    try {
      // Update source cache to get latest window information
      await updateSourceCache()

      // Get the window source information
      const sourceInfo = sourceCache.get(windowId)

      if (sourceInfo && sourceInfo.name) {
        try {
          const { getWindowBoundsForSource, bringAppToFront, isWindowAvailable } = await import('../native/window-bounds')

          // Extract app name from source name (e.g., "Spotify - Song Title" -> "Spotify")
          const appName = sourceInfo.name.split(' - ')[0].split(' — ')[0].trim()

          // Check if window is still available (not closed)
          const available = await isWindowAvailable(sourceInfo.name)
          if (!available) {
            console.warn('[OverlayWindows] Window not available (may be closed or minimized)')
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
          console.warn('[OverlayWindows] Failed to get window bounds:', err)
        }
      }

      // Fallback to showing overlay on primary display if window bounds not available
      showMonitorOverlay(undefined, sourceInfo?.name || 'Application')

      return { success: true }
    } catch (error) {
      console.error('[OverlayWindows] Failed to show window overlay:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('hide-monitor-overlay', async () => {
    try {
      hideMonitorOverlay()
      return { success: true }
    } catch (error) {
      console.error('[OverlayWindows] Failed to hide monitor overlay:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}
