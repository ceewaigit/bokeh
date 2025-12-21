/**
 * IPC Bridge module exports
 */

export {
  type IpcBridge,
  getIpcBridge,
  setIpcBridge,
  resetIpcBridge,
  isIpcAvailable
} from './ipc-bridge'

export { ElectronIpcBridge } from './electron-ipc-bridge'

export { MockIpcBridge, createMockIpcBridge } from './mock-ipc-bridge'

export {
  type RecordingIpcBridge,
  type Rect,
  type DesktopSource,
  type DisplayInfo,
  type MouseTrackingOptions,
  type MouseTrackingResult,
  type PermissionResult,
  ElectronRecordingBridge,
  getRecordingBridge,
  setRecordingBridge,
  resetRecordingBridge
} from './recording-ipc-bridge'
