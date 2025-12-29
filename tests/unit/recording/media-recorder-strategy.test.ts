import { MediaRecorderStrategy } from '@/features/recording/strategies/media-recorder-strategy'
import { type RecordingIpcBridge } from '@/lib/bridges/recording-ipc-bridge'

const createBridge = (overrides: Partial<RecordingIpcBridge> = {}): RecordingIpcBridge => ({
  nativeRecorderAvailable: jest.fn(),
  nativeRecorderStartDisplay: jest.fn(),
  nativeRecorderStartWindow: jest.fn(),
  nativeRecorderStop: jest.fn(),
  nativeRecorderPause: jest.fn(),
  nativeRecorderResume: jest.fn(),
  checkScreenRecordingPermission: jest.fn(),
  requestScreenRecordingPermission: jest.fn(),
  getDesktopSources: jest.fn(),
  getSourceBounds: jest.fn(),
  getScreens: jest.fn(),
  startMouseTracking: jest.fn(),
  stopMouseTracking: jest.fn(),
  onMouseMove: jest.fn(),
  onMouseClick: jest.fn(),
  onScroll: jest.fn(),
  startKeyboardTracking: jest.fn(),
  stopKeyboardTracking: jest.fn(),
  onKeyboardEvent: jest.fn(),
  createMetadataFile: jest.fn(),
  appendMetadataBatch: jest.fn(),
  readMetadataFile: jest.fn(),
  createTempRecordingFile: jest.fn().mockResolvedValue({ success: true, data: '/tmp/fallback.webm' }),
  appendToRecording: jest.fn().mockResolvedValue({ success: true }),
  finalizeRecording: jest.fn().mockResolvedValue({ success: true }),
  invoke: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  ...overrides
})

describe('MediaRecorderStrategy (black box)', () => {
  beforeEach(() => {
    ; (window as any).electronAPI = {
      getDesktopStream: jest.fn().mockResolvedValue({ audio: true, video: true })
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('starts and stops with a finalized recording path', async () => {
    jest.useFakeTimers()
    const bridge = createBridge()
    const strategy = new MediaRecorderStrategy(bridge)

    await strategy.start({
      sourceId: 'screen:1:0',
      sourceType: 'screen',
      hasAudio: true
    })

    const result = await strategy.stop()
    expect(result.videoPath).toBe('/tmp/fallback.webm')
    expect(bridge.finalizeRecording).toHaveBeenCalledWith('/tmp/fallback.webm')

    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('rejects when desktop stream API is missing', async () => {
    ; (window as any).electronAPI = {}
    const bridge = createBridge()
    const strategy = new MediaRecorderStrategy(bridge)

    await expect(
      strategy.start({ sourceId: 'screen:1:0', sourceType: 'screen', hasAudio: false })
    ).rejects.toThrow('Desktop stream API not available')
  })
})
