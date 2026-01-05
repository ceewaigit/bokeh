import { TrackingService } from '@/features/media/recording/services/tracking-service'
import { resetRecordingBridge, setRecordingBridge, type RecordingIpcBridge } from '@/features/core/bridges/recording-ipc-bridge'

const createBridge = () => {
  const mouseListeners: Array<(data: unknown) => void> = []
  const clickListeners: Array<(data: unknown) => void> = []
  const scrollListeners: Array<(data: unknown) => void> = []
  const keyboardListeners: Array<(data: unknown) => void> = []
  const batches: unknown[] = []

  const bridge: RecordingIpcBridge = {
    nativeRecorderAvailable: jest.fn().mockResolvedValue(false),
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
    startMouseTracking: jest.fn().mockResolvedValue({ success: true, fps: 60 }),
    stopMouseTracking: jest.fn().mockResolvedValue(undefined),
    onMouseMove: jest.fn((cb: (data: unknown) => void) => {
      mouseListeners.push(cb)
      return () => { }
    }),
    onMouseClick: jest.fn((cb: (data: unknown) => void) => {
      clickListeners.push(cb)
      return () => { }
    }),
    onScroll: jest.fn((cb: (data: unknown) => void) => {
      scrollListeners.push(cb)
      return () => { }
    }),
    startKeyboardTracking: jest.fn().mockResolvedValue(undefined),
    stopKeyboardTracking: jest.fn().mockResolvedValue(undefined),
    onKeyboardEvent: jest.fn((cb: (data: unknown) => void) => {
      keyboardListeners.push(cb)
      return () => { }
    }),
    createMetadataFile: jest.fn().mockResolvedValue({ success: true, data: '/tmp/meta.json' }),
    appendMetadataBatch: jest.fn(async (_path: string, batch: unknown[]) => {
      batches.push(...batch)
      return { success: true }
    }),
    readMetadataFile: jest.fn(async () => ({ success: true, data: batches })),
    createTempRecordingFile: jest.fn(),
    appendToRecording: jest.fn(),
    finalizeRecording: jest.fn(),
    invoke: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn()
  }

  return { bridge, mouseListeners, clickListeners, scrollListeners, keyboardListeners, batches }
}

describe('TrackingService (black box)', () => {
  beforeEach(() => {
    resetRecordingBridge()
  })

  afterEach(() => {
    resetRecordingBridge()
    jest.clearAllMocks()
  })

  it('maps mouse events into capture-relative coordinates', async () => {
    const { bridge, mouseListeners } = createBridge()
    setRecordingBridge(bridge)

    const service = new TrackingService()
    await service.start(
      'screen:1:0',
      { fullBounds: { x: 100, y: 50, width: 300, height: 200 }, scaleFactor: 2 },
      600,
      400
    )

    const move = mouseListeners[0]
    move?.({ x: 150, y: 100 })

    const result = await service.stop()
    const event = result.find((e: any) => e.eventType === 'mouse')
    expect(event?.mouseX).toBe(100)
    expect(event?.mouseY).toBe(100)
  })

  it('drops events outside the capture bounds', async () => {
    const { bridge, mouseListeners } = createBridge()
    setRecordingBridge(bridge)

    const service = new TrackingService()
    await service.start(
      'screen:1:0',
      { fullBounds: { x: 0, y: 0, width: 100, height: 100 }, scaleFactor: 1 },
      100,
      100
    )

    const move = mouseListeners[0]
    move?.({ x: 150, y: 150 })

    const result = await service.stop()
    expect(result.find((e: any) => e.eventType === 'mouse')).toBeUndefined()
  })

  it('ignores events while paused', async () => {
    const { bridge, mouseListeners } = createBridge()
    setRecordingBridge(bridge)

    const service = new TrackingService()
    await service.start('screen:1:0', { fullBounds: { x: 0, y: 0, width: 100, height: 100 }, scaleFactor: 1 }, 100, 100)

    service.pause()
    mouseListeners[0]?.({ x: 10, y: 10 })
    service.resume()
    mouseListeners[0]?.({ x: 20, y: 20 })

    const result = await service.stop()
    const mouseEvents = result.filter((e: any) => e.eventType === 'mouse')
    expect(mouseEvents).toHaveLength(1)
  })
})
