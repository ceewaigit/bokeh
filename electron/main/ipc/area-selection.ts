import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { areaSelectionService } from '../services/area-selection-service'
import { assertTrustedIpcSender } from '../utils/ipc-security'

/**
 * Registers IPC handlers for area selection functionality.
 * This handler delegates to the AreaSelectionService for the actual implementation.
 */
export function registerAreaSelectionHandlers(): void {
  ipcMain.handle('select-screen-area', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'select-screen-area')
    return areaSelectionService.selectArea()
  })
}
