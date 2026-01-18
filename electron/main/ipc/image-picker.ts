/**
 * IPC handlers for custom image file selection.
 * Handles file picker dialogs and image loading for custom backgrounds.
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow, dialog, nativeImage, app } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { assertTrustedIpcSender } from '../utils/ipc-security'

// Allowed image extensions for validation
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.tiff', '.tif'])

// Track paths that were selected through the file dialog (security measure)
const validatedPaths = new Set<string>()

/**
 * Check if a path is within a trusted app directory.
 * Trusted directories include bundled resources and the user's Bokeh Captures folder.
 *
 * Security: Uses realpathSync to resolve symlinks, preventing symlink traversal attacks.
 */
function isTrustedAppPath(imagePath: string): boolean {
  // Resolve symlinks to get the real path - prevents symlink traversal attacks
  let realPath: string
  try {
    realPath = fsSync.realpathSync(imagePath)
  } catch {
    // File doesn't exist or can't be accessed - not trusted
    return false
  }

  const normalizedPath = path.normalize(realPath)

  // App resources directory (bundled assets like wallpapers, mockups, parallax)
  const resourcesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'public')
    : path.join(process.cwd(), 'public')

  // User's Bokeh Captures directory (for thumbnails in .bokeh project folders)
  const userDocuments = app.getPath('documents')
  const bokehCapturesPath = path.join(userDocuments, 'Bokeh Captures')

  // Check if path is within trusted directories
  const trustedPaths = [resourcesPath, bokehCapturesPath]

  for (const trusted of trustedPaths) {
    const normalizedTrusted = path.normalize(trusted)
    if (normalizedPath.startsWith(normalizedTrusted + path.sep) || normalizedPath === normalizedTrusted) {
      return true
    }
  }

  return false
}

export function registerImagePickerHandlers(): void {
  // Image selection for custom backgrounds
  ipcMain.handle('select-image-file', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'select-image-file')
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

    const selectedPath = result.filePaths[0]
    // Track this path as validated (user selected it through the dialog)
    validatedPaths.add(selectedPath)
    return selectedPath
  })

  ipcMain.handle('load-image-as-data-url', async (event: IpcMainInvokeEvent, imagePath: string) => {
    try {
      assertTrustedIpcSender(event, 'load-image-as-data-url')
      // Security validation
      // 1. Path must be absolute (no relative path traversal)
      if (!path.isAbsolute(imagePath)) {
        throw new Error('Invalid path: must be absolute')
      }

      // 2. Extension must be an allowed image type
      const ext = path.extname(imagePath).toLowerCase()
      if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
        throw new Error(`Invalid file type: ${ext}`)
      }

      // 3. Path should either be selected through file dialog OR be within trusted app directories
      // This prevents arbitrary file reads from compromised renderers while allowing
      // bundled assets and project thumbnails to be loaded
      if (!validatedPaths.has(imagePath) && !isTrustedAppPath(imagePath)) {
        console.warn('[ImagePicker] Attempt to load unvalidated path:', imagePath)
        throw new Error('Access denied: path not selected through file picker')
      }

      // Read the image file
      const imageBuffer = await fs.readFile(imagePath)
      const image = nativeImage.createFromBuffer(imageBuffer)

      // Convert to data URL
      return image.toDataURL()
    } catch (error) {
      console.error('[ImagePicker] Error loading image as data URL:', error)
      throw error
    }
  })
}
