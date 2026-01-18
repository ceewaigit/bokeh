import { ipcMain, IpcMainInvokeEvent, app } from 'electron'
import * as path from 'path'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import { randomUUID } from 'crypto'
import { getRecordingsDirectory } from '../config'
import { isPathWithin, isPathWithinAny } from '../utils/path-validation'
import { assertTrustedIpcSender } from '../utils/ipc-security'

// Active recording file handles for streaming
const activeRecordings = new Map<string, fsSync.WriteStream>()
// Track last activity time for each stream to detect idle streams
const streamLastActivity = new Map<string, number>()
// Idle stream timeout (5 minutes)
const STREAM_IDLE_TIMEOUT_MS = 5 * 60 * 1000
// Cleanup check interval (1 minute)
const CLEANUP_CHECK_INTERVAL_MS = 60 * 1000
let streamCleanupInterval: NodeJS.Timeout | null = null

// Start periodic cleanup of idle streams
function startStreamCleanup(): void {
  if (streamCleanupInterval) return

  streamCleanupInterval = setInterval(() => {
    const now = Date.now()
    const toCleanup: string[] = []

    streamLastActivity.forEach((lastActivity, filePath) => {
      if (now - lastActivity > STREAM_IDLE_TIMEOUT_MS) {
        toCleanup.push(filePath)
      }
    })

    toCleanup.forEach(filePath => {
      const stream = activeRecordings.get(filePath)
      if (stream) {
        console.warn(`[Recording] Closing idle stream (no activity for ${STREAM_IDLE_TIMEOUT_MS / 1000}s): ${filePath}`)
        stream.end()
        activeRecordings.delete(filePath)
        streamLastActivity.delete(filePath)
      }
    })
  }, CLEANUP_CHECK_INTERVAL_MS)
}

// Stop cleanup interval when no active recordings
function stopStreamCleanupIfEmpty(): void {
  if (activeRecordings.size === 0 && streamCleanupInterval) {
    clearInterval(streamCleanupInterval)
    streamCleanupInterval = null
  }
}

// Clean up orphaned temp files from previous sessions on startup
async function cleanupOrphanedTempFiles(): Promise<void> {
  try {
    const tempDir = app.getPath('temp')
    const entries = await fs.readdir(tempDir)
    const orphanedFiles = entries.filter(
      name => name.startsWith('bokeh-recording-') || name.startsWith('metadata-')
    )

    for (const file of orphanedFiles) {
      const filePath = path.join(tempDir, file)
      try {
        await fs.unlink(filePath)
        console.log(`[Recording] Cleaned up orphaned temp file: ${file}`)
      } catch {
        // File may be in use or already deleted, ignore
      }
    }
  } catch (error) {
    console.warn('[Recording] Failed to clean up orphaned temp files:', error)
  }
}

const sanitizeName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')

const ensureUniquePath = async (baseDir: string, baseName: string, extension: string): Promise<string> => {
  let suffix = ''
  let attempt = 0
  while (true) {
    const candidate = path.join(baseDir, `${baseName}${suffix}${extension}`)
    if (!fsSync.existsSync(candidate)) {
      return candidate
    }
    attempt += 1
    suffix = `-${attempt}`
  }
}

function sanitizeExtension(extension: string): string {
  const safe = String(extension).toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (!safe) return 'webm'
  return safe.slice(0, 10)
}

function _getAllowedRoots(): { recordingsDir: string; tempDir: string } {
  return {
    recordingsDir: path.resolve(getRecordingsDirectory()),
    tempDir: path.resolve(app.getPath('temp')),
  }
}

export function registerRecordingHandlers(): void {
  // Clean up orphaned temp files from previous sessions
  cleanupOrphanedTempFiles()

  ipcMain.handle('start-recording', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'start-recording')
    return { success: true, recordingsDir: getRecordingsDirectory() }
  })

  ipcMain.handle('stop-recording', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'stop-recording')
    return { success: true }
  })

  ipcMain.handle('get-recordings-directory', (event: IpcMainInvokeEvent): string => {
    assertTrustedIpcSender(event, 'get-recordings-directory')
    return getRecordingsDirectory()
  })

  ipcMain.handle('save-recording', async (event: IpcMainInvokeEvent, filePath: string, buffer: Buffer) => {
    try {
      assertTrustedIpcSender(event, 'save-recording')
      const normalizedPath = path.resolve(filePath)
      const recordingsDir = path.resolve(getRecordingsDirectory())
      const tempDir = path.resolve(app.getPath('temp'))

      // Validate that the path is within recordings or temp directory
      if (!isPathWithin(normalizedPath, recordingsDir) && !isPathWithin(normalizedPath, tempDir)) {
        console.error('[Recording] Access denied: path outside allowed directories:', normalizedPath)
        return { success: false, error: 'Access denied: path outside allowed directories' }
      }

      const dir = path.dirname(normalizedPath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(normalizedPath, Buffer.from(buffer))
      return { success: true, data: { filePath: normalizedPath } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to save:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('load-recordings', async (event: IpcMainInvokeEvent) => {
    try {
      assertTrustedIpcSender(event, 'load-recordings')
      const recordingsDir = getRecordingsDirectory()

      const results: Array<{ name: string; path: string; timestamp: Date; size: number }> = []

      // Local constants for file extensions to avoid magic strings
      const EXT_BOKEH = '.bokeh'
      const PROJECT_PACKAGE_FILE = 'project.json'

      async function walk(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            if (entry.name.endsWith(EXT_BOKEH)) {
              const projectFilePath = path.join(fullPath, PROJECT_PACKAGE_FILE)
              if (fsSync.existsSync(projectFilePath)) {
                const stats = fsSync.statSync(projectFilePath)
                results.push({ name: entry.name, path: fullPath, timestamp: stats.mtime, size: stats.size })
              }
              continue
            }
            await walk(fullPath)
          } else if (entry.isFile() && entry.name.endsWith(EXT_BOKEH)) {
            const stats = fsSync.statSync(fullPath)
            results.push({ name: entry.name, path: fullPath, timestamp: stats.mtime, size: stats.size })
          }
        }
      }

      await walk(recordingsDir)

      const recordings = results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      return recordings
    } catch (error) {
      console.error('[Recording] Failed to load recordings:', error)
      return []
    }
  })

  ipcMain.handle('get-file-size', async (event: IpcMainInvokeEvent, filePath: string) => {
    try {
      assertTrustedIpcSender(event, 'get-file-size')
      const normalizedPath = path.resolve(filePath)
      const recordingsDir = path.resolve(getRecordingsDirectory())
      const tempDir = path.resolve(app.getPath('temp'))

      // Validate that the path is within allowed directories
      if (!isPathWithinAny(normalizedPath, [recordingsDir, tempDir])) {
        console.error('[Recording] Access denied: path outside allowed directories:', normalizedPath)
        return { success: false, error: 'Access denied: path outside allowed directories' }
      }

      const stats = await fs.stat(normalizedPath)
      return { success: true, data: { size: stats.size } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to get file size:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('delete-recording-project', async (event: IpcMainInvokeEvent, projectFilePath: string) => {
    try {
      assertTrustedIpcSender(event, 'delete-recording-project')
      if (!projectFilePath || typeof projectFilePath !== 'string') {
        return { success: false, error: 'Invalid path' }
      }

      const recordingsDir = path.resolve(getRecordingsDirectory())
      const resolvedProjectFile = path.resolve(projectFilePath)

      if (!resolvedProjectFile.endsWith('.bokeh')) {
        return { success: false, error: 'Not a project file' }
      }

      // Ensure the target is within the recordings directory.
      if (!isPathWithin(resolvedProjectFile, recordingsDir)) {
        return { success: false, error: 'Path outside recordings directory' }
      }

      const stats = await fs.lstat(resolvedProjectFile)
      const projectFolder = stats.isDirectory() ? resolvedProjectFile : path.dirname(resolvedProjectFile)

      if (projectFolder === recordingsDir) {
        // Safety fallback: only remove the project file if it lives at the root.
        if (!stats.isDirectory()) {
          await fs.unlink(resolvedProjectFile)
        }
        return { success: true }
      }

      if (!isPathWithin(projectFolder, recordingsDir)) {
        return { success: false, error: 'Invalid project folder' }
      }

      await fs.rm(projectFolder, { recursive: true, force: true })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to delete project:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('duplicate-recording-project', async (event: IpcMainInvokeEvent, projectFilePath: string, newName?: string) => {
    try {
      assertTrustedIpcSender(event, 'duplicate-recording-project')
      if (!projectFilePath || typeof projectFilePath !== 'string') {
        return { success: false, error: 'Invalid path' }
      }

      const recordingsDir = path.resolve(getRecordingsDirectory())
      const resolvedProjectFile = path.resolve(projectFilePath)

      if (!resolvedProjectFile.endsWith('.bokeh')) {
        return { success: false, error: 'Not a project file' }
      }

      if (!isPathWithin(resolvedProjectFile, recordingsDir)) {
        return { success: false, error: 'Path outside recordings directory' }
      }

      const stats = await fs.lstat(resolvedProjectFile)
      const isDirectory = stats.isDirectory()
      const sourceDir = isDirectory ? resolvedProjectFile : path.dirname(resolvedProjectFile)
      const sourceBaseName = path.basename(sourceDir, '.bokeh')
      const sanitized = sanitizeName(newName || `${sourceBaseName} Copy`) || `Recording_${Date.now()}`

      const targetPath = await ensureUniquePath(recordingsDir, sanitized, '.bokeh')

      if (isDirectory) {
        await fs.cp(sourceDir, targetPath, { recursive: true })
      } else {
        await fs.copyFile(resolvedProjectFile, targetPath)
      }

      const projectJsonPath = isDirectory
        ? path.join(targetPath, 'project.json')
        : targetPath

      if (fsSync.existsSync(projectJsonPath)) {
        try {
          const fileData = await fs.readFile(projectJsonPath, 'utf8')
          const project = JSON.parse(fileData)
          project.name = newName || project.name || sanitized
          project.id = `project-${Date.now()}`
          project.filePath = targetPath
          project.modifiedAt = new Date().toISOString()
          await fs.writeFile(projectJsonPath, JSON.stringify(project))
        } catch (error) {
          console.warn('[Recording] Failed to update duplicated project metadata:', error)
        }
      }

      return { success: true, data: { path: targetPath } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to duplicate project:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // ========== NEW STREAMING HANDLERS ==========

  // Create a temporary recording file and return its path
  ipcMain.handle('create-temp-recording-file', async (event: IpcMainInvokeEvent, extension: string = 'webm') => {
    try {
      assertTrustedIpcSender(event, 'create-temp-recording-file')
      const tempDir = app.getPath('temp')
      const safeExt = sanitizeExtension(extension)
      const tempPath = path.join(tempDir, `bokeh-recording-${randomUUID()}.${safeExt}`)

      // Create write stream for this recording
      const stream = fsSync.createWriteStream(tempPath, { flags: 'w' })
      activeRecordings.set(tempPath, stream)

      // Track last activity time for idle stream cleanup
      streamLastActivity.set(tempPath, Date.now())

      // Start cleanup interval if not already running
      startStreamCleanup()

      console.log(`[Recording] Created temp file: ${tempPath}`)
      return { success: true, data: tempPath }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to create temp file:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Append chunk to recording file (streaming write)
  ipcMain.handle('append-to-recording', async (event: IpcMainInvokeEvent, filePath: string, chunk: ArrayBuffer | Buffer) => {
    try {
      assertTrustedIpcSender(event, 'append-to-recording')
      const stream = activeRecordings.get(filePath)
      if (!stream) {
        throw new Error(`No active stream for ${filePath}`)
      }

      // Update last activity time
      streamLastActivity.set(filePath, Date.now())

      // Convert ArrayBuffer to Buffer if needed
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)

      return new Promise((resolve) => {
        // Handle backpressure: if write returns false, wait for drain
        const canContinue = stream.write(buffer, (err) => {
          if (err) {
            console.error(`[Recording] Write error for ${filePath}:`, err)
            resolve({ success: false, error: err.message })
          }
        })

        if (canContinue) {
          resolve({ success: true })
        } else {
          // Backpressure: wait for drain event before resolving
          stream.once('drain', () => {
            resolve({ success: true, backpressure: true })
          })
        }
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to append chunk:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Close recording stream and finalize file
  ipcMain.handle('finalize-recording', async (event: IpcMainInvokeEvent, filePath: string) => {
    try {
      assertTrustedIpcSender(event, 'finalize-recording')
      const stream = activeRecordings.get(filePath)
      if (!stream) {
        console.warn(`[Recording] No active stream for ${filePath}, may already be finalized`)
        // Clean up activity tracking just in case
        streamLastActivity.delete(filePath)
        stopStreamCleanupIfEmpty()
        return { success: true }
      }

      return new Promise((resolve) => {
        stream.end(() => {
          activeRecordings.delete(filePath)
          streamLastActivity.delete(filePath)
          stopStreamCleanupIfEmpty()
          console.log(`[Recording] Finalized: ${filePath}`)
          resolve({ success: true })
        })
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to finalize:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Move file from temp to final location
  ipcMain.handle('move-file', async (event: IpcMainInvokeEvent, sourcePath: string, destPath: string) => {
    try {
      assertTrustedIpcSender(event, 'move-file')
      const normalizedSource = path.resolve(sourcePath)
      const normalizedDest = path.resolve(destPath)
      const recordingsDir = path.resolve(getRecordingsDirectory())
      const tempDir = path.resolve(app.getPath('temp'))

      // Validate that both paths are within allowed directories
      if (!isPathWithinAny(normalizedSource, [recordingsDir, tempDir])) {
        console.error('[Recording] Access denied: source path outside allowed directories:', normalizedSource)
        return { success: false, error: 'Access denied: source path outside allowed directories' }
      }

      // Security: only allow moving files into the recordings directory.
      if (!isPathWithinAny(normalizedDest, [recordingsDir])) {
        console.error('[Recording] Access denied: destination path outside allowed directories:', normalizedDest)
        return { success: false, error: 'Access denied: destination path outside allowed directories' }
      }

      // Ensure destination directory exists
      const destDir = path.dirname(normalizedDest)
      await fs.mkdir(destDir, { recursive: true })

      // Move the file
      await fs.rename(normalizedSource, normalizedDest)

      console.log(`[Recording] Moved ${normalizedSource} to ${normalizedDest}`)
      return { success: true, data: normalizedDest }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to move file:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Create metadata file for streaming writes
  ipcMain.handle('create-metadata-file', async (event: IpcMainInvokeEvent) => {
    try {
      assertTrustedIpcSender(event, 'create-metadata-file')
      const tempDir = app.getPath('temp')
      const metadataPath = path.join(tempDir, `metadata-${randomUUID()}.json`)

      // Initialize with empty array
      await fs.writeFile(metadataPath, '[\n', 'utf8')

      console.log(`[Recording] Created metadata file: ${metadataPath}`)
      return { success: true, data: metadataPath }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to create metadata file:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Append metadata batch to file
  ipcMain.handle('append-metadata-batch', async (event: IpcMainInvokeEvent, filePath: string, batch: any[], isLast: boolean = false) => {
    try {
      assertTrustedIpcSender(event, 'append-metadata-batch')
      const normalizedPath = path.resolve(filePath)
      const tempDir = path.resolve(app.getPath('temp'))
      const metadataNameOk = /^metadata-[0-9a-f-]{36}\.json$/i.test(path.basename(normalizedPath))

      // Validate that the path is within allowed directories
      if (!metadataNameOk || !isPathWithinAny(normalizedPath, [tempDir])) {
        console.error('[Recording] Access denied: path outside allowed directories:', normalizedPath)
        return { success: false, error: 'Access denied: path outside allowed directories' }
      }

      // Convert batch to JSON lines
      const jsonLines = batch.map(item => JSON.stringify(item)).join(',\n')
      const content = isLast ? jsonLines + '\n]' : jsonLines + ',\n'

      await fs.appendFile(normalizedPath, content, 'utf8')

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to append metadata:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Read metadata from file
  // Maximum metadata file size (10MB) to prevent DoS attacks
  const MAX_METADATA_SIZE = 10 * 1024 * 1024

  ipcMain.handle('read-metadata-file', async (event: IpcMainInvokeEvent, filePath: string) => {
    try {
      assertTrustedIpcSender(event, 'read-metadata-file')
      const normalizedPath = path.resolve(filePath)
      const tempDir = path.resolve(app.getPath('temp'))
      const metadataNameOk = /^metadata-[0-9a-f-]{36}\.json$/i.test(path.basename(normalizedPath))

      // Validate that the path is within allowed directories
      if (!metadataNameOk || !isPathWithinAny(normalizedPath, [tempDir])) {
        console.error('[Recording] Access denied: path outside allowed directories:', normalizedPath)
        return { success: false, error: 'Access denied: path outside allowed directories' }
      }

      // Check file size before reading to prevent DoS
      const stat = await fs.stat(normalizedPath)
      if (stat.size > MAX_METADATA_SIZE) {
        console.error('[Recording] Metadata file too large:', stat.size, 'bytes')
        return { success: false, error: 'Metadata file too large' }
      }

      const content = await fs.readFile(normalizedPath, 'utf8')
      let metadata: unknown

      try {
        metadata = JSON.parse(content)
      } catch (parseError) {
        const trimmed = content.trim()

        if (trimmed === '' || trimmed === '[') {
          metadata = []
        } else {
          let repaired = trimmed.replace(/,\s*$/, '')
          repaired = repaired.replace(/,\s*]$/, ']')
          if (!repaired.endsWith(']')) {
            repaired = `${repaired}\n]`
          }

          try {
            metadata = JSON.parse(repaired)
            console.warn('[Recording] Repaired malformed metadata JSON for', filePath)
          } catch {
            throw parseError
          }
        }
      }

      // Clean up temp file
      await fs.unlink(normalizedPath).catch(() => { })

      return { success: true, data: metadata }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to read metadata:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Cleanup any orphaned streams on app quit
  app.on('before-quit', () => {
    // Clear cleanup interval
    if (streamCleanupInterval) {
      clearInterval(streamCleanupInterval)
      streamCleanupInterval = null
    }

    activeRecordings.forEach((stream, filePath) => {
      console.log(`[Recording] Cleaning up stream: ${filePath}`)
      stream.end()
    })
    activeRecordings.clear()
    streamLastActivity.clear()
  })

  // List metadata files in a recording directory
  ipcMain.handle('list-metadata-files', async (event: IpcMainInvokeEvent, folderPath: string) => {
    try {
      assertTrustedIpcSender(event, 'list-metadata-files')
      if (!folderPath) return { success: false, error: 'No folder path provided' }

      const normalizedPath = path.resolve(folderPath)
      const recordingsDir = path.resolve(getRecordingsDirectory())

      // Validate that the path is within allowed directories
      if (!isPathWithinAny(normalizedPath, [recordingsDir])) {
        console.error('[Recording] Access denied: path outside allowed directories:', normalizedPath)
        return { success: false, error: 'Access denied: path outside allowed directories' }
      }

      const entries = await fs.readdir(normalizedPath, { withFileTypes: true })

      const files = entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .filter(entry => {
          // Match format: mouse-0.json, keyboard-0.json, etc.
          return /^(mouse|keyboard|click|scroll|screen)-\d+\.json$/.test(entry.name)
        })
        .map(entry => entry.name)

      return { success: true, files }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`[Recording] Failed to list metadata files in ${folderPath}:`, errorMessage)
      return { success: false, error: errorMessage }
    }
  })
}
