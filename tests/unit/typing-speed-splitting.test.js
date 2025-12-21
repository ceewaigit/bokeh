
import { TypingSpeedApplicationService } from '@/lib/timeline/typing-speed-application'

// Mock dependencies
jest.mock('@/lib/timeline/timeline-operations', () => ({
    reflowClips: jest.fn(),
    calculateTimelineDuration: jest.fn().mockReturnValue(10000)
}))

describe('Typing Speed Splitting', () => {
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
            }],
            settings: {
                frameRate: 60
            }
        }
    })

    it('should split clips correctly based on typing periods', () => {
        const periods = [{
            startTime: 2000,
            endTime: 4000,
            suggestedSpeedMultiplier: 2
        }]

        TypingSpeedApplicationService.applyTypingSpeedToClip(project, 'test-clip', periods)

        // Should be split into 3 clips
        expect(track.clips.length).toBe(3)

        // Clip 1: 0-2000ms (Normal)
        expect(track.clips[0].sourceIn).toBe(0)
        expect(track.clips[0].sourceOut).toBe(2000)
        expect(track.clips[0].playbackRate).toBe(1)
        expect(track.clips[0].typingSpeedApplied).toBe(true) // Should be true for all

        // Clip 2: 2000-4000ms (Fast 2x)
        expect(track.clips[1].sourceIn).toBe(2000)
        expect(track.clips[1].sourceOut).toBe(4000)
        expect(track.clips[1].playbackRate).toBe(2)
        expect(track.clips[1].typingSpeedApplied).toBe(true)

        // Clip 3: 4000-10000ms (Normal)
        expect(track.clips[2].sourceIn).toBe(4000)
        expect(track.clips[2].sourceOut).toBe(10000)
        expect(track.clips[2].playbackRate).toBe(1)
        expect(track.clips[2].typingSpeedApplied).toBe(true)
    })

    it('should merge small gaps', () => {
        // Create a period with a tiny gap before it
        // Gap: 2000-2010 (10ms) - smaller than 1 frame (16.6ms)
        // Period: 2010-4000
        const periods = [{
            startTime: 2010,
            endTime: 4000,
            suggestedSpeedMultiplier: 2
        }]

        TypingSpeedApplicationService.applyTypingSpeedToClip(project, 'test-clip', periods)

        // The gap (2000-2010) should be merged into the previous clip (Clip 1)
        // Clip 1: 0 - 2010 (Normal)
        // Clip 2: 2010 - 4000 (Fast)
        // Clip 3: 4000 - 10000 (Normal)

        expect(track.clips.length).toBe(3)
        expect(track.clips[0].sourceOut).toBe(2010)
        expect(track.clips[1].sourceIn).toBe(2010)
    })
    it('should maintain source continuity across splits', () => {
        const periods = [{
            startTime: 2000,
            endTime: 4000,
            suggestedSpeedMultiplier: 2
        }]

        TypingSpeedApplicationService.applyTypingSpeedToClip(project, 'test-clip', periods)

        // Check that sourceOut of one clip equals sourceIn of next
        expect(track.clips[0].sourceOut).toBe(track.clips[1].sourceIn)
        expect(track.clips[1].sourceOut).toBe(track.clips[2].sourceIn)
    })

    it('should maintain timeline continuity (no gaps)', () => {
        const periods = [{
            startTime: 2000,
            endTime: 4000,
            suggestedSpeedMultiplier: 2
        }]

        TypingSpeedApplicationService.applyTypingSpeedToClip(project, 'test-clip', periods)

        // Check that startTime + duration of one clip equals startTime of next
        expect(track.clips[0].startTime + track.clips[0].duration).toBe(track.clips[1].startTime)
        expect(track.clips[1].startTime + track.clips[1].duration).toBe(track.clips[2].startTime)
    })
})
