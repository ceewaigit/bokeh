import { BrowserWindow, screen } from 'electron'
import * as path from 'path'
import { getAppURL, isDev } from '../config'
import { applyContentSecurityPolicy } from './content-security-policy'

// Webpack entry points are set as environment variables by electron-forge

export function createRecordButton(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  console.log('🖥️ Creating record button overlay for display:', display.bounds)

  const initialWidth = 180
  const initialHeight = 56
  const marginBottom = 24
  const workArea = display.workArea

  const recordButton = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: 140,
    minHeight: 56,
    x: Math.round(workArea.x + (workArea.width - initialWidth) / 2),
    y: Math.round(workArea.y + workArea.height - initialHeight - marginBottom),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    // Keep true transparency (no vibrancy material behind the UI)
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY || path.join(__dirname, '../../preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev,
      backgroundThrottling: false
    },
    icon: isDev
      ? path.join(__dirname, '../../../../public/brand/icon.png')
      : path.join(process.resourcesPath, 'public/brand/icon.png'),
  })


  // Set window title to empty string to avoid any OS chrome showing it
  recordButton.setTitle('')

  // Track whether the user has moved the dock (so future resizes preserve their placement).
  recordButton.on('move', () => {
    if (!(recordButton as any).__bokehBoundsUpdateInProgress) {
      ; (recordButton as any).__bokehUserMoved = true
    }
  })

  // Configure as a true overlay window
  recordButton.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Don't ignore mouse events - we need interaction
  recordButton.setIgnoreMouseEvents(false)

  // Platform-specific window configuration
  if (process.platform === 'darwin') {
    recordButton.setFullScreenable(false)
    // Use screen-saver level on macOS - this keeps it above other windows
    // and helps with window exclusion in screen capture
    recordButton.setAlwaysOnTop(true, 'screen-saver', 1)
  } else {
    recordButton.setAlwaysOnTop(true, 'floating', 1)
  }

  // Apply CSP so blob: media URLs are allowed
  applyContentSecurityPolicy(recordButton)

  recordButton.on('unresponsive', () => {
    console.error('❌ Record button window became unresponsive')
  })

  recordButton.on('closed', () => {
    console.log('🔒 Record button window closed')
  })

  return recordButton
}

export function setupRecordButton(recordButton: BrowserWindow): void {
  const url = getAppURL('/record-button')
  console.log('🔗 Loading record button from:', url)

  recordButton.loadURL(url)

  recordButton.once('ready-to-show', () => {
    console.log('✅ Record button ready to show')
    recordButton.show()
    recordButton.focus()
  })

  recordButton.webContents.on('did-finish-load', () => {
    console.log('📄 Record button content loaded')
  })

  recordButton.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('❌ Failed to load record button:', errorCode, errorDescription)
  })

  recordButton.webContents.on('render-process-gone', (event, details) => {
    console.error('💥 Renderer process crashed:', details)
    setTimeout(() => {
      console.log('🔄 Attempting to reload record button...')
      recordButton.reload()
    }, 1000)
  })

  recordButton.webContents.on('will-navigate', (event, url) => {
    const allowedPrefixes = ['file://', 'app://', 'data:']
    // Allow localhost in development
    if (isDev) {
      allowedPrefixes.push('http://localhost:', 'http://127.0.0.1:')
    }
    if (!allowedPrefixes.some(prefix => url.startsWith(prefix))) {
      console.log('🚫 Preventing navigation to:', url)
      event.preventDefault()
    }
  })
}
