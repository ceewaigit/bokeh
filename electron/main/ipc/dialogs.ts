import { ipcMain, dialog, BrowserWindow, IpcMainInvokeEvent, MessageBoxOptions, SaveDialogOptions, OpenDialogOptions } from 'electron'
import { approveReadPaths, approveSavePath } from '../utils/ipc-path-approvals'
import { assertTrustedIpcSender } from '../utils/ipc-security'

export function registerDialogHandlers(): void {
  ipcMain.handle('show-message-box', async (event: IpcMainInvokeEvent, options: MessageBoxOptions) => {
    try {
      assertTrustedIpcSender(event, 'show-message-box')
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showMessageBox(window!, options)
      return result
    } catch (error) {
      console.error('Error showing message box:', error)
      return { response: 0, checkboxChecked: false }
    }
  })

  ipcMain.handle('show-save-dialog', async (event: IpcMainInvokeEvent, options: SaveDialogOptions) => {
    try {
      assertTrustedIpcSender(event, 'show-save-dialog')
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)
      if (!result.canceled && result.filePath) {
        approveSavePath(event.sender, result.filePath)
      }
      return result
    } catch (error) {
      console.error('Error showing save dialog:', error)
      return { canceled: true }
    }
  })

  ipcMain.handle('show-open-dialog', async (event: IpcMainInvokeEvent, options: OpenDialogOptions) => {
    try {
      assertTrustedIpcSender(event, 'show-open-dialog')
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      if (!result.canceled && Array.isArray(result.filePaths) && result.filePaths.length > 0) {
        approveReadPaths(event.sender, result.filePaths)
      }
      return result
    } catch (error) {
      console.error('Error showing open dialog:', error)
      return { canceled: true }
    }
  })
}
