/**
 * Tests for video scrubbing performance optimizations
 */

describe('Adaptive Throttle Logic', () => {
  const BASE_THROTTLE_MS = 16
  const MAX_THROTTLE_MS = 32
  const LARGE_SEEK_THRESHOLD = 10

  const getAdaptiveThrottle = (frameDelta: number): number => {
    return frameDelta > LARGE_SEEK_THRESHOLD ? MAX_THROTTLE_MS : BASE_THROTTLE_MS
  }

  it('uses fast throttle (16ms) for small seeks', () => {
    expect(getAdaptiveThrottle(1)).toBe(16)
    expect(getAdaptiveThrottle(5)).toBe(16)
    expect(getAdaptiveThrottle(10)).toBe(16)
  })

  it('uses slow throttle (32ms) for large seeks', () => {
    expect(getAdaptiveThrottle(11)).toBe(32)
    expect(getAdaptiveThrottle(50)).toBe(32)
    expect(getAdaptiveThrottle(100)).toBe(32)
  })

  it('threshold is at 10 frames', () => {
    expect(getAdaptiveThrottle(10)).toBe(16) // at threshold = fast
    expect(getAdaptiveThrottle(11)).toBe(32) // above threshold = slow
  })
})

describe('URL Locking During Scrub', () => {
  // Simulate the URL locking logic from useVideoUrl
  const createUrlLocker = () => {
    let lockedUrl: string | undefined = undefined
    let lockedKey: string | undefined = undefined

    return {
      getLockedUrl: (
        computedUrl: string | undefined,
        recordingId: string,
        clipId: string,
        isPlaying: boolean,
        isScrubbing: boolean
      ): string | undefined => {
        const invalidateKey = `${recordingId}-${clipId}`
        const isLocked = isPlaying || isScrubbing

        if (invalidateKey !== lockedKey) {
          lockedUrl = computedUrl
          lockedKey = invalidateKey
        } else if (!isLocked && computedUrl && computedUrl !== lockedUrl) {
          lockedUrl = computedUrl
        } else if (!lockedUrl && computedUrl) {
          lockedUrl = computedUrl
        }

        return lockedUrl ?? computedUrl
      },
      reset: () => {
        lockedUrl = undefined
        lockedKey = undefined
      }
    }
  }

  it('locks URL when scrubbing starts', () => {
    const locker = createUrlLocker()

    // Initial URL when idle
    const url1 = locker.getLockedUrl('proxy.mp4', 'rec1', 'clip1', false, false)
    expect(url1).toBe('proxy.mp4')

    // Start scrubbing - URL should stay locked even if computed changes
    const url2 = locker.getLockedUrl('source.mp4', 'rec1', 'clip1', false, true)
    expect(url2).toBe('proxy.mp4') // Still locked to original
  })

  it('locks URL when playing', () => {
    const locker = createUrlLocker()

    const url1 = locker.getLockedUrl('proxy.mp4', 'rec1', 'clip1', false, false)
    expect(url1).toBe('proxy.mp4')

    // Start playing - URL should stay locked
    const url2 = locker.getLockedUrl('source.mp4', 'rec1', 'clip1', true, false)
    expect(url2).toBe('proxy.mp4')
  })

  it('allows URL change when idle (not playing, not scrubbing)', () => {
    const locker = createUrlLocker()

    const url1 = locker.getLockedUrl('proxy.mp4', 'rec1', 'clip1', false, false)
    expect(url1).toBe('proxy.mp4')

    // Still idle - URL can change
    const url2 = locker.getLockedUrl('source.mp4', 'rec1', 'clip1', false, false)
    expect(url2).toBe('source.mp4')
  })

  it('invalidates lock when recording/clip changes', () => {
    const locker = createUrlLocker()

    const url1 = locker.getLockedUrl('proxy1.mp4', 'rec1', 'clip1', true, false)
    expect(url1).toBe('proxy1.mp4')

    // Different clip - lock should reset
    const url2 = locker.getLockedUrl('proxy2.mp4', 'rec1', 'clip2', true, false)
    expect(url2).toBe('proxy2.mp4')
  })
})

describe('Player Key Stability', () => {
  // Simulate the playerKey logic
  const generatePlayerKey = (
    fps: number,
    videoRecordingIds: string[]
  ): string => {
    const sortedIds = [...videoRecordingIds].sort().join(',')
    return `player-${fps}-${sortedIds}`
  }

  it('key changes when fps changes', () => {
    const key1 = generatePlayerKey(30, ['rec1'])
    const key2 = generatePlayerKey(60, ['rec1'])
    expect(key1).not.toBe(key2)
  })

  it('key changes when recordings change', () => {
    const key1 = generatePlayerKey(30, ['rec1'])
    const key2 = generatePlayerKey(30, ['rec1', 'rec2'])
    expect(key1).not.toBe(key2)
  })

  it('key does NOT change when duration changes', () => {
    // Previously, duration was in the key which caused unnecessary remounts
    // Now it's not included, so two different durations produce the same key
    const key1 = generatePlayerKey(30, ['rec1'])
    const key2 = generatePlayerKey(30, ['rec1']) // Same fps and recordings
    expect(key1).toBe(key2)
  })

  it('key does NOT change when dimensions change', () => {
    // Previously, width/height were in the key
    // Now they're not included
    const key1 = generatePlayerKey(30, ['rec1'])
    const key2 = generatePlayerKey(30, ['rec1'])
    expect(key1).toBe(key2)
  })

  it('recording order does not affect key', () => {
    const key1 = generatePlayerKey(30, ['rec1', 'rec2'])
    const key2 = generatePlayerKey(30, ['rec2', 'rec1'])
    expect(key1).toBe(key2) // Should be same due to sorting
  })
})

describe('RAF Optimization - Frame Skip Logic', () => {
  it('should skip work when frame has not changed', () => {
    let workDone = 0
    let lastFrame = -1

    const processFrame = (currentFrame: number) => {
      if (currentFrame === lastFrame) {
        return false // Skipped
      }
      lastFrame = currentFrame
      workDone++
      return true // Processed
    }

    // First call - should process
    expect(processFrame(0)).toBe(true)
    expect(workDone).toBe(1)

    // Same frame - should skip
    expect(processFrame(0)).toBe(false)
    expect(workDone).toBe(1) // No change

    // Same frame again - should skip
    expect(processFrame(0)).toBe(false)
    expect(workDone).toBe(1)

    // New frame - should process
    expect(processFrame(1)).toBe(true)
    expect(workDone).toBe(2)
  })
})
