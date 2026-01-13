/**
 * Tests for proxy-service.ts (renderer)
 *
 * Coverage:
 * - needsUserPrompt logic
 * - Proxy decision based on video dimensions
 *
 * Note: Tests that require mocking the zustand store status are skipped
 * since they're more suitable for integration testing.
 */

import { describe, it, expect } from '@jest/globals'
import type { Recording } from '@/types/project'
import { MIN_WIDTH_FOR_PREVIEW_PROXY } from '../../src/features/proxy/constants'
import { ProxyService } from '../../src/features/proxy/services/proxy-service'

// Helper to create a minimal recording
function createTestRecording(overrides: Partial<Recording> = {}): Recording {
    return {
        id: `test-recording-${Date.now()}`,
        filePath: '/test/video.mp4',
        duration: 5000,
        width: 1920,
        height: 1080,
        frameRate: 30,
        hasAudio: true,
        sourceType: 'video',
        effects: [],
        ...overrides,
    } as Recording
}

describe('Proxy Service', () => {
    describe('MIN_WIDTH_FOR_PREVIEW_PROXY constant', () => {
        it('should be 2560 (1440p threshold)', () => {
            expect(MIN_WIDTH_FOR_PREVIEW_PROXY).toBe(2560)
        })
    })

    describe('needsUserPrompt - dimension checks', () => {
        it('should return false for small video (1920px width - 1080p)', () => {
            const recording = createTestRecording({ width: 1920 })
            expect(ProxyService.needsUserPrompt(recording)).toBe(false)
        })

        it('should return false for video at exactly 2560px (1440p)', () => {
            const recording = createTestRecording({ width: 2560 })
            expect(ProxyService.needsUserPrompt(recording)).toBe(false)
        })

        it('should return true for large video (3840px width - 4K)', () => {
            const recording = createTestRecording({ width: 3840 })
            expect(ProxyService.needsUserPrompt(recording)).toBe(true)
        })

        it('should return true for video just above threshold (2561px)', () => {
            const recording = createTestRecording({ width: 2561 })
            expect(ProxyService.needsUserPrompt(recording)).toBe(true)
        })

        it('should return true when capabilities.requiresProxy is true', () => {
            const recording = createTestRecording({
                width: 1920,
                capabilities: {
                    hasCursorData: false,
                    hasKeystrokeData: false,
                    hasScrollData: false,
                    hasScreenData: false,
                    requiresProxy: true,
                },
            })
            expect(ProxyService.needsUserPrompt(recording)).toBe(true)
        })

        it('should return false for video without width property', () => {
            const recording = createTestRecording()
            // @ts-expect-error - intentionally testing undefined width
            delete recording.width
            expect(ProxyService.needsUserPrompt(recording)).toBe(false)
        })
    })

    // Note: Status-based tests (generating, ready, dismissed, checking) are skipped
    // because they require proper zustand store mocking which is better suited
    // for integration tests. The dimension-based logic above is the critical path.
})

describe('Proxy Threshold Integration', () => {
    it('should match the constant used in import-media-section', () => {
        // This test ensures the constant is consistent across the codebase
        // The import-media-section.tsx uses this same constant
        expect(MIN_WIDTH_FOR_PREVIEW_PROXY).toBe(2560)
    })

    describe('common video resolutions', () => {
        const resolutionTests = [
            { name: '720p', width: 1280, shouldRequireProxy: false },
            { name: '1080p', width: 1920, shouldRequireProxy: false },
            { name: '1440p', width: 2560, shouldRequireProxy: false },
            { name: '4K', width: 3840, shouldRequireProxy: true },
            { name: '5K', width: 5120, shouldRequireProxy: true },
            { name: '6K', width: 6016, shouldRequireProxy: true },
            { name: '8K', width: 7680, shouldRequireProxy: true },
        ]

        resolutionTests.forEach(({ name, width, shouldRequireProxy }) => {
            it(`${name} (${width}px) should ${shouldRequireProxy ? '' : 'NOT '}require proxy`, () => {
                const recording = createTestRecording({ width })
                const needsPrompt = ProxyService.needsUserPrompt(recording)
                expect(needsPrompt).toBe(shouldRequireProxy)
            })
        })
    })
})
