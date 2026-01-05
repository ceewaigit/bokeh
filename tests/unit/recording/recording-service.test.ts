import { RecordingService } from '@/features/media/recording/services/recording-service'
import { resetRecordingBridge, setRecordingBridge, type RecordingIpcBridge } from '@/features/core/bridges/recording-ipc-bridge'
import { AudioInput, ExportFormat, QualityLevel, RecordingArea, type RecordingSettings } from '@/types'

const baseSettings: RecordingSettings = {
  area: RecordingArea.Fullscreen,
  audioInput: AudioInput.System,
  quality: QualityLevel.Medium,
  framerate: 30,
  format: ExportFormat.MOV,
  onlySelf: false,
  includeAppWindows: true
}

const createBridge = (overrides: Partial<RecordingIpcBridge> = {}): RecordingIpcBridge => ({
  nativeRecorderAvailable: jest.fn().mockResolvedValue(true),
  nativeRecorderStartDisplay: jest.fn().mockResolvedValue({ outputPath: '/tmp/native.mov' }),
  nativeRecorderStartWindow: jest.fn().mockResolvedValue({ outputPath: '/tmp/native.mov' }),
  nativeRecorderStop: jest.fn().mockResolvedValue({ outputPath: '/tmp/native.mov' }),
  nativeRecorderPause: jest.fn().mockResolvedValue(undefined),
  nativeRecorderResume: jest.fn().mockResolvedValue(undefined),
  checkScreenRecordingPermission: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  requestScreenRecordingPermission: jest.fn().mockResolvedValue(undefined),
  getDesktopSources: jest.fn().mockResolvedValue([]),
  getSourceBounds: jest.fn().mockResolvedValue(null),
  getScreens: jest.fn().mockResolvedValue([]),
  startMouseTracking: jest.fn().mockResolvedValue({ success: true, fps: 60 }),
  stopMouseTracking: jest.fn().mockResolvedValue(undefined),
  onMouseMove: jest.fn().mockReturnValue(() => { }),
  onMouseClick: jest.fn().mockReturnValue(() => { }),
  onScroll: jest.fn().mockReturnValue(() => { }),
  startKeyboardTracking: jest.fn().mockResolvedValue(undefined),
  stopKeyboardTracking: jest.fn().mockResolvedValue(undefined),
  onKeyboardEvent: jest.fn().mockReturnValue(() => { }),
  createMetadataFile: jest.fn().mockResolvedValue({ success: true, data: '/tmp/meta.json' }),
  appendMetadataBatch: jest.fn().mockResolvedValue({ success: true }),
  readMetadataFile: jest.fn().mockResolvedValue({ success: true, data: [] }),
  createTempRecordingFile: jest.fn().mockResolvedValue({ success: true, data: '/tmp/fallback.webm' }),
  appendToRecording: jest.fn().mockResolvedValue({ success: true }),
  finalizeRecording: jest.fn().mockResolvedValue({ success: true }),
  invoke: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  ...overrides
})

const createElectronApi = (overrides: Record<string, unknown> = {}) => ({
  checkScreenRecordingPermission: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  requestScreenRecordingPermission: jest.fn().mockResolvedValue({ opened: true, status: 'granted', granted: true }),
  getDesktopSources: jest.fn().mockResolvedValue([]),
  getSourceBounds: jest.fn().mockResolvedValue(null),
  getScreens: jest.fn().mockResolvedValue([]),
  showRecordingOverlay: jest.fn().mockResolvedValue({ success: true }),
  hideRecordingOverlay: jest.fn().mockResolvedValue({ success: true }),
  getDesktopStream: jest.fn().mockResolvedValue({ audio: false, video: true }),
  ...overrides
})

describe('RecordingService (black box)', () => {
  beforeEach(() => {
    resetRecordingBridge()
      ; (window as any).electronAPI = createElectronApi()
  })

  afterEach(() => {
    resetRecordingBridge()
    jest.clearAllMocks()
  })

  it('starts screen recording and returns a finalized result on stop', async () => {
    const bridge = createBridge()
    setRecordingBridge(bridge)

      ; (window as any).electronAPI = createElectronApi({
        getDesktopSources: jest.fn().mockResolvedValue([{
          id: 'screen:1:0',
          name: 'Display 1',
          displayInfo: {
            id: 1,
            isPrimary: true,
            isInternal: false,
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
            workArea: { x: 0, y: 0, width: 1920, height: 1040 },
            scaleFactor: 2
          }
        }]),
        getSourceBounds: jest.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 }),
        getScreens: jest.fn().mockResolvedValue([{
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
          scaleFactor: 2,
          rotation: 0,
          internal: true
        }])
      })

    const service = new RecordingService()
    await service.start({ ...baseSettings, sourceId: 'screen:1:0' })

    expect((window as any).electronAPI.showRecordingOverlay).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 1920, height: 1080 },
      'Recording Screen'
    )

    const result = await service.stop()
    expect(result.videoPath).toBe('/tmp/native.mov')
    expect(result.metadata).toEqual([])
    expect((window as any).electronAPI.hideRecordingOverlay).toHaveBeenCalled()
  })

  it('uses area bounds for overlays and capture', async () => {
    const bridge = createBridge()
    setRecordingBridge(bridge)

      ; (window as any).electronAPI = createElectronApi({
        getDesktopSources: jest.fn().mockResolvedValue([{
          id: 'screen:1:0',
          name: 'Display 1',
          displayInfo: {
            id: 1,
            isPrimary: true,
            isInternal: false,
            bounds: { x: 100, y: 50, width: 1920, height: 1080 },
            workArea: { x: 100, y: 50, width: 1920, height: 1040 },
            scaleFactor: 1
          }
        }]),
        getSourceBounds: jest.fn().mockResolvedValue({ x: 100, y: 50, width: 1920, height: 1080 })
      })

    const service = new RecordingService()
    await service.start({ ...baseSettings, sourceId: 'area:10,20,200,150,1', area: RecordingArea.Region })

    expect((window as any).electronAPI.showRecordingOverlay).toHaveBeenCalledWith(
      { x: 110, y: 70, width: 200, height: 150 },
      'Recording Area'
    )

    await service.stop()
  })

  it('fails fast on missing permissions', async () => {
    const bridge = createBridge()
    setRecordingBridge(bridge)

      ; (window as any).electronAPI = createElectronApi({
        checkScreenRecordingPermission: jest.fn().mockResolvedValue({ status: 'denied', granted: false }),
        requestScreenRecordingPermission: jest.fn().mockResolvedValue({ opened: true, status: 'denied', granted: false })
      })

    const service = new RecordingService()

    await expect(
      service.start({ ...baseSettings, sourceId: 'screen:1:0' })
    ).rejects.toThrow('Screen recording permission is required')

    expect(bridge.startMouseTracking).not.toHaveBeenCalled()
  })

  it('falls back to MediaRecorder when native is unavailable', async () => {
    jest.useFakeTimers()

    const bridge = createBridge({
      nativeRecorderAvailable: jest.fn().mockResolvedValue(false)
    })
    setRecordingBridge(bridge)

      ; (window as any).electronAPI = createElectronApi({
        getDesktopSources: jest.fn().mockResolvedValue([{
          id: 'screen:1:0',
          name: 'Display 1',
          displayInfo: {
            id: 1,
            isPrimary: true,
            isInternal: false,
            bounds: { x: 0, y: 0, width: 1280, height: 720 },
            workArea: { x: 0, y: 0, width: 1280, height: 680 },
            scaleFactor: 1
          }
        }]),
        getSourceBounds: jest.fn().mockResolvedValue({ x: 0, y: 0, width: 1280, height: 720 })
      })

    const service = new RecordingService()
    await service.start({ ...baseSettings, sourceId: 'screen:1:0' })

    const result = await service.stop()
    expect(result.videoPath).toBe('/tmp/fallback.webm')

    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('rolls back tracking when recorder start fails', async () => {
    const bridge = createBridge({
      nativeRecorderStartDisplay: jest.fn().mockRejectedValue(new Error('boom'))
    })
    setRecordingBridge(bridge)

      ; (window as any).electronAPI = createElectronApi({
        getDesktopSources: jest.fn().mockResolvedValue([{
          id: 'screen:1:0',
          name: 'Display 1',
          displayInfo: {
            id: 1,
            isPrimary: true,
            isInternal: false,
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
            workArea: { x: 0, y: 0, width: 1920, height: 1040 },
            scaleFactor: 1
          }
        }]),
        getSourceBounds: jest.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 })
      })

    const service = new RecordingService()
    await expect(
      service.start({ ...baseSettings, sourceId: 'screen:1:0' })
    ).rejects.toThrow('boom')

    await expect(
      service.stop()
    ).rejects.toThrow('Not recording')
  })

  it('returns video even when tracking metadata fails on stop', async () => {
    const bridge = createBridge({
      readMetadataFile: jest.fn().mockRejectedValue(new Error('metadata failure'))
    })
    setRecordingBridge(bridge)

      ; (window as any).electronAPI = createElectronApi({
        getDesktopSources: jest.fn().mockResolvedValue([{
          id: 'screen:1:0',
          name: 'Display 1',
          displayInfo: {
            id: 1,
            isPrimary: true,
            isInternal: false,
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
            workArea: { x: 0, y: 0, width: 1920, height: 1040 },
            scaleFactor: 1
          }
        }]),
        getSourceBounds: jest.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 })
      })

    const service = new RecordingService()
    await service.start({ ...baseSettings, sourceId: 'screen:1:0' })

    const result = await service.stop()
    expect(result.videoPath).toBe('/tmp/native.mov')
    expect(result.metadata).toEqual([])
  })
})
