
import { TypingSpeedApplicationService } from '@/lib/timeline/typing-speed-application'
import { TimeConverter } from '@/lib/timeline/time-space-converter'

// Mock dependencies
jest.mock('@/lib/timeline/timeline-operations', () => ({
  reflowClips: jest.fn(),
  calculateTimelineDuration: jest.fn().mockReturnValue(10000)
}))

describe('Typing Speed Remapping', () => {
  let project
  let clip
  let track

  beforeEach(() => {
    clip = {
      id: 'test-clip',
      recordingId: 'rec-1',
      startTime: 0,
      duration: 10000, // 10s
      sourceIn: 0,
      sourceOut: 10000,
      playbackRate: 1,
      typingSpeedApplied: false
    }

    track = {
      id: 'track-1',
      type: 'video',
      clips: [clip]
    }

    project = {
      timeline: {
        tracks: [track],
        duration: 10000
      },
      recordings: [{
        id: 'rec-1',
        duration: 10000
      }]
    }
  })

  it('should apply time remapping instead of splitting clips', () => {
    const periods = [{
      startTime: 2000,
      endTime: 4000,
      suggestedSpeedMultiplier: 2
    }]

    const result = TypingSpeedApplicationService.applyTypingSpeedToClip(project, 'test-clip', periods)

    // Should still be one clip
    expect(track.clips.length).toBe(1)
    expect(track.clips[0].id).toBe('test-clip')
    
    // Should have time remapping applied
    const updatedClip = track.clips[0]
    expect(updatedClip.typingSpeedApplied).toBe(true)
    expect(updatedClip.timeRemapPeriods).toHaveLength(3) // Normal, Fast, Normal

    // Check periods
    // 1. 0-2000ms: Normal speed (1x)
    expect(updatedClip.timeRemapPeriods[0]).toEqual({
      sourceStartTime: 0,
      sourceEndTime: 2000,
      speedMultiplier: 1
    })

    // 2. 2000-4000ms: Fast speed (2x)
    expect(updatedClip.timeRemapPeriods[1]).toEqual({
      sourceStartTime: 2000,
      sourceEndTime: 4000,
      speedMultiplier: 2
    })

    // 3. 4000-10000ms: Normal speed (1x)
    expect(updatedClip.timeRemapPeriods[2]).toEqual({
      sourceStartTime: 4000,
      sourceEndTime: 10000,
      speedMultiplier: 1
    })
  })

  it('should calculate correct duration with remapping', () => {
    // Original: 10s
    // Speed up 2s section (2000-4000) by 2x -> takes 1s
    // Remaining 8s is 1x -> takes 8s
    // Total new duration should be 9s
    
    const periods = [{
      startTime: 2000,
      endTime: 4000,
      suggestedSpeedMultiplier: 2
    }]

    TypingSpeedApplicationService.applyTypingSpeedToClip(project, 'test-clip', periods)
    
    const updatedClip = track.clips[0]
    expect(updatedClip.duration).toBe(9000)
  })

  it('should handle multiple speed up periods', () => {
    // 10s clip
    // 2000-4000: 2x (2s -> 1s)
    // 6000-8000: 4x (2s -> 0.5s)
    // Rest (6s): 1x (6s -> 6s)
    // Total: 7.5s
    
    const periods = [
      { startTime: 2000, endTime: 4000, suggestedSpeedMultiplier: 2 },
      { startTime: 6000, endTime: 8000, suggestedSpeedMultiplier: 4 }
    ]

    TypingSpeedApplicationService.applyTypingSpeedToClip(project, 'test-clip', periods)
    
    const updatedClip = track.clips[0]
    expect(updatedClip.duration).toBe(7500)
    expect(updatedClip.timeRemapPeriods).toHaveLength(5) // N, F, N, F, N
  })
})
