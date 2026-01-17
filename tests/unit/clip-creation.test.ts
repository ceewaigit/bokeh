/**
 * Tests for clip-creation.ts
 *
 * Coverage:
 * - addRecordingToProject
 *
 * Note: For external asset import tests, see command tests for AddAssetCommand.
 * The addAssetRecording function was consolidated into AddAssetCommand for cleaner architecture.
 */

import { describe, it, expect } from '@jest/globals'
import type { Project, Recording } from '@/types/project'
import { TrackType } from '@/types/project'
import { addRecordingToProject } from '../../src/features/ui/timeline/clips/clip-creation'

// Helper to create a minimal valid project
function createEmptyProject(): Project {
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
            duration: 0,
            tracks: [
                {
                    id: 'track-video',
                    name: 'Video',
                    type: TrackType.Video,
                    clips: [],
                    muted: false,
                    locked: false,
                },
                {
                    id: 'track-webcam',
                    name: 'Webcam',
                    type: TrackType.Webcam,
                    clips: [],
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

describe('Clip Creation', () => {
    describe('addRecordingToProject', () => {
        it('should add recording and create clip', () => {
            const project = createEmptyProject()
            const recording: Recording = {
                id: 'test-recording-1',
                filePath: '/test/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                frameRate: 30,
                hasAudio: true,
                sourceType: 'video',
                effects: [],
            }

            const clip = addRecordingToProject(project, recording)

            expect(project.recordings).toHaveLength(1)
            expect(project.recordings[0].id).toBe('test-recording-1')
            expect(clip).not.toBeNull()
            expect(clip!.recordingId).toBe('test-recording-1')
        })

        it('should not duplicate recording if already exists', () => {
            const project = createEmptyProject()
            const recording: Recording = {
                id: 'test-recording-1',
                filePath: '/test/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                frameRate: 30,
                hasAudio: true,
                sourceType: 'video',
                effects: [],
            }

            // Add recording directly first
            project.recordings.push(recording)

            // Call addRecordingToProject
            addRecordingToProject(project, recording)

            // Should still only have one recording
            expect(project.recordings).toHaveLength(1)
        })

        it('should add clip to video track by default', () => {
            const project = createEmptyProject()
            const recording: Recording = {
                id: 'test-recording-1',
                filePath: '/test/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                frameRate: 30,
                hasAudio: true,
                sourceType: 'video',
                effects: [],
            }

            addRecordingToProject(project, recording)

            const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
            expect(videoTrack!.clips).toHaveLength(1)
        })

        it('should add clip to webcam track when specified', () => {
            const project = createEmptyProject()
            const recording: Recording = {
                id: 'test-recording-1',
                filePath: '/test/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                frameRate: 30,
                hasAudio: true,
                sourceType: 'video',
                effects: [],
            }

            addRecordingToProject(project, recording, { trackType: TrackType.Webcam })

            const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)
            expect(webcamTrack!.clips).toHaveLength(1)
        })
    })
})
