/**
 * IPC handlers for wallpaper management.
 * Handles macOS wallpaper discovery, thumbnail generation, and loading.
 */

import { ipcMain, IpcMainInvokeEvent, nativeImage, app } from 'electron'
import { execSync } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'

const WALLPAPER_EXTS = new Set(['.heic', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif', '.webp'])
const THUMB_MAX = 300
const WALLPAPER_MAX = 2560
const MAX_WALLPAPERS = 250
const THUMB_CONCURRENCY = 6

// Electron doesn't expose a "cache" path. Use userData/Cache for persistence.
const thumbCacheDir = path.join(app.getPath('userData'), 'Cache', 'wallpaper-thumbs')

// Cache settings
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const CACHE_MAX_SIZE_MB = 100 // 100MB max cache size
let cacheCleanupDone = false

async function ensureThumbCacheDir(): Promise<void> {
  try { await fs.mkdir(thumbCacheDir, { recursive: true }) } catch { }
}

// Clean up old cache files on startup (run once)
async function cleanupOldCacheFiles(): Promise<void> {
  if (cacheCleanupDone) return
  cacheCleanupDone = true

  try {
    const files = await fs.readdir(thumbCacheDir)
    const now = Date.now()
    let totalSize = 0
    const fileStats: Array<{ name: string; mtime: number; size: number }> = []

    // Get stats for all files
    for (const file of files) {
      try {
        const filePath = path.join(thumbCacheDir, file)
        const stat = await fs.stat(filePath)
        totalSize += stat.size
        fileStats.push({ name: file, mtime: stat.mtimeMs, size: stat.size })
      } catch { }
    }

    // Remove files older than CACHE_MAX_AGE_MS
    let cleaned = 0
    for (const { name, mtime, size } of fileStats) {
      if (now - mtime > CACHE_MAX_AGE_MS) {
        try {
          await fs.unlink(path.join(thumbCacheDir, name))
          totalSize -= size
          cleaned++
        } catch { }
      }
    }

    // If still over size limit, remove oldest files
    if (totalSize > CACHE_MAX_SIZE_MB * 1024 * 1024) {
      const remaining = fileStats
        .filter(f => now - f.mtime <= CACHE_MAX_AGE_MS)
        .sort((a, b) => a.mtime - b.mtime) // Oldest first

      for (const { name, size } of remaining) {
        if (totalSize <= CACHE_MAX_SIZE_MB * 1024 * 1024) break
        try {
          await fs.unlink(path.join(thumbCacheDir, name))
          totalSize -= size
          cleaned++
        } catch { }
      }
    }

    if (cleaned > 0) {
      console.log(`[Wallpapers] Cleaned up ${cleaned} old cache files`)
    }
  } catch (error) {
    console.warn('[Wallpapers] Failed to clean up cache:', error)
  }
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

// Track initialization state to prevent handlers from running before cleanup
let initializationPromise: Promise<void> | null = null

export function registerWallpaperHandlers(): void {
  // Clean up old cache files on startup (await completion before handling requests)
  initializationPromise = cleanupOldCacheFiles()

  ipcMain.handle('get-macos-wallpapers', async () => {
    // Ensure cache cleanup is complete before serving requests
    if (initializationPromise) await initializationPromise

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
    // Ensure cache cleanup is complete before serving requests
    if (initializationPromise) await initializationPromise

    return await getWallpaperThumbnails(imagePaths)
  })

  ipcMain.handle('load-wallpaper-image', async (_event: IpcMainInvokeEvent, imagePath: string) => {
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
      console.error('[Wallpapers] Error loading wallpaper image:', error)
      throw error
    }
  })
}
