import { BrowserWindow, screen } from 'electron'

// Webpack entry points are set as environment variables by electron-forge

export function createCountdownWindow(displayId?: number): BrowserWindow {
  // Get the target display - use provided displayId or fall back to primary
  const displays = screen.getAllDisplays()
  const display = displayId
    ? displays.find(d => d.id === displayId) || screen.getPrimaryDisplay()
    : screen.getPrimaryDisplay()

  // Use workArea instead of bounds to account for macOS menu bar and dock
  const workArea = display.workArea

  const countdownWindow = new BrowserWindow({
    width: workArea.width,
    height: workArea.height,
    x: workArea.x,
    y: workArea.y,
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
    }
  })

  countdownWindow.setIgnoreMouseEvents(true)
  countdownWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  countdownWindow.setAlwaysOnTop(true, 'screen-saver', 1000)

  return countdownWindow
}

const countdownLoadPromises = new WeakMap<BrowserWindow, Promise<void>>()

function getCountdownHtml(): string {
  const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; media-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Security-Policy" content="${csp}">
      <style>
        * { 
          margin: 0; 
          padding: 0; 
          box-sizing: border-box;
        }
        
        html, body {
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          width: 100vw;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
          user-select: none;
          -webkit-user-select: none;
          overflow: hidden;
        }
        
        .countdown-container {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        /* The number */
        .countdown {
          font-size: 180px;
          font-weight: 300; /* Light/Thin */
          letter-spacing: -4px;
          line-height: 1;
          color: white;
          text-shadow: 0 4px 30px rgba(0,0,0,0.3);
          font-variant-numeric: tabular-nums;
        }

        .reveal {
          animation: numberReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        
        @keyframes numberReveal {
          0% {
            opacity: 0;
            transform: scale(0.9);
            filter: blur(10px);
          }
          100% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
        }
      </style>
    </head>
    <body>
      <div class="countdown-container">
        <div id="countdown" class="countdown"></div>
      </div>
    </body>
    </html>
  `
}

async function ensureCountdownLoaded(countdownWindow: BrowserWindow): Promise<void> {
  const existing = countdownLoadPromises.get(countdownWindow)
  if (existing) return existing

  const html = getCountdownHtml()
  const loadPromise = countdownWindow
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    .then(() => { })

  countdownLoadPromises.set(countdownWindow, loadPromise)
  return loadPromise
}

async function updateCountdownNumber(countdownWindow: BrowserWindow, number: number): Promise<void> {
  const text = number > 0 ? String(number) : ''
  const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

  await countdownWindow.webContents.executeJavaScript(
    `
      (() => {
        const el = document.getElementById('countdown');
        if (!el) return;
        el.textContent = '${escaped}';
        el.classList.remove('reveal');
        void el.offsetWidth;
        if (el.textContent) el.classList.add('reveal');
      })();
    `,
    true
  )
}

export async function showCountdown(countdownWindow: BrowserWindow, number: number): Promise<void> {
  await ensureCountdownLoaded(countdownWindow)
  await updateCountdownNumber(countdownWindow, number)
  if (!countdownWindow.isVisible()) {
    countdownWindow.show()
  }
}
