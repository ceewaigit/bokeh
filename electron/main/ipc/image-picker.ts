/**
 * IPC handlers for custom image file selection.
 * Handles file picker dialogs and image loading for custom backgrounds.
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow, dialog, nativeImage } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'

// Allowed image extensions for validation
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.tiff', '.tif'])

// Track paths that were selected through the file dialog (security measure)
const validatedPaths = new Set<string>()

export function registerImagePickerHandlers(): void {
  // Image selection for custom backgrounds
  ipcMain.handle('select-image-file', async (event: IpcMainInvokeEvent) => {
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

  ipcMain.handle('load-image-as-data-url', async (_event: IpcMainInvokeEvent, imagePath: string) => {
    try {
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

      // 3. Path should have been selected through the file dialog
      // This prevents arbitrary file reads from compromised renderers
      if (!validatedPaths.has(imagePath)) {
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
