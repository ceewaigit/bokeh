/**
 * Native macOS window bounds detection using CGWindow APIs
 * This provides accurate window positions and sizes for proper recording
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  name: string
  ownerName: string
  windowId: number
}

/**
 * Get bounds for all windows using macOS CGWindow API
 */
export async function getAllWindowBounds(): Promise<WindowBounds[]> {
  try {
    // Use macOS's CGWindow API via a Swift/ObjC script
    // This gets accurate window positions for visible, user-facing windows only
    const script = `
import Cocoa
import CoreGraphics

// System apps and helper processes to exclude
let excludedApps: Set<String> = [
    "WindowServer", "Dock", "SystemUIServer", "Spotlight",
    "Control Center", "NotificationCenter", "loginwindow",
    "AirPlayUIAgent", "talagent", "universalaccessd",
    "ScreenCaptureKit", "screencapturekt", "screencaptured",
    "CoreServicesUIAgent", "System Preferences",
    "System Settings", "FolderActionsDispatcher", "launchservicesd"
]

let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []

for window in windows {
    // Get window layer - only include normal window layer (0)
    let windowLayer = window[kCGWindowLayer as String] as? Int ?? 0
    guard windowLayer == 0 else { continue }
    
    guard let name = window[kCGWindowName as String] as? String,
          !name.isEmpty,  // Must have a window name
          let ownerName = window[kCGWindowOwnerName as String] as? String,
          !ownerName.isEmpty,
          !excludedApps.contains(ownerName),  // Exclude system apps
          let windowId = window[kCGWindowNumber as String] as? Int,
          let bounds = window[kCGWindowBounds as String] as? [String: Any],
          let x = bounds["X"] as? CGFloat,
          let y = bounds["Y"] as? CGFloat,
          let width = bounds["Width"] as? CGFloat,
          let height = bounds["Height"] as? CGFloat,
          width > 50, height > 50  // Filter out small windows (reduced from 100)
    else { continue }
    
    print("\\(windowId)|\\(ownerName)|\\(name)|\\(Int(x))|\\(Int(y))|\\(Int(width))|\\(Int(height))")
}
`

    // Execute via swift command
    const { stdout } = await execAsync(`echo '${script}' | swift -`)

    const windows: WindowBounds[] = []
    const lines = stdout.trim().split('\n').filter(line => line.length > 0)

    for (const line of lines) {
      const [windowId, ownerName, name, x, y, width, height] = line.split('|')
      windows.push({
        windowId: parseInt(windowId),
        ownerName,
        name,
        x: parseInt(x),
        y: parseInt(y),
        width: parseInt(width),
        height: parseInt(height)
      })
    }

    return windows
  } catch (error) {
    console.error('Failed to get window bounds:', error)
    return []
  }
}

/**
 * Match Electron desktopCapturer source to actual window bounds
 * The source.name from desktopCapturer usually matches window title
 */
export async function getWindowBoundsForSource(sourceName: string): Promise<WindowBounds | null> {
  const allWindows = await getAllWindowBounds()

  // Try exact match first
  let match = allWindows.find(w => w.name === sourceName)

  // If no exact match, try to match by owner name (app name)
  if (!match) {
    match = allWindows.find(w =>
      sourceName.includes(w.ownerName) ||
      w.ownerName.includes(sourceName.split(' - ')[0])
    )
  }

  return match || null
}

/**
 * Bring an application window to the front using AppleScript
 * @param appName - The application name (e.g., "Spotify", "Safari")
 */
export async function bringAppToFront(appName: string): Promise<boolean> {
  try {
    // First, try to find the exact owner name from visible windows
    const visibleWindows = await getAllWindowBounds()

    // Find a window that matches this app name
    const matchingWindow = visibleWindows.find(w =>
      w.ownerName === appName ||
      w.ownerName.toLowerCase() === appName.toLowerCase() ||
      w.name.startsWith(appName) ||
      appName.includes(w.ownerName)
    )

    // Use the actual owner name if found, otherwise use the provided name
    const actualAppName = matchingWindow?.ownerName || appName

    // Use AppleScript to activate the app and bring it to front
    const script = `
      tell application "${actualAppName}"
        activate
      end tell
    `
    await execAsync(`osascript -e '${script}'`)
    console.log(`[WindowBounds] Brought ${actualAppName} to front`)
    return true
  } catch (error) {
    // Fallback: try using System Events to bring the window to front by process name
    try {
      const script = `
        tell application "System Events"
          set frontmost of (first process whose name contains "${appName}") to true
        end tell
      `
      await execAsync(`osascript -e '${script}'`)
      console.log(`[WindowBounds] Brought ${appName} to front via System Events`)
      return true
    } catch (fallbackError) {
      console.warn(`[WindowBounds] Failed to bring ${appName} to front:`, error)
      return false
    }
  }
}

/**
 * Check if a window is currently visible (not minimized, not closed)
 * @param sourceName - The window/source name
 */
export async function isWindowAvailable(sourceName: string): Promise<boolean> {
  const bounds = await getWindowBoundsForSource(sourceName)
  return bounds !== null
}
