import { BrowserWindow, screen, Display } from 'electron'
import * as path from 'path'

let overlayWindow: BrowserWindow | null = null
let recordingOverlayWindow: BrowserWindow | null = null
const overlayCsp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; media-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"

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

  // Refined window overlay HTML - matching monitor overlay style
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Security-Policy" content="${overlayCsp}">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          background: transparent;
          height: 100vh;
          width: 100vw;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
          user-select: none;
          overflow: hidden;
        }
        
        /* Subtle gradient border */
        .frame {
          position: absolute;
          inset: 3px;
          border-radius: 6px;
          pointer-events: none;
          animation: fadeIn 0.15s ease-out;
        }
        
        .frame::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 6px;
          padding: 1.5px;
          background: linear-gradient(
            135deg,
            rgba(255,255,255,0.5) 0%,
            rgba(255,255,255,0.2) 50%,
            rgba(255,255,255,0.5) 100%
          );
          -webkit-mask: 
            linear-gradient(#fff 0 0) content-box, 
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }
        
        /* Elegant status pill */
        .status {
          position: absolute;
          top: 10px;
          left: 10px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          padding: 6px 12px;
          border-radius: 100px;
          border: 0.5px solid rgba(255, 255, 255, 0.1);
          animation: slideIn 0.15s ease-out;
          max-width: calc(100% - 20px);
        }
        
        .dot {
          width: 5px;
          height: 5px;
          background: #34d399;
          border-radius: 50%;
          flex-shrink: 0;
          box-shadow: 0 0 6px rgba(52, 211, 153, 0.5);
        }
        
        .label {
          color: rgba(255, 255, 255, 0.85);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: -0.1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-3px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        
        .fade-out {
          animation: fadeOut 0.3s ease-out forwards;
        }
      </style>
    </head>
    <body>
      <div class="frame"></div>
      <div class="status">
        <div class="dot"></div>
        <span class="label">${windowName}</span>
      </div>
      <script>
        setTimeout(() => document.body.classList.add('fade-out'), 2000);
      </script>
    </body>
    </html>
  `

  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  overlayWindow.show()

  // Auto-close after fade animation
  setTimeout(() => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close()
      overlayWindow = null
    }
  }, 2300)
}

export function showMonitorOverlay(displayId?: number, customLabel?: string): void {
  const overlay = createMonitorOverlay(displayId)

  // Get display info for the overlay
  const targetDisplay = resolveTargetDisplay(displayId)

  const displayName = customLabel || getDisplayName(targetDisplay)

  // Refined, artistic Apple-like overlay
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Security-Policy" content="${overlayCsp}">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          background: transparent;
          height: 100vh;
          width: 100vw;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
          user-select: none;
          overflow: hidden;
        }
        
        /* Subtle animated border */
        .frame {
          position: absolute;
          inset: 4px;
          border-radius: 8px;
          pointer-events: none;
          animation: fadeIn 0.15s ease-out;
        }
        
        .frame::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 8px;
          padding: 1.5px;
          background: linear-gradient(
            135deg,
            rgba(255,255,255,0.5) 0%,
            rgba(255,255,255,0.2) 50%,
            rgba(255,255,255,0.5) 100%
          );
          -webkit-mask: 
            linear-gradient(#fff 0 0) content-box, 
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }
        
        /* Elegant status pill */
        .status {
          position: absolute;
          top: 12px;
          left: 12px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          padding: 7px 14px;
          border-radius: 100px;
          border: 0.5px solid rgba(255, 255, 255, 0.1);
          animation: slideIn 0.15s ease-out;
        }
        
        .dot {
          width: 5px;
          height: 5px;
          background: #34d399;
          border-radius: 50%;
          box-shadow: 0 0 6px rgba(52, 211, 153, 0.5);
        }
        
        .label {
          color: rgba(255, 255, 255, 0.85);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: -0.1px;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-3px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      </style>
    </head>
    <body>
      <div class="frame"></div>
      <div class="status">
        <div class="dot"></div>
        <span class="label">${displayName}</span>
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

export function showRecordingOverlay(
  bounds: { x: number; y: number; width: number; height: number },
  label: string = 'Recording',
  options?: { displayId?: number; relativeToDisplay?: boolean; mode?: 'full' | 'dots' | 'hidden' }
): void {
  if (options?.mode === 'hidden') {
    hideRecordingOverlay()
    return
  }

  if (recordingOverlayWindow && !recordingOverlayWindow.isDestroyed()) {
    recordingOverlayWindow.close()
    recordingOverlayWindow = null
  }

  const resolvedBounds = (() => {
    if (!options?.relativeToDisplay) return bounds
    const targetDisplay = resolveTargetDisplay(options.displayId)
    return {
      x: bounds.x + targetDisplay.bounds.x,
      y: bounds.y + targetDisplay.bounds.y,
      width: bounds.width,
      height: bounds.height
    }
  })()

  recordingOverlayWindow = new BrowserWindow({
    x: Math.round(resolvedBounds.x),
    y: Math.round(resolvedBounds.y),
    width: Math.max(1, Math.round(resolvedBounds.width)),
    height: Math.max(1, Math.round(resolvedBounds.height)),
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

  const overlayMode = options?.mode ?? 'full'
  const showFrame = overlayMode === 'full'
  const pillText = overlayMode === 'dots' ? '&hellip;' : label

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Security-Policy" content="${overlayCsp}">
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
        .dots {
          font-size: 14px;
          line-height: 1;
          margin-top: -2px;
          letter-spacing: 3px;
          padding-left: 2px;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.15); }
        }
      </style>
    </head>
    <body>
      ${showFrame ? '<div class="frame"></div>' : ''}
      <div class="label">
        ${overlayMode === 'full' ? '<span class="dot"></span>' : ''}
        <span class="${overlayMode === 'dots' ? 'dots' : ''}">${pillText}</span>
      </div>
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
