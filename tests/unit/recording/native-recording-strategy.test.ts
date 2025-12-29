import { NativeRecordingStrategy } from '@/features/recording/strategies/native-recording-strategy'
import type { RecordingConfig } from '@/features/recording/types/recording-strategy'
import { type RecordingIpcBridge } from '@/lib/bridges/recording-ipc-bridge'

const createBridge = (overrides: Partial<RecordingIpcBridge> = {}): RecordingIpcBridge => ({
  nativeRecorderAvailable: jest.fn().mockResolvedValue(true),
  nativeRecorderStartDisplay: jest.fn().mockResolvedValue({ outputPath: '/tmp/native.mov' }),
  nativeRecorderStartWindow: jest.fn().mockResolvedValue({ outputPath: '/tmp/native.mov' }),
  nativeRecorderStop: jest.fn().mockResolvedValue({ outputPath: '/tmp/native.mov' }),
  nativeRecorderPause: jest.fn().mockResolvedValue(undefined),
  nativeRecorderResume: jest.fn().mockResolvedValue(undefined),
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
  createTempRecordingFile: jest.fn(),
  appendToRecording: jest.fn(),
  finalizeRecording: jest.fn(),
  invoke: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  ...overrides
})

describe('NativeRecordingStrategy (black box)', () => {
  it('starts a display recording with crop bounds for area capture', async () => {
    const bridge = createBridge()
    const strategy = new NativeRecordingStrategy(bridge)

    const config: RecordingConfig = {
      sourceId: 'area:10,20,200,150,1',
      sourceType: 'area',
      hasAudio: true,
      bounds: { x: 10, y: 20, width: 200, height: 150 },
      displayId: 1
    }

    await strategy.start(config)
    expect(bridge.nativeRecorderStartDisplay).toHaveBeenCalledWith(
      1,
      { x: 10, y: 20, width: 200, height: 150 },
      expect.objectContaining({ includeAppWindows: undefined })
    )
  })

  it('starts a window recording when sourceType is window', async () => {
    const bridge = createBridge()
    const strategy = new NativeRecordingStrategy(bridge)

    await strategy.start({
      sourceId: 'window:123:0',
      sourceType: 'window',
      hasAudio: true
    })

    expect(bridge.nativeRecorderStartWindow).toHaveBeenCalledWith(
      123,
      expect.any(Object)
    )
  })

  it('stops and returns a recording result', async () => {
    const bridge = createBridge()
    const strategy = new NativeRecordingStrategy(bridge)

    await strategy.start({
      sourceId: 'screen:1:0',
      sourceType: 'screen',
      hasAudio: true,
      displayId: 1
    })

    const result = await strategy.stop()
    expect(result.videoPath).toBe('/tmp/native.mov')
    expect(result.hasAudio).toBe(true)
  })
})
