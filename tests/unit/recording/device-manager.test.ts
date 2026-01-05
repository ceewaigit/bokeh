import { getDeviceManager } from '@/features/media/recording/services/device-manager'

// Mock navigator.mediaDevices
const createMockMediaDevices = (devices: MediaDeviceInfo[] = []) => ({
  enumerateDevices: jest.fn().mockResolvedValue(devices),
  getUserMedia: jest.fn().mockResolvedValue({
    getTracks: () => [{ stop: jest.fn() }],
    getVideoTracks: () => [{ stop: jest.fn() }],
    getAudioTracks: () => [{ stop: jest.fn() }]
  }),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
})

const createDevice = (kind: MediaDeviceKind, id: string, label: string): MediaDeviceInfo => ({
  deviceId: id,
  groupId: `group-${id}`,
  kind,
  label,
  toJSON: () => ({ deviceId: id, groupId: `group-${id}`, kind, label })
})

describe('DeviceManager (black box)', () => {
  let originalMediaDevices: typeof navigator.mediaDevices
  let manager: ReturnType<typeof getDeviceManager>

  beforeEach(() => {
    originalMediaDevices = navigator.mediaDevices
    // Reset the singleton by destroying it
    try {
      getDeviceManager().destroy()
    } catch {
      // Ignore if not initialized
    }
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      writable: true
    })
    jest.clearAllMocks()
    try {
      getDeviceManager().destroy()
    } catch {
      // Ignore
    }
  })

  describe('device enumeration', () => {
    it('returns empty arrays when no devices available', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: createMockMediaDevices([]),
        writable: true
      })

      manager = getDeviceManager()
      await manager.initialize()
      const state = manager.getDeviceState()

      expect(state.webcams).toEqual([])
      expect(state.microphones).toEqual([])
      expect(state.speakers).toEqual([])
    })

    it('separates devices by type correctly', async () => {
      const devices = [
        createDevice('videoinput', 'cam1', 'FaceTime HD Camera'),
        createDevice('videoinput', 'cam2', 'External Webcam'),
        createDevice('audioinput', 'mic1', 'Built-in Microphone'),
        createDevice('audioinput', 'mic2', 'External Mic'),
        createDevice('audiooutput', 'speaker1', 'Built-in Speaker')
      ]

      Object.defineProperty(navigator, 'mediaDevices', {
        value: createMockMediaDevices(devices),
        writable: true
      })

      manager = getDeviceManager()
      await manager.initialize()
      const state = manager.getDeviceState()

      expect(state.webcams).toHaveLength(2)
      expect(state.microphones).toHaveLength(2)
      expect(state.speakers).toHaveLength(1)
    })
  })

  describe('default device selection', () => {
    it('returns first webcam as default when available', async () => {
      const devices = [
        createDevice('videoinput', 'cam1', 'FaceTime HD Camera'),
        createDevice('videoinput', 'cam2', 'External Webcam')
      ]

      Object.defineProperty(navigator, 'mediaDevices', {
        value: createMockMediaDevices(devices),
        writable: true
      })

      manager = getDeviceManager()
      await manager.initialize()

      expect(manager.getDefaultWebcam()).toBe('cam1')
    })

    it('returns null when no webcams available', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: createMockMediaDevices([]),
        writable: true
      })

      manager = getDeviceManager()
      await manager.initialize()

      expect(manager.getDefaultWebcam()).toBeNull()
    })

    it('returns default microphone preferring "default" device', async () => {
      const devices = [
        createDevice('audioinput', 'mic1', 'Built-in Microphone'),
        createDevice('audioinput', 'default', 'Default')
      ]

      Object.defineProperty(navigator, 'mediaDevices', {
        value: createMockMediaDevices(devices),
        writable: true
      })

      manager = getDeviceManager()
      await manager.initialize()

      expect(manager.getDefaultMicrophone()).toBe('default')
    })
  })

  describe('preview stream management', () => {
    it('creates preview stream for webcam', async () => {
      const mockStream = {
        getTracks: () => [{ stop: jest.fn() }],
        getVideoTracks: () => [{ stop: jest.fn() }],
        getAudioTracks: () => []
      }

      const mockMediaDevices = {
        ...createMockMediaDevices([createDevice('videoinput', 'cam1', 'Camera')]),
        getUserMedia: jest.fn().mockResolvedValue(mockStream)
      }

      Object.defineProperty(navigator, 'mediaDevices', {
        value: mockMediaDevices,
        writable: true
      })

      manager = getDeviceManager()
      await manager.initialize()
      const stream = await manager.startPreview('cam1')

      expect(stream).toBe(mockStream)
      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            deviceId: { exact: 'cam1' }
          })
        })
      )
    })

    it('stops preview stream on stopPreview', async () => {
      const stopMock = jest.fn()
      const mockStream = {
        getTracks: () => [{ stop: stopMock }],
        getVideoTracks: () => [{ stop: stopMock }],
        getAudioTracks: () => []
      }

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          ...createMockMediaDevices([]),
          getUserMedia: jest.fn().mockResolvedValue(mockStream)
        },
        writable: true
      })

      manager = getDeviceManager()
      await manager.initialize()
      await manager.startPreview('cam1')
      manager.stopPreview()

      expect(stopMock).toHaveBeenCalled()
    })

    it('returns current preview stream', async () => {
      const mockStream = {
        getTracks: () => [{ stop: jest.fn() }],
        getVideoTracks: () => [],
        getAudioTracks: () => []
      }

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          ...createMockMediaDevices([]),
          getUserMedia: jest.fn().mockResolvedValue(mockStream)
        },
        writable: true
      })

      manager = getDeviceManager()
      await manager.initialize()

      expect(manager.getPreviewStream()).toBeNull()

      await manager.startPreview('cam1')
      expect(manager.getPreviewStream()).toBe(mockStream)
    })
  })

  describe('device change events', () => {
    it('calls callback when devices change', async () => {
      const mockMediaDevices = createMockMediaDevices([])
      let deviceChangeHandler: (() => void | Promise<void>) | null = null

      mockMediaDevices.addEventListener = jest.fn((event: string, handler: () => void | Promise<void>) => {
        if (event === 'devicechange') {
          deviceChangeHandler = handler
        }
      })

      Object.defineProperty(navigator, 'mediaDevices', {
        value: mockMediaDevices,
        writable: true
      })

      const onChange = jest.fn()
      manager = getDeviceManager()
      manager.onDevicesChanged(onChange)
      await manager.initialize()

      // Simulate device change
      mockMediaDevices.enumerateDevices.mockResolvedValue([
        createDevice('videoinput', 'newcam', 'New Camera')
      ])

      if (deviceChangeHandler) {
        await (deviceChangeHandler as () => Promise<void>)()
      }

      expect(onChange).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('handles getUserMedia failure for preview', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          ...createMockMediaDevices([]),
          getUserMedia: jest.fn().mockRejectedValue(new Error('NotAllowedError'))
        },
        writable: true
      })

      manager = getDeviceManager()
      await manager.initialize()

      await expect(manager.startPreview('cam1')).rejects.toThrow('NotAllowedError')
    })
  })
})
