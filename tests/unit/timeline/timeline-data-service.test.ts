/**
 * Tests for TimelineDataService
 *
 * Critical coverage for refactoring safety:
 * - Skip range computation
 * - Source-to-timeline projection
 * - Range merging and normalization
 * - Binary search utilities
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import type { Project, Clip, Recording, SourceTimeRange } from '@/types/project'
import { TrackType } from '@/types/project'
import { TimelineDataService, type GlobalSkipRange } from '@/features/ui/timeline/timeline-data-service'

// Helper to create a minimal valid project
function createTestProject(clips: Clip[] = [], recordings: Recording[] = []): Project {
    return {
        version: '1',
        schemaVersion: 1,
        id: 'test-project',
        name: 'Test Project',
        createdAt: new Date().toISOString(),
        recordings,
        effects: [],
        settings: {
            frameRate: 30,
            resolution: { width: 1920, height: 1080 }
        } as any,
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
            transcriptEdits: {}
        },
        modifiedAt: new Date().toISOString(),
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

// Helper to create a test recording (VideoRecording variant)
function createTestRecording(overrides: Partial<Recording> = {}): Recording {
    const base = {
        id: 'rec-1',
        sourceType: 'video' as const,
        filePath: '/test/recording.mp4',
        duration: 10000,
        width: 1920,
        height: 1080,
        frameRate: 30,
        effects: [],
        ...overrides,
    }
    return base as unknown as Recording
}

describe('TimelineDataService', () => {
    beforeEach(() => {
        // Clear caches between tests
        const project = createTestProject()
        TimelineDataService.invalidateCache(project)
    })

    describe('Basic clip queries', () => {
        it('getVideoClips returns clips from video track', () => {
            const clip1 = createTestClip({ id: 'clip-1' })
            const clip2 = createTestClip({ id: 'clip-2', startTime: 4000 })
            const project = createTestProject([clip1, clip2])

            const clips = TimelineDataService.getVideoClips(project)

            expect(clips).toHaveLength(2)
            expect(clips[0].id).toBe('clip-1')
        })

        it('getSortedVideoClips returns clips sorted by startTime', () => {
            const clip1 = createTestClip({ id: 'clip-1', startTime: 2000 })
            const clip2 = createTestClip({ id: 'clip-2', startTime: 0 })
            const clip3 = createTestClip({ id: 'clip-3', startTime: 4000 })
            const project = createTestProject([clip1, clip2, clip3])

            const sorted = TimelineDataService.getSortedVideoClips(project)

            expect(sorted[0].id).toBe('clip-2') // startTime: 0
            expect(sorted[1].id).toBe('clip-1') // startTime: 2000
            expect(sorted[2].id).toBe('clip-3') // startTime: 4000
        })

        it('getRecordingsMap returns Map for O(1) lookup', () => {
            const rec1 = createTestRecording({ id: 'rec-1' })
            const rec2 = createTestRecording({ id: 'rec-2' })
            const project = createTestProject([], [rec1, rec2])

            const map = TimelineDataService.getRecordingsMap(project)

            expect(map.get('rec-1')).toBe(rec1)
            expect(map.get('rec-2')).toBe(rec2)
            expect(map.get('non-existent')).toBeUndefined()
        })
    })

    describe('getRecordingTimelineRange', () => {
        it('returns null for recording with no clips', () => {
            const project = createTestProject([])

            const range = TimelineDataService.getRecordingTimelineRange(project, 'rec-1')

            expect(range).toBeNull()
        })

        it('returns correct range for single clip', () => {
            const clip = createTestClip({ recordingId: 'rec-1', startTime: 1000, duration: 3000 })
            const project = createTestProject([clip])

            const range = TimelineDataService.getRecordingTimelineRange(project, 'rec-1')

            expect(range).toEqual({ start: 1000, end: 4000 })
        })

        it('returns correct range for multiple clips from same recording', () => {
            const clip1 = createTestClip({ recordingId: 'rec-1', startTime: 0, duration: 2000 })
            const clip2 = createTestClip({ recordingId: 'rec-1', startTime: 5000, duration: 3000 })
            const project = createTestProject([clip1, clip2])

            const range = TimelineDataService.getRecordingTimelineRange(project, 'rec-1')

            expect(range).toEqual({ start: 0, end: 8000 })
        })
    })

    describe('Source to Timeline Projection', () => {
        it('projectSourceRangeToTimeline returns null for non-overlapping range', () => {
            const clip = createTestClip({
                startTime: 0,
                duration: 4000,
                sourceIn: 0,
                sourceOut: 4000
            })
            const sourceRange: SourceTimeRange = { startTime: 5000, endTime: 6000 }

            const result = TimelineDataService.projectSourceRangeToTimeline(sourceRange, clip)

            expect(result).toBeNull()
        })

        it('projectSourceRangeToTimeline projects correctly at 1x playback', () => {
            const clip = createTestClip({
                startTime: 1000, // Timeline position
                duration: 4000,
                sourceIn: 0,
                sourceOut: 4000,
                playbackRate: 1
            })
            // Source range from 1000-2000ms in recording
            const sourceRange: SourceTimeRange = { startTime: 1000, endTime: 2000 }

            const result = TimelineDataService.projectSourceRangeToTimeline(sourceRange, clip)

            expect(result).not.toBeNull()
            // At 1x, source 1000-2000 with clip starting at timeline 1000 -> timeline 2000-3000
            expect(result!.start).toBe(2000)
            expect(result!.end).toBe(3000)
        })

        it('projectSourceRangeToTimeline handles 2x playback rate', () => {
            const clip = createTestClip({
                startTime: 0,
                duration: 2000, // 2s timeline
                sourceIn: 0,
                sourceOut: 4000, // 4s source at 2x = 2s timeline
                playbackRate: 2
            })
            // Source range 1000-2000ms (should map to timeline 500-1000ms at 2x)
            const sourceRange: SourceTimeRange = { startTime: 1000, endTime: 2000 }

            const result = TimelineDataService.projectSourceRangeToTimeline(sourceRange, clip)

            expect(result).not.toBeNull()
            expect(result!.start).toBe(500)  // 1000 / 2
            expect(result!.end).toBe(1000)   // 2000 / 2
        })

        it('projectSourceRangeToTimeline clamps to clip bounds', () => {
            const clip = createTestClip({
                startTime: 1000,
                duration: 2000, // Clip ends at timeline 3000
                sourceIn: 1000,
                sourceOut: 3000,
                playbackRate: 1
            })
            // Source range that extends beyond clip's source window
            const sourceRange: SourceTimeRange = { startTime: 0, endTime: 5000 }

            const result = TimelineDataService.projectSourceRangeToTimeline(sourceRange, clip)

            expect(result).not.toBeNull()
            // Should be clamped to clip bounds (timeline 1000-3000)
            expect(result!.start).toBe(1000)
            expect(result!.end).toBe(3000)
        })

        it('projectSourceRangeToTimeline with sourceIn offset', () => {
            const clip = createTestClip({
                startTime: 0,
                duration: 3000,
                sourceIn: 2000, // Clip starts from source position 2000
                sourceOut: 5000,
                playbackRate: 1
            })
            // Source range 3000-4000 (within clip's source window)
            const sourceRange: SourceTimeRange = { startTime: 3000, endTime: 4000 }

            const result = TimelineDataService.projectSourceRangeToTimeline(sourceRange, clip)

            expect(result).not.toBeNull()
            // Source 3000 = clip.sourceIn + 1000 = timeline position 1000
            expect(result!.start).toBe(1000)
            expect(result!.end).toBe(2000)
        })
    })

    describe('Skip Range Utilities', () => {
        it('findSkipRangeAtTime returns null for empty ranges', () => {
            const result = TimelineDataService.findSkipRangeAtTime(1000, [])
            expect(result).toBeNull()
        })

        it('findSkipRangeAtTime finds range containing time', () => {
            const ranges: GlobalSkipRange[] = [
                { start: 0, end: 1000, clipId: 'c1', recordingId: 'r1' },
                { start: 2000, end: 3000, clipId: 'c1', recordingId: 'r1' },
                { start: 5000, end: 6000, clipId: 'c1', recordingId: 'r1' },
            ]

            expect(TimelineDataService.findSkipRangeAtTime(500, ranges)).toEqual(ranges[0])
            expect(TimelineDataService.findSkipRangeAtTime(2500, ranges)).toEqual(ranges[1])
            expect(TimelineDataService.findSkipRangeAtTime(5500, ranges)).toEqual(ranges[2])
        })

        it('findSkipRangeAtTime returns null for time between ranges', () => {
            const ranges: GlobalSkipRange[] = [
                { start: 0, end: 1000, clipId: 'c1', recordingId: 'r1' },
                { start: 2000, end: 3000, clipId: 'c1', recordingId: 'r1' },
            ]

            expect(TimelineDataService.findSkipRangeAtTime(1500, ranges)).toBeNull()
            expect(TimelineDataService.findSkipRangeAtTime(4000, ranges)).toBeNull()
        })

        it('findSkipRangeAtTime uses exclusive end (time < end)', () => {
            const ranges: GlobalSkipRange[] = [
                { start: 0, end: 1000, clipId: 'c1', recordingId: 'r1' },
            ]

            expect(TimelineDataService.findSkipRangeAtTime(999, ranges)).not.toBeNull()
            expect(TimelineDataService.findSkipRangeAtTime(1000, ranges)).toBeNull() // Exclusive end
        })

        it('isTimeInSkipRange returns boolean', () => {
            const ranges: GlobalSkipRange[] = [
                { start: 0, end: 1000, clipId: 'c1', recordingId: 'r1' },
            ]

            expect(TimelineDataService.isTimeInSkipRange(500, ranges)).toBe(true)
            expect(TimelineDataService.isTimeInSkipRange(1500, ranges)).toBe(false)
        })

        it('findNextSkipRange returns null for empty ranges', () => {
            const result = TimelineDataService.findNextSkipRange(1000, [])
            expect(result).toBeNull()
        })

        it('findNextSkipRange finds first range after time', () => {
            const ranges: GlobalSkipRange[] = [
                { start: 0, end: 1000, clipId: 'c1', recordingId: 'r1' },
                { start: 2000, end: 3000, clipId: 'c1', recordingId: 'r1' },
                { start: 5000, end: 6000, clipId: 'c1', recordingId: 'r1' },
            ]

            expect(TimelineDataService.findNextSkipRange(500, ranges)).toEqual(ranges[1])
            expect(TimelineDataService.findNextSkipRange(1500, ranges)).toEqual(ranges[1])
            expect(TimelineDataService.findNextSkipRange(3500, ranges)).toEqual(ranges[2])
            expect(TimelineDataService.findNextSkipRange(6000, ranges)).toBeNull()
        })
    })

    describe('Global Skip Ranges Computation', () => {
        it('getGlobalTimelineSkips returns empty for no transcriptEdits', () => {
            const clip = createTestClip({ recordingId: 'rec-1' })
            const project = createTestProject([clip])
            // No transcriptEdits set

            const skips = TimelineDataService.getGlobalTimelineSkips(project)

            expect(skips).toEqual([])
        })

        it('getGlobalTimelineSkips returns empty for no hidden regions', () => {
            const clip = createTestClip({ recordingId: 'rec-1' })
            const project = createTestProject([clip])
            project.timeline.transcriptEdits = {
                'rec-1': { hiddenRegions: [] }
            }

            const skips = TimelineDataService.getGlobalTimelineSkips(project)

            expect(skips).toEqual([])
        })

        it('getGlobalTimelineSkips projects hidden regions to timeline', () => {
            const clip = createTestClip({
                id: 'clip-1',
                recordingId: 'rec-1',
                startTime: 0,
                duration: 10000,
                sourceIn: 0,
                sourceOut: 10000,
                playbackRate: 1
            })
            const project = createTestProject([clip])
            // Hidden region from 2000-4000 in source
            project.timeline.transcriptEdits = {
                'rec-1': {
                    hiddenRegions: [{ startTime: 2000, endTime: 4000 }]
                }
            }

            const skips = TimelineDataService.getGlobalTimelineSkips(project)

            expect(skips).toHaveLength(1)
            expect(skips[0].start).toBe(2000)
            expect(skips[0].end).toBe(4000)
            expect(skips[0].clipId).toBe('clip-1')
        })

        it('getGlobalTimelineSkips merges overlapping ranges', () => {
            const clip1 = createTestClip({
                id: 'clip-1',
                recordingId: 'rec-1',
                startTime: 0,
                duration: 5000,
                sourceIn: 0,
                sourceOut: 5000
            })
            const clip2 = createTestClip({
                id: 'clip-2',
                recordingId: 'rec-1',
                startTime: 5000,
                duration: 5000,
                sourceIn: 5000,
                sourceOut: 10000
            })
            const project = createTestProject([clip1, clip2])
            // Hidden region that spans both clips
            project.timeline.transcriptEdits = {
                'rec-1': {
                    hiddenRegions: [
                        { startTime: 3000, endTime: 5000 },
                        { startTime: 5000, endTime: 7000 }
                    ]
                }
            }

            const skips = TimelineDataService.getGlobalTimelineSkips(project)

            // Should be merged into one continuous skip
            expect(skips).toHaveLength(1)
            expect(skips[0].start).toBe(3000)
            expect(skips[0].end).toBe(7000)
        })
    })

    describe('Hidden Regions', () => {
        it('getHiddenRegionsFromEditState returns empty for null editState', () => {
            const result = TimelineDataService.getHiddenRegionsFromEditState(null)
            expect(result).toEqual([])
        })

        it('getHiddenRegionsFromEditState returns hiddenRegions directly', () => {
            const editState = {
                hiddenRegions: [
                    { startTime: 1000, endTime: 2000 },
                    { startTime: 3000, endTime: 4000 }
                ]
            }

            const result = TimelineDataService.getHiddenRegionsFromEditState(editState)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({ startTime: 1000, endTime: 2000 })
        })

        it('getHiddenRegionsFromEditState merges overlapping regions', () => {
            const editState = {
                hiddenRegions: [
                    { startTime: 1000, endTime: 3000 },
                    { startTime: 2000, endTime: 4000 } // Overlaps with first
                ]
            }

            const result = TimelineDataService.getHiddenRegionsFromEditState(editState)

            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({ startTime: 1000, endTime: 4000 })
        })

        it('getHiddenRegionsFromEditState handles legacy keptRegions', () => {
            const recording = createTestRecording({ duration: 10000 })
            const editState = {
                keptRegions: [
                    { startTime: 2000, endTime: 4000 },
                    { startTime: 6000, endTime: 8000 }
                ]
            }

            const result = TimelineDataService.getHiddenRegionsFromEditState(editState, recording)

            // Hidden = full duration - kept
            // [0-2000], [4000-6000], [8000-10000]
            expect(result).toHaveLength(3)
            expect(result[0]).toEqual({ startTime: 0, endTime: 2000 })
            expect(result[1]).toEqual({ startTime: 4000, endTime: 6000 })
            expect(result[2]).toEqual({ startTime: 8000, endTime: 10000 })
        })
    })

    describe('Cache invalidation', () => {
        it('invalidateCache clears sorted clips cache', () => {
            const clip1 = createTestClip({ id: 'clip-1', startTime: 1000 })
            const clip2 = createTestClip({ id: 'clip-2', startTime: 0 })
            const project = createTestProject([clip1, clip2])

            // First call - populates cache
            const sorted1 = TimelineDataService.getSortedVideoClips(project)
            expect(sorted1[0].id).toBe('clip-2')

            // Mutate project (simulating Immer)
            project.timeline.tracks[0].clips[0].startTime = 5000

            // Without invalidation, would return cached
            TimelineDataService.invalidateCache(project)

            // After invalidation, should recompute
            const sorted2 = TimelineDataService.getSortedVideoClips(project)
            expect(sorted2[0].id).toBe('clip-2') // clip-2 still at 0
            expect(sorted2[1].id).toBe('clip-1') // clip-1 now at 5000
        })
    })

    describe('Utility methods', () => {
        it('getDuration returns timeline duration', () => {
            const clip = createTestClip({ startTime: 0, duration: 5000 })
            const project = createTestProject([clip])
            project.timeline.duration = 5000

            expect(TimelineDataService.getDuration(project)).toBe(5000)
        })

        it('getFps returns frame rate from settings', () => {
            const project = createTestProject()
            project.settings.frameRate = 60

            expect(TimelineDataService.getFps(project)).toBe(60)
        })

        it('hasVideoContent returns true when clips exist', () => {
            const project = createTestProject([createTestClip()])
            expect(TimelineDataService.hasVideoContent(project)).toBe(true)
        })

        it('hasVideoContent returns false when no clips', () => {
            const project = createTestProject([])
            expect(TimelineDataService.hasVideoContent(project)).toBe(false)
        })

        it('getSourceDimensions returns recording dimensions', () => {
            const recording = createTestRecording({ width: 2560, height: 1440 })
            const project = createTestProject([], [recording])

            const dims = TimelineDataService.getSourceDimensions(project)

            expect(dims).toEqual({ width: 2560, height: 1440 })
        })

        it('getSourceDimensions returns max dimensions across multiple recordings', () => {
            const rec1 = createTestRecording({ id: 'rec-1', width: 1920, height: 1080 })
            const rec2 = createTestRecording({ id: 'rec-2', width: 3840, height: 2160 }) // 4K
            const rec3 = createTestRecording({ id: 'rec-3', width: 1080, height: 1920 }) // Portrait
            const project = createTestProject([], [rec1, rec2, rec3])

            const dims = TimelineDataService.getSourceDimensions(project)

            // Should return max width and max height across all recordings
            expect(dims).toEqual({ width: 3840, height: 2160 })
        })

        it('getSourceDimensions returns square canvas for mixed landscape/portrait recordings', () => {
            // This simulates the user's scenario: 16:9 screen recording + 9:16 portrait video
            const screenRecording = createTestRecording({ id: 'rec-screen', width: 1920, height: 1080 }) // 16:9
            const portraitVideo = createTestRecording({ id: 'rec-portrait', width: 1080, height: 1920 }) // 9:16
            const project = createTestProject([], [screenRecording, portraitVideo])

            const dims = TimelineDataService.getSourceDimensions(project)

            // Max dimensions should create a canvas that fits both:
            // - maxWidth: max(1920, 1080) = 1920
            // - maxHeight: max(1080, 1920) = 1920
            // Result: 1920x1920 square canvas
            // The 16:9 video gets letterboxed (black bars top/bottom)
            // The 9:16 video gets pillarboxed (black bars left/right)
            expect(dims).toEqual({ width: 1920, height: 1920 })
        })

        it('getSourceDimensions should NOT use first recording only (regression test)', () => {
            // This test verifies the fix: we should NOT return first recording dimensions
            // when there are recordings with larger dimensions
            const smallRecording = createTestRecording({ id: 'rec-small', width: 1280, height: 720 }) // First recording: 720p
            const largeRecording = createTestRecording({ id: 'rec-large', width: 1920, height: 1080 }) // Second: 1080p
            const project = createTestProject([], [smallRecording, largeRecording])

            const dims = TimelineDataService.getSourceDimensions(project)

            // Should NOT return first recording's dimensions (1280x720)
            // Should return max dimensions (1920x1080)
            expect(dims).not.toEqual({ width: 1280, height: 720 })
            expect(dims).toEqual({ width: 1920, height: 1080 })
        })

        it('getSourceDimensions handles recordings with mixed valid/invalid dimensions', () => {
            const rec1 = createTestRecording({ id: 'rec-1', width: 1920, height: 1080 })
            const rec2 = createTestRecording({ id: 'rec-2', width: 0, height: 0 }) // Invalid
            const rec3 = createTestRecording({ id: 'rec-3', width: 2560, height: 1440 })
            const project = createTestProject([], [rec1, rec2, rec3])

            const dims = TimelineDataService.getSourceDimensions(project)

            // Should ignore 0 dimensions and return max of valid dimensions
            expect(dims).toEqual({ width: 2560, height: 1440 })
        })

        it('getSourceDimensions falls back to 1920x1080', () => {
            const project = createTestProject()

            const dims = TimelineDataService.getSourceDimensions(project)

            expect(dims).toEqual({ width: 1920, height: 1080 })
        })
    })
})
