import { WebcamService } from '@/features/recording/services/webcam-service'
import { resetRecordingBridge, setRecordingBridge, type RecordingIpcBridge } from '@/features/bridges/recording-ipc-bridge'

// Mock MediaRecorder
class MockMediaRecorder {
  static isTypeSupported = jest.fn().mockReturnValue(true)

  state: 'inactive' | 'recording' | 'paused' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((event: { error: Error }) => void) | null = null

  start = jest.fn().mockImplementation(() => {
    this.state = 'recording'
  })

  stop = jest.fn().mockImplementation(() => {
    this.state = 'inactive'
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['video data'], { type: 'video/webm' }) })
    }
    if (this.onstop) {
      setTimeout(() => this.onstop?.(), 0)
    }
  })

  pause = jest.fn().mockImplementation(() => {
    this.state = 'paused'
  })

  resume = jest.fn().mockImplementation(() => {
    this.state = 'recording'
  })

  requestData = jest.fn()
}

// Mock getUserMedia stream
const createMockStream = () => {
  const stopMock = jest.fn()
  return {
    getTracks: () => [{ stop: stopMock, kind: 'video', onended: null }],
    getVideoTracks: () => [{
      stop: stopMock,
      onended: null,
      getSettings: () => ({ width: 1280, height: 720 })
    }],
    getAudioTracks: () => [],
    active: true
  }
}

const createMockMediaDevices = () => ({
  getUserMedia: jest.fn().mockResolvedValue(createMockStream()),
  enumerateDevices: jest.fn().mockResolvedValue([])
})

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
  createTempRecordingFile: jest.fn().mockResolvedValue({ success: true, data: '/tmp/webcam.webm' }),
  appendToRecording: jest.fn().mockResolvedValue({ success: true }),
  finalizeRecording: jest.fn().mockResolvedValue({ success: true }),
  invoke: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  ...overrides
})

describe('WebcamService (black box)', () => {
  let originalMediaDevices: typeof navigator.mediaDevices
  let originalMediaRecorder: typeof MediaRecorder

  beforeEach(() => {
    originalMediaDevices = navigator.mediaDevices
    originalMediaRecorder = (global as any).MediaRecorder
      ; (global as any).MediaRecorder = MockMediaRecorder

    Object.defineProperty(navigator, 'mediaDevices', {
      value: createMockMediaDevices(),
      writable: true
    })

    resetRecordingBridge()
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      writable: true
    })
      ; (global as any).MediaRecorder = originalMediaRecorder
    resetRecordingBridge()
    jest.clearAllMocks()
  })

  describe('starting webcam capture', () => {
    it('requests camera with specified device id', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new WebcamService(bridge)
      await service.start({ deviceId: 'camera-123' })

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            deviceId: { exact: 'camera-123' }
          })
        })
      )
    })

    it('applies resolution constraints when provided', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new WebcamService(bridge)
      await service.start({
        deviceId: 'camera-123',
        width: 1920,
        height: 1080
      })

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          })
        })
      )
    })

    it('applies framerate constraint when provided', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new WebcamService(bridge)
      await service.start({
        deviceId: 'camera-123',
        frameRate: 60
      })

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            frameRate: { ideal: 60 }
          })
        })
      )
    })

    it('returns stream for live preview', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new WebcamService(bridge)
      await service.start({ deviceId: 'camera-123' })

      const stream = service.getStream()
      expect(stream).toBeTruthy()
      expect(stream?.active).toBe(true)
    })

    it('throws error when already recording', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new WebcamService(bridge)
      await service.start({ deviceId: 'camera-123' })

      await expect(
        service.start({ deviceId: 'camera-456' })
      ).rejects.toThrow('Webcam already recording')
    })
  })

  describe('stopping webcam capture', () => {
    it('stops all tracks and returns result', async () => {
      jest.useFakeTimers()
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new WebcamService(bridge)
      await service.start({ deviceId: 'camera-123' })

      const stopPromise = service.stop()
      jest.runAllTimers()

      const result = await stopPromise

      expect(result).toMatchObject({
        videoPath: expect.any(String),
        duration: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number)
      })

      jest.useRealTimers()
    })

    it('returns null stream after stopping', async () => {
      jest.useFakeTimers()
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new WebcamService(bridge)
      await service.start({ deviceId: 'camera-123' })

      const stopPromise = service.stop()
      jest.runAllTimers()
      await stopPromise

      expect(service.getStream()).toBeNull()

      jest.useRealTimers()
    })

    it('throws error when not recording', async () => {
      const bridge = createBridge()
      const service = new WebcamService(bridge)

      await expect(service.stop()).rejects.toThrow()
    })
  })

  describe('pause and resume', () => {
    it('pauses recording', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new WebcamService(bridge)
      await service.start({ deviceId: 'camera-123' })

      service.pause()

      expect(service.isPaused()).toBe(true)
    })

    it('resumes recording after pause', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new WebcamService(bridge)
      await service.start({ deviceId: 'camera-123' })

      service.pause()
      service.resume()

      expect(service.isPaused()).toBe(false)
    })

    it('does nothing if pause called when not recording', () => {
      const bridge = createBridge()
      const service = new WebcamService(bridge)

      // Should not throw
      expect(() => service.pause()).not.toThrow()
    })
  })

  describe('recording state', () => {
    it('reports not recording initially', () => {
      const bridge = createBridge()
      const service = new WebcamService(bridge)

      expect(service.isRecording()).toBe(false)
    })

    it('reports recording after start', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new WebcamService(bridge)
      await service.start({ deviceId: 'camera-123' })

      expect(service.isRecording()).toBe(true)
    })

    it('reports not recording after stop', async () => {
      jest.useFakeTimers()
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new WebcamService(bridge)
      await service.start({ deviceId: 'camera-123' })

      const stopPromise = service.stop()
      jest.runAllTimers()
      await stopPromise

      expect(service.isRecording()).toBe(false)

      jest.useRealTimers()
    })
  })

  describe('error handling', () => {
    it('handles getUserMedia permission denied', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: jest.fn().mockRejectedValue(new Error('NotAllowedError'))
        },
        writable: true
      })

      const bridge = createBridge()
      const service = new WebcamService(bridge)

      await expect(
        service.start({ deviceId: 'camera-123' })
      ).rejects.toThrow()
    })

    it('handles device not found', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: jest.fn().mockRejectedValue(new Error('NotFoundError'))
        },
        writable: true
      })

      const bridge = createBridge()
      const service = new WebcamService(bridge)

      await expect(
        service.start({ deviceId: 'nonexistent-camera' })
      ).rejects.toThrow()
    })
  })
})
