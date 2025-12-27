import { ipcMain, IpcMainInvokeEvent, app } from 'electron'
import * as path from 'path'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import { getRecordingsDirectory } from '../config'

// Active recording file handles for streaming
const activeRecordings = new Map<string, fsSync.WriteStream>()

export function registerRecordingHandlers(): void {
  ipcMain.handle('start-recording', async () => {
    return { success: true, recordingsDir: getRecordingsDirectory() }
  })

  ipcMain.handle('stop-recording', async () => {
    return { success: true }
  })

  ipcMain.handle('get-recordings-directory', (): string => {
    return getRecordingsDirectory()
  })

  ipcMain.handle('save-recording', async (event: IpcMainInvokeEvent, filePath: string, buffer: Buffer) => {
    try {
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, Buffer.from(buffer))
      return { success: true, data: { filePath } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to save:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('load-recordings', async () => {
    try {
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
      const stats = await fs.stat(filePath)
      return { success: true, data: { size: stats.size } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to get file size:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('delete-recording-project', async (_event: IpcMainInvokeEvent, projectFilePath: string) => {
    try {
      if (!projectFilePath || typeof projectFilePath !== 'string') {
        return { success: false, error: 'Invalid path' }
      }

      const recordingsDir = path.resolve(getRecordingsDirectory())
      const resolvedProjectFile = path.resolve(projectFilePath)

      if (!resolvedProjectFile.endsWith('.bokeh')) {
        return { success: false, error: 'Not a project file' }
      }

      // Ensure the target is within the recordings directory.
      const within = (candidate: string, base: string) => {
        const rel = path.relative(base, candidate)
        return rel && !rel.startsWith('..') && !path.isAbsolute(rel)
      }

      if (!within(resolvedProjectFile, recordingsDir)) {
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

      if (!within(projectFolder, recordingsDir)) {
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

  // ========== NEW STREAMING HANDLERS ==========

  // Create a temporary recording file and return its path
  ipcMain.handle('create-temp-recording-file', async (event: IpcMainInvokeEvent, extension: string = 'webm') => {
    try {
      const tempDir = app.getPath('temp')
      const timestamp = Date.now()
      const tempPath = path.join(tempDir, `bokeh-recording-${Date.now()}.${extension}`)

      // Create write stream for this recording
      const stream = fsSync.createWriteStream(tempPath, { flags: 'w' })
      activeRecordings.set(tempPath, stream)

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
      const stream = activeRecordings.get(filePath)
      if (!stream) {
        throw new Error(`No active stream for ${filePath}`)
      }

      // Convert ArrayBuffer to Buffer if needed
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)

      return new Promise((resolve) => {
        stream.write(buffer, (err) => {
          if (err) {
            console.error(`[Recording] Write error for ${filePath}:`, err)
            resolve({ success: false, error: err.message })
          } else {
            resolve({ success: true })
          }
        })
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
      const stream = activeRecordings.get(filePath)
      if (!stream) {
        console.warn(`[Recording] No active stream for ${filePath}, may already be finalized`)
        return { success: true }
      }

      return new Promise((resolve) => {
        stream.end(() => {
          activeRecordings.delete(filePath)
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
      // Ensure destination directory exists
      const destDir = path.dirname(destPath)
      await fs.mkdir(destDir, { recursive: true })

      // Move the file
      await fs.rename(sourcePath, destPath)

      console.log(`[Recording] Moved ${sourcePath} to ${destPath}`)
      return { success: true, data: destPath }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to move file:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Create metadata file for streaming writes
  ipcMain.handle('create-metadata-file', async (event: IpcMainInvokeEvent) => {
    try {
      const tempDir = app.getPath('temp')
      const timestamp = Date.now()
      const metadataPath = path.join(tempDir, `metadata-${timestamp}.json`)

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
      // Convert batch to JSON lines
      const jsonLines = batch.map(item => JSON.stringify(item)).join(',\n')
      const content = isLast ? jsonLines + '\n]' : jsonLines + ',\n'

      await fs.appendFile(filePath, content, 'utf8')

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to append metadata:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Read metadata from file
  ipcMain.handle('read-metadata-file', async (event: IpcMainInvokeEvent, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf8')
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
          } catch (repairError) {
            throw parseError
          }
        }
      }

      // Clean up temp file
      await fs.unlink(filePath).catch(() => { })

      return { success: true, data: metadata }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to read metadata:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Cleanup any orphaned streams on app quit
  app.on('before-quit', () => {
    activeRecordings.forEach((stream, path) => {
      console.log(`[Recording] Cleaning up stream: ${path}`)
      stream.end()
    })
    activeRecordings.clear()
  })

  // List metadata files in a recording directory
  ipcMain.handle('list-metadata-files', async (event: IpcMainInvokeEvent, folderPath: string) => {
    try {
      if (!folderPath) return { success: false, error: 'No folder path provided' }

      const entries = await fs.readdir(folderPath, { withFileTypes: true })

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
