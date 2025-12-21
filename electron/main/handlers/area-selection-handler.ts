import { ipcMain } from 'electron'
import { areaSelectionService } from '../services/area-selection-service'

/**
 * Registers IPC handlers for area selection functionality.
 * This handler delegates to the AreaSelectionService for the actual implementation.
 */
export function registerAreaSelectionHandlers(): void {
  ipcMain.handle('select-screen-area', async () => {
    return areaSelectionService.selectArea()
  })
}
