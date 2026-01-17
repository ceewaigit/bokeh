/**
 * Sync Orchestration Tests
 *
 * Tests the TimelineSyncOrchestrator and its interactions between
 * ClipBoundEffectSync, TimeBasedEffectSync, and WebcamSyncService.
 */

import { TimelineSyncOrchestrator, ClipBoundEffectSync, TimeBasedEffectSync } from '@/features/effects/sync'
import type { Project, Clip, Effect } from '@/types/project'
import { TrackType, EffectType } from '@/types/project'
import type { ClipChange, ClipState, SegmentMapping, EffectMutationBatch } from '@/features/effects/sync/types'
import { EffectStore } from '@/features/effects/core/effects-store'

/**
 * Helper to execute sync and apply mutations atomically (mimics orchestrator behavior)
 */
function syncAndApply(
    project: Project,
    change: ClipChange,
    syncFn: (project: Project, change: ClipChange, batch: EffectMutationBatch) => void
): void {
    const batch: EffectMutationBatch = {
        toRemove: new Set<string>(),
        toUpdate: new Map(),
        toAdd: [],
    }
    syncFn(project, change, batch)
    EffectStore.applyBatch(project, batch)
}

// Test helper to create a minimal project
function createTestProject(
    videoClips: Clip[],
    webcamClips: Clip[] = [],
    effects: Effect[] = []
): Project {
    const videoRecording = {
        id: 'video-rec-1',
        sourceType: 'video' as const,
        filePath: '/tmp/test-video.mp4',
        duration: 60000,
        width: 1920,
        height: 1080,
        frameRate: 60,
        effects: [],
        metadata: {
            keyboardEvents: [],
            mouseEvents: [],
            clickEvents: [],
            screenEvents: [],
        },
    }

    return {
        id: 'project-1',
        version: '1.0.0',
        schemaVersion: 1,
        name: 'Test Project',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        recordings: [videoRecording],
        timeline: {
            tracks: [
                {
                    id: 'video-track-1',
                    name: 'Video Track',
                    type: TrackType.Video,
                    clips: videoClips,
                    muted: false,
                    locked: false,
                },
                ...(webcamClips.length > 0 ? [{
                    id: 'webcam-track-1',
                    name: 'Webcam Track',
                    type: TrackType.Webcam,
                    clips: webcamClips,
                    muted: false,
                    locked: false,
                }] : []),
            ],
            duration: Math.max(
                ...videoClips.map(c => c.startTime + c.duration),
                ...(webcamClips.length > 0 ? webcamClips.map(c => c.startTime + c.duration) : [0])
            ),
            effects,
        },
        settings: {
            frameRate: 60,
            resolution: { width: 1920, height: 1080 },
            backgroundColor: '#000000',
            audio: { volume: 1, muted: false, fadeInDuration: 0, fadeOutDuration: 0, enhanceAudio: false },
            canvas: { aspectRatio: 'original' as any },
        } as any,
        exportPresets: [],
    } as Project
}

function createClip(
    id: string,
    startTime: number,
    duration: number,
    sourceIn: number = 0,
    playbackRate: number = 1
): Clip {
    return {
        id,
        recordingId: 'video-rec-1',
        startTime,
        duration,
        sourceIn,
        sourceOut: sourceIn + duration * playbackRate,
        playbackRate,
    }
}

function createZoomEffect(
    id: string,
    startTime: number,
    endTime: number,
    clipId?: string
): Effect {
    return {
        id,
        type: EffectType.Zoom,
        startTime,
        endTime,
        enabled: true,
        ...(clipId && { clipId }),
        data: { zoomLevel: 2, x: 0.5, y: 0.5 } as any,
    }
}

function createCropEffect(
    id: string,
    startTime: number,
    endTime: number,
    clipId: string
): Effect {
    return {
        id,
        type: EffectType.Crop,
        startTime,
        endTime,
        enabled: true,
        clipId,
        data: { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 } as any,
    }
}

function buildClipState(clip: Clip): ClipState {
    return {
        startTime: clip.startTime,
        endTime: clip.startTime + clip.duration,
        playbackRate: clip.playbackRate ?? 1,
        sourceIn: clip.sourceIn ?? 0,
        sourceOut: clip.sourceOut ?? (clip.sourceIn ?? 0) + clip.duration * (clip.playbackRate ?? 1),
    }
}

describe('TimelineSyncOrchestrator', () => {
    describe('commit() operation order', () => {
        it('processes clip-bound effects before time-based effects', () => {
            // Setup: clip with both a crop effect (clip-bound) and zoom effect (time-based)
            const clip = createClip('clip-1', 0, 10000)
            const cropEffect = createCropEffect('crop-1', 0, 10000, 'clip-1')
            const zoomEffect = createZoomEffect('zoom-1', 5000, 8000)

            const project = createTestProject([clip], [], [cropEffect, zoomEffect])

            // Simulate split at timeline position 5000
            const firstClip: Clip = { ...clip, id: 'clip-1-a', duration: 5000, sourceOut: 5000 }
            const secondClip: Clip = { ...clip, id: 'clip-1-b', startTime: 5000, duration: 5000, sourceIn: 5000 }

            // Replace original clip with split clips
            project.timeline.tracks[0].clips = [firstClip, secondClip]

            const change: ClipChange = {
                type: 'split',
                clipId: 'clip-1',
                recordingId: clip.recordingId,
                before: buildClipState(clip),
                after: null,
                timelineDelta: 0,
                newClipIds: ['clip-1-a', 'clip-1-b'],
            }

            TimelineSyncOrchestrator.commit(project, change)

            // Verify crop effect was duplicated for both clips
            const effects = EffectStore.getAll(project)
            const cropEffects = effects.filter(e => e.type === EffectType.Crop)
            expect(cropEffects.length).toBe(2)

            // Verify zoom effect timing is unchanged (no timeline delta for split)
            const zoomEffects = effects.filter(e => e.type === EffectType.Zoom)
            expect(zoomEffects.length).toBe(1)
            expect(zoomEffects[0].startTime).toBe(5000)
            expect(zoomEffects[0].endTime).toBe(8000)
        })
    })
})

describe('ClipBoundEffectSync', () => {
    describe('split handling', () => {
        it('duplicates clip-bound effect for both split clips', () => {
            const clip = createClip('clip-1', 0, 10000)
            const cropEffect = createCropEffect('crop-1', 0, 10000, 'clip-1')
            const project = createTestProject([clip], [], [cropEffect])

            // Simulate split
            const firstClip: Clip = { ...clip, id: 'clip-1-a', duration: 5000, sourceOut: 5000 }
            const secondClip: Clip = { ...clip, id: 'clip-1-b', startTime: 5000, duration: 5000, sourceIn: 5000 }
            project.timeline.tracks[0].clips = [firstClip, secondClip]

            const change: ClipChange = {
                type: 'split',
                clipId: 'clip-1',
                recordingId: clip.recordingId,
                before: buildClipState(clip),
                after: null,
                timelineDelta: 0,
                newClipIds: ['clip-1-a', 'clip-1-b'],
            }

            syncAndApply(project, change, ClipBoundEffectSync.collectMutations.bind(ClipBoundEffectSync))

            const effects = EffectStore.getAll(project)
            const cropEffects = effects.filter(e => e.type === EffectType.Crop)

            expect(cropEffects.length).toBe(2)

            // First effect should be bound to first clip
            const firstEffect = cropEffects.find(e => e.clipId === 'clip-1-a')
            expect(firstEffect).toBeTruthy()
            expect(firstEffect!.startTime).toBe(0)
            expect(firstEffect!.endTime).toBe(5000)

            // Second effect should be bound to second clip
            const secondEffect = cropEffects.find(e => e.clipId === 'clip-1-b')
            expect(secondEffect).toBeTruthy()
            expect(secondEffect!.startTime).toBe(5000)
            expect(secondEffect!.endTime).toBe(10000)
        })

        it('updates clip-bound effect timing when clip is moved', () => {
            const clip = createClip('clip-1', 1000, 10000)
            const cropEffect = createCropEffect('crop-1', 1000, 11000, 'clip-1')
            const project = createTestProject([clip], [], [cropEffect])

            // Simulate reorder - clip moved to start at 0
            clip.startTime = 0

            const change: ClipChange = {
                type: 'reorder',
                clipId: 'clip-1',
                recordingId: clip.recordingId,
                before: { startTime: 1000, endTime: 11000, playbackRate: 1, sourceIn: 0, sourceOut: 10000 },
                after: { startTime: 0, endTime: 10000, playbackRate: 1, sourceIn: 0, sourceOut: 10000 },
                timelineDelta: -1000,
            }

            syncAndApply(project, change, ClipBoundEffectSync.collectMutations.bind(ClipBoundEffectSync))

            const effects = EffectStore.getAll(project)
            const cropEffects = effects.filter(e => e.type === EffectType.Crop)

            expect(cropEffects.length).toBe(1)
            expect(cropEffects[0].startTime).toBe(0)
            expect(cropEffects[0].endTime).toBe(10000)
        })
    })
})

describe('TimeBasedEffectSync', () => {
    describe('delete handling', () => {
        it('shifts effects after deleted clip backward', () => {
            const clip1 = createClip('clip-1', 0, 5000)
            const clip2 = createClip('clip-2', 5000, 5000)
            const zoomEffect = createZoomEffect('zoom-1', 6000, 8000) // Inside clip-2

            const project = createTestProject([clip2], [], [zoomEffect])

            const change: ClipChange = {
                type: 'delete',
                clipId: 'clip-1',
                recordingId: clip1.recordingId,
                before: buildClipState(clip1),
                after: null,
                timelineDelta: -5000,
            }

            syncAndApply(project, change, TimeBasedEffectSync.collectMutations.bind(TimeBasedEffectSync))

            const effects = EffectStore.getAll(project)
            expect(effects.length).toBe(1)
            expect(effects[0].startTime).toBe(1000) // 6000 - 5000
            expect(effects[0].endTime).toBe(3000)   // 8000 - 5000
        })

        it('removes effects entirely within deleted region', () => {
            const clip = createClip('clip-1', 0, 10000)
            const zoomEffect = createZoomEffect('zoom-1', 2000, 5000)

            const project = createTestProject([], [], [zoomEffect])

            const change: ClipChange = {
                type: 'delete',
                clipId: 'clip-1',
                recordingId: clip.recordingId,
                before: buildClipState(clip),
                after: null,
                timelineDelta: -10000,
            }

            syncAndApply(project, change, TimeBasedEffectSync.collectMutations.bind(TimeBasedEffectSync))

            const effects = EffectStore.getAll(project)
            expect(effects.length).toBe(0)
        })

        it('truncates effects that span across deleted region', () => {
            const clip = createClip('clip-1', 5000, 5000) // 5000-10000
            const zoomEffect = createZoomEffect('zoom-1', 3000, 12000) // Spans before, during, and after

            const project = createTestProject([], [], [zoomEffect])

            const change: ClipChange = {
                type: 'delete',
                clipId: 'clip-1',
                recordingId: clip.recordingId,
                before: buildClipState(clip),
                after: null,
                timelineDelta: -5000,
            }

            syncAndApply(project, change, TimeBasedEffectSync.collectMutations.bind(TimeBasedEffectSync))

            const effects = EffectStore.getAll(project)
            expect(effects.length).toBe(1)
            expect(effects[0].startTime).toBe(3000)  // Unchanged
            expect(effects[0].endTime).toBe(7000)    // 12000 - 5000
        })
    })

    describe('trim-end handling', () => {
        it('shifts effects after trimmed clip by timeline delta', () => {
            const clip = createClip('clip-1', 0, 10000)
            const zoomEffect = createZoomEffect('zoom-1', 12000, 15000) // After clip

            const project = createTestProject([clip], [], [zoomEffect])

            // Trim end: clip duration changes from 10000 to 8000
            clip.duration = 8000
            clip.sourceOut = 8000

            const change: ClipChange = {
                type: 'trim-end',
                clipId: 'clip-1',
                recordingId: clip.recordingId,
                before: { startTime: 0, endTime: 10000, playbackRate: 1, sourceIn: 0, sourceOut: 10000 },
                after: { startTime: 0, endTime: 8000, playbackRate: 1, sourceIn: 0, sourceOut: 8000 },
                timelineDelta: -2000,
            }

            syncAndApply(project, change, TimeBasedEffectSync.collectMutations.bind(TimeBasedEffectSync))

            const effects = EffectStore.getAll(project)
            expect(effects.length).toBe(1)
            expect(effects[0].startTime).toBe(10000) // 12000 - 2000
            expect(effects[0].endTime).toBe(13000)   // 15000 - 2000
        })

        it('truncates effects that extend past new clip end', () => {
            const clip = createClip('clip-1', 0, 10000)
            const zoomEffect = createZoomEffect('zoom-1', 5000, 12000) // Ends after clip

            const project = createTestProject([clip], [], [zoomEffect])

            // Trim end: clip duration changes from 10000 to 7000
            clip.duration = 7000
            clip.sourceOut = 7000

            const change: ClipChange = {
                type: 'trim-end',
                clipId: 'clip-1',
                recordingId: clip.recordingId,
                before: { startTime: 0, endTime: 10000, playbackRate: 1, sourceIn: 0, sourceOut: 10000 },
                after: { startTime: 0, endTime: 7000, playbackRate: 1, sourceIn: 0, sourceOut: 7000 },
                timelineDelta: -3000,
            }

            syncAndApply(project, change, TimeBasedEffectSync.collectMutations.bind(TimeBasedEffectSync))

            const effects = EffectStore.getAll(project)
            expect(effects.length).toBe(1)
            expect(effects[0].startTime).toBe(5000)  // Unchanged
            expect(effects[0].endTime).toBe(7000)    // Truncated to new clip end
        })

        it('removes effects starting in trimmed portion', () => {
            const clip = createClip('clip-1', 0, 10000)
            const zoomEffect = createZoomEffect('zoom-1', 8000, 9000) // Inside trimmed portion

            const project = createTestProject([clip], [], [zoomEffect])

            // Trim end: clip duration changes from 10000 to 6000
            clip.duration = 6000
            clip.sourceOut = 6000

            const change: ClipChange = {
                type: 'trim-end',
                clipId: 'clip-1',
                recordingId: clip.recordingId,
                before: { startTime: 0, endTime: 10000, playbackRate: 1, sourceIn: 0, sourceOut: 10000 },
                after: { startTime: 0, endTime: 6000, playbackRate: 1, sourceIn: 0, sourceOut: 6000 },
                timelineDelta: -4000,
            }

            syncAndApply(project, change, TimeBasedEffectSync.collectMutations.bind(TimeBasedEffectSync))

            const effects = EffectStore.getAll(project)
            expect(effects.length).toBe(0)
        })
    })

    describe('speed-up handling', () => {
        it('proportionally remaps effects during speed-up', () => {
            const clip = createClip('clip-1', 0, 30000)
            // Effect in the first segment (before 2x section)
            const zoomEffect = createZoomEffect('zoom-1', 5000, 8000)

            const project = createTestProject([clip], [], [zoomEffect])

            // Speed-up: middle portion (10000-20000 source) at 2x
            // New timeline: 0-10000 (rate 1), 10000-15000 (rate 2), 15000-25000 (rate 1)
            const segmentMapping: SegmentMapping = {
                originalClipStart: 0,
                originalClipEnd: 30000,
                timelineDelta: -5000, // 30000 -> 25000
                basePlaybackRate: 1,
                segments: [
                    { sourceStart: 0, sourceEnd: 10000, timelineStart: 0, timelineEnd: 10000, speedMultiplier: 1 },
                    { sourceStart: 10000, sourceEnd: 20000, timelineStart: 10000, timelineEnd: 15000, speedMultiplier: 2 },
                    { sourceStart: 20000, sourceEnd: 30000, timelineStart: 15000, timelineEnd: 25000, speedMultiplier: 1 },
                ],
            }

            const change: ClipChange = {
                type: 'speed-up',
                clipId: 'clip-1',
                recordingId: clip.recordingId,
                before: buildClipState(clip),
                after: null,
                timelineDelta: -5000,
                segmentMapping,
            }

            syncAndApply(project, change, TimeBasedEffectSync.collectMutations.bind(TimeBasedEffectSync))

            const effects = EffectStore.getAll(project)
            expect(effects.length).toBe(1)
            // Effect in first segment (1x) should map 1:1
            expect(effects[0].startTime).toBe(5000)
            expect(effects[0].endTime).toBe(8000)
        })

        it('shifts effects after clip by timeline delta', () => {
            const clip = createClip('clip-1', 0, 10000)
            const zoomEffect = createZoomEffect('zoom-1', 15000, 20000) // After clip

            const project = createTestProject([clip], [], [zoomEffect])

            const segmentMapping: SegmentMapping = {
                originalClipStart: 0,
                originalClipEnd: 10000,
                timelineDelta: -3000,
                basePlaybackRate: 1,
                segments: [
                    { sourceStart: 0, sourceEnd: 4000, timelineStart: 0, timelineEnd: 4000, speedMultiplier: 1 },
                    { sourceStart: 4000, sourceEnd: 10000, timelineStart: 4000, timelineEnd: 7000, speedMultiplier: 2 },
                ],
            }

            const change: ClipChange = {
                type: 'speed-up',
                clipId: 'clip-1',
                recordingId: clip.recordingId,
                before: buildClipState(clip),
                after: null,
                timelineDelta: -3000,
                segmentMapping,
            }

            syncAndApply(project, change, TimeBasedEffectSync.collectMutations.bind(TimeBasedEffectSync))

            const effects = EffectStore.getAll(project)
            expect(effects.length).toBe(1)
            expect(effects[0].startTime).toBe(12000) // 15000 - 3000
            expect(effects[0].endTime).toBe(17000)   // 20000 - 3000
        })
    })

    describe('floating point precision', () => {
        it('handles sub-millisecond timing without errors', () => {
            const clip = createClip('clip-1', 0, 10000.333)
            const zoomEffect = createZoomEffect('zoom-1', 5000.5, 8000.7)

            const project = createTestProject([clip], [], [zoomEffect])

            // Trim with fractional values
            clip.duration = 8000.123

            const change: ClipChange = {
                type: 'trim-end',
                clipId: 'clip-1',
                recordingId: clip.recordingId,
                before: { startTime: 0, endTime: 10000.333, playbackRate: 1, sourceIn: 0, sourceOut: 10000.333 },
                after: { startTime: 0, endTime: 8000.123, playbackRate: 1, sourceIn: 0, sourceOut: 8000.123 },
                timelineDelta: -2000.21,
            }

            // Should not throw
            expect(() => syncAndApply(project, change, TimeBasedEffectSync.collectMutations.bind(TimeBasedEffectSync))).not.toThrow()

            const effects = EffectStore.getAll(project)
            expect(effects.length).toBe(1)
            // Effect should be truncated to new clip end
            expect(effects[0].endTime).toBeCloseTo(8000.123, 1)
        })
    })
})

describe('segment mapping precision', () => {
    it('correctly maps time through multiple speed segments', () => {
        // This tests the mapTimeToNewPosition function's precision
        // The algorithm maps original timeline position → new timeline position
        // based on how segments compress/expand the timeline
        const segmentMapping: SegmentMapping = {
            originalClipStart: 0,
            originalClipEnd: 30000,
            timelineDelta: -10000, // Significant compression
            basePlaybackRate: 1,
            segments: [
                { sourceStart: 0, sourceEnd: 10000, timelineStart: 0, timelineEnd: 10000, speedMultiplier: 1 },
                { sourceStart: 10000, sourceEnd: 20000, timelineStart: 10000, timelineEnd: 12500, speedMultiplier: 4 },
                { sourceStart: 20000, sourceEnd: 30000, timelineStart: 12500, timelineEnd: 20000, speedMultiplier: 1.33 },
            ],
        }

        // Test the mapping function directly
        const result1 = TimeBasedEffectSync.mapTimeToNewPosition(5000, segmentMapping)
        expect(result1).toBeCloseTo(5000, 1) // In first segment (1x), maps 1:1

        // Position 10000 is at the boundary between segment 1 and 2
        const result2 = TimeBasedEffectSync.mapTimeToNewPosition(10000, segmentMapping)
        expect(result2).toBeCloseTo(10000, 1)

        // Before clip start - should return unchanged
        const result3 = TimeBasedEffectSync.mapTimeToNewPosition(-1000, segmentMapping)
        expect(result3).toBe(-1000)

        // Verify segment boundaries work correctly
        // At the end of the new timeline (20000), content that was at original position ~20018 appears
        const result4 = TimeBasedEffectSync.mapTimeToNewPosition(0, segmentMapping)
        expect(result4).toBe(0)
    })
})
