import { BrowserWindow, screen, Display } from 'electron'
import * as path from 'path'

let overlayWindow: BrowserWindow | null = null
let recordingOverlayWindow: BrowserWindow | null = null

function resolveTargetDisplay(displayId?: number): Display {
  const displays = screen.getAllDisplays()
  if (typeof displayId === 'number') {
    let target = displays.find(d => d.id === displayId)
    if (!target) {
      if (displayId >= 0 && displayId < displays.length) {
        target = displays[displayId]
      } else if (displayId > 0 && displayId - 1 < displays.length) {
        target = displays[displayId - 1]
      }
    }
    if (target) {
      return target
    }
    console.warn(`[MonitorOverlay] Display ID ${displayId} not found; falling back to primary display.`)
  }
  return screen.getPrimaryDisplay()
}

export function createMonitorOverlay(displayId?: number): BrowserWindow {
  // Get the target display
  const targetDisplay = resolveTargetDisplay(displayId)

  // Destroy existing overlay if any
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }

  // Use workArea instead of bounds to account for macOS menu bar and dock
  const workArea = targetDisplay.workArea

  // Create overlay window covering the available work area
  overlayWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY || path.join(__dirname, '../../preload.js')
    }
  })

  // Make it ignore mouse events so user can still interact with screen
  overlayWindow.setIgnoreMouseEvents(true)
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1000)

  return overlayWindow
}

/**
 * Create an overlay that matches specific window bounds
 */
export function showWindowBoundsOverlay(
  bounds: { x: number; y: number; width: number; height: number },
  windowName: string
): void {
  // Destroy existing overlay if any
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }

  // Create overlay window matching the window bounds
  overlayWindow = new BrowserWindow({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY || path.join(__dirname, '../../preload.js')
    }
  })

  // Make it ignore mouse events so user can still interact
  overlayWindow.setIgnoreMouseEvents(true)
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1000)

  // Window-specific overlay HTML
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          background: transparent;
          height: 100vh;
          width: 100vw;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
          user-select: none;
          overflow: hidden;
        }
        
        .border-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          animation: fadeIn 0.3s ease-out;
        }
        
        .border-overlay::before {
          content: '';
          position: absolute;
          inset: 4px;
          border: 2px solid rgba(99, 102, 241, 0.8);
          border-radius: 8px;
          background: rgba(99, 102, 241, 0.05);
          box-shadow: 
            0 0 0 1px rgba(255, 255, 255, 0.1) inset,
            0 4px 20px rgba(99, 102, 241, 0.2);
        }
        
        .status-indicator {
          position: absolute;
          top: 12px;
          left: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.85);
          padding: 6px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          animation: slideDown 0.4s ease-out;
        }
        
        .status-dot {
          width: 5px;
          height: 5px;
          background: #10b981;
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }
        
        .status-text {
          color: rgba(255, 255, 255, 0.95);
          font-size: 11px;
          font-weight: 500;
        }
        
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        
        .fade-out {
          animation: fadeOut 0.5s ease-out forwards;
        }
      </style>
    </head>
    <body>
      <div class="border-overlay"></div>
      <div class="status-indicator">
        <div class="status-dot"></div>
        <div class="status-text">${windowName}</div>
      </div>
      <script>
        // Auto-hide after 2 seconds
        setTimeout(() => {
          document.body.classList.add('fade-out');
        }, 2000);
      </script>
    </body>
    </html>
  `

  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  overlayWindow.show()

  // Auto-close the overlay after 2.5 seconds (after fade animation)
  setTimeout(() => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close()
      overlayWindow = null
    }
  }, 2500)
}

export function showMonitorOverlay(displayId?: number, customLabel?: string): void {
  const overlay = createMonitorOverlay(displayId)

  // Get display info for the overlay
  const targetDisplay = resolveTargetDisplay(displayId)

  const displayName = customLabel || getDisplayName(targetDisplay)
  const statusText = customLabel ? 'Ready to Record' : 'Ready to Record'

  // Glassmorphic overlay HTML with beautiful design
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { 
          margin: 0; 
          padding: 0; 
          box-sizing: border-box;
        }
        html, body {
          background: transparent;
          height: 100vh;
          width: 100vw;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
          user-select: none;
          -webkit-user-select: none;
          overflow: hidden;
          position: relative;
        }
        
        /* Minimal glassmorphic border */
        .border-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        /* Clean, minimal border design */
        .border-overlay::before {
          content: '';
          position: absolute;
          inset: 8px;
          border: 1.5px solid rgba(255, 255, 255, 0.25);
          border-radius: 12px;
          background: linear-gradient(135deg, 
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0.03) 100%);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          box-shadow: 
            0 0 0 1px rgba(255, 255, 255, 0.15) inset,
            0 8px 32px rgba(0, 0, 0, 0.25),
            0 4px 16px rgba(0, 0, 0, 0.1);
        }
        
        /* Subtle corner indicators */
        .corner {
          position: absolute;
          width: 20px;
          height: 20px;
          border: 2px solid rgba(99, 102, 241, 0.8);
          background: rgba(99, 102, 241, 0.15);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }
        
        .corner.top-left {
          top: 6px;
          left: 6px;
          border-right: none;
          border-bottom: none;
          border-top-left-radius: 8px;
        }
        
        .corner.top-right {
          top: 6px;
          right: 6px;
          border-left: none;
          border-bottom: none;
          border-top-right-radius: 8px;
        }
        
        .corner.bottom-left {
          bottom: 6px;
          left: 6px;
          border-right: none;
          border-top: none;
          border-bottom-left-radius: 8px;
        }
        
        .corner.bottom-right {
          bottom: 6px;
          right: 6px;
          border-left: none;
          border-top: none;
          border-bottom-right-radius: 8px;
        }
        
        /* Clean status indicator - positioned in top-left */
        .status-indicator {
          position: absolute;
          top: 16px;
          left: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          padding: 8px 16px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          animation: slideDown 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .status-dot {
          width: 6px;
          height: 6px;
          background: #10b981;
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
        }
        
        .status-text {
          color: rgba(255, 255, 255, 0.95);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.2px;
        }
        
        /* Minimal center label */
        .label-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 10;
          animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .label {
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          padding: 12px 24px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 
            0 4px 24px rgba(0, 0, 0, 0.3),
            0 0 0 0.5px rgba(255, 255, 255, 0.1) inset;
        }
        
        .label-text {
          color: rgba(255, 255, 255, 0.95);
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.3px;
          text-align: center;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideDown {
          from { 
            opacity: 0;
            transform: translateY(-8px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeInUp {
          from { 
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to { 
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
        
        @keyframes pulse {
          0%, 100% { 
            opacity: 1;
            transform: scale(1);
          }
          50% { 
            opacity: 0.6;
            transform: scale(1.2);
          }
        }
      </style>
    </head>
    <body>
      <div class="border-overlay">
        <!-- Minimal corner indicators -->
        <div class="corner top-left"></div>
        <div class="corner top-right"></div>
        <div class="corner bottom-left"></div>
        <div class="corner bottom-right"></div>
      </div>
      
      <div class="status-indicator">
        <div class="status-dot"></div>
        <div class="status-text">${statusText}</div>
      </div>
      
      <div class="label-container">
        <div class="label">
          <div class="label-text">${displayName}</div>
        </div>
      </div>
    </body>
    </html>
  `

  overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  overlay.show()
}

export function hideMonitorOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }
}

export function showRecordingOverlay(bounds: { x: number; y: number; width: number; height: number }, label: string = 'Recording'): void {
  if (recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
    recordingOverlayWindow.close()
    recordingOverlayWindow = null
  }

  recordingOverlayWindow = new BrowserWindow({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY || path.join(__dirname, '../../preload.js')
    }
  })

  recordingOverlayWindow.setIgnoreMouseEvents(true)
  recordingOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  recordingOverlayWindow.setAlwaysOnTop(true, 'screen-saver', 1000)
  recordingOverlayWindow.setContentProtection(true)

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          background: transparent;
          height: 100vh;
          width: 100vw;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
          user-select: none;
          -webkit-user-select: none;
          overflow: hidden;
        }
        .frame {
          position: absolute;
          inset: 0;
          border: 2px solid rgba(239, 68, 68, 0.9);
          border-radius: 6px;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.15) inset,
            0 8px 24px rgba(239, 68, 68, 0.25);
        }
        .label {
          position: absolute;
          top: 10px;
          left: 10px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.75);
          color: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 14px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.2px;
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.8);
          animation: pulse 1.6s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.15); }
        }
      </style>
    </head>
    <body>
      <div class="frame"></div>
      <div class="label"><span class="dot"></span>${label}</div>
    </body>
    </html>
  `

  recordingOverlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  recordingOverlayWindow.show()
}

export function hideRecordingOverlay(): void {
  if (recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
    recordingOverlayWindow.close()
    recordingOverlayWindow = null
  }
}

function getDisplayName(display: Display | undefined): string {
  if (!display) return 'Unknown Display'

  // Check if this is the primary display
  if (display.id === screen.getPrimaryDisplay().id) {
    return 'Primary Display'
  }

  // For other displays, use a more descriptive name
  const allDisplays = screen.getAllDisplays()
  const displayIndex = allDisplays.findIndex(d => d.id === display.id)

  if (displayIndex >= 0) {
    return `Display ${displayIndex + 1}`
  }

  return display.label || `Display ${display.id}`
}
