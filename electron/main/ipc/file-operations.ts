import { ipcMain, app, IpcMainInvokeEvent } from 'electron'
import * as path from 'path'
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import { makeVideoSrc } from '../utils/video-url-factory'
import { resolveRecordingFilePath } from '../utils/file-resolution'
import { isPathWithinAny } from '../utils/path-validation'
import { getRecordingsDirectory, isDev } from '../config'
import { assertTrustedIpcSender } from '../utils/ipc-security'
import { approveReadPaths, consumeApprovedSavePath, isApprovedReadPath } from '../utils/ipc-path-approvals'
import {
  ensurePreviewProxy,
  ensureGlowProxy,
  needsPreviewProxy,
  getExistingProxyPath,
  getExistingGlowProxyPath,
  clearPreviewProxies,
  clearGlowProxies,
  getProxyCacheSize,
  getVideoDimensions,
  getVideoMetadata,
  generateThumbnail
} from '../services/proxy-service'

/**
 * Get the list of allowed directories for file operations.
 * Includes recordings directory, app data, temp, and resource paths.
 */
function getAllowedDirectories(): string[] {
  const publicDir = app.isPackaged
    ? path.join(process.resourcesPath, 'public')
    : path.join(app.getAppPath(), 'public')
  return [
    getRecordingsDirectory(),
    app.getPath('userData'),
    app.getPath('temp'),
    app.getPath('downloads'),
    publicDir,
  ].filter(Boolean)
}

function assertAllowedReadPath(event: IpcMainInvokeEvent, candidatePath: string, label: string): string {
  const normalizedPath = path.resolve(candidatePath)
  if (!path.isAbsolute(normalizedPath)) {
    throw new Error(`${label}: path must be absolute`)
  }
  const allowedDirs = getAllowedDirectories()
  const allowed = isPathWithinAny(normalizedPath, allowedDirs) || isApprovedReadPath(event.sender, normalizedPath)
  if (!allowed) {
    throw new Error(`${label}: access denied`)
  }
  return normalizedPath
}

export function registerFileOperationHandlers(): void {
  // Generate a thumbnail using ffmpeg (fallback for unsupported formats)
  ipcMain.handle('generate-video-thumbnail', async (event: IpcMainInvokeEvent, options: any) => {
    try {
      assertTrustedIpcSender(event, 'generate-video-thumbnail')
      const { path: videoPath, width, height, timestamp } = options
      const normalizedPath = assertAllowedReadPath(event, String(videoPath), 'generate-video-thumbnail')
      const result = await generateThumbnail(normalizedPath, { width, height, timestamp })
      return result
    } catch (error) {
      console.error('[FileOps] Error generating thumbnail:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get video metadata (width, height, duration) using ffprobe
  // This is reliable even for formats the renderer cannot play directly (e.g. 6K HEVC)
  ipcMain.handle('get-video-metadata', async (event: IpcMainInvokeEvent, filePath: string) => {
    console.log('[FileOps] 🛰️ get-video-metadata called for:', filePath)
    try {
      assertTrustedIpcSender(event, 'get-video-metadata')
      const normalizedPath = assertAllowedReadPath(event, String(filePath), 'get-video-metadata')
      const meta = await getVideoMetadata(normalizedPath)
      if (meta) {
        console.log('[FileOps] 📐 Metadata extracted:', meta)
        return {
          success: true,
          ...meta
        }
      }
      console.error('[FileOps] ❌ Failed to extract metadata for:', filePath)
      return { success: false, error: 'Failed to extract metadata' }
    } catch (error) {
      console.error('[FileOps] ❌ Error getting video metadata:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('save-file', async (event: IpcMainInvokeEvent, data: Buffer | ArrayBuffer | string | object, filepath?: string) => {
    try {
      assertTrustedIpcSender(event, 'save-file')
      // Determine final save path. If a path is provided but has no extension, default to mp4.
      let normalizedPath: string
      if (!filepath) {
        normalizedPath = path.resolve(path.join(app.getPath('downloads'), 'recording.mp4'))
      } else {
        const resolved = path.resolve(filepath)
        const ext = path.extname(resolved)
        const resolvedWithDefaultExt = ext ? resolved : `${resolved}.mp4`

        // Security: allow saving outside the app directories only when the path was returned
        // from a native save dialog recently.
        const approved =
          consumeApprovedSavePath(event.sender, resolved) ||
          (resolvedWithDefaultExt !== resolved && consumeApprovedSavePath(event.sender, resolvedWithDefaultExt))

        if (!approved) {
          return { success: false, error: 'Access denied: path not approved by save dialog' }
        }

        normalizedPath = resolvedWithDefaultExt
      }

      let buffer: Buffer
      if (Buffer.isBuffer(data)) {
        buffer = data
      } else if (data instanceof ArrayBuffer) {
        buffer = Buffer.from(new Uint8Array(data))
      } else if (ArrayBuffer.isView(data)) {
        buffer = Buffer.from(data.buffer as ArrayBuffer)
      } else if (Array.isArray(data)) {
        buffer = Buffer.from(data as any)
      } else if (typeof data === 'string') {
        buffer = Buffer.from(data)
      } else {
        // As a last resort, try to serialize
        buffer = Buffer.from(JSON.stringify(data))
      }

      await fs.writeFile(normalizedPath, buffer)
      console.log(`[FileOps] ✅ File saved: ${normalizedPath} (${buffer.length} bytes)`)
      return { success: true, path: normalizedPath }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[FileOps] Error saving file:', error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('open-file', async (event: IpcMainInvokeEvent, filename: string) => {
    try {
      assertTrustedIpcSender(event, 'open-file')
      if (!filename || typeof filename !== 'string') throw new Error('Invalid filename')
      if (path.basename(filename) !== filename) throw new Error('Invalid filename')
      const filePath = path.join(app.getPath('downloads'), filename)
      const data = await fs.readFile(filePath)
      return { success: true, data: { data } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[FileOps] Error opening file:', error)
      return { success: false, error: errorMessage }
    }
  })

  // Read an arbitrary local file by absolute path and return its ArrayBuffer
  ipcMain.handle('read-local-file', async (event: IpcMainInvokeEvent, absolutePath: string) => {
    try {
      assertTrustedIpcSender(event, 'read-local-file')
      const normalizedPath = assertAllowedReadPath(event, String(absolutePath), 'read-local-file')

      const data = await fs.readFile(normalizedPath)
      // Return a proper ArrayBuffer slice
      const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      return { success: true, data: arrayBuffer }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[FileOps] Error reading local file:', error)
      return { success: false, error: errorMessage }
    }
  })

  // Get a URL that can be used to stream video files
  ipcMain.handle('get-video-url', async (event: IpcMainInvokeEvent, filePath: string) => {
    try {
      assertTrustedIpcSender(event, 'get-video-url')
      if (!filePath) return null

      // If the renderer already has a usable URL, keep it as-is.
      // This avoids breaking thumbnails when paths are stored as `video-stream://...` etc.
      const lower = String(filePath).toLowerCase()
      const isAlreadyUrl =
        lower.startsWith('video-stream:') ||
        lower.startsWith('app:') ||
        lower.startsWith('file:') ||
        lower.startsWith('data:') ||
        lower.startsWith('blob:') ||
        lower.startsWith('http:') ||
        lower.startsWith('https:')
      if (isAlreadyUrl) {
        // Security: do not allow remote media URLs in production.
        if (!isDev && (lower.startsWith('http:') || lower.startsWith('https:'))) return null

        if (lower.startsWith('file:')) {
          const localPath = fileURLToPath(filePath)
          const normalizedPath = assertAllowedReadPath(event, localPath, 'get-video-url')
          await fs.access(normalizedPath)
          return await makeVideoSrc(normalizedPath, 'preview')
        }

        return filePath
      }

      const normalizedPath = path.resolve(filePath)
      if (path.isAbsolute(normalizedPath)) {
        const allowedPath = assertAllowedReadPath(event, normalizedPath, 'get-video-url')
        await fs.access(allowedPath)
        return await makeVideoSrc(allowedPath, 'preview')
      }

      // Fall back to resolving relative recording paths (e.g. stored project-relative filenames).
      const resolved = resolveRecordingFilePath(filePath)
      if (!resolved) return null
      const allowedResolved = assertAllowedReadPath(event, resolved, 'get-video-url')
      await fs.access(allowedResolved)
      return await makeVideoSrc(allowedResolved, 'preview')

    } catch {
      return null
    }
  })

  // Check if a file exists at the given path
  ipcMain.handle('file-exists', async (event: IpcMainInvokeEvent, filePath: string): Promise<boolean> => {
    try {
      assertTrustedIpcSender(event, 'file-exists')
      const candidate = assertAllowedReadPath(event, String(filePath), 'file-exists')
      await fs.access(candidate)
      return true
    } catch {
      return false
    }
  })

  // ============================================
  // Preview Proxy Handlers
  // ============================================

  // Generate a preview proxy for a large video file
  ipcMain.handle('generate-preview-proxy', async (
    event: IpcMainInvokeEvent,
    filePath: string,
    recordingId?: string
  ): Promise<{
    success: boolean
    proxyPath?: string
    proxyUrl?: string
    skipped?: boolean
    reason?: string
    error?: string
  }> => {
    try {
      assertTrustedIpcSender(event, 'generate-preview-proxy')
      const normalizedPath = assertAllowedReadPath(event, String(filePath), 'generate-preview-proxy')
      const progressKey = recordingId || normalizedPath
      let lastProgressSent = -1
      const result = await ensurePreviewProxy(normalizedPath, (progress) => {
        if (progress === lastProgressSent) return
        lastProgressSent = progress
        event.sender.send('proxy:progress', {
          recordingId: progressKey,
          type: 'preview',
          progress,
        })
      })

      if (result.success && result.proxyPath) {
        // Return both the path and a video-stream URL
        const proxyUrl = await makeVideoSrc(result.proxyPath, 'preview')
        return {
          success: true,
          proxyPath: result.proxyPath,
          proxyUrl,
        }
      }

      if (result.skipped) {
        return {
          success: true,
          skipped: true,
          reason: result.reason,
        }
      }

      return {
        success: false,
        error: result.error || 'Unknown error generating proxy',
      }
    } catch (error) {
      console.error('[FileOps] Error generating preview proxy:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  // Generate a glow proxy for the ambient glow player
  ipcMain.handle('generate-glow-proxy', async (
    event: IpcMainInvokeEvent,
    filePath: string,
    recordingId?: string
  ): Promise<{
    success: boolean
    proxyPath?: string
    proxyUrl?: string
    skipped?: boolean
    reason?: string
    error?: string
  }> => {
    try {
      assertTrustedIpcSender(event, 'generate-glow-proxy')
      const normalizedPath = assertAllowedReadPath(event, String(filePath), 'generate-glow-proxy')
      const progressKey = recordingId || normalizedPath
      let lastProgressSent = -1
      const result = await ensureGlowProxy(normalizedPath, (progress) => {
        if (progress === lastProgressSent) return
        lastProgressSent = progress
        event.sender.send('proxy:progress', {
          recordingId: progressKey,
          type: 'glow',
          progress,
        })
      })

      if (result.success && result.proxyPath) {
        const proxyUrl = await makeVideoSrc(result.proxyPath, 'preview')
        return {
          success: true,
          proxyPath: result.proxyPath,
          proxyUrl,
        }
      }

      if (result.skipped) {
        return {
          success: true,
          skipped: true,
          reason: result.reason,
        }
      }

      return {
        success: false,
        error: result.error || 'Unknown error generating glow proxy',
      }
    } catch (error) {
      console.error('[FileOps] Error generating glow proxy:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  // Check if a video needs a preview proxy (based on dimensions)
  ipcMain.handle('check-preview-proxy', async (
    event: IpcMainInvokeEvent,
    filePath: string
  ): Promise<{
    needsProxy: boolean
    existingProxyPath?: string
    existingProxyUrl?: string
  }> => {
    console.log('[FileOps] 📡 check-preview-proxy called for:', filePath)
    try {
      assertTrustedIpcSender(event, 'check-preview-proxy')
      const normalizedPath = assertAllowedReadPath(event, String(filePath), 'check-preview-proxy')

      // Check if there's an existing proxy
      const existingPath = await getExistingProxyPath(normalizedPath)
      if (existingPath) {
        console.log('[FileOps] ✅ Found existing proxy:', existingPath)
        const proxyUrl = await makeVideoSrc(existingPath, 'preview')
        return {
          needsProxy: false,
          existingProxyPath: existingPath,
          existingProxyUrl: proxyUrl,
        }
      }

      // Check if the video is large enough to need a proxy
      // Log the actual dimensions so we can see why it's being skipped
      const dimensions = await getVideoDimensions(normalizedPath)
      console.log('[FileOps] 📐 Detected video dimensions:', dimensions)

      const needs = await needsPreviewProxy(normalizedPath)
      console.log('[FileOps] 📐 Needs proxy (>2560px width)?', needs)
      return { needsProxy: needs }
    } catch (error) {
      console.error('[FileOps] Error checking preview proxy:', error)
      return { needsProxy: false }
    }
  })

  // Check if a glow proxy already exists
  ipcMain.handle('check-glow-proxy', async (
    event: IpcMainInvokeEvent,
    filePath: string
  ): Promise<{
    existingProxyPath?: string
    existingProxyUrl?: string
  }> => {
    try {
      assertTrustedIpcSender(event, 'check-glow-proxy')
      const normalizedPath = assertAllowedReadPath(event, String(filePath), 'check-glow-proxy')
      const existingPath = await getExistingGlowProxyPath(normalizedPath)
      if (existingPath) {
        const proxyUrl = await makeVideoSrc(existingPath, 'preview')
        return {
          existingProxyPath: existingPath,
          existingProxyUrl: proxyUrl,
        }
      }
      return {}
    } catch (error) {
      console.error('[FileOps] Error checking glow proxy:', error)
      return {}
    }
  })

  // Clear all preview proxies to free disk space
  ipcMain.handle('clear-preview-proxies', async (event: IpcMainInvokeEvent): Promise<{ success: boolean }> => {
    try {
      assertTrustedIpcSender(event, 'clear-preview-proxies')
      await clearPreviewProxies()
      return { success: true }
    } catch (error) {
      console.error('[FileOps] Error clearing preview proxies:', error)
      return { success: false }
    }
  })

  // Clear all glow proxies to free disk space
  ipcMain.handle('clear-glow-proxies', async (event: IpcMainInvokeEvent): Promise<{ success: boolean }> => {
    try {
      assertTrustedIpcSender(event, 'clear-glow-proxies')
      await clearGlowProxies()
      return { success: true }
    } catch (error) {
      console.error('[FileOps] Error clearing glow proxies:', error)
      return { success: false }
    }
  })

  // Get the size of all preview proxies on disk
  ipcMain.handle('get-proxy-cache-size', async (event: IpcMainInvokeEvent): Promise<{ size: number }> => {
    try {
      assertTrustedIpcSender(event, 'get-proxy-cache-size')
      const size = await getProxyCacheSize()
      return { size }
    } catch {
      return { size: 0 }
    }
  })

  // Approve read paths for drag-and-drop imports
  // This allows the protocol handler to serve files that were user-selected
  ipcMain.handle('approve-read-paths', async (event: IpcMainInvokeEvent, filePaths: string[]): Promise<void> => {
    assertTrustedIpcSender(event, 'approve-read-paths')
    if (!Array.isArray(filePaths)) return
    const rawPaths = filePaths.filter(p => typeof p === 'string' && p.length > 0)
    if (rawPaths.length === 0) return

    const normalizedPaths = rawPaths
      .map(p => path.resolve(p))
      .filter(p => path.isAbsolute(p))

    const existingFilePaths: string[] = []
    for (const p of normalizedPaths) {
      try {
        const stat = await fs.stat(p)
        if (stat.isFile()) existingFilePaths.push(p)
      } catch {
        // Ignore missing/inaccessible paths
      }
    }

    if (existingFilePaths.length > 0) {
      approveReadPaths(event.sender, existingFilePaths)
    }
  })

}
