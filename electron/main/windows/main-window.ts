import { BrowserWindow, WebContents, screen } from 'electron'
import * as path from 'path'
import { isDev } from '../config'
import { applyContentSecurityPolicy } from './content-security-policy'
import { isTrustedRendererUrl } from '../utils/ipc-security'

// Webpack entry points are set as environment variables by electron-forge

export function createMainWindow(): BrowserWindow {
  console.log('[MainWindow] Creating main window...')

  const isMac = process.platform === 'darwin'
  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workArea
  const width = 1920
  const height = 1440

  // Center the window on the screen
  const x = Math.round(workArea.x + (workArea.width - width) / 2)
  const y = Math.round(workArea.y + (workArea.height - height) / 2)

  // Main app window: transparent surface with native macOS traffic lights.
  const mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    ...(isMac
      ? {
        titleBarStyle: 'hiddenInset' as const,
        trafficLightPosition: { x: 20, y: 16 },
      }
      : {
        titleBarOverlay: {
          color: '#00000000',
          symbolColor: '#ffffff',
          height: 40,
        },
      }),
    transparent: true,
    // Don't set vibrancy here - let the renderer set it based on theme
    // This prevents flash of wrong vibrancy on light mode initial load
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY || path.join(__dirname, '../../preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableWebSQL: false,
      spellcheck: false,
      sandbox: true
    },
    icon: isDev
      ? path.join(__dirname, '../../../../public/brand/dock_icon.png')
      : path.join(process.resourcesPath, 'public/brand/dock_icon.png'),
  })

  setupPermissions(mainWindow)
  applyContentSecurityPolicy(mainWindow)

  // Don't load URL here - let the caller handle it
  // This prevents double loading

  if (isMac) {
    try {
      mainWindow.setBackgroundColor('#00000000')
    } catch { }
  }

  // Avoid auto-opening devtools; it affects perceived transparency.
  if (isDev && process.env.OPEN_DEVTOOLS === '1') mainWindow.webContents.openDevTools()

  mainWindow.on('closed', () => {
    console.log('[MainWindow] Window closed')
  })

  return mainWindow
}

function setupPermissions(window: BrowserWindow): void {
  const logPermissions = isDev && process.env.DEBUG_PERMISSIONS === '1'

  const permissionHandler = (webContents: WebContents, permission: string, callback: (granted: boolean) => void) => {
    if (logPermissions) console.log('🔐 Permission requested:', permission)
    const senderUrl = webContents.getURL()
    if (!isTrustedRendererUrl(senderUrl)) {
      if (logPermissions) console.log('❌ Denying permission from untrusted origin:', senderUrl)
      callback(false)
      return
    }
    if (permission === 'media' || permission === 'display-capture' || permission === 'screen') {
      if (logPermissions) console.log('✅ Granting permission for:', permission)
      callback(true)
    } else {
      if (logPermissions) console.log('❌ Denying permission for:', permission)
      callback(false)
    }
  }
  window.webContents.session.setPermissionRequestHandler(permissionHandler)

  const permissionCheckHandler = (webContents: WebContents | null, permission: string) => {
    if (logPermissions) console.log('🔍 Permission check:', permission)
    const senderUrl = webContents?.getURL() || ''
    if (!isTrustedRendererUrl(senderUrl)) return false
    return permission === 'media' || permission === 'display-capture' || permission === 'screen'
  }
  window.webContents.session.setPermissionCheckHandler(permissionCheckHandler)
}
