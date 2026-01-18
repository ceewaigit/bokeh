import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { PermissionService } from '../services/permission-service'
import { isDev } from '../config'
import { assertTrustedIpcSender } from '../utils/ipc-security'

export function registerPermissionHandlers(): void {
  const permissionService = PermissionService.getInstance()

  ipcMain.handle('check-screen-recording-permission', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'check-screen-recording-permission')
    return permissionService.checkScreenRecordingPermission()
  })

  ipcMain.handle('start-permission-monitoring', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'start-permission-monitoring')
    permissionService.startMonitoring(event.sender)
  })

  ipcMain.handle('stop-permission-monitoring', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'stop-permission-monitoring')
    permissionService.stopMonitoring()
  })

  ipcMain.handle('request-screen-recording-permission', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'request-screen-recording-permission')
    return permissionService.requestScreenRecordingPermission()
  })

  ipcMain.handle('check-microphone-permission', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'check-microphone-permission')
    return permissionService.checkMicrophonePermission()
  })

  ipcMain.handle('request-microphone-permission', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'request-microphone-permission')
    return permissionService.requestMicrophonePermission()
  })

  ipcMain.handle('check-camera-permission', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'check-camera-permission')
    return permissionService.checkCameraPermission()
  })

  ipcMain.handle('request-camera-permission', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'request-camera-permission')
    return permissionService.requestCameraPermission()
  })

  ipcMain.handle('set-mock-permissions', async (event: IpcMainInvokeEvent, permissions: { screen?: boolean; microphone?: boolean; camera?: boolean }) => {
    if (!isDev) {
      throw new Error('set-mock-permissions is only available in development')
    }
    assertTrustedIpcSender(event, 'set-mock-permissions')
    permissionService.setMockPermissions(permissions)
  })

  ipcMain.handle('open-media-privacy-settings', async (event: IpcMainInvokeEvent, type: 'screen' | 'microphone' | 'camera') => {
    assertTrustedIpcSender(event, 'open-media-privacy-settings')
    permissionService.openMediaPrivacySettings(type)
  })
}
