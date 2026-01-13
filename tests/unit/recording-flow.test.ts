/**
 * Recording Flow Black Box Tests
 *
 * Mental Model:
 * 1. Global Pause/Resume: Freezes ALL sources, results in single continuous files
 * 2. Source Toggle (Webcam/Mic): Creates SEGMENTS - each toggle off/on creates a new clip
 * 3. Each segment knows its startTimeOffsetMs relative to main recording start
 * 4. Operations are locked to prevent race conditions
 */

import { AudioInputService } from '@/features/media/recording/services/audio-input-service'
import { WebcamService } from '@/features/media/recording/services/webcam-service'

// Mock the bridge for testing
const createMockBridge = () => ({
  createTempRecordingFile: jest.fn().mockResolvedValue({ success: true, data: '/tmp/test-file.webm' }),
  appendToRecording: jest.fn().mockResolvedValue({ success: true }),
  finalizeRecording: jest.fn().mockResolvedValue({ success: true }),
})

// Mock MediaRecorder
class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((event: any) => void) | null = null

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    // Simulate async stop
    setTimeout(() => this.onstop?.(), 0)
  }

  pause() {
    this.state = 'paused'
  }

  resume() {
    this.state = 'recording'
  }

  requestData() {
    this.ondataavailable?.({ data: new Blob(['test'], { type: 'audio/webm' }) })
  }

  static isTypeSupported() {
    return true
  }
}

// Mock getUserMedia
const mockStream = {
  getTracks: () => [{
    stop: jest.fn(),
    onended: null,
    kind: 'audio',
    getSettings: () => ({ width: 1920, height: 1080 })
  }],
  getAudioTracks: () => [{ stop: jest.fn(), onended: null }],
  getVideoTracks: () => [{ stop: jest.fn(), onended: null, getSettings: () => ({ width: 1920, height: 1080 }) }],
}

describe('Recording Flow Mental Model', () => {
  let originalMediaRecorder: any
  let originalGetUserMedia: any

  beforeAll(() => {
    originalMediaRecorder = (global as any).MediaRecorder
    ;(global as any).MediaRecorder = MockMediaRecorder

    originalGetUserMedia = navigator.mediaDevices?.getUserMedia
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockStream),
      },
      writable: true,
    })
  })

  afterAll(() => {
    ;(global as any).MediaRecorder = originalMediaRecorder
    if (originalGetUserMedia) {
      navigator.mediaDevices.getUserMedia = originalGetUserMedia
    }
  })

  describe('AudioInputService Segment Behavior', () => {
    it('should create a single segment when recording without toggles', async () => {
      const bridge = createMockBridge()
      const service = new AudioInputService(bridge as any)

      // Set main recording start time
      service.setMainRecordingStartTime(Date.now())

      // Start recording
      await service.start({ deviceId: 'test-device' })
      expect(service.isRecording()).toBe(true)
      expect(service.isToggledOff()).toBe(false)

      // Wait a bit to simulate recording
      await new Promise(r => setTimeout(r, 50))

      // Stop recording
      const result = await service.stop()

      // Should have exactly 1 segment
      expect(result.segments).toHaveLength(1)
      expect(result.segments[0].startTimeOffsetMs).toBeGreaterThanOrEqual(0)
      expect(result.segments[0].durationMs).toBeGreaterThan(0)
    })

    it('should create multiple segments when toggled off/on', async () => {
      const bridge = createMockBridge()
      const service = new AudioInputService(bridge as any)

      const mainStartTime = Date.now()
      service.setMainRecordingStartTime(mainStartTime)

      // Start recording
      await service.start({ deviceId: 'test-device' })
      expect(service.isToggledOff()).toBe(false)

      // Record first segment
      await new Promise(r => setTimeout(r, 30))

      // Toggle OFF (end first segment)
      const segment1 = await service.endSegment()
      expect(segment1).not.toBeNull()
      expect(service.isToggledOff()).toBe(true)

      // Wait while "off"
      await new Promise(r => setTimeout(r, 30))

      // Toggle ON (start new segment)
      await service.startNewSegment()
      expect(service.isToggledOff()).toBe(false)

      // Record second segment
      await new Promise(r => setTimeout(r, 30))

      // Stop recording
      const result = await service.stop()

      // Should have 2 segments
      expect(result.segments).toHaveLength(2)

      // Second segment should start AFTER first segment ended (with gap)
      expect(result.segments[1].startTimeOffsetMs).toBeGreaterThan(
        result.segments[0].startTimeOffsetMs + result.segments[0].durationMs - 50 // Allow some timing tolerance
      )
    })

    it('should track segment offsets relative to main recording', async () => {
      const bridge = createMockBridge()
      const service = new AudioInputService(bridge as any)

      const mainStartTime = Date.now()
      service.setMainRecordingStartTime(mainStartTime)

      // Wait 50ms before starting audio (simulates screen recording started first)
      await new Promise(r => setTimeout(r, 50))

      await service.start({ deviceId: 'test-device' })

      // Record for a bit
      await new Promise(r => setTimeout(r, 30))

      const result = await service.stop()

      // First segment offset should be ~50ms (the delay before audio started)
      expect(result.segments[0].startTimeOffsetMs).toBeGreaterThanOrEqual(40)
      expect(result.segments[0].startTimeOffsetMs).toBeLessThan(100)
    })

    it('should throw when trying to start segment without being toggled off', async () => {
      const bridge = createMockBridge()
      const service = new AudioInputService(bridge as any)

      service.setMainRecordingStartTime(Date.now())
      await service.start({ deviceId: 'test-device' })

      // Try to start new segment without ending current one
      await expect(service.startNewSegment()).rejects.toThrow('not toggled off')

      await service.stop()
    })

    it('should return null when ending segment while already toggled off', async () => {
      const bridge = createMockBridge()
      const service = new AudioInputService(bridge as any)

      service.setMainRecordingStartTime(Date.now())
      await service.start({ deviceId: 'test-device' })

      // End segment once
      await service.endSegment()
      expect(service.isToggledOff()).toBe(true)

      // Try to end again - should return null
      const result = await service.endSegment()
      expect(result).toBeNull()

      // Clean up by starting new segment then stopping
      await service.startNewSegment()
      await service.stop()
    })
  })

  describe('Global Pause vs Source Toggle Distinction', () => {
    it('global pause should NOT create new segments', async () => {
      const bridge = createMockBridge()
      const service = new AudioInputService(bridge as any)

      service.setMainRecordingStartTime(Date.now())
      await service.start({ deviceId: 'test-device' })

      // Use global pause/resume (not toggle)
      service.pause()
      expect(service.isPaused()).toBe(true)
      expect(service.isToggledOff()).toBe(false) // NOT toggled off

      await new Promise(r => setTimeout(r, 30))

      service.resume()
      expect(service.isPaused()).toBe(false)

      await new Promise(r => setTimeout(r, 30))

      const result = await service.stop()

      // Should still have only 1 segment (pause doesn't create segments)
      expect(result.segments).toHaveLength(1)
    })

    it('source toggle should create new segments', async () => {
      const bridge = createMockBridge()
      const service = new AudioInputService(bridge as any)

      service.setMainRecordingStartTime(Date.now())
      await service.start({ deviceId: 'test-device' })

      // Use toggle (not global pause)
      await service.endSegment()
      expect(service.isToggledOff()).toBe(true)
      expect(service.isPaused()).toBe(false) // Different from paused

      await new Promise(r => setTimeout(r, 30))

      await service.startNewSegment()
      expect(service.isToggledOff()).toBe(false)

      const result = await service.stop()

      // Should have 2 segments
      expect(result.segments).toHaveLength(2)
    })
  })

  describe('WebcamService Segment Behavior', () => {
    it('should create multiple segments when toggled', async () => {
      const bridge = createMockBridge()
      const service = new WebcamService(bridge as any)

      const mainStartTime = Date.now()
      service.setMainRecordingStartTime(mainStartTime)

      await service.start({ deviceId: 'test-webcam' })
      expect(service.isToggledOff()).toBe(false)

      await new Promise(r => setTimeout(r, 30))

      // Toggle OFF
      const segment1 = await service.endSegment()
      expect(segment1).not.toBeNull()
      expect(service.isToggledOff()).toBe(true)

      await new Promise(r => setTimeout(r, 30))

      // Toggle ON
      await service.startNewSegment()
      expect(service.isToggledOff()).toBe(false)

      await new Promise(r => setTimeout(r, 30))

      const result = await service.stop()

      expect(result.segments).toHaveLength(2)
      expect(result.segments[1].startTimeOffsetMs).toBeGreaterThan(result.segments[0].startTimeOffsetMs)
    })
  })

  describe('Segment Timeline Alignment', () => {
    it('segment offsets should allow correct clip placement', async () => {
      const bridge = createMockBridge()
      const service = new AudioInputService(bridge as any)

      // Simulate: main recording starts at T=0
      const mainStartTime = Date.now()
      service.setMainRecordingStartTime(mainStartTime)

      // Audio starts at T=0 relative to main
      await service.start({ deviceId: 'test-device' })

      // Record segment 1 for ~50ms (T=0 to T=50)
      await new Promise(r => setTimeout(r, 50))
      await service.endSegment()

      // Gap of ~50ms (T=50 to T=100) - audio is off
      await new Promise(r => setTimeout(r, 50))

      // Start segment 2 at T=100
      await service.startNewSegment()
      await new Promise(r => setTimeout(r, 50))

      const result = await service.stop()

      // Verify timeline alignment
      const seg1 = result.segments[0]
      const seg2 = result.segments[1]

      // Segment 1 should start near T=0
      expect(seg1.startTimeOffsetMs).toBeLessThan(20)

      // Segment 2 should start near T=100 (after 50ms recording + 50ms gap)
      expect(seg2.startTimeOffsetMs).toBeGreaterThan(80)
      expect(seg2.startTimeOffsetMs).toBeLessThan(150)

      // Gap between segments should be ~50ms
      const gap = seg2.startTimeOffsetMs - (seg1.startTimeOffsetMs + seg1.durationMs)
      expect(gap).toBeGreaterThan(30)
      expect(gap).toBeLessThan(100)
    })
  })

  describe('Result Structure Backward Compatibility', () => {
    it('AudioInputResult should have audioPath for backward compatibility', async () => {
      const bridge = createMockBridge()
      const service = new AudioInputService(bridge as any)

      service.setMainRecordingStartTime(Date.now())
      await service.start({ deviceId: 'test-device' })
      await new Promise(r => setTimeout(r, 30))

      const result = await service.stop()

      // Should have audioPath (first segment path) for backward compat
      expect(result.audioPath).toBeTruthy()
      expect(result.audioPath).toBe(result.segments[0]?.filePath || '')

      // Should have duration (total of all segments)
      expect(result.duration).toBeGreaterThan(0)

      // Should have segments array
      expect(Array.isArray(result.segments)).toBe(true)
    })

    it('WebcamRecordingResult should have videoPath for backward compatibility', async () => {
      const bridge = createMockBridge()
      const service = new WebcamService(bridge as any)

      service.setMainRecordingStartTime(Date.now())
      await service.start({ deviceId: 'test-webcam' })
      await new Promise(r => setTimeout(r, 30))

      const result = await service.stop()

      // Should have videoPath (first segment path) for backward compat
      expect(result.videoPath).toBeTruthy()

      // Should have dimensions
      expect(result.width).toBeGreaterThan(0)
      expect(result.height).toBeGreaterThan(0)

      // Should have segments array
      expect(Array.isArray(result.segments)).toBe(true)
    })
  })
})

describe('RecordingService Toggle API', () => {
  // These tests verify the RecordingService orchestrates toggles correctly
  // Note: Full integration would require mocking native recording strategy

  it('toggle methods should exist on RecordingService', async () => {
    const { RecordingService } = await import('@/features/media/recording/services/recording-service')
    const service = new RecordingService()

    // Verify toggle API exists
    expect(typeof service.toggleWebcamCapture).toBe('function')
    expect(typeof service.toggleMicrophoneCapture).toBe('function')
    expect(typeof service.isWebcamToggledOff).toBe('function')
    expect(typeof service.isMicrophoneToggledOff).toBe('function')
    expect(typeof service.canToggleWebcam).toBe('function')
    expect(typeof service.canToggleMicrophone).toBe('function')
  })

  it('cannot toggle when not recording', async () => {
    const { RecordingService } = await import('@/features/media/recording/services/recording-service')
    const service = new RecordingService()

    // Should throw when trying to toggle without active recording
    await expect(service.toggleWebcamCapture()).rejects.toThrow('not recording')
    await expect(service.toggleMicrophoneCapture()).rejects.toThrow('not recording')
  })

  it('canToggle should return false when not recording', async () => {
    const { RecordingService } = await import('@/features/media/recording/services/recording-service')
    const service = new RecordingService()

    expect(service.canToggleWebcam()).toBe(false)
    expect(service.canToggleMicrophone()).toBe(false)
  })

  it('isToggledOff should return false when no services', async () => {
    const { RecordingService } = await import('@/features/media/recording/services/recording-service')
    const service = new RecordingService()

    expect(service.isWebcamToggledOff()).toBe(false)
    expect(service.isMicrophoneToggledOff()).toBe(false)
  })
})

// Note: Toggle state is now managed solely by RecordingService, not session-store.
// Session-store only tracks isRecording, isPaused, duration, and settings.
// Tests for toggle state should use RecordingService directly via the useRecording hook.
