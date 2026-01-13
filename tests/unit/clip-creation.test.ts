/**
 * Tests for clip-creation.ts
 *
 * Coverage:
 * - addAssetRecording
 * - addRecordingToProject
 * - Asset to Recording to Clip flow
 */

import { describe, it, expect } from '@jest/globals'
import type { Project, Recording } from '@/types/project'
import { TrackType } from '@/types/project'
import { addAssetRecording, addRecordingToProject, type AssetDetails } from '../../src/features/ui/timeline/clips/clip-creation'

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
    describe('addAssetRecording - video', () => {
        it('should create recording and clip from video asset', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                type: 'video',
                name: 'test-video.mp4',
            }

            const clip = addAssetRecording(project, asset)

            // Recording should be added
            expect(project.recordings).toHaveLength(1)
            expect(project.recordings[0].filePath).toBe('/test/video.mp4')
            expect(project.recordings[0].width).toBe(1920)
            expect(project.recordings[0].height).toBe(1080)
            expect(project.recordings[0].duration).toBe(5000)
            expect(project.recordings[0].sourceType).toBe('video')

            // Clip should be created
            expect(clip).not.toBeNull()
            expect(clip!.recordingId).toBe(project.recordings[0].id)
            expect(clip!.duration).toBe(5000)
        })

        it('should mark recording as external', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                type: 'video',
            }

            addAssetRecording(project, asset)

            expect(project.recordings[0].isExternal).toBe(true)
        })

        it('should pass requiresProxy through to recording capabilities', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/video.mp4',
                duration: 5000,
                width: 3840,
                height: 2160,
                type: 'video',
                requiresProxy: true,
            }

            addAssetRecording(project, asset)

            expect(project.recordings[0].capabilities).toBeDefined()
            expect(project.recordings[0].capabilities!.requiresProxy).toBe(true)
        })

        it('should not set requiresProxy when not provided', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                type: 'video',
            }

            addAssetRecording(project, asset)

            expect(project.recordings[0].capabilities!.requiresProxy).toBeUndefined()
        })

        it('should set hasAudio to true for video assets', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                type: 'video',
            }

            addAssetRecording(project, asset)

            expect(project.recordings[0].hasAudio).toBe(true)
        })

        it('should use provided frameRate', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                type: 'video',
                frameRate: 60,
            }

            addAssetRecording(project, asset)

            expect(project.recordings[0].frameRate).toBe(60)
        })

        it('should add clip to video track by default', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                type: 'video',
            }

            addAssetRecording(project, asset)

            const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
            expect(videoTrack!.clips).toHaveLength(1)
        })

        it('should add clip to webcam track when specified', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                type: 'video',
            }

            addAssetRecording(project, asset, { trackType: TrackType.Webcam })

            const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)
            expect(webcamTrack!.clips).toHaveLength(1)
        })
    })

    describe('addAssetRecording - image', () => {
        it('should create image recording with sourceType "image"', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/image.png',
                duration: 5000,
                width: 800,
                height: 600,
                type: 'image',
            }

            addAssetRecording(project, asset)

            expect(project.recordings[0].sourceType).toBe('image')
        })

        it('should create imageSource on image recording', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/image.png',
                duration: 5000,
                width: 800,
                height: 600,
                type: 'image',
            }

            addAssetRecording(project, asset)

            const recording = project.recordings[0] as any
            expect(recording.imageSource).toBeDefined()
            expect(recording.imageSource.imagePath).toBe('/test/image.png')
        })

        it('should set hasAudio to false for images', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/image.png',
                duration: 5000,
                width: 800,
                height: 600,
                type: 'image',
            }

            addAssetRecording(project, asset)

            expect(project.recordings[0].hasAudio).toBe(false)
        })
    })

    describe('addAssetRecording - audio', () => {
        it('should create audio recording with hasAudio true', () => {
            const project = createEmptyProject()
            const asset: AssetDetails = {
                path: '/test/audio.mp3',
                duration: 60000,
                width: 0,
                height: 0,
                type: 'audio',
            }

            addAssetRecording(project, asset)

            expect(project.recordings[0].hasAudio).toBe(true)
        })
    })

    describe('addAssetRecording - multiple clips', () => {
        it('should append clips sequentially', () => {
            const project = createEmptyProject()

            addAssetRecording(project, {
                path: '/test/video1.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                type: 'video',
            })

            addAssetRecording(project, {
                path: '/test/video2.mp4',
                duration: 3000,
                width: 1920,
                height: 1080,
                type: 'video',
            })

            expect(project.recordings).toHaveLength(2)
            const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
            expect(videoTrack!.clips).toHaveLength(2)
        })
    })

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
    })
})
