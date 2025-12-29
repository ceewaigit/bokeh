/**
 * Tests for timeline-operations trim functions
 * 
 * Coverage:
 * - trimClipStart
 * - executeTrimClipStart
 * - trimClipEnd
 * - executeTrimClipEnd
 * 
 * Edge cases:
 * - Minimum duration enforcement
 * - Playback rate handling
 * - Source bounds (sourceIn/sourceOut) updates
 * - Locked bounds validation
 * - Fade duration handling
 */

import { describe, it, expect } from '@jest/globals'
import type { Project, Clip } from '@/types/project'
import { TrackType } from '@/types/project'

// Helper to create a minimal valid project
function createTestProject(clips: Clip[] = []): Project {
    return {
        version: '1',
        schemaVersion: 1,
        id: 'test-project',
        name: 'Test Project',
        createdAt: '2020-01-01T00:00:00.000Z',
        recordings: [],
        effects: [],
        settings: {} as any,
        exportPresets: [],
        timeline: {
            duration: clips.length > 0
                ? Math.max(...clips.map(c => c.startTime + c.duration))
                : 0,
            tracks: [
                {
                    id: 'track-video',
                    name: 'Video',
                    type: TrackType.Video,
                    clips: clips,
                    muted: false,
                    locked: false,
                },
            ],
        },
        modifiedAt: '2020-01-01T00:00:00.000Z',
    } as Project
}

// Helper to create a test clip
function createTestClip(overrides: Partial<Clip> = {}): Clip {
    return {
        id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        recordingId: 'rec-1',
        startTime: 0,
        duration: 4000,
        sourceIn: 0,
        sourceOut: 4000,
        playbackRate: 1,
        ...overrides,
    }
}

describe('trimClipStart', () => {
    it('calculates correct updates when trimming from start', () => {
        const { trimClipStart } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 4000,
            sourceIn: 0,
            sourceOut: 4000,
            playbackRate: 1,
        })

        const result = trimClipStart(clip, 1000)

        expect(result).not.toBeNull()
        expect(result!.startTime).toBe(1000)
        expect(result!.duration).toBe(3000)
        expect(result!.sourceIn).toBe(1000)
    })

    it('handles playback rate when calculating sourceIn', () => {
        const { trimClipStart } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 2000,  // 2s timeline = 4s source at 2x
            sourceIn: 0,
            sourceOut: 4000,
            playbackRate: 2,
        })

        // Trim 500ms from start (timeline) = 1000ms in source space at 2x
        const result = trimClipStart(clip, 500)

        expect(result).not.toBeNull()
        expect(result!.startTime).toBe(500)
        expect(result!.duration).toBe(1500)
        expect(result!.sourceIn).toBe(1000)  // 500 * 2 = 1000
    })

    it('rejects trim that would result in duration < 1 second', () => {
        const { trimClipStart } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 2000,
            sourceIn: 0,
            sourceOut: 2000,
        })

        // Try to trim to leave only 500ms (< 1000ms minimum)
        const result = trimClipStart(clip, 1500)

        expect(result).toBeNull()
    })

    it('rejects negative startTime', () => {
        const { trimClipStart } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 4000,
        })

        const result = trimClipStart(clip, -1000)

        expect(result).toBeNull()
    })

    it('respects lockedSourceIn bounds', () => {
        const { trimClipStart } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 1000,
            duration: 3000,
            sourceIn: 1000,
            sourceOut: 4000,
            lockedSourceIn: 1000,  // Can't expand before this
        })

        // Try to expand left (which would require sourceIn < 1000)
        const result = trimClipStart(clip, 500)  // This would need sourceIn = 500

        expect(result).toBeNull()
    })

    it('caps introFadeMs to new duration', () => {
        const { trimClipStart } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 4000,
            sourceIn: 0,
            sourceOut: 4000,
            introFadeMs: 2000,  // 2s fade
        })

        // Trim to leave only 1.5s - fade should be capped
        const result = trimClipStart(clip, 2500)

        expect(result).not.toBeNull()
        expect(result!.duration).toBe(1500)
        expect(result!.introFadeMs).toBe(1500)  // Capped to new duration
    })
})

describe('executeTrimClipStart', () => {
    it('executes trim and updates project state', () => {
        const { executeTrimClipStart } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            id: 'clip-1',
            startTime: 0,
            duration: 4000,
            sourceIn: 0,
            sourceOut: 4000,
        })
        const project = createTestProject([clip])

        const result = executeTrimClipStart(project, 'clip-1', 1000)

        expect(result).toBe(true)
        // Note: after shrinking from start (moving start right), reflow is called
        // which resets the first clip to startTime 0
        expect(project.timeline.tracks[0].clips[0].startTime).toBe(0)
        expect(project.timeline.tracks[0].clips[0].duration).toBe(3000)
        expect(project.timeline.tracks[0].clips[0].sourceIn).toBe(1000)
    })

    it('reflows subsequent clips when shrinking (moving start right)', () => {
        const { executeTrimClipStart } = require('../../src/lib/timeline/timeline-operations')

        const clip1 = createTestClip({
            id: 'clip-1',
            startTime: 0,
            duration: 4000,
            sourceIn: 0,
            sourceOut: 4000,
        })
        const clip2 = createTestClip({
            id: 'clip-2',
            startTime: 4000,
            duration: 2000,
            sourceIn: 0,
            sourceOut: 2000,
        })
        const project = createTestProject([clip1, clip2])

        // Shrink clip-1 by moving start right (from 0 to 1000)
        const result = executeTrimClipStart(project, 'clip-1', 1000)

        expect(result).toBe(true)
        // Clip 1 shrinks
        expect(project.timeline.tracks[0].clips[0].duration).toBe(3000)
        // Clip 2 reflows to close the gap
        expect(project.timeline.tracks[0].clips[1].startTime).toBe(3000)
    })

    it('does not reflow when expanding (moving start left)', () => {
        const { executeTrimClipStart } = require('../../src/lib/timeline/timeline-operations')

        const clip1 = createTestClip({
            id: 'clip-1',
            startTime: 1000,  // Gap at start
            duration: 3000,
            sourceIn: 1000,
            sourceOut: 4000,
        })
        const clip2 = createTestClip({
            id: 'clip-2',
            startTime: 4000,
            duration: 2000,
        })
        const project = createTestProject([clip1, clip2])

        // Expand clip-1 by moving start left (from 1000 to 0)
        const result = executeTrimClipStart(project, 'clip-1', 0)

        expect(result).toBe(true)
        // Clip 1 expands
        expect(project.timeline.tracks[0].clips[0].duration).toBe(4000)
        // Clip 2 position should be adjusted by reflow to maintain contiguity
        expect(project.timeline.tracks[0].clips[1].startTime).toBe(4000)
    })

    it('returns false for non-existent clip', () => {
        const { executeTrimClipStart } = require('../../src/lib/timeline/timeline-operations')

        const project = createTestProject([])

        const result = executeTrimClipStart(project, 'non-existent', 1000)

        expect(result).toBe(false)
    })
})

describe('trimClipEnd', () => {
    it('calculates correct updates when trimming from end', () => {
        const { trimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 4000,
            sourceIn: 0,
            sourceOut: 4000,
            playbackRate: 1,
        })

        const result = trimClipEnd(clip, 3000)

        expect(result).not.toBeNull()
        expect(result!.duration).toBe(3000)
        expect(result!.sourceOut).toBe(3000)
    })

    it('handles playback rate when calculating sourceOut', () => {
        const { trimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 2000,  // 2s timeline = 4s source at 2x
            sourceIn: 0,
            sourceOut: 4000,
            playbackRate: 2,
        })

        // Trim end to 1.5s timeline = 3s source
        const result = trimClipEnd(clip, 1500)

        expect(result).not.toBeNull()
        expect(result!.duration).toBe(1500)
        // durationChange = 1500 - 2000 = -500, sourceChange = -500 * 2 = -1000
        expect(result!.sourceOut).toBe(3000)  // 4000 - 1000
    })

    it('rejects trim that would result in duration < 1 second', () => {
        const { trimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 2000,
            sourceIn: 0,
            sourceOut: 2000,
        })

        // Try to trim to only 500ms
        const result = trimClipEnd(clip, 500)

        expect(result).toBeNull()
    })

    it('rejects negative endTime', () => {
        const { trimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 4000,
        })

        const result = trimClipEnd(clip, -1000)

        expect(result).toBeNull()
    })

    it('respects lockedSourceOut bounds', () => {
        const { trimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 2000,
            sourceIn: 0,
            sourceOut: 2000,
            lockedSourceOut: 2000,  // Can't expand past this
        })

        // Try to expand right (which would require sourceOut > 2000)
        const result = trimClipEnd(clip, 3000)  // This would need sourceOut = 3000

        expect(result).toBeNull()
    })

    it('caps outroFadeMs to new duration', () => {
        const { trimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 4000,
            sourceIn: 0,
            sourceOut: 4000,
            outroFadeMs: 2000,  // 2s fade
        })

        // Trim to only 1.5s - fade should be capped
        const result = trimClipEnd(clip, 1500)

        expect(result).not.toBeNull()
        expect(result!.duration).toBe(1500)
        expect(result!.outroFadeMs).toBe(1500)  // Capped to new duration
    })

    it('ensures sourceOut >= sourceIn', () => {
        const { trimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            startTime: 0,
            duration: 4000,
            sourceIn: 2000,
            sourceOut: 6000,
            playbackRate: 1,
        })

        // Trim severely
        const result = trimClipEnd(clip, 1000)  // duration becomes 1000

        expect(result).not.toBeNull()
        // Even with severe trim, sourceOut should be >= sourceIn
        expect(result!.sourceOut).toBeGreaterThanOrEqual(clip.sourceIn)
    })
})

describe('executeTrimClipEnd', () => {
    it('executes trim and updates project state', () => {
        const { executeTrimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            id: 'clip-1',
            startTime: 0,
            duration: 4000,
            sourceIn: 0,
            sourceOut: 4000,
        })
        const project = createTestProject([clip])

        const result = executeTrimClipEnd(project, 'clip-1', 3000)

        expect(result).toBe(true)
        expect(project.timeline.tracks[0].clips[0].duration).toBe(3000)
        expect(project.timeline.tracks[0].clips[0].sourceOut).toBe(3000)
        expect(project.timeline.duration).toBe(3000)
    })

    it('reflows subsequent clips when shrinking (moving end left)', () => {
        const { executeTrimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip1 = createTestClip({
            id: 'clip-1',
            startTime: 0,
            duration: 4000,
            sourceIn: 0,
            sourceOut: 4000,
        })
        const clip2 = createTestClip({
            id: 'clip-2',
            startTime: 4000,
            duration: 2000,
            sourceIn: 0,
            sourceOut: 2000,
        })
        const project = createTestProject([clip1, clip2])

        // Shrink clip-1 by moving end left
        const result = executeTrimClipEnd(project, 'clip-1', 2000)

        expect(result).toBe(true)
        // Clip 1 shrinks
        expect(project.timeline.tracks[0].clips[0].duration).toBe(2000)
        // Clip 2 reflows to close the gap
        expect(project.timeline.tracks[0].clips[1].startTime).toBe(2000)
    })

    it('pushes subsequent clips when expanding (moving end right)', () => {
        const { executeTrimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip1 = createTestClip({
            id: 'clip-1',
            startTime: 0,
            duration: 2000,
            sourceIn: 0,
            sourceOut: 2000,
        })
        const clip2 = createTestClip({
            id: 'clip-2',
            startTime: 2000,
            duration: 2000,
            sourceIn: 0,
            sourceOut: 2000,
        })
        const project = createTestProject([clip1, clip2])

        // Expand clip-1 by moving end right (from 2000 to 3000)
        const result = executeTrimClipEnd(project, 'clip-1', 3000)

        expect(result).toBe(true)
        // Clip 1 expands
        expect(project.timeline.tracks[0].clips[0].duration).toBe(3000)
        // Clip 2 pushed to make room
        expect(project.timeline.tracks[0].clips[1].startTime).toBe(3000)
    })

    it('returns false for non-existent clip', () => {
        const { executeTrimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const project = createTestProject([])

        const result = executeTrimClipEnd(project, 'non-existent', 1000)

        expect(result).toBe(false)
    })

    it('updates timeline duration after trim', () => {
        const { executeTrimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            id: 'clip-1',
            startTime: 0,
            duration: 4000,
            sourceIn: 0,
            sourceOut: 4000,
        })
        const project = createTestProject([clip])
        expect(project.timeline.duration).toBe(4000)

        executeTrimClipEnd(project, 'clip-1', 2000)

        expect(project.timeline.duration).toBe(2000)
    })
})

describe('Trim edge cases', () => {
    it('trim start then trim end maintains consistency', () => {
        const { executeTrimClipStart, executeTrimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        const clip = createTestClip({
            id: 'clip-1',
            startTime: 0,
            duration: 6000,
            sourceIn: 0,
            sourceOut: 6000,
        })
        const project = createTestProject([clip])

        // First trim start - shrinking from start triggers reflow which resets startTime to 0
        executeTrimClipStart(project, 'clip-1', 1000)

        const afterStartTrim = project.timeline.tracks[0].clips[0]
        // After shrinking, reflow resets startTime to 0 (first clip always at 0)
        expect(afterStartTrim.startTime).toBe(0)
        expect(afterStartTrim.duration).toBe(5000)
        expect(afterStartTrim.sourceIn).toBe(1000)
        expect(afterStartTrim.sourceOut).toBe(6000)

        // Then trim end - clip now ends at 5000 (startTime 0 + duration 5000)
        // Trimming end to 4000 means new duration = 4000
        executeTrimClipEnd(project, 'clip-1', 4000)

        const afterEndTrim = project.timeline.tracks[0].clips[0]
        expect(afterEndTrim.duration).toBe(4000)
        expect(afterEndTrim.sourceIn).toBe(1000)
        // sourceOut change: oldDuration=5000, newDuration=4000, change=-1000
        // newSourceOut = 6000 + (-1000 * 1) = 5000
        expect(afterEndTrim.sourceOut).toBe(5000)
    })

    it('playback rate 2x trim correctly calculates source bounds', () => {
        const { executeTrimClipEnd } = require('../../src/lib/timeline/timeline-operations')

        // 2x speed: 4s source plays in 2s timeline
        const clip = createTestClip({
            id: 'clip-1',
            startTime: 0,
            duration: 2000,  // 2s timeline
            sourceIn: 0,
            sourceOut: 4000, // 4s source
            playbackRate: 2,
        })
        const project = createTestProject([clip])

        // Trim to 1s timeline (should be 2s source at 2x)
        executeTrimClipEnd(project, 'clip-1', 1000)

        const trimmed = project.timeline.tracks[0].clips[0]
        expect(trimmed.duration).toBe(1000)
        expect(trimmed.sourceOut).toBe(2000)  // 4000 - (1000 * 2)
    })
})
