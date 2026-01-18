import { BrowserWindow, screen } from 'electron'
import * as path from 'path'
import { getAppURL } from '../config'
import { applyContentSecurityPolicy } from './content-security-policy'

let teleprompterWindow: BrowserWindow | null = null

/**
 * Creates a teleprompter window for recording notes
 * Resizable, always-on-top overlay for note-taking during recording prep
 */
export function createTeleprompterWindow(): BrowserWindow {
    // If window already exists, just show and focus it
    if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
        teleprompterWindow.show()
        teleprompterWindow.focus()
        return teleprompterWindow
    }

    const display = screen.getPrimaryDisplay()
    const isDev = process.env.NODE_ENV === 'development'

    // Position to the right side of the screen
    const width = 400
    const height = 500
    const x = display.workAreaSize.width - width - 24
    const y = Math.floor(display.workAreaSize.height / 2 - height / 2)

    teleprompterWindow = new BrowserWindow({
        width,
        height,
        minWidth: 280,
        minHeight: 300,
        maxWidth: 800,
        maxHeight: display.workAreaSize.height - 100,
        x,
        y,
        frame: true,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 12, y: 14 },
        transparent: false,
        backgroundColor: '#0f0f11', // Matches --background in dark mode
        alwaysOnTop: true,
        resizable: true,
        movable: true,
        minimizable: true,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: false,
        hasShadow: true,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY || path.join(__dirname, '../../preload.js'),
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: isDev,
            backgroundThrottling: false,
            sandbox: true
        },
        icon: isDev
            ? path.join(__dirname, '../../../../public/brand/icon.png')
            : path.join(process.resourcesPath, 'public/brand/icon.png'),
    })

    teleprompterWindow.setTitle('Notes')
    teleprompterWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (process.platform === 'darwin') {
        teleprompterWindow.setFullScreenable(false)
        teleprompterWindow.setAlwaysOnTop(true, 'floating', 1)
    } else {
        teleprompterWindow.setAlwaysOnTop(true, 'floating', 1)
    }

    applyContentSecurityPolicy(teleprompterWindow)

    if (isDev) {
        teleprompterWindow.webContents.openDevTools({ mode: 'detach' })
    }

    teleprompterWindow.on('closed', () => {
        teleprompterWindow = null
    })

    return teleprompterWindow
}

export function setupTeleprompterWindow(window: BrowserWindow): void {
    const url = getAppURL('/teleprompter')
    console.log('📝 Loading teleprompter from:', url)

    window.loadURL(url)

    window.once('ready-to-show', () => {
        console.log('✅ Teleprompter ready to show')
        window.show()
        window.focus()
    })

    window.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('❌ Failed to load teleprompter:', errorCode, errorDescription)
    })
}

export function showTeleprompterWindow(): BrowserWindow {
    const window = createTeleprompterWindow()
    setupTeleprompterWindow(window)
    return window
}

export function hideTeleprompterWindow(): void {
    if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
        teleprompterWindow.hide()
    }
}

export function toggleTeleprompterWindow(): boolean {
    if (teleprompterWindow && !teleprompterWindow.isDestroyed() && teleprompterWindow.isVisible()) {
        teleprompterWindow.hide()
        return false
    } else {
        showTeleprompterWindow()
        return true
    }
}

export function getTeleprompterWindow(): BrowserWindow | null {
    return teleprompterWindow
}
