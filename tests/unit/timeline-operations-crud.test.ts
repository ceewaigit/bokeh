/**
 * Tests for timeline-operations CRUD functions
 * 
 * Coverage:
 * - addClipToTrack
 * - removeClipFromTrack
 * - duplicateClipInTrack
 * - restoreClipToTrack
 * - restoreClipsToTrack
 * - updateClipInTrack
 * - findClipById
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import type { Project, Clip, Track } from '@/types/project'
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
                {
                    id: 'track-audio',
                    name: 'Audio',
                    type: TrackType.Audio,
                    clips: [],
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
        duration: 2000,
        sourceIn: 0,
        sourceOut: 2000,
        playbackRate: 1,
        ...overrides,
    }
}

describe('Timeline Operations CRUD', () => {
    describe('findClipById', () => {
        it('finds a clip in the video track', () => {
            const { findClipById } = require('../../src/features/timeline/timeline-operations')

            const clip = createTestClip({ id: 'test-clip-1' })
            const project = createTestProject([clip])

            const result = findClipById(project, 'test-clip-1')

            expect(result).not.toBeNull()
            expect(result!.clip.id).toBe('test-clip-1')
            expect(result!.track.id).toBe('track-video')
        })

        it('returns null for non-existent clip', () => {
            const { findClipById } = require('../../src/features/timeline/timeline-operations')

            const project = createTestProject([])

            const result = findClipById(project, 'non-existent')

            expect(result).toBeNull()
        })
    })

    describe('addClipToTrack', () => {
        it('adds a clip object to an empty track', () => {
            const { addClipToTrack } = require('../../src/features/timeline/timeline-operations')

            const project = createTestProject([])
            const clip = createTestClip({ id: 'new-clip', startTime: 0, duration: 3000, sourceIn: 0, sourceOut: 3000 })

            const result = addClipToTrack(project, clip)

            expect(result).not.toBeNull()
            expect(project.timeline.tracks[0].clips).toHaveLength(1)
            expect(project.timeline.tracks[0].clips[0].id).toBe('new-clip')
            expect(project.timeline.duration).toBe(3000)
        })

        it('appends clip to end of existing clips', () => {
            const { addClipToTrack } = require('../../src/features/timeline/timeline-operations')

            const existingClip = createTestClip({
                id: 'existing',
                startTime: 0,
                duration: 2000,
                sourceIn: 0,
                sourceOut: 2000
            })
            const project = createTestProject([existingClip])

            const newClip = createTestClip({ id: 'new-clip', duration: 3000 })
            const result = addClipToTrack(project, newClip)

            expect(result).not.toBeNull()
            expect(project.timeline.tracks[0].clips).toHaveLength(2)
            // After reflow, the new clip should start where existing ends
            expect(project.timeline.tracks[0].clips[1].startTime).toBe(2000)
        })

        it('inserts clip at specified startTime', () => {
            const { addClipToTrack } = require('../../src/features/timeline/timeline-operations')

            const clip1 = createTestClip({ id: 'clip-1', startTime: 0, duration: 2000 })
            const clip2 = createTestClip({ id: 'clip-2', startTime: 2000, duration: 2000 })
            const project = createTestProject([clip1, clip2])

            const newClip = createTestClip({ id: 'inserted', duration: 1000 })
            const result = addClipToTrack(project, newClip, 2000)

            expect(result).not.toBeNull()
            expect(project.timeline.tracks[0].clips).toHaveLength(3)
        })
    })

    describe('removeClipFromTrack', () => {
        it('removes a clip and reflows remaining clips', () => {
            const { removeClipFromTrack } = require('../../src/features/timeline/timeline-operations')

            const clip1 = createTestClip({ id: 'clip-1', startTime: 0, duration: 2000 })
            const clip2 = createTestClip({ id: 'clip-2', startTime: 2000, duration: 2000 })
            const clip3 = createTestClip({ id: 'clip-3', startTime: 4000, duration: 2000 })
            const project = createTestProject([clip1, clip2, clip3])

            const result = removeClipFromTrack(project, 'clip-2')

            expect(result).toBe(true)
            expect(project.timeline.tracks[0].clips).toHaveLength(2)
            expect(project.timeline.tracks[0].clips[0].id).toBe('clip-1')
            expect(project.timeline.tracks[0].clips[1].id).toBe('clip-3')
            // Clip 3 should have reflowed to start at 2000 (where clip 1 ends)
            expect(project.timeline.tracks[0].clips[1].startTime).toBe(2000)
        })

        it('returns false for non-existent clip', () => {
            const { removeClipFromTrack } = require('../../src/features/timeline/timeline-operations')

            const project = createTestProject([])

            const result = removeClipFromTrack(project, 'non-existent')

            expect(result).toBe(false)
        })

        it('removes clip using knownTrack optimization', () => {
            const { removeClipFromTrack } = require('../../src/features/timeline/timeline-operations')

            const clip = createTestClip({ id: 'clip-1' })
            const project = createTestProject([clip])
            const track = project.timeline.tracks[0]

            const result = removeClipFromTrack(project, 'clip-1', track)

            expect(result).toBe(true)
            expect(track.clips).toHaveLength(0)
        })
    })

    describe('duplicateClipInTrack', () => {
        it('duplicates a clip and inserts after original', () => {
            const { duplicateClipInTrack } = require('../../src/features/timeline/timeline-operations')

            const originalClip = createTestClip({
                id: 'original',
                startTime: 0,
                duration: 2000,
                sourceIn: 0,
                sourceOut: 2000,
                playbackRate: 1
            })
            const project = createTestProject([originalClip])

            const result = duplicateClipInTrack(project, 'original')

            expect(result).not.toBeNull()
            expect(project.timeline.tracks[0].clips).toHaveLength(2)
            expect(result!.id).toContain('original-copy')
            expect(result!.recordingId).toBe(originalClip.recordingId)
            expect(result!.duration).toBe(originalClip.duration)
            // Duplicate should start where original ends
            expect(result!.startTime).toBe(2000)
        })

        it('returns null for non-existent clip', () => {
            const { duplicateClipInTrack } = require('../../src/features/timeline/timeline-operations')

            const project = createTestProject([])

            const result = duplicateClipInTrack(project, 'non-existent')

            expect(result).toBeNull()
        })

        it('duplicates clip in middle of timeline correctly', () => {
            const { duplicateClipInTrack } = require('../../src/features/timeline/timeline-operations')

            const clip1 = createTestClip({ id: 'clip-1', startTime: 0, duration: 2000 })
            const clip2 = createTestClip({ id: 'clip-2', startTime: 2000, duration: 2000 })
            const clip3 = createTestClip({ id: 'clip-3', startTime: 4000, duration: 2000 })
            const project = createTestProject([clip1, clip2, clip3])

            const result = duplicateClipInTrack(project, 'clip-2')

            expect(result).not.toBeNull()
            expect(project.timeline.tracks[0].clips).toHaveLength(4)
            // Order should be: clip-1, clip-2, duplicate, clip-3
            expect(project.timeline.tracks[0].clips[0].id).toBe('clip-1')
            expect(project.timeline.tracks[0].clips[1].id).toBe('clip-2')
            expect(project.timeline.tracks[0].clips[2].id).toContain('clip-2-copy')
            expect(project.timeline.tracks[0].clips[3].id).toBe('clip-3')
        })
    })

    describe('restoreClipToTrack', () => {
        it('restores a deleted clip at specific index', () => {
            const { restoreClipToTrack } = require('../../src/features/timeline/timeline-operations')

            const clip1 = createTestClip({ id: 'clip-1', startTime: 0, duration: 2000 })
            const clip2 = createTestClip({ id: 'clip-2', startTime: 2000, duration: 2000 })
            const project = createTestProject([clip1, clip2])

            const restoredClip = createTestClip({
                id: 'restored-clip',
                startTime: 1000,
                duration: 1000
            })

            const result = restoreClipToTrack(project, 'track-video', restoredClip, 1)

            expect(result).toBe(true)
            expect(project.timeline.tracks[0].clips).toHaveLength(3)
            expect(project.timeline.tracks[0].clips[1].id).toBe('restored-clip')
        })

        it('prevents duplicate restoration (idempotency)', () => {
            const { restoreClipToTrack } = require('../../src/features/timeline/timeline-operations')

            const clip = createTestClip({ id: 'existing-clip' })
            const project = createTestProject([clip])

            // Try to restore a clip that already exists
            const result = restoreClipToTrack(project, 'track-video', clip, 0)

            // Should return true (idempotent) but not add duplicate
            expect(result).toBe(true)
            expect(project.timeline.tracks[0].clips).toHaveLength(1)
        })

        it('returns false for non-existent track', () => {
            const { restoreClipToTrack } = require('../../src/features/timeline/timeline-operations')

            const project = createTestProject([])
            const clip = createTestClip({ id: 'new-clip' })

            const result = restoreClipToTrack(project, 'non-existent-track', clip, 0)

            expect(result).toBe(false)
        })
    })

    describe('restoreClipsToTrack', () => {
        it('atomically removes and restores clips for undo', () => {
            const { restoreClipsToTrack } = require('../../src/features/timeline/timeline-operations')

            // Setup: 3 clips that were split from 1 original
            const splitClip1 = createTestClip({ id: 'split-1', startTime: 0, duration: 1000 })
            const splitClip2 = createTestClip({ id: 'split-2', startTime: 1000, duration: 1000 })
            const splitClip3 = createTestClip({ id: 'split-3', startTime: 2000, duration: 1000 })
            const project = createTestProject([splitClip1, splitClip2, splitClip3])

            const originalClip = createTestClip({ id: 'original', startTime: 0, duration: 3000, sourceIn: 0, sourceOut: 3000 })

            const result = restoreClipsToTrack(
                project,
                'track-video',
                ['split-1', 'split-2', 'split-3'],
                [originalClip]
            )

            expect(result).toBe(true)
            expect(project.timeline.tracks[0].clips).toHaveLength(1)
            expect(project.timeline.tracks[0].clips[0].id).toBe('original')
            expect(project.timeline.tracks[0].clips[0].duration).toBe(3000)
        })

        it('returns false for non-existent track', () => {
            const { restoreClipsToTrack } = require('../../src/features/timeline/timeline-operations')

            const project = createTestProject([])

            const result = restoreClipsToTrack(
                project,
                'non-existent',
                [],
                []
            )

            expect(result).toBe(false)
        })
    })

    describe('updateClipInTrack', () => {
        it('updates clip properties and reflows', () => {
            const { updateClipInTrack } = require('../../src/features/timeline/timeline-operations')

            const clip1 = createTestClip({ id: 'clip-1', startTime: 0, duration: 2000 })
            const clip2 = createTestClip({ id: 'clip-2', startTime: 2000, duration: 2000 })
            const project = createTestProject([clip1, clip2])

            const result = updateClipInTrack(project, 'clip-1', { duration: 3000, sourceOut: 3000 })

            expect(result).toBe(true)
            expect(project.timeline.tracks[0].clips[0].duration).toBe(3000)
            // Clip 2 should have reflowed to start at 3000
            expect(project.timeline.tracks[0].clips[1].startTime).toBe(3000)
        })

        it('skips reflow when maintainContiguous is false', () => {
            const { updateClipInTrack } = require('../../src/features/timeline/timeline-operations')

            const clip1 = createTestClip({ id: 'clip-1', startTime: 0, duration: 2000 })
            const clip2 = createTestClip({ id: 'clip-2', startTime: 2000, duration: 2000 })
            const project = createTestProject([clip1, clip2])

            const result = updateClipInTrack(
                project,
                'clip-1',
                { duration: 1000, sourceOut: 1000 },
                { maintainContiguous: false }
            )

            expect(result).toBe(true)
            expect(project.timeline.tracks[0].clips[0].duration).toBe(1000)
            // Clip 2 should NOT have reflowed (gap is allowed)
            expect(project.timeline.tracks[0].clips[1].startTime).toBe(2000)
        })

        it('returns false for non-existent clip', () => {
            const { updateClipInTrack } = require('../../src/features/timeline/timeline-operations')

            const project = createTestProject([])

            const result = updateClipInTrack(project, 'non-existent', { duration: 1000 })

            expect(result).toBe(false)
        })
    })
})

describe('reflowClips', () => {
    it('maintains contiguous layout starting from index 0', () => {
        const { reflowClips } = require('../../src/features/timeline/timeline-operations')

        const track: Track = {
            id: 'track-1',
            name: 'Video',
            type: TrackType.Video,
            clips: [
                createTestClip({ id: 'clip-1', startTime: 500, duration: 2000 }),
                createTestClip({ id: 'clip-2', startTime: 5000, duration: 2000 }),
                createTestClip({ id: 'clip-3', startTime: 10000, duration: 2000 }),
            ],
            muted: false,
            locked: false,
        }

        reflowClips(track, 0)

        expect(track.clips[0].startTime).toBe(0)
        expect(track.clips[1].startTime).toBe(2000)
        expect(track.clips[2].startTime).toBe(4000)
    })

    it('only reflows from specified startFromIndex', () => {
        const { reflowClips } = require('../../src/features/timeline/timeline-operations')

        const track: Track = {
            id: 'track-1',
            name: 'Video',
            type: TrackType.Video,
            clips: [
                createTestClip({ id: 'clip-1', startTime: 0, duration: 2000 }),
                createTestClip({ id: 'clip-2', startTime: 10000, duration: 2000 }), // Gap before this
                createTestClip({ id: 'clip-3', startTime: 20000, duration: 2000 }),
            ],
            muted: false,
            locked: false,
        }

        reflowClips(track, 1)

        // Clip 0 is unchanged (before startFromIndex)
        expect(track.clips[0].startTime).toBe(0)
        // Clip 1 and 2 are reflowed to be contiguous starting after clip 0
        expect(track.clips[1].startTime).toBe(2000)
        expect(track.clips[2].startTime).toBe(4000)
    })
})

describe('sortClipsByTime', () => {
    it('sorts clips by startTime', () => {
        const { sortClipsByTime } = require('../../src/features/timeline/timeline-operations')

        const track: Track = {
            id: 'track-1',
            name: 'Video',
            type: TrackType.Video,
            clips: [
                createTestClip({ id: 'clip-3', startTime: 4000 }),
                createTestClip({ id: 'clip-1', startTime: 0 }),
                createTestClip({ id: 'clip-2', startTime: 2000 }),
            ],
            muted: false,
            locked: false,
        }

        sortClipsByTime(track)

        expect(track.clips[0].id).toBe('clip-1')
        expect(track.clips[1].id).toBe('clip-2')
        expect(track.clips[2].id).toBe('clip-3')
    })
})
