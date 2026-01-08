import { app, BrowserWindow, protocol, ipcMain } from 'electron'

// Set app name immediately for best chance of persisting in Dock/Menu
app.setName('bokeh.')
app.name = 'bokeh.'
if (process.platform === 'win32') {
  app.setAppUserModelId('com.bokeh.app')
}
import * as path from 'path'
import * as os from 'os'
import { isDev, getRecordingsDirectory } from './config'
import { makeVideoSrc } from './utils/video-url-factory'
import { createRecordButton, setupRecordButton } from './windows/record-button'
import { PermissionService } from './services/permission-service'
import { registerRecordingHandlers } from './ipc/recording'
import { registerSourceHandlers } from './ipc/sources'
import { registerAreaSelectionHandlers } from './ipc/area-selection'
import { registerPermissionHandlers } from './ipc/permissions'
import { registerMouseTrackingHandlers, cleanupMouseTracking } from './ipc/mouse-tracking'
import { registerKeyboardTrackingHandlers, cleanupKeyboardTracking } from './ipc/keyboard-tracking'
import { registerFileOperationHandlers } from './ipc/file-operations'
import { registerDialogHandlers } from './ipc/dialogs'
import { registerWindowControlHandlers } from './ipc/window-controls'
import { registerWindowSurfaceHandlers } from './ipc/window-surface'
import { setupNativeRecorder } from './ipc/native-recorder'
import { setupExportHandler, cleanupBundleCache } from './export'
import { setupThumbnailHandler } from './ipc/thumbnail'
import { killRemotionChromiumProcesses } from './utils/remotion-chromium-cleanup'
import { registerAssetHandlers } from './ipc/assets'
import { registerBokehProcessHandlers } from './ipc/system-stats'
import { enableCaptureProtection } from './windows/capture-protection'
import { registerProtocol } from './ipc/protocol-handler'
import { resolveRecordingFilePath } from './utils/file-resolution'
import { registerTranscriptionHandlers } from './ipc/transcription'

app.on('browser-window-created', (_event, window) => {
  enableCaptureProtection(window, `window-${window.id}`)
})

// Register custom protocols before app ready
// This ensures they're available when needed
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'video-stream',
    privileges: {
      standard: true,        // Behaves like http/https
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  },
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
])

function registerAllHandlers(): void {
  // Best-effort cleanup from previous crashes (Remotion/Puppeteer Chromium can linger on macOS).
  const killStats = killRemotionChromiumProcesses({ graceMs: 0 })
  if (killStats.matched > 0) {
    console.log('[Startup] Cleaned up orphaned Chromium processes', killStats)
  }

  registerRecordingHandlers()
  registerSourceHandlers()
  registerAreaSelectionHandlers()
  registerPermissionHandlers()
  registerMouseTrackingHandlers()
  registerKeyboardTrackingHandlers()
  registerFileOperationHandlers()
  registerDialogHandlers()
  registerWindowControlHandlers()
  registerWindowSurfaceHandlers()
  registerAssetHandlers()
  registerBokehProcessHandlers()
  registerTranscriptionHandlers()
  setupNativeRecorder()
  setupExportHandler()
  setupThumbnailHandler()

  // Path resolution handler - replaces path-resolver.ts functionality
  ipcMain.handle('resolve-recording-path', async (_, filePath: string, folderPath?: string) => {
    try {
      // Handle absolute paths
      if (path.isAbsolute(filePath)) {
        const videoUrl = await makeVideoSrc(filePath, 'preview')
        return videoUrl
      }

      // Handle data URIs - return as-is
      if (filePath.startsWith('data:')) {
        return filePath
      }

      const resolvedPath = resolveRecordingFilePath(filePath, folderPath)
      if (!resolvedPath) {
        throw new Error(`Recording file not found: ${filePath}`)
      }
      return await makeVideoSrc(resolvedPath, 'preview')
    } catch (error) {
      console.error('[IPC] Error resolving recording path:', error)
      throw error
    }
  })
}

// Define global variables with proper types
declare global {
  var recordingsDirectory: string
  var mainWindow: BrowserWindow | null
  var recordButton: BrowserWindow | null
  var isRecordingActive: boolean
}

global.recordingsDirectory = getRecordingsDirectory()
global.isRecordingActive = false

async function initializeApp(): Promise<void> {
  console.log(`🚀 App ready - Electron version: ${process.versions.electron}`)
  console.log(`🌐 Chrome version: ${process.versions.chrome}`)

  registerProtocol()
  // Initialize permission service
  await PermissionService.getInstance().checkInitialPermissions()
  registerAllHandlers()

  // Explicitly set dock icon on macOS (especially needed for dev mode)
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = !app.isPackaged
      ? path.join(__dirname, '../../../public/brand/icon.png')
      : path.join(process.resourcesPath, 'public/brand/icon.png')

    console.log('🍎 Setting dock icon from:', iconPath)
    app.dock.setIcon(iconPath)
    app.dock.show()
  }

  global.mainWindow = null

  const recordButton = createRecordButton()
  global.recordButton = recordButton
  setupRecordButton(recordButton)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newRecordButton = createRecordButton()
      global.recordButton = newRecordButton
      setupRecordButton(newRecordButton)
    }
  })
}

app.whenReady().then(initializeApp)

if (isDev) {
  // Reduce logging verbosity - don't log media stream details
  app.commandLine.appendSwitch('enable-logging', 'stderr')
  app.commandLine.appendSwitch('log-level', '2') // Only warnings and errors
}

// Aggressive GPU acceleration flags - Cleaned up for stability
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
// app.commandLine.appendSwitch('ignore-gpu-blacklist') // Potentially unstable
// app.commandLine.appendSwitch('disable-gpu-sandbox') // DANGEROUS: Causes security risks and potential instability
app.commandLine.appendSwitch('disable-software-rasterizer')
// Forcing ANGLE Metal can break transparent/vibrant windows on some macOS/Electron builds.
// Let Electron pick the default backend on darwin.
if (process.platform !== 'darwin') {
  app.commandLine.appendSwitch('use-angle', 'metal')
}
app.commandLine.appendSwitch('enable-accelerated-2d-canvas')

// Dynamic memory scaling for renderer processes
const totalMemGB = os.totalmem() / (1024 * 1024 * 1024)
const rendererLimitMB = Math.min(16384, Math.max(4096, Math.floor(totalMemGB * 0.5 * 1024)))

// Apply dynamic heap limit and aggressive memory reduction flags
app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${rendererLimitMB} --memory-reducer --expose-gc`)

if (isDev) {
  console.log(`[Memory] Dynamic scaling active:
  - Main Process: 2048MB (Static via NODE_OPTIONS)
  - Renderer Processes: ${rendererLimitMB}MB (Dynamic base on ${totalMemGB.toFixed(1)}GB RAM)
  - V8 Reducer: Enabled`)
}

app.on('window-all-closed', () => {
  cleanupMouseTracking()
  cleanupKeyboardTracking()
  cleanupBundleCache() // Clean up cached webpack bundle
  killRemotionChromiumProcesses()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Ensure chromium processes are terminated even if windows remain (macOS).
  killRemotionChromiumProcesses()
})

process.on('uncaughtException', (error: Error) => {
  console.error('[Process] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('[Process] Unhandled Rejection:', { promise, reason })
})
