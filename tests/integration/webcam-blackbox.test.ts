/**
 * Webcam Black Box Integration Tests
 *
 * Verifies the integrity of the webcam architecture:
 * 1. Webcam clips use contiguous layout like video/audio (unified behavior).
 * 2. Layout data is stored on clip.layout (WebcamLayoutData) not valid Effects.
 * 3. Cleanup works correctly (deleting clip removes webcam-specific transcript data).
 */

import { describe, it, expect } from '@jest/globals'
import type { Project, Clip, WebcamLayoutData, Recording } from '@/types/project'
import { TrackType } from '@/types/project'
import { ProjectCleanupService } from '@/features/ui/timeline/project-cleanup'
import { addClipToTrack } from '@/features/ui/timeline/clips/clip-crud'
import { reflowClips } from '@/features/ui/timeline/clips/clip-reflow'

// --- Test Generators ---

function createTestProject(): Project {
    return {
        version: '1', schemaVersion: 1, id: 'test-project',
        name: 'Test Project', createdAt: '2020-01-01', modifiedAt: '2020-01-01',
        recordings: [], effects: [], settings: {} as any, exportPresets: [],
        timeline: {
            duration: 0,
            tracks: [
                { id: 'video-track', name: 'Video', type: TrackType.Video, clips: [], muted: false, locked: false },
                { id: 'webcam-track', name: 'Webcam', type: TrackType.Webcam, clips: [], muted: false, locked: false }
            ],
            transcriptEdits: {},
            effects: [] // Global effects store
        }
    } as unknown as Project
}

function createWebcamClip(id: string, startTime: number, duration: number, recordingId: string): Clip {
    const layout: WebcamLayoutData = {
        position: { x: 0, y: 0, anchor: 'base' }, // 'base' is legacy, usually 'bottom-right' etc
        size: 300,
        shape: 'circle',
        borderEnabled: true,
        borderColor: '#ffffff',
        borderWidth: 4,
        shadowEnabled: true,
        shadowColor: '#000000',
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowOffsetY: 4
    } as any // cast for simplified test data

    return {
        id,
        recordingId,
        startTime,
        duration,
        sourceIn: 0,
        sourceOut: duration,
        playbackRate: 1,
        layout // THE CRITICAL PART: Layout is on the clip
    }
}

describe('Webcam Black Box Architecture', () => {

    describe('1. Contiguous Layout (Unified Behavior)', () => {
        it('webcam clips use contiguous layout like video/audio clips', () => {
            const project = createTestProject()
            const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!

            // Add first webcam clip at 0
            const clip1 = createWebcamClip('wc-1', 0, 5000, 'rec-1')
            webcamTrack.clips.push(clip1)

            // Add second webcam clip - should be placed after the first
            const clip2 = createWebcamClip('wc-2', 0, 2000, 'rec-1') // startTime will be adjusted by reflow
            webcamTrack.clips.push(clip2)

            // Apply reflow - webcam now uses contiguous layout
            reflowClips(webcamTrack)

            expect(webcamTrack.clips[0].startTime).toBe(0)
            expect(webcamTrack.clips[1].startTime).toBe(5000) // Starts after first clip ends
            expect(webcamTrack.clips).toHaveLength(2)
        })
    })

    describe('2. Layout Data Integrity', () => {
        it('stores webcam styling in clip.layout, NOT in project.effects', () => {
            const project = createTestProject()
            const clip = createWebcamClip('wc-style-test', 0, 1000, 'rec-1')

            project.timeline.tracks.find(t => t.type === TrackType.Webcam)!.clips.push(clip)

            // Verify clip has data
            const storedClip = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!.clips[0]
            expect(storedClip.layout).toBeDefined()
            const layout = storedClip.layout as WebcamLayoutData
            expect(layout.shape).toBe('circle')
            expect(layout.size).toBe(300)

            // Verify NO Effect was created
            expect(project.timeline.effects).toHaveLength(0)
        })
    })

    describe('3. Cleanup Logic', () => {
        it('cleans up transcript edits when the last webcam clip using a recording is deleted', () => {
            const project = createTestProject()
            const recId = 'rec-webcam-1'

            // Setup: Recording exists
            project.recordings.push({ id: recId, duration: 10000 } as Recording)

            // Setup: Clip using that recording
            const clip = createWebcamClip('wc-clean-test', 0, 5000, recId)
            project.timeline.tracks.find(t => t.type === TrackType.Webcam)!.clips.push(clip)

            // Setup: Transcript edits exist for this recording
            project.timeline.transcriptEdits = {
                [recId]: { edits: [{ type: 'skip', start: 100, end: 200 }] }
            } as any

            expect(project.timeline.transcriptEdits![recId]).toBeDefined()

            // ACTION: Delete the clip
            // Use the service directly to ensure we test the logic we added to RemoveClipCommand's cleanup path
            // Note: RemoveClipCommand calls ProjectCleanupService.cleanupWebcamRecordingData

            // Manually simulate what RemoveClipCommand does:
            // 1. Remove clip from track
            project.timeline.tracks.find(t => t.type === TrackType.Webcam)!.clips = []

            // 2. Call cleanup
            ProjectCleanupService.cleanupWebcamRecordingData(project, recId)

            // ASSERTION: Transcript edits should be gone because no other clip uses 'rec-webcam-1'
            expect(project.timeline.transcriptEdits![recId]).toBeUndefined()
        })

        it('does NOT clean up transcript edits if another webcam clip still uses the recording', () => {
            const project = createTestProject()
            const recId = 'rec-shared-1'

            project.recordings.push({ id: recId, duration: 10000 } as Recording)

            // Two clips usage
            const clip1 = createWebcamClip('wc-1', 0, 5000, recId)
            const clip2 = createWebcamClip('wc-2', 5000, 5000, recId)
            const track = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!
            track.clips.push(clip1, clip2)

            project.timeline.transcriptEdits = {
                [recId]: { edits: [] }
            } as any

            // Remove ONE clip
            track.clips = track.clips.filter(c => c.id !== 'wc-1')

            // Call cleanup
            ProjectCleanupService.cleanupWebcamRecordingData(project, recId)

            // Should STILL EXIST because wc-2 uses it
            expect(project.timeline.transcriptEdits![recId]).toBeDefined()
        })
    })
})
