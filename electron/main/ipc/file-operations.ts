import { ipcMain, app, IpcMainInvokeEvent } from 'electron'
import * as path from 'path'
import { promises as fs } from 'fs'
import { makeVideoSrc } from '../utils/video-url-factory'
import { resolveRecordingFilePath } from '../utils/file-resolution'
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

export function registerFileOperationHandlers(): void {
  // Generate a thumbnail using ffmpeg (fallback for unsupported formats)
  ipcMain.handle('generate-video-thumbnail', async (_event: IpcMainInvokeEvent, options: any) => {
    try {
      const { path: videoPath, width, height, timestamp } = options
      const result = await generateThumbnail(videoPath, { width, height, timestamp })
      return result
    } catch (error) {
      console.error('[FileOps] Error generating thumbnail:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get video metadata (width, height, duration) using ffprobe
  // This is reliable even for formats the renderer cannot play directly (e.g. 6K HEVC)
  ipcMain.handle('get-video-metadata', async (_event: IpcMainInvokeEvent, filePath: string) => {
    console.log('[FileOps] 🛰️ get-video-metadata called for:', filePath)
    try {
      const normalizedPath = path.resolve(filePath)
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
      // Determine final save path. If a path is provided but has no extension, default to mp4.
      let finalPath = filepath
      if (!finalPath) {
        finalPath = path.join(app.getPath('downloads'), 'recording.mp4')
      } else {
        const ext = path.extname(finalPath)
        if (!ext) {
          finalPath = `${finalPath}.mp4`
        }
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

      await fs.writeFile(finalPath, buffer)
      console.log(`[FileOps] ✅ File saved: ${finalPath} (${buffer.length} bytes)`)
      return { success: true, path: finalPath }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[FileOps] Error saving file:', error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('open-file', async (event: IpcMainInvokeEvent, filename: string) => {
    try {
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
  ipcMain.handle('read-local-file', async (_event: IpcMainInvokeEvent, absolutePath: string) => {
    try {
      const data = await fs.readFile(absolutePath)
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
  ipcMain.handle('get-video-url', async (_event: IpcMainInvokeEvent, filePath: string) => {
    try {
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
      if (isAlreadyUrl) return filePath

      const normalizedPath = path.resolve(filePath)
      try {
        await fs.access(normalizedPath)
        // Return video-stream URL using our safe encoding utility
        // Use the unified video URL factory for consistency
        return await makeVideoSrc(normalizedPath, 'preview')
      } catch {
        // Fall back to resolving relative recording paths (e.g. stored project-relative filenames).
        const resolved = resolveRecordingFilePath(filePath)
        if (!resolved) return null
        await fs.access(resolved)
        return await makeVideoSrc(resolved, 'preview')
      }

    } catch {
      return null
    }
  })

  // Check if a file exists at the given path
  ipcMain.handle('file-exists', async (_event: IpcMainInvokeEvent, filePath: string): Promise<boolean> => {
    try {
      await fs.access(path.resolve(filePath))
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
      const normalizedPath = path.resolve(filePath)
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
      const normalizedPath = path.resolve(filePath)
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
    _event: IpcMainInvokeEvent,
    filePath: string
  ): Promise<{
    needsProxy: boolean
    existingProxyPath?: string
    existingProxyUrl?: string
  }> => {
    console.log('[FileOps] 📡 check-preview-proxy called for:', filePath)
    try {
      const normalizedPath = path.resolve(filePath)

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
    _event: IpcMainInvokeEvent,
    filePath: string
  ): Promise<{
    existingProxyPath?: string
    existingProxyUrl?: string
  }> => {
    try {
      const normalizedPath = path.resolve(filePath)
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
  ipcMain.handle('clear-preview-proxies', async (): Promise<{ success: boolean }> => {
    try {
      await clearPreviewProxies()
      return { success: true }
    } catch (error) {
      console.error('[FileOps] Error clearing preview proxies:', error)
      return { success: false }
    }
  })

  // Clear all glow proxies to free disk space
  ipcMain.handle('clear-glow-proxies', async (): Promise<{ success: boolean }> => {
    try {
      await clearGlowProxies()
      return { success: true }
    } catch (error) {
      console.error('[FileOps] Error clearing glow proxies:', error)
      return { success: false }
    }
  })

  // Get the size of all preview proxies on disk
  ipcMain.handle('get-proxy-cache-size', async (): Promise<{ size: number }> => {
    try {
      const size = await getProxyCacheSize()
      return { size }
    } catch {
      return { size: 0 }
    }
  })

}
