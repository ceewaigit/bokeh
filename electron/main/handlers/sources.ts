import { ipcMain, desktopCapturer, BrowserWindow, dialog, systemPreferences, screen, IpcMainInvokeEvent, nativeImage, app } from 'electron'
import { exec, execSync } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import { promisify } from 'util'
import * as crypto from 'crypto'

const WALLPAPER_EXTS = new Set(['.heic', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif', '.webp'])
const THUMB_MAX = 300
const WALLPAPER_MAX = 2560
const MAX_WALLPAPERS = 250
const THUMB_CONCURRENCY = 6
// Electron doesn't expose a "cache" path. Use userData/Cache for persistence.
const thumbCacheDir = path.join(app.getPath('userData'), 'Cache', 'wallpaper-thumbs')

async function ensureThumbCacheDir(): Promise<void> {
  try { await fs.mkdir(thumbCacheDir, { recursive: true }) } catch { }
}

function hashPath(p: string): string {
  return crypto.createHash('sha1').update(p).digest('hex')
}

async function listWallpaperFiles(root: string, depth = 2, out: string[] = []): Promise<string[]> {
  if (out.length >= MAX_WALLPAPERS) return out
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      if (out.length >= MAX_WALLPAPERS) break
      const full = path.join(root, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name.endsWith('.madesktop')) continue
        if (depth > 0) await listWallpaperFiles(full, depth - 1, out)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (WALLPAPER_EXTS.has(ext)) out.push(full)
      }
    }
  } catch { }
  return out
}

async function getThumbnailDataUrl(imagePath: string): Promise<string | null> {
  await ensureThumbCacheDir()
  const thumbFile = path.join(thumbCacheDir, `${hashPath(imagePath)}.jpg`)
  try {
    const [srcStat, thumbStat] = await Promise.all([
      fs.stat(imagePath),
      fs.stat(thumbFile).catch(() => null as any)
    ])
    if (thumbStat && thumbStat.mtimeMs >= srcStat.mtimeMs) {
      const buf = await fs.readFile(thumbFile)
      return `data:image/jpeg;base64,${buf.toString('base64')}`
    }
  } catch { }

  try {
    const ext = path.extname(imagePath).toLowerCase()
    let img: Electron.NativeImage | null = null

    if (!(process.platform === 'darwin' && ext === '.heic')) {
      img = nativeImage.createFromPath(imagePath)
      if (img.isEmpty()) img = null
    }

    if (img) {
      const size = img.getSize()
      const scale = Math.min(1, THUMB_MAX / Math.max(size.width, size.height))
      const resized = scale < 1 ? img.resize({ width: Math.round(size.width * scale) }) : img
      const jpeg = resized.toJPEG(70)
      await fs.writeFile(thumbFile, jpeg).catch(() => { })
      return `data:image/jpeg;base64,${jpeg.toString('base64')}`
    }
  } catch { }

  if (process.platform === 'darwin') {
    try {
      const tempFile = path.join(require('os').tmpdir(), `thumb-${Date.now()}.jpg`)
      execSync(`sips -Z ${THUMB_MAX} -s format jpeg "${imagePath}" --out "${tempFile}"`, { stdio: 'ignore' })
      const buf = await fs.readFile(tempFile)
      await fs.writeFile(thumbFile, buf).catch(() => { })
      await fs.unlink(tempFile).catch(() => { })
      return `data:image/jpeg;base64,${buf.toString('base64')}`
    } catch { }
  }

  return null
}

async function getWallpaperThumbnails(paths: string[]): Promise<Record<string, string | null>> {
  const unique = Array.from(new Set(paths.filter(Boolean)))
  const results: Record<string, string | null> = {}
  if (unique.length === 0) return results

  let index = 0
  const workers = Array.from({ length: Math.min(THUMB_CONCURRENCY, unique.length) }, async () => {
    while (true) {
      const next = unique[index]
      index += 1
      if (!next) return

      try {
        results[next] = await getThumbnailDataUrl(next)
      } catch {
        results[next] = null
      }
    }
  })

  await Promise.all(workers)
  return results
}

async function loadAndResizeToDataUrl(imagePath: string, maxDim: number): Promise<string> {
  const ext = path.extname(imagePath).toLowerCase()

  if (process.platform === 'darwin' && ext === '.heic') {
    const tempFile = path.join(require('os').tmpdir(), `wallpaper-${Date.now()}.jpg`)
    execSync(`sips -s format jpeg "${imagePath}" --out "${tempFile}"`, { stdio: 'ignore' })
    const buf = await fs.readFile(tempFile)
    try { await fs.unlink(tempFile) } catch { }
    const img = nativeImage.createFromBuffer(buf)
    if (!img.isEmpty()) {
      const size = img.getSize()
      const scale = Math.min(1, maxDim / Math.max(size.width, size.height))
      const resized = scale < 1 ? img.resize({ width: Math.round(size.width * scale) }) : img
      const jpeg = resized.toJPEG(85)
      return `data:image/jpeg;base64,${jpeg.toString('base64')}`
    }
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  }

  const imageBuffer = await fs.readFile(imagePath)
  const img = nativeImage.createFromBuffer(imageBuffer)
  if (!img.isEmpty()) {
    const size = img.getSize()
    const scale = Math.min(1, maxDim / Math.max(size.width, size.height))
    const resized = scale < 1 ? img.resize({ width: Math.round(size.width * scale) }) : img
    const jpeg = resized.toJPEG(85)
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  }

  // Fallback: return raw bytes as data URL when nativeImage can't decode
  return nativeImage.createFromBuffer(imageBuffer).toDataURL()
}

interface DesktopSourceOptions {
  types?: string[]
  thumbnailSize?: { width: number; height: number }
}

interface MediaConstraints {
  audio: boolean | { mandatory: { chromeMediaSource: string; chromeMediaSourceId?: string } }
  video: {
    mandatory: {
      chromeMediaSource: string
      chromeMediaSourceId: string
    }
  }
}

export function registerSourceHandlers(): void {

  // CRITICAL FIX: Return constraints that work with all Electron versions
  ipcMain.handle('get-desktop-stream', async (event: IpcMainInvokeEvent, sourceId: string, hasAudio: boolean = false): Promise<MediaConstraints> => {
    try {

      // For desktop audio capture, explicitly request 'desktop' as chromeMediaSource
      const audioConstraints = hasAudio
        ? {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        }
        : false

      const constraints: MediaConstraints = {
        audio: audioConstraints,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        }
      }

      console.log(`✅ Desktop stream constraints created - Audio: ${hasAudio}, Source: ${sourceId}`)
      return constraints
    } catch (error) {
      console.error('❌ Failed to create stream constraints:', error)
      throw error
    }
  })

  ipcMain.handle('get-desktop-sources', async (event: IpcMainInvokeEvent, options: DesktopSourceOptions = {}) => {
    try {
      // Check permissions on macOS
      if (process.platform === 'darwin') {
        const status = systemPreferences.getMediaAccessStatus('screen')

        if (status !== 'granted') {
          const parentWindow = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()

          if (parentWindow) {
            const result = await dialog.showMessageBox(parentWindow, {
              type: 'warning',
              title: 'Screen Recording Permission Required',
              message: 'Bokeh needs permission to record your screen.',
              detail: 'To enable screen recording:\n\n1. Open System Settings\n2. Go to Privacy & Security > Screen Recording\n3. Check the box next to Bokeh\n4. Restart Bokeh if needed\n\nClick "Open System Settings" to go there now.',
              buttons: ['Open System Preferences', 'Cancel'],
              defaultId: 0,
              cancelId: 1
            })

            if (result.response === 0) {
              exec('open x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
            }
          }

          const permissionError: any = new Error('Screen recording permission denied')
          permissionError.code = 'PERMISSION_DENIED'
          throw permissionError
        }
      }

      // Use desktopCapturer properly with error handling

      const types = options.types || ['screen', 'window']
      const thumbnailSize = options.thumbnailSize || { width: 150, height: 150 }

      try {
        const sources = await desktopCapturer.getSources({
          types: types as any,
          thumbnailSize: thumbnailSize,
          fetchWindowIcons: false
        })


        // Import window bounds helper dynamically
        const { getWindowBoundsForSource, getAllWindowBounds } = await import('../native/window-bounds')

        // Get all visible windows from native API (uses .optionOnScreenOnly)
        const visibleWindows = await getAllWindowBounds()
        const visibleWindowNames = new Set(visibleWindows.map(w => w.name))
        const visibleOwnerNames = new Set(visibleWindows.map(w => w.ownerName))

        // Get all displays for enhanced information
        const displays = screen.getAllDisplays()
        const primaryDisplay = screen.getPrimaryDisplay()

        // Filter and map the sources - be more lenient to capture Electron apps
        const filteredSources = sources.filter(source => {
          // Always keep screen sources
          if (source.id.startsWith('screen:')) {
            return true
          }

          // For window sources, include if it has a non-empty name from desktopCapturer
          // The desktopCapturer API already filters for visible windows
          // We only do light filtering here to catch obvious system windows
          const sourceName = source.name.toLowerCase()

          // Skip empty names
          if (!source.name.trim()) {
            console.log(`[Sources] Filtering out empty name window`)
            return false
          }

          // Skip obvious system UI elements that slip through
          const systemPatterns = ['menubar', 'menu bar', 'notification center', 'control center']
          if (systemPatterns.some(pattern => sourceName.includes(pattern))) {
            console.log(`[Sources] Filtering out system window: ${source.name}`)
            return false
          }

          return true
        })


        // Map the sources to our format with bounds information
        const mappedSources = await Promise.all(filteredSources.map(async source => {
          // Get window bounds for window sources
          let bounds = undefined
          let displayInfo = undefined

          if (source.id.startsWith('screen:')) {
            // For screen sources, get display information
            const screenIdMatch = source.id.match(/screen:(\d+):/)
            if (screenIdMatch) {
              const screenId = parseInt(screenIdMatch[1])
              const display = displays.find(d => d.id === screenId)
              if (display) {
                bounds = display.bounds
                displayInfo = {
                  id: display.id,
                  isPrimary: display.id === primaryDisplay.id,
                  isInternal: display.internal,
                  bounds: display.bounds,
                  workArea: display.workArea,
                  scaleFactor: display.scaleFactor
                }

                // Create better display names
                if (display.id === primaryDisplay.id) {
                  source.name = 'Primary Display'
                } else if (display.internal) {
                  source.name = 'Built-in Display'
                } else {
                  const index = displays.findIndex(d => d.id === display.id)
                  source.name = `Display ${index + 1}`
                }
              }
            }
          } else {
            // For window sources
            bounds = await getWindowBoundsForSource(source.name)
          }

          return {
            id: source.id,
            name: source.name,
            display_id: source.display_id,
            thumbnail: source.thumbnail?.toDataURL() || undefined,
            bounds,
            displayInfo
          }
        }))

        if (mappedSources.length === 0) {
          throw new Error('No sources found. Please check screen recording permissions.')
        }

        return mappedSources
      } catch (captureError) {
        console.error('desktopCapturer failed:', captureError)
        throw new Error('Failed to capture desktop sources. Please check screen recording permissions.')
      }

    } catch (error: any) {
      console.error('❌ Error getting desktop sources:', error)

      if (error?.message?.includes('Failed to get sources') || !error?.message) {
        const permissionError: any = new Error(
          'Screen recording permission required. Please go to System Preferences > Security & Privacy > Privacy > Screen Recording and enable access for this app.'
        )
        permissionError.code = 'PERMISSION_DENIED'
        throw permissionError
      }
      throw error
    }
  })

  ipcMain.handle('get-screens', async () => {
    return screen.getAllDisplays().map(display => ({
      id: display.id,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      internal: display.internal
    }))
  })

  // Get window bounds for a specific source
  ipcMain.handle('get-source-bounds', async (_event: IpcMainInvokeEvent, sourceId: string) => {
    try {
      // For screens, return the display bounds
      if (sourceId.startsWith('screen:')) {
        const screenIdMatch = sourceId.match(/screen:(\d+):/)
        if (screenIdMatch) {
          const screenId = parseInt(screenIdMatch[1])
          const display = screen.getAllDisplays().find(d => d.id === screenId)
          if (display) {
            return {
              x: display.bounds.x,
              y: display.bounds.y,
              width: display.bounds.width,
              height: display.bounds.height
            }
          }
        }
      } else {
        // For windows, get the actual window bounds
        const sources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 1, height: 1 }
        })

        const source = sources.find(s => s.id === sourceId)
        if (source) {
          const { getWindowBoundsForSource } = await import('../native/window-bounds')
          const bounds = await getWindowBoundsForSource(source.name)
          if (bounds) {
            return {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height
            }
          }
        }
      }

      return null
    } catch (error) {
      console.error('Failed to get source bounds:', error)
      return null
    }
  })

  ipcMain.handle('get-platform', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.getSystemVersion?.() || 'unknown'
    }
  })

  ipcMain.handle('get-macos-wallpapers', async () => {
    const wallpapers: Array<{ name: string; path: string; thumbnail?: string | null }> = []
    const roots = [
      '/System/Library/Desktop Pictures',
      '/Library/Desktop Pictures'
    ]

    const files = new Set<string>()
    for (const root of roots) {
      const listed = await listWallpaperFiles(root, 4)
      for (const f of listed) files.add(f)
      if (files.size >= MAX_WALLPAPERS) break
    }

    const sorted = Array.from(files).sort((a, b) => path.basename(a).localeCompare(path.basename(b)))

    for (const filePath of sorted) {
      const name = path.basename(filePath, path.extname(filePath))
      wallpapers.push({ name, path: filePath })
    }

    return {
      wallpapers,
      gradients: []
    }
  })

  ipcMain.handle('get-wallpaper-thumbnails', async (_event: IpcMainInvokeEvent, imagePaths: string[]) => {
    return await getWallpaperThumbnails(imagePaths)
  })

  ipcMain.handle('load-wallpaper-image', async (event: IpcMainInvokeEvent, imagePath: string) => {
    try {
      const allowedDirs = [
        '/System/Library/Desktop Pictures',
        '/Library/Desktop Pictures'
      ]

      const isAllowed = allowedDirs.some(dir => imagePath.startsWith(dir))
      if (!isAllowed) {
        throw new Error('Access denied')
      }
      return await loadAndResizeToDataUrl(imagePath, WALLPAPER_MAX)
    } catch (error) {
      console.error('Error loading wallpaper image:', error)
      throw error
    }
  })

  // Image selection for custom backgrounds
  ipcMain.handle('select-image-file', async (event: IpcMainInvokeEvent) => {
    const { dialog } = require('electron')
    const mainWindow = BrowserWindow.fromWebContents(event.sender)

    if (!mainWindow) return null

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Background Image',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('load-image-as-data-url', async (event: IpcMainInvokeEvent, imagePath: string) => {
    try {
      // Read the image file
      const imageBuffer = await fs.readFile(imagePath)
      const image = nativeImage.createFromBuffer(imageBuffer)

      // Convert to data URL
      return image.toDataURL()
    } catch (error) {
      console.error('Error loading image as data URL:', error)
      throw error
    }
  })
}
