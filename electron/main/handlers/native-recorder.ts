import { ipcMain, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'

let nativeRecorder: any = null

// Declare shim for webpack's non-webpack require if present
declare const __non_webpack_require__: NodeJS.Require | undefined

// Function to load the native recorder module
function loadNativeRecorder() {
  try {
    const os = require('os')
    const platform = os.platform()

    if (platform === 'darwin') {
      const envPath = process.env.SCREENCAPTURE_KIT_PATH
      const appPath = app.getAppPath()
      const candidates = new Set<string>()

      if (envPath) candidates.add(envPath)

      const nodeModuleRel = path.join('build', 'Release', 'screencapture_kit.node')
      candidates.add(path.join(appPath, nodeModuleRel))

      // When running via webpack, appPath is typically ".../.webpack/main"
      // so also try the project root two levels up.
      if (appPath.includes('.webpack')) {
        candidates.add(path.join(appPath, '..', '..', nodeModuleRel))
      }

      // Packaged app location.
      if (process.resourcesPath) {
        candidates.add(path.join(process.resourcesPath, nodeModuleRel))
      }

      // One-level-up variant for some dev setups.
      candidates.add(path.join(appPath, '..', nodeModuleRel))

      // Use Node's real require to bypass webpack bundling for native modules
      const nodeRequire: NodeJS.Require = (typeof __non_webpack_require__ !== 'undefined'
        ? __non_webpack_require__ as NodeJS.Require
        : (eval('require')))

      for (const modulePath of candidates) {
        try {
          // Check if file exists before trying to require it
          if (require('fs').existsSync(modulePath)) {
            const nativeModule = nodeRequire(modulePath)
            nativeRecorder = new nativeModule.NativeScreenRecorder()
            console.log('✅ Native ScreenCaptureKit recorder loaded - cursor will be hidden!')
            return
          }
        } catch (err: any) {
          // Try next candidate
        }
      }

      console.warn('[NativeRecorder] ScreenCaptureKit module not found; falling back to MediaRecorder')
    } else {
      // Not on macOS, native recorder unsupported.
    }
  } catch (err) {
    console.error('Failed to check native recorder:', err)
  }
}

export function setupNativeRecorder() {
  // Load the native recorder module first
  loadNativeRecorder()

  console.log('Setting up native recorder handlers, nativeRecorder:', nativeRecorder ? 'loaded' : 'null')

  // Check if native recorder is available
  ipcMain.handle('native-recorder:available', async () => {
    console.log('Checking native recorder availability:', nativeRecorder !== null)
    return nativeRecorder !== null
  })

  // Start recording
  ipcMain.handle('native-recorder:start-display', async (event, displayId: number, bounds?: { x: number; y: number; width: number; height: number }, options?: { onlySelf?: boolean; lowMemory?: boolean; includeAppWindows?: boolean; useMacOSDefaults?: boolean; framerate?: number }) => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }

    const tempDir = app.getPath('temp')
    const timestamp = Date.now()
    const outputPath = path.join(tempDir, `bokeh-native-${timestamp}.mov`)
    const onlySelf = options?.onlySelf ?? false
    const lowMemory = options?.lowMemory ?? false
    const includeAppWindows = options?.includeAppWindows ?? false
    const useMacOSDefaults = options?.useMacOSDefaults ?? true
    const framerate = options?.framerate ?? 60

    console.log(`[NativeRecorder] Starting display recording: displayId=${displayId}, bounds=${JSON.stringify(bounds)}, onlySelf=${onlySelf}, includeAppWindows=${includeAppWindows}, useMacOSDefaults=${useMacOSDefaults}, framerate=${framerate}`)

    return new Promise((resolve, reject) => {
      // If bounds provided, pass to native recorder (for region capture)
      if (bounds) {
        nativeRecorder.startRecordingWithRect(displayId, outputPath, bounds.x, bounds.y, bounds.width, bounds.height, (err: Error | null) => {
          if (err) {
            reject(err)
          } else {
            resolve({ outputPath })
          }
        }, onlySelf, lowMemory, includeAppWindows, useMacOSDefaults, framerate)
      } else {
        nativeRecorder.startRecording(displayId, outputPath, (err: Error | null) => {
          if (err) {
            reject(err)
          } else {
            resolve({ outputPath })
          }
        }, onlySelf, lowMemory, includeAppWindows, useMacOSDefaults, framerate)
      }
    })
  })

  // Stop recording
  ipcMain.handle('native-recorder:stop', async () => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }

    return new Promise((resolve, reject) => {
      nativeRecorder.stopRecording((err: Error | null, outputPath: string | null) => {
        if (err) {
          reject(err)
        } else {
          resolve({ outputPath })
        }
      })
    })
  })

  // Check if recording
  ipcMain.handle('native-recorder:is-recording', async () => {
    if (!nativeRecorder) {
      return false
    }
    return nativeRecorder.isRecording()
  })

  // Pause recording
  ipcMain.handle('native-recorder:pause', async () => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }
    nativeRecorder.pauseRecording()
    console.log('Native recording paused')
    return { success: true }
  })

  // Resume recording
  ipcMain.handle('native-recorder:resume', async () => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }
    nativeRecorder.resumeRecording()
    console.log('Native recording resumed')
    return { success: true }
  })

  // Read video file as buffer
  ipcMain.handle('native-recorder:read-video', async (event, filePath: string) => {
    try {
      const buffer = await fs.readFile(filePath)
      // Clean up temp file after reading
      await fs.unlink(filePath).catch(() => { })
      return buffer
    } catch (err) {
      console.error('Failed to read video file:', err)
      throw err
    }
  })

  // Start recording a specific window
  ipcMain.handle('native-recorder:start-window', async (event, windowId: number, options?: { lowMemory?: boolean; useMacOSDefaults?: boolean; framerate?: number }) => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }

    const tempDir = app.getPath('temp')
    const timestamp = Date.now()
    const outputPath = path.join(tempDir, `bokeh-native-window-${timestamp}.mov`)
    const lowMemory = options?.lowMemory ?? false
    const useMacOSDefaults = options?.useMacOSDefaults ?? true
    const framerate = options?.framerate ?? 60

    console.log(`Starting window recording for window ID: ${windowId}, useMacOSDefaults=${useMacOSDefaults}, framerate=${framerate}`)

    return new Promise((resolve, reject) => {
      nativeRecorder.startRecordingWindow(windowId, outputPath, (err: Error | null) => {
        if (err) {
          console.error('Failed to start window recording:', err)
          reject(err)
        } else {
          console.log('Window recording started:', outputPath)
          resolve({ outputPath })
        }
      }, lowMemory, useMacOSDefaults, framerate)
    })
  })
}
