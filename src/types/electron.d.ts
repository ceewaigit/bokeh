export interface ElectronAPI {
  // Desktop capture
  getDesktopSources: (options: any) => Promise<Array<{
    id: string
    name: string
    display_id?: number
    thumbnail?: string
    displayInfo?: {
      id: number
      isPrimary: boolean
      isInternal: boolean
      bounds: { x: number; y: number; width: number; height: number }
      workArea: { x: number; y: number; width: number; height: number }
      scaleFactor: number
    }
  }>>
  getDesktopStream?: (sourceId: string, hasAudio?: boolean) => Promise<any>
  getScreens?: () => Promise<Array<{
    id: number
    bounds: { x: number; y: number; width: number; height: number }
    workArea: { x: number; y: number; width: number; height: number }
    scaleFactor: number
    rotation: number
    internal: boolean
  }>>
  getSourceBounds?: (sourceId: string) => Promise<{ x: number; y: number; width: number; height: number } | null>

  // Permission checking
  checkScreenRecordingPermission: () => Promise<{ status: string; granted: boolean }>
  requestScreenRecordingPermission: () => Promise<{ opened: boolean; status: string; granted: boolean }>
  checkMicrophonePermission: () => Promise<{ status: string; granted: boolean }>
  requestMicrophonePermission: () => Promise<{ status: string; granted: boolean }>
  checkCameraPermission?: () => Promise<{ status: string; granted: boolean }>
  requestCameraPermission?: () => Promise<{ status: string; granted: boolean }>
  setMockPermissions: (permissions: { screen?: boolean; microphone?: boolean; camera?: boolean }) => Promise<void>
  startPermissionMonitoring?: () => Promise<void>
  stopPermissionMonitoring?: () => Promise<void>
  onPermissionStatusChanged?: (callback: (event: any, data: {
    screen: { status: string; granted: boolean };
    microphone: { status: string; granted: boolean };
    camera?: { status: string; granted: boolean };
  }) => void) => () => void

  // Mouse tracking
  startMouseTracking: (options: any) => Promise<any>
  stopMouseTracking: () => Promise<any>
  isNativeMouseTrackingAvailable: () => Promise<{ available: boolean; tracker: boolean }>
  onMouseMove: (callback: any) => () => void
  onMouseClick: (callback: any) => () => void
  onScroll?: (callback: any) => () => void
  removeAllMouseListeners: () => void

  // Keyboard tracking
  startKeyboardTracking?: () => Promise<any>
  stopKeyboardTracking?: () => Promise<any>
  onKeyboardEvent?: (callback: any) => () => void

  // Recording and workspace control
  openWorkspace?: () => Promise<void>
  openWorkspaceSettings?: () => Promise<void>
  startRecording?: () => Promise<any>
  stopRecording?: () => Promise<any>
  getRecordingsDirectory?: () => Promise<string>
  resolveRecordingPath?: (filePath: string, folderPath?: string) => Promise<string>
  saveRecording?: (filePath: string, buffer: ArrayBuffer) => Promise<any>
  loadRecordings?: () => Promise<Array<{
    name: string
    path: string
    timestamp: string | Date
    size?: number
  }>>
  deleteRecordingProject?: (projectFilePath: string) => Promise<{ success: boolean; error?: string }>
  readLocalFile?: (absolutePath: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>
  getFileSize?: (filePath: string) => Promise<{ success: boolean; data?: { size: number }; error?: string }>
  listMetadataFiles?: (folderPath: string) => Promise<{ success: boolean; files?: string[]; error?: string }>
  getVideoUrl?: (filePath: string) => Promise<string | null>
  fileExists?: (filePath: string) => Promise<boolean>

  // Preview proxy generation for large source videos
  generatePreviewProxy?: (filePath: string) => Promise<{
    success: boolean
    proxyPath?: string
    proxyUrl?: string
    skipped?: boolean
    reason?: string
    error?: string
  }>
  generateGlowProxy?: (filePath: string) => Promise<{
    success: boolean
    proxyPath?: string
    proxyUrl?: string
    skipped?: boolean
    reason?: string
    error?: string
  }>
  checkPreviewProxy?: (filePath: string) => Promise<{
    needsProxy: boolean
    existingProxyPath?: string
    existingProxyUrl?: string
  }>
  checkGlowProxy?: (filePath: string) => Promise<{
    existingProxyPath?: string
    existingProxyUrl?: string
  }>
  clearPreviewProxies?: () => Promise<{ success: boolean }>
  clearGlowProxies?: () => Promise<{ success: boolean }>
  getProxyCacheSize?: () => Promise<{ size: number }>

  onToggleRecording?: (callback: () => void) => void

  // Streaming recording handlers
  createTempRecordingFile?: (extension?: string) => Promise<{ success: boolean; data?: string; error?: string }>
  appendToRecording?: (filePath: string, chunk: ArrayBuffer | Blob) => Promise<{ success: boolean; error?: string }>
  finalizeRecording?: (filePath: string) => Promise<{ success: boolean; error?: string }>
  createMetadataFile?: () => Promise<{ success: boolean; data?: string; error?: string }>
  appendMetadata?: (filePath: string, metadata: any[]) => Promise<{ success: boolean; error?: string }>
  appendMetadataBatch?: (filePath: string, metadata: any[], isLast?: boolean) => Promise<{ success: boolean; error?: string }>
  readMetadata?: (filePath: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
  readMetadataFile?: (filePath: string) => Promise<{ success: boolean; data?: any[]; error?: string }>

  // File operations
  moveFile?: (source: string, destination: string) => Promise<{ success: boolean; error?: string }>

  // Dialog APIs
  showSaveDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>
  showMessageBox: (options: any) => Promise<{ response: number; checkboxChecked: boolean }>

  // File operations
  saveFile: (data: any, filepath?: string) => Promise<{ success: boolean; path?: string; error?: string }>
  openFile: (filename: string) => Promise<{ success: boolean; data?: any; error?: string }>
  openPath?: (path: string) => Promise<void>
  generateThumbnail?: (options: any) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>

  // IPC communication (restricted surface)
  ipc?: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
    removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => void
    invoke: (channel: string, ...args: any[]) => Promise<any>
  }

  // Platform-specific features
  getPlatform?: () => Promise<{ platform: string; arch: string; version: string }>
  getBokehProcesses?: () => Promise<{
    timestamp: number
    appName: string
    totalCpu: number
    totalMemRssBytes: number
    gpu: {
      vramTotalBytes: number | null
      vramUsedBytes: number | null
    }
    processes: Array<{
      pid: number
      ppid: number | null
      type: string
      name: string
      command: string | null
      cpu: number
      memRss: number | null
    }>
  }>
  getMacOSWallpapers?: () => Promise<{
    wallpapers: Array<{ name: string; path: string; thumbnail?: string }>
    gradients: Array<{ name: string; path: string; colors: string[] }>
  }>
  loadWallpaperImage?: (imagePath: string) => Promise<string>
  getWallpaperThumbnails?: (imagePaths: string[]) => Promise<Record<string, string | null>>
  selectImageFile?: () => Promise<string | null>
  loadImageAsDataUrl?: (imagePath: string) => Promise<string>
  listParallaxPresets?: () => Promise<Array<{ id: string; name: string; folder: string; files: string[] }>>
  listPreinstalledWallpapers?: () => Promise<Array<{ id: string; name: string; path: string; absolutePath: string }>>
  selectScreenArea?: () => Promise<{
    success: boolean
    cancelled?: boolean
    area?: { x: number; y: number; width: number; height: number; displayId: number }
  }>
  sendAreaSelection?: (bounds: { x: number; y: number; width: number; height: number }) => void
  cancelAreaSelection?: () => void

  // Window controls
  minimize: () => void
  maximize: () => void
  quit: () => void
  minimizeRecordButton?: () => void
  showRecordButton?: (options?: { hideMainWindow?: boolean }) => Promise<void>
  openWorkspace?: () => void
  setWindowContentSize?: (dimensions: { width: number; height: number }) => Promise<{ success: boolean }>
  setWindowVibrancy?: (vibrancy: string | null) => Promise<{ success: boolean }>
  setWindowHasShadow?: (hasShadow: boolean) => Promise<{ success: boolean }>
  getWindowDebugState?: () => Promise<{
    success: boolean
    platform?: string
    isVisible?: boolean
    hasShadow?: boolean
    backgroundColor?: string
    isDestroyed?: boolean
    bounds?: { x: number; y: number; width: number; height: number }
    url?: string
    error?: string
  }>
  getWindowAlphaSamples?: () => Promise<{
    success: boolean
    samples?: Array<{ x: number; y: number; r: number; g: number; b: number; alpha: number }>
    error?: string
  }>
  getElementAtPoint?: (x: number, y: number) => Promise<{
    success: boolean
    result?: {
      tagName: string
      id: string | null
      className: string | null
      backgroundColor: string
      opacity: string
      pointerEvents: string
    } | null
    error?: string
  }>
  getElementsAtPoint?: (x: number, y: number, limit?: number) => Promise<{
    success: boolean
    result?: Array<{
      tagName: string
      id: string | null
      className: string | null
      backgroundColor: string
      opacity: string
      pointerEvents: string
    }>
    error?: string
  }>
  getMainWindowId: () => Promise<number | undefined>

  // Countdown window methods
  showCountdown?: (number: number, displayId?: number) => Promise<{ success: boolean }>
  hideCountdown?: () => Promise<{ success: boolean }>

  // Monitor overlay methods
  showMonitorOverlay?: (displayId?: number) => Promise<{ success: boolean }>
  hideMonitorOverlay?: () => Promise<{ success: boolean }>
  showWindowOverlay?: (windowId: string) => Promise<{ success: boolean }>
  showRecordingOverlay?: (
    bounds: { x: number; y: number; width: number; height: number },
    label?: string,
    options?: { displayId?: number; relativeToDisplay?: boolean }
  ) => Promise<{ success: boolean }>
  hideRecordingOverlay?: () => Promise<{ success: boolean }>

  // Desktop icons visibility (macOS only)
  hideDesktopIcons?: () => Promise<{ success: boolean; error?: string }>
  showDesktopIcons?: () => Promise<{ success: boolean; error?: string }>

  // Recording events
  onRefreshLibrary?: (callback: () => void) => () => void
  onOpenSettingsDialog?: (callback: () => void) => () => void
  consumePendingSettingsOpen?: () => boolean
  onRecordingStarted: (callback: () => void) => () => void
  onRecordingStopped: (callback: () => void) => () => void
  onRecordingError: (callback: (error: string) => void) => () => void
  removeAllListeners: (channel: string) => void

  // Native recorder API (macOS 12.3+ with ScreenCaptureKit)
  nativeRecorder?: {
    isAvailable: () => Promise<boolean>
    startDisplay: (displayId: number, bounds?: { x: number; y: number; width: number; height: number }, options?: { onlySelf?: boolean; lowMemory?: boolean; includeAppWindows?: boolean; useMacOSDefaults?: boolean; framerate?: number }) => Promise<{ outputPath: string }>
    startWindow: (windowId: number, options?: { lowMemory?: boolean; useMacOSDefaults?: boolean; framerate?: number }) => Promise<{ outputPath: string }>
    stop: () => Promise<{ outputPath: string }>
    pause: () => Promise<{ success: boolean }>
    resume: () => Promise<{ success: boolean }>
    isRecording: () => Promise<boolean>
    readVideo: (filePath: string) => Promise<ArrayBuffer>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export { }
