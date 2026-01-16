import { AudioInputService } from '@/features/media/recording/services/audio-input-service'
import { resetRecordingBridge, setRecordingBridge, type RecordingIpcBridge } from '@/features/core/bridges/recording-ipc-bridge'

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
    // Simulate data available event
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['audio data'], { type: 'audio/webm' }) })
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
const createMockAudioStream = () => {
  const stopMock = jest.fn()
  return {
    getTracks: () => [{ stop: stopMock, kind: 'audio', onended: null }],
    getVideoTracks: () => [],
    getAudioTracks: () => [{
      stop: stopMock,
      onended: null,
      getSettings: () => ({
        channelCount: 2,
        sampleRate: 48000,
        echoCancellation: true,
        noiseSuppression: true
      })
    }],
    active: true
  }
}

const createMockMediaDevices = () => ({
  getUserMedia: jest.fn().mockResolvedValue(createMockAudioStream()),
  enumerateDevices: jest.fn().mockResolvedValue([])
})

// Mock AudioContext
class MockAnalyserNode {
  fftSize = 256
  frequencyBinCount = 128
  smoothingTimeConstant = 0.8
  getByteFrequencyData = jest.fn().mockImplementation((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 128)
    }
  })
  connect = jest.fn()
  disconnect = jest.fn()
}

class MockMediaStreamSource {
  connect = jest.fn()
  disconnect = jest.fn()
}

class MockAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'running'
  createAnalyser = jest.fn().mockReturnValue(new MockAnalyserNode())
  createMediaStreamSource = jest.fn().mockReturnValue(new MockMediaStreamSource())
  close = jest.fn().mockImplementation(() => {
    this.state = 'closed'
    return Promise.resolve()
  })
  resume = jest.fn().mockResolvedValue(undefined)
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
  createTempRecordingFile: jest.fn().mockResolvedValue({ success: true, data: '/tmp/audio.webm' }),
  appendToRecording: jest.fn().mockResolvedValue({ success: true }),
  finalizeRecording: jest.fn().mockResolvedValue({ success: true }),
  invoke: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  ...overrides
})

describe('AudioInputService (black box)', () => {
  let originalMediaDevices: typeof navigator.mediaDevices
  let originalMediaRecorder: typeof MediaRecorder
  let originalAudioContext: typeof AudioContext

  beforeEach(() => {
    originalMediaDevices = navigator.mediaDevices
    originalMediaRecorder = (global as any).MediaRecorder
    originalAudioContext = (global as any).AudioContext

      ; (global as any).MediaRecorder = MockMediaRecorder
      ; (global as any).AudioContext = MockAudioContext

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
      ; (global as any).AudioContext = originalAudioContext
    resetRecordingBridge()
    jest.clearAllMocks()
  })

  describe('starting audio capture', () => {
    it('requests microphone with specified device id', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({ deviceId: 'mic-123' })

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            deviceId: { exact: 'mic-123' }
          })
        })
      )
    })

    it('applies echo cancellation when enabled', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({
        deviceId: 'mic-123',
        echoCancellation: true
      })

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            echoCancellation: true
          })
        })
      )
    })

    it('applies noise suppression when enabled', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({
        deviceId: 'mic-123',
        noiseSuppression: true
      })

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            noiseSuppression: true
          })
        })
      )
    })

    it('disables video capture', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({ deviceId: 'mic-123' })

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: false
        })
      )
    })

    it('throws error when already recording', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({ deviceId: 'mic-123' })

      await expect(
        service.start({ deviceId: 'mic-456' })
      ).rejects.toThrow('Audio already recording')
    })
  })

  describe('audio level monitoring', () => {
    it('returns audio level between 0 and 1', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({ deviceId: 'mic-123' })

      const level = service.getAudioLevel()

      expect(level).toBeGreaterThanOrEqual(0)
      expect(level).toBeLessThanOrEqual(1)
    })

    it('returns 0 when not recording', () => {
      const bridge = createBridge()
      const service = new AudioInputService(bridge)

      expect(service.getAudioLevel()).toBe(0)
    })
  })

  describe('stopping audio capture', () => {
    it('returns result with duration and path', async () => {
      jest.useFakeTimers()
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({ deviceId: 'mic-123' })

      const stopPromise = service.stop()

      // Run timers to trigger the onstop callback
      jest.runAllTimers()

      const result = await stopPromise

      expect(result).toMatchObject({
        audioPath: expect.any(String),
        duration: expect.any(Number)
      })

      jest.useRealTimers()
    })

    it('throws error when not recording', async () => {
      const bridge = createBridge()
      const service = new AudioInputService(bridge)

      await expect(service.stop()).rejects.toThrow('Audio not recording')
    })
  })

  describe('pause and resume', () => {
    it('pauses recording', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({ deviceId: 'mic-123' })

      service.pause()

      expect(service.isPaused()).toBe(true)
    })

    it('resumes recording after pause', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({ deviceId: 'mic-123' })

      service.pause()
      service.resume()

      // Wait for async segment-based resume to complete
      await new Promise(r => setTimeout(r, 50))

      expect(service.isPaused()).toBe(false)
    })

    it('does nothing if pause called when not recording', () => {
      const bridge = createBridge()
      const service = new AudioInputService(bridge)

      // Should not throw
      expect(() => service.pause()).not.toThrow()
    })
  })

  describe('recording state', () => {
    it('reports not recording initially', () => {
      const bridge = createBridge()
      const service = new AudioInputService(bridge)

      expect(service.isRecording()).toBe(false)
    })

    it('reports recording after start', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({ deviceId: 'mic-123' })

      expect(service.isRecording()).toBe(true)
    })

    it('reports not recording after stop', async () => {
      jest.useFakeTimers()
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({ deviceId: 'mic-123' })

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
      const service = new AudioInputService(bridge)

      await expect(
        service.start({ deviceId: 'mic-123' })
      ).rejects.toThrow('Failed to capture audio')
    })
  })

  describe('stream access', () => {
    it('provides stream for external use', async () => {
      const bridge = createBridge()
      setRecordingBridge(bridge)

      const service = new AudioInputService(bridge)
      await service.start({ deviceId: 'mic-123' })

      const stream = service.getStream()
      expect(stream).toBeTruthy()
      expect(stream?.getAudioTracks()).toHaveLength(1)
    })

    it('returns null stream when not recording', () => {
      const bridge = createBridge()
      const service = new AudioInputService(bridge)

      expect(service.getStream()).toBeNull()
    })
  })
})
