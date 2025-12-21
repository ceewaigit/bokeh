const { splitClipAtTime } = require('@/lib/timeline/timeline-operations')

describe('splitClipAtTime source bounds', () => {
  it('safely defaults missing sourceIn/sourceOut when splitting', () => {
    const clip = {
      id: 'clip-1',
      recordingId: 'rec-1',
      startTime: 0,
      duration: 8000,
      playbackRate: 1
    }

    const result = splitClipAtTime(clip, 4000)
    expect(result).not.toBeNull()
    const { firstClip, secondClip } = result

    expect(firstClip.sourceIn).toBe(0)
    expect(firstClip.sourceOut).toBe(4000)
    expect(secondClip.sourceIn).toBe(4000)
    expect(secondClip.sourceOut).toBe(8000)
  })

  it('keeps explicit source bounds intact', () => {
    const clip = {
      id: 'clip-2',
      recordingId: 'rec-2',
      startTime: 1000,
      duration: 6000,
      sourceIn: 2000,
      sourceOut: 8000,
      playbackRate: 1
    }

    const result = splitClipAtTime(clip, 2500)
    expect(result).not.toBeNull()

    const { firstClip, secondClip } = result
    expect(firstClip.sourceIn).toBe(2000)
    expect(firstClip.sourceOut).toBe(4500)
    expect(secondClip.sourceIn).toBe(4500)
    expect(secondClip.sourceOut).toBe(8000)
  })
})
