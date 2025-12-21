import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { PermissionService } from '../services/permission-service'

export function registerPermissionHandlers(): void {
  const permissionService = PermissionService.getInstance()

  ipcMain.handle('check-screen-recording-permission', async () => {
    return permissionService.checkScreenRecordingPermission()
  })

  ipcMain.handle('start-permission-monitoring', async (event: IpcMainInvokeEvent) => {
    permissionService.startMonitoring(event.sender)
  })

  ipcMain.handle('stop-permission-monitoring', async () => {
    permissionService.stopMonitoring()
  })

  ipcMain.handle('request-screen-recording-permission', async () => {
    return permissionService.requestScreenRecordingPermission()
  })

  ipcMain.handle('check-microphone-permission', async () => {
    return permissionService.checkMicrophonePermission()
  })

  ipcMain.handle('request-microphone-permission', async () => {
    return permissionService.requestMicrophonePermission()
  })

  ipcMain.handle('set-mock-permissions', async (_, permissions: { screen?: boolean; microphone?: boolean }) => {
    permissionService.setMockPermissions(permissions)
  })
}