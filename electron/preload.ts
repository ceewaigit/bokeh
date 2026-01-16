import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'
import type {
  DesktopSourceOptions,
  DesktopSource,
  MousePosition,
  MouseTrackingOptions,
  MessageBoxOptions,
  SaveDialogOptions,
  OpenDialogOptions
} from './types/electron-shared'

let pendingSettingsOpen = false

const allowedIpcInvokeChannels = new Set([
  'export-video',
  'export-cancel',
  'export-cleanup',
  'export-stream-chunk'
])

const allowedIpcOnChannels = new Set([
  'export-progress'
])

const restrictedIpc = {
  invoke: (channel: string, ...args: any[]) => {
    if (!allowedIpcInvokeChannels.has(channel)) {
      throw new Error(`Blocked IPC invoke channel: ${channel}`)
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
    if (!allowedIpcOnChannels.has(channel)) {
      throw new Error(`Blocked IPC listener channel: ${channel}`)
    }
    ipcRenderer.on(channel, listener)
  },
  removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => {
    if (!allowedIpcOnChannels.has(channel)) {
      throw new Error(`Blocked IPC listener channel: ${channel}`)
    }
    ipcRenderer.removeListener(channel, listener)
  }
}

ipcRenderer.on('open-settings-dialog', () => {
  pendingSettingsOpen = true
})

const electronAPI = {
  // Desktop capture - properly use IPC with error handling
  getDesktopSources: async (options?: DesktopSourceOptions): Promise<DesktopSource[]> => {
    console.log('🎥 Preload: Requesting desktop sources via IPC')
    const sources = await ipcRenderer.invoke('get-desktop-sources', options)

    if (!sources || sources.length === 0) {
      throw new Error('No desktop sources available. Please check screen recording permissions.')
    }

    return sources
  },

  // File Utils
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file)
  },

  getDesktopStream: (sourceId: string, hasAudio: boolean) => {
    // Simple pass-through - let main process handle it
    return ipcRenderer.invoke('get-desktop-stream', sourceId, hasAudio)
  },

  getScreens: () => {
    return ipcRenderer.invoke('get-screens')
  },

  getSourceBounds: (sourceId: string) => {
    return ipcRenderer.invoke('get-source-bounds', sourceId)
  },

  // Permission checking
  checkScreenRecordingPermission: () =>
    ipcRenderer.invoke('check-screen-recording-permission'),

  requestScreenRecordingPermission: () =>
    ipcRenderer.invoke('request-screen-recording-permission'),

  checkMicrophonePermission: () =>
    ipcRenderer.invoke('check-microphone-permission'),

  requestMicrophonePermission: () =>
    ipcRenderer.invoke('request-microphone-permission'),

  checkCameraPermission: () =>
    ipcRenderer.invoke('check-camera-permission'),

  requestCameraPermission: () =>
    ipcRenderer.invoke('request-camera-permission'),

  openMediaPrivacySettings: (type: 'screen' | 'microphone' | 'camera') =>
    ipcRenderer.invoke('open-media-privacy-settings', type),

  setMockPermissions: (permissions: { screen?: boolean; microphone?: boolean; camera?: boolean }) =>
    ipcRenderer.invoke('set-mock-permissions', permissions),

  startPermissionMonitoring: () =>
    ipcRenderer.invoke('start-permission-monitoring'),

  stopPermissionMonitoring: () =>
    ipcRenderer.invoke('stop-permission-monitoring'),

  onPermissionStatusChanged: (callback: (event: IpcRendererEvent, data: any) => void) => {
    const wrappedCallback = (event: IpcRendererEvent, data: any) => {
      if (data && typeof data === 'object') {
        callback(event, data)
      }
    }
    ipcRenderer.on('permission-status-changed', wrappedCallback)
    return () => ipcRenderer.removeListener('permission-status-changed', wrappedCallback)
  },

  // Mouse tracking with type safety
  startMouseTracking: async (options?: MouseTrackingOptions) => {
    // Validate options
    if (options && typeof options !== 'object') {
      return Promise.reject(new Error('Invalid options provided to startMouseTracking'))
    }
    return ipcRenderer.invoke('start-mouse-tracking', options)
  },

  stopMouseTracking: () =>
    ipcRenderer.invoke('stop-mouse-tracking'),

  getMousePosition: (): Promise<MousePosition> =>
    ipcRenderer.invoke('get-mouse-position'),

  isNativeMouseTrackingAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('is-native-mouse-tracking-available'),

  onMouseMove: (callback: (event: IpcRendererEvent, position: MousePosition) => void) => {
    const wrappedCallback = (event: IpcRendererEvent, data: any) => {
      // Validate data structure
      if (data && typeof data === 'object' && typeof data.x === 'number' && typeof data.y === 'number') {
        callback(event, data)
      }
    }
    ipcRenderer.on('mouse-move', wrappedCallback)
    return () => ipcRenderer.removeListener('mouse-move', wrappedCallback)
  },

  onMouseClick: (callback: (event: IpcRendererEvent, position: MousePosition) => void) => {
    const wrappedCallback = (event: IpcRendererEvent, data: any) => {
      // Validate data structure
      if (data && typeof data === 'object' && typeof data.x === 'number' && typeof data.y === 'number') {
        callback(event, data)
      }
    }
    ipcRenderer.on('mouse-click', wrappedCallback)
    return () => ipcRenderer.removeListener('mouse-click', wrappedCallback)
  },

  // Keyboard tracking
  startKeyboardTracking: () => ipcRenderer.invoke('start-keyboard-tracking'),
  stopKeyboardTracking: () => ipcRenderer.invoke('stop-keyboard-tracking'),
  onKeyboardEvent: (callback: (event: IpcRendererEvent, data: any) => void) => {
    // Handle batched keyboard events (performance optimization)
    // Events are batched every 50ms to reduce IPC overhead
    const wrappedBatchCallback = (event: IpcRendererEvent, batch: any[]) => {
      if (!Array.isArray(batch)) return
      // Dispatch each event in the batch to maintain API compatibility
      for (const data of batch) {
        if (data && typeof data === 'object') {
          callback(event, data)
        }
      }
    }
    ipcRenderer.on('keyboard-events-batch', wrappedBatchCallback)
    return () => ipcRenderer.removeListener('keyboard-events-batch', wrappedBatchCallback)
  },

  // Window appearance
  setWindowVibrancy: (vibrancy: string | null) =>
    ipcRenderer.invoke('set-window-vibrancy', vibrancy),
  setWindowHasShadow: (hasShadow: boolean) =>
    ipcRenderer.invoke('set-window-has-shadow', hasShadow),
  getWindowDebugState: () =>
    ipcRenderer.invoke('get-window-debug-state'),
  getWindowAlphaSamples: () =>
    ipcRenderer.invoke('get-window-alpha-samples'),
  getElementAtPoint: (x: number, y: number) =>
    ipcRenderer.invoke('get-element-at-point', x, y),
  getElementsAtPoint: (x: number, y: number, limit: number = 12) =>
    ipcRenderer.invoke('get-elements-at-point', x, y, limit),

  getMainWindowId: () => ipcRenderer.invoke('get-main-window-id'),

  // Title bar behaviors (macOS polish)
  doubleClickTitleBar: () => ipcRenderer.send('titlebar-double-click'),

  // Scroll events
  onScroll: (callback: (event: IpcRendererEvent, data: { timestamp: number; deltaX: number; deltaY: number }) => void) => {
    const wrapped = (event: IpcRendererEvent, data: any) => {
      if (data && typeof data.timestamp === 'number' && typeof data.deltaY === 'number') {
        callback(event, data)
      }
    }
    ipcRenderer.on('scroll-event', wrapped)
    return () => ipcRenderer.removeListener('scroll-event', wrapped)
  },

  removeMouseListener: (event: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(event, callback)
  },

  removeAllMouseListeners: () => {
    ipcRenderer.removeAllListeners('mouse-move')
    ipcRenderer.removeAllListeners('mouse-click')
    ipcRenderer.removeAllListeners('scroll-event')
  },

  // System information
  getPlatform: (): Promise<NodeJS.Platform> =>
    ipcRenderer.invoke('get-platform'),
  getBokehProcesses: () =>
    ipcRenderer.invoke('get-bokeh-processes'),

  // macOS wallpapers
  getMacOSWallpapers: (): Promise<{ wallpapers: any[], gradients: any[] }> =>
    ipcRenderer.invoke('get-macos-wallpapers'),

  loadWallpaperImage: (imagePath: string): Promise<string> =>
    ipcRenderer.invoke('load-wallpaper-image', imagePath),

  getWallpaperThumbnails: (imagePaths: string[]): Promise<Record<string, string | null>> =>
    ipcRenderer.invoke('get-wallpaper-thumbnails', imagePaths),

  // Image selection for custom backgrounds
  selectImageFile: (): Promise<string | null> =>
    ipcRenderer.invoke('select-image-file'),

  loadImageAsDataUrl: (imagePath: string): Promise<string> =>
    ipcRenderer.invoke('load-image-as-data-url', imagePath),

  // Asset helpers
  listParallaxPresets: (): Promise<Array<{ id: string; name: string; folder: string; files: string[] }>> =>
    ipcRenderer.invoke('list-parallax-presets'),

  listPreinstalledWallpapers: (): Promise<Array<{ id: string; name: string; path: string; absolutePath: string }>> =>
    ipcRenderer.invoke('list-preinstalled-wallpapers'),

  listAvailableMockups: (): Promise<{
    devices: Array<{
      type: string
      models: Array<{
        id: string
        name: string
        folder: string
        variants: Array<{ name: string; filename: string; path: string }>
        frame?: {
          path: string
          width: number
          height: number
          screenRegion: { x: number; y: number; width: number; height: number; cornerRadius: number }
          frameBounds?: { x: number; y: number; width: number; height: number }
        }
      }>
    }>
  }> => ipcRenderer.invoke('list-available-mockups'),

  // Native screen area selection
  selectScreenArea: (): Promise<{
    success: boolean
    cancelled?: boolean
    area?: { x: number; y: number; width: number; height: number; displayId: number }
  }> => ipcRenderer.invoke('select-screen-area'),

  // Area selection IPC (from overlay window)
  sendAreaSelection: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.send('area-selection-complete', bounds),

  cancelAreaSelection: () =>
    ipcRenderer.send('area-selection-cancelled'),

  // Recording and workspace control
  openWorkspace: () =>
    ipcRenderer.send('open-workspace'),
  openWorkspaceSettings: () =>
    ipcRenderer.send('open-workspace-settings'),

  startRecording: () =>
    ipcRenderer.invoke('start-recording'),

  stopRecording: () =>
    ipcRenderer.invoke('stop-recording'),

  minimizeRecordButton: () =>
    ipcRenderer.invoke('minimize-record-button'),

  showRecordButton: (options?: { hideMainWindow?: boolean }) =>
    ipcRenderer.invoke('show-record-button', options),

  setRecordingState: (isRecording: boolean) =>
    ipcRenderer.invoke('set-recording-state', isRecording),

  setWindowContentSize: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke('set-window-content-size', dimensions),

  // Dialog APIs
  showMessageBox: (options: MessageBoxOptions) =>
    ipcRenderer.invoke('show-message-box', options),

  showSaveDialog: (options: SaveDialogOptions) =>
    ipcRenderer.invoke('show-save-dialog', options),

  showOpenDialog: (options: OpenDialogOptions) =>
    ipcRenderer.invoke('show-open-dialog', options),

  // Countdown window
  showCountdown: (number: number, displayId?: number) =>
    ipcRenderer.invoke('show-countdown', number, displayId),

  hideCountdown: () =>
    ipcRenderer.invoke('hide-countdown'),

  // Monitor overlay
  showMonitorOverlay: (displayId?: number) =>
    ipcRenderer.invoke('show-monitor-overlay', displayId),

  showWindowOverlay: (windowId: string) =>
    ipcRenderer.invoke('show-window-overlay', windowId),

  hideMonitorOverlay: () =>
    ipcRenderer.invoke('hide-monitor-overlay'),

  // Recording overlay
  showRecordingOverlay: (
    bounds: { x: number; y: number; width: number; height: number },
    label?: string,
    options?: { displayId?: number; relativeToDisplay?: boolean; mode?: 'full' | 'dots' | 'hidden' }
  ) =>
    ipcRenderer.invoke('show-recording-overlay', bounds, label, options),

  hideRecordingOverlay: () =>
    ipcRenderer.invoke('hide-recording-overlay'),

  // Desktop icons visibility (macOS only)
  hideDesktopIcons: () =>
    ipcRenderer.invoke('hide-desktop-icons'),

  showDesktopIcons: () =>
    ipcRenderer.invoke('show-desktop-icons'),

  // File operations
  saveFile: (data: Buffer | ArrayBuffer, filepath: string) =>
    ipcRenderer.invoke('save-file', data, filepath),

  openFile: (filename: string) =>
    ipcRenderer.invoke('open-file', filename),

  generateThumbnail: (options: any) =>
    ipcRenderer.invoke('generate-thumbnail', options),

  // Recording file helpers
  getRecordingsDirectory: () =>
    ipcRenderer.invoke('get-recordings-directory'),

  resolveRecordingPath: (filePath: string, folderPath?: string) =>
    ipcRenderer.invoke('resolve-recording-path', filePath, folderPath),

  saveRecording: (filePath: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('save-recording', filePath, buffer),

  loadRecordings: () =>
    ipcRenderer.invoke('load-recordings'),

  deleteRecordingProject: (projectFilePath: string) =>
    ipcRenderer.invoke('delete-recording-project', projectFilePath),
  duplicateRecordingProject: (projectFilePath: string, newName?: string) =>
    ipcRenderer.invoke('duplicate-recording-project', projectFilePath, newName),

  // Streaming recording handlers
  createTempRecordingFile: (extension?: string) =>
    ipcRenderer.invoke('create-temp-recording-file', extension),
  appendToRecording: (filePath: string, chunk: ArrayBuffer | Blob) => {
    // Convert Blob to ArrayBuffer if needed
    if (chunk instanceof Blob) {
      return chunk.arrayBuffer().then(buffer =>
        ipcRenderer.invoke('append-to-recording', filePath, buffer)
      )
    }
    return ipcRenderer.invoke('append-to-recording', filePath, chunk)
  },
  finalizeRecording: (filePath: string) =>
    ipcRenderer.invoke('finalize-recording', filePath),
  moveFile: (sourcePath: string, destPath: string) =>
    ipcRenderer.invoke('move-file', sourcePath, destPath),
  createMetadataFile: () =>
    ipcRenderer.invoke('create-metadata-file'),
  appendMetadataBatch: (filePath: string, batch: any[], isLast?: boolean) =>
    ipcRenderer.invoke('append-metadata-batch', filePath, batch, isLast),
  readMetadataFile: (filePath: string) =>
    ipcRenderer.invoke('read-metadata-file', filePath),

  readLocalFile: (absolutePath: string) =>
    ipcRenderer.invoke('read-local-file', absolutePath),

  getFileSize: (filePath: string) =>
    ipcRenderer.invoke('get-file-size', filePath),

  listMetadataFiles: (folderPath: string) =>
    ipcRenderer.invoke('list-metadata-files', folderPath),

  // Transcription
  transcription: {
    start: (options: { recordingId: string; filePath: string; folderPath?: string; modelName?: string; language?: string }) =>
      ipcRenderer.invoke('transcription:start', options),
    cancel: (recordingId: string) =>
      ipcRenderer.invoke('transcription:cancel', recordingId),
    listModels: () =>
      ipcRenderer.invoke('transcription:list-models'),
    downloadModel: (modelName: string) =>
      ipcRenderer.invoke('transcription:download-model', modelName),
    recommendModel: () =>
      ipcRenderer.invoke('transcription:recommend-model'),
    whisperStatus: () =>
      ipcRenderer.invoke('transcription:whisper-status'),
    installWhisper: () =>
      ipcRenderer.invoke('transcription:install-whisper'),
    onProgress: (callback: (event: IpcRendererEvent, data: any) => void) => {
      const wrapped = (event: IpcRendererEvent, data: any) => {
        if (data && typeof data === 'object') {
          callback(event, data)
        }
      }
      ipcRenderer.on('transcription:progress', wrapped)
      return () => ipcRenderer.removeListener('transcription:progress', wrapped)
    },
    onStatus: (callback: (event: IpcRendererEvent, data: any) => void) => {
      const wrapped = (event: IpcRendererEvent, data: any) => {
        if (data && typeof data === 'object') {
          callback(event, data)
        }
      }
      ipcRenderer.on('transcription:status', wrapped)
      return () => ipcRenderer.removeListener('transcription:status', wrapped)
    }
  },

  // Get a URL that can be used to stream video files
  getVideoUrl: (filePath: string) =>
    ipcRenderer.invoke('get-video-url', filePath),

  // Get video metadata (width, height, duration)
  getVideoMetadata: (filePath: string) =>
    ipcRenderer.invoke('get-video-metadata', filePath),

  generateVideoThumbnail: (options: { path: string; width?: number; height?: number; timestamp?: number }) =>
    ipcRenderer.invoke('generate-video-thumbnail', options),

  // Check if a file exists at the given path
  fileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('file-exists', filePath),

  // Preview proxy generation for large source videos
  generatePreviewProxy: (filePath: string, recordingId?: string) =>
    ipcRenderer.invoke('generate-preview-proxy', filePath, recordingId),

  generateGlowProxy: (filePath: string, recordingId?: string) =>
    ipcRenderer.invoke('generate-glow-proxy', filePath, recordingId),

  checkPreviewProxy: (filePath: string) =>
    ipcRenderer.invoke('check-preview-proxy', filePath),

  checkGlowProxy: (filePath: string) =>
    ipcRenderer.invoke('check-glow-proxy', filePath),

  clearPreviewProxies: () =>
    ipcRenderer.invoke('clear-preview-proxies'),

  clearGlowProxies: () =>
    ipcRenderer.invoke('clear-glow-proxies'),

  getProxyCacheSize: () =>
    ipcRenderer.invoke('get-proxy-cache-size'),

  onProxyProgress: (callback: (event: IpcRendererEvent, data: any) => void) => {
    const wrapped = (event: IpcRendererEvent, data: any) => {
      if (data && typeof data === 'object') {
        callback(event, data)
      }
    }
    ipcRenderer.on('proxy:progress', wrapped)
    return () => ipcRenderer.removeListener('proxy:progress', wrapped)
  },

  onRefreshLibrary: (callback: () => void) => {
    const wrappedCallback = () => callback()
    ipcRenderer.on('refresh-library', wrappedCallback)
    return () => ipcRenderer.removeListener('refresh-library', wrappedCallback)
  },

  onOpenProjectFromPath: (callback: (projectPath: string) => void) => {
    const wrappedCallback = (_event: IpcRendererEvent, projectPath: string) => {
      if (typeof projectPath === 'string' && projectPath.endsWith('.bokeh')) {
        callback(projectPath)
      }
    }
    ipcRenderer.on('open-project-from-path', wrappedCallback)
    return () => ipcRenderer.removeListener('open-project-from-path', wrappedCallback)
  },

  onOpenSettingsDialog: (callback: () => void) => {
    const wrappedCallback = () => callback()
    ipcRenderer.on('open-settings-dialog', wrappedCallback)
    return () => ipcRenderer.removeListener('open-settings-dialog', wrappedCallback)
  },
  consumePendingSettingsOpen: () => {
    const pending = pendingSettingsOpen
    pendingSettingsOpen = false
    return pending
  },

  // Recording events
  onRecordingStarted: (callback: (event: IpcRendererEvent, ...args: any[]) => void) => {
    ipcRenderer.on('recording-started', callback)
    return () => ipcRenderer.removeListener('recording-started', callback)
  },

  onRecordingStopped: (callback: (event: IpcRendererEvent, ...args: any[]) => void) => {
    ipcRenderer.on('recording-stopped', callback)
    return () => ipcRenderer.removeListener('recording-stopped', callback)
  },

  onRecordingError: (callback: (error: any) => void) => {
    const wrappedCallback = (_event: IpcRendererEvent, error: any) => callback(error)
    ipcRenderer.on('recording-error', wrappedCallback)
    return () => ipcRenderer.removeListener('recording-error', wrappedCallback)
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },

  // Native recorder API (macOS 12.3+ with ScreenCaptureKit)
  nativeRecorder: {
    isAvailable: () => ipcRenderer.invoke('native-recorder:available'),
    startDisplay: (displayId: number, bounds?: { x: number; y: number; width: number; height: number }, options?: { onlySelf?: boolean; lowMemory?: boolean; includeAppWindows?: boolean; useMacOSDefaults?: boolean; framerate?: number }) =>
      ipcRenderer.invoke('native-recorder:start-display', displayId, bounds, options),
    startWindow: (windowId: number, options?: { lowMemory?: boolean; useMacOSDefaults?: boolean; framerate?: number }) =>
      ipcRenderer.invoke('native-recorder:start-window', windowId, options),
    stop: () => ipcRenderer.invoke('native-recorder:stop'),
    pause: () => ipcRenderer.invoke('native-recorder:pause'),
    resume: () => ipcRenderer.invoke('native-recorder:resume'),
    isRecording: () => ipcRenderer.invoke('native-recorder:is-recording'),
    readVideo: (filePath: string) => ipcRenderer.invoke('native-recorder:read-video', filePath)
  },

  // Teleprompter window
  toggleTeleprompterWindow: () =>
    ipcRenderer.invoke('toggle-teleprompter-window'),

  showTeleprompterWindow: () =>
    ipcRenderer.invoke('show-teleprompter-window'),

  hideTeleprompterWindow: () =>
    ipcRenderer.invoke('hide-teleprompter-window'),

  // Webcam preview window
  showWebcamPreview: (deviceId: string) =>
    ipcRenderer.invoke('show-webcam-preview', deviceId),

  hideWebcamPreview: () =>
    ipcRenderer.invoke('hide-webcam-preview'),

  // Restricted IPC surface for export flows
  ipc: restrictedIpc
}

// Always expose the API using contextBridge for security
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
console.log('Electron API exposed via contextBridge')

// Export types for TypeScript support
export type ElectronAPI = typeof electronAPI
