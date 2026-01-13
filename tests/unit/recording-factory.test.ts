/**
 * Tests for recording-factory.ts
 *
 * Coverage:
 * - createRecording() for external/app/library sources
 * - Capability detection
 * - ID generation
 * - requiresProxy handling
 */

import { describe, it, expect } from '@jest/globals'
import {
    createRecording,
    hasCursorData,
    hasKeystrokeData,
    shouldSkipMetadataLoading,
} from '../../src/features/ui/timeline/clips/recording-factory'

describe('Recording Factory', () => {
    describe('createRecording - external video', () => {
        it('should set isExternal to true for external source', () => {
            const recording = createRecording({
                type: 'video',
                source: 'external',
                filePath: '/path/to/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            expect(recording.isExternal).toBe(true)
        })

        it('should set all capability flags to false for external source', () => {
            const recording = createRecording({
                type: 'video',
                source: 'external',
                filePath: '/path/to/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            expect(recording.capabilities).toBeDefined()
            expect(recording.capabilities!.hasCursorData).toBe(false)
            expect(recording.capabilities!.hasKeystrokeData).toBe(false)
            expect(recording.capabilities!.hasScrollData).toBe(false)
            expect(recording.capabilities!.hasScreenData).toBe(false)
        })

        it('should pass through requiresProxy to capabilities', () => {
            const recording = createRecording({
                type: 'video',
                source: 'external',
                filePath: '/path/to/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                requiresProxy: true,
            })

            expect(recording.capabilities!.requiresProxy).toBe(true)
        })

        it('should not set requiresProxy when not specified', () => {
            const recording = createRecording({
                type: 'video',
                source: 'external',
                filePath: '/path/to/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            expect(recording.capabilities!.requiresProxy).toBeUndefined()
        })

        it('should generate ID with "imported-" prefix for external source', () => {
            const recording = createRecording({
                type: 'video',
                source: 'external',
                filePath: '/path/to/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            expect(recording.id).toMatch(/^imported-/)
        })

        it('should set sourceType to "video" for video type', () => {
            const recording = createRecording({
                type: 'video',
                source: 'external',
                filePath: '/path/to/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            expect(recording.sourceType).toBe('video')
        })

        it('should use default frameRate of 30 when not specified', () => {
            const recording = createRecording({
                type: 'video',
                source: 'external',
                filePath: '/path/to/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            expect(recording.frameRate).toBe(30)
        })

        it('should use provided frameRate when specified', () => {
            const recording = createRecording({
                type: 'video',
                source: 'external',
                filePath: '/path/to/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                frameRate: 60,
            })

            expect(recording.frameRate).toBe(60)
        })
    })

    describe('createRecording - external image', () => {
        it('should set sourceType to "image" for image type', () => {
            const recording = createRecording({
                type: 'image',
                source: 'external',
                filePath: '/path/to/image.png',
                duration: 5000,
                width: 800,
                height: 600,
            })

            expect(recording.sourceType).toBe('image')
        })

        it('should create imageSource with correct properties', () => {
            const recording = createRecording({
                type: 'image',
                source: 'external',
                filePath: '/path/to/image.png',
                duration: 5000,
                width: 800,
                height: 600,
            })

            expect((recording as any).imageSource).toBeDefined()
            expect((recording as any).imageSource.imagePath).toBe('/path/to/image.png')
            expect((recording as any).imageSource.sourceWidth).toBe(800)
            expect((recording as any).imageSource.sourceHeight).toBe(600)
        })
    })

    describe('createRecording - app source', () => {
        it('should set isExternal to false for app source', () => {
            const recording = createRecording({
                type: 'video',
                source: 'app',
                filePath: '/path/to/recording.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            // App source should not have isExternal flag
            expect(recording.isExternal).toBeFalsy()
        })

        it('should generate ID with "recording-" prefix for app source', () => {
            const recording = createRecording({
                type: 'video',
                source: 'app',
                filePath: '/path/to/recording.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            expect(recording.id).toMatch(/^recording-/)
        })

        it('should detect cursor data from metadata chunks', () => {
            const recording = createRecording({
                type: 'video',
                source: 'app',
                filePath: '/path/to/recording.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                metadataChunks: {
                    mouse: ['mouse-0.json', 'mouse-1.json'],
                },
            })

            expect(recording.capabilities!.hasCursorData).toBe(true)
        })

        it('should detect keyboard data from metadata chunks', () => {
            const recording = createRecording({
                type: 'video',
                source: 'app',
                filePath: '/path/to/recording.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                metadataChunks: {
                    keyboard: ['keyboard-0.json'],
                },
            })

            expect(recording.capabilities!.hasKeystrokeData).toBe(true)
        })
    })

    describe('createRecording - library source', () => {
        it('should generate ID with "lib-" prefix for library source', () => {
            const recording = createRecording({
                type: 'video',
                source: 'library',
                filePath: '/path/to/lib-recording.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            expect(recording.id).toMatch(/^lib-/)
        })
    })

    describe('hasCursorData utility', () => {
        it('should return false for external recordings', () => {
            const recording = createRecording({
                type: 'video',
                source: 'external',
                filePath: '/path/to/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            expect(hasCursorData(recording)).toBe(false)
        })

        it('should return true when capabilities.hasCursorData is true', () => {
            const recording = createRecording({
                type: 'video',
                source: 'app',
                filePath: '/path/to/recording.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                metadataChunks: { mouse: ['mouse-0.json'] },
            })

            expect(hasCursorData(recording)).toBe(true)
        })
    })

    describe('hasKeystrokeData utility', () => {
        it('should return false for external recordings', () => {
            const recording = createRecording({
                type: 'video',
                source: 'external',
                filePath: '/path/to/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            expect(hasKeystrokeData(recording)).toBe(false)
        })

        it('should return true when capabilities.hasKeystrokeData is true', () => {
            const recording = createRecording({
                type: 'video',
                source: 'app',
                filePath: '/path/to/recording.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                metadataChunks: { keyboard: ['keyboard-0.json'] },
            })

            expect(hasKeystrokeData(recording)).toBe(true)
        })
    })

    describe('shouldSkipMetadataLoading utility', () => {
        it('should return true for external recordings', () => {
            const recording = createRecording({
                type: 'video',
                source: 'external',
                filePath: '/path/to/video.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
            })

            expect(shouldSkipMetadataLoading(recording)).toBe(true)
        })

        it('should return false for app recordings with metadata chunks', () => {
            const recording = createRecording({
                type: 'video',
                source: 'app',
                filePath: '/path/to/recording.mp4',
                duration: 5000,
                width: 1920,
                height: 1080,
                folderPath: '/path/to/recording-folder',
                metadataChunks: { mouse: ['mouse-0.json'] },
            })

            expect(shouldSkipMetadataLoading(recording)).toBe(false)
        })
    })
})
