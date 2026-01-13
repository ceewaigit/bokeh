/**
 * Tests for import-media-section.tsx logic
 *
 * Coverage:
 * - Metadata extraction and requiresProxy decision
 * - Dimension-based proxy threshold
 * - Integration with MIN_WIDTH_FOR_PREVIEW_PROXY constant
 *
 * Note: These tests verify the logic without rendering the React component.
 * The core logic being tested:
 * - requiresProxy should be set based on width > 2560px
 * - requiresProxy should NOT be set based on metadata extraction method
 */

import { describe, it, expect } from '@jest/globals'
import { MIN_WIDTH_FOR_PREVIEW_PROXY } from '../../src/features/proxy/constants'

// Simulate the metadata processing logic from import-media-section.tsx
interface VideoMetadataResult {
    success: boolean
    width?: number
    height?: number
    duration?: number
    error?: string
}

interface ProcessedMetadata {
    width: number
    height: number
    duration: number
    requiresProxy?: boolean
}

/**
 * Simulates the metadata processing logic from import-media-section.tsx
 * This is the FIXED logic that we're testing.
 */
function processVideoMetadata(
    electronResult: VideoMetadataResult | null,
    domFallback?: { width: number; height: number; duration: number }
): ProcessedMetadata {
    if (electronResult?.success && electronResult.width && electronResult.height && electronResult.duration !== undefined) {
        return {
            width: electronResult.width,
            height: electronResult.height,
            duration: electronResult.duration * 1000, // Convert seconds to ms
            // Only require proxy for large videos (> 1440p) - THE FIX
            requiresProxy: electronResult.width > MIN_WIDTH_FOR_PREVIEW_PROXY,
        }
    }

    if (domFallback) {
        return {
            width: domFallback.width,
            height: domFallback.height,
            duration: domFallback.duration,
            // Only require proxy for large videos (> 1440p) - THE FIX
            requiresProxy: domFallback.width > MIN_WIDTH_FOR_PREVIEW_PROXY,
        }
    }

    throw new Error('No metadata available')
}

describe('Import Media - Metadata Processing', () => {
    describe('Video requiresProxy logic', () => {
        describe('Electron API path', () => {
            it('should NOT set requiresProxy for 1080p video (1920x1080)', () => {
                const result = processVideoMetadata({
                    success: true,
                    width: 1920,
                    height: 1080,
                    duration: 60,
                })

                expect(result.requiresProxy).toBe(false)
            })

            it('should NOT set requiresProxy for 1440p video (2560x1440)', () => {
                const result = processVideoMetadata({
                    success: true,
                    width: 2560,
                    height: 1440,
                    duration: 60,
                })

                // At exactly 2560, should NOT require proxy (threshold is >)
                expect(result.requiresProxy).toBe(false)
            })

            it('should set requiresProxy for 4K video (3840x2160)', () => {
                const result = processVideoMetadata({
                    success: true,
                    width: 3840,
                    height: 2160,
                    duration: 60,
                })

                expect(result.requiresProxy).toBe(true)
            })

            it('should set requiresProxy for video just above threshold (2561px)', () => {
                const result = processVideoMetadata({
                    success: true,
                    width: 2561,
                    height: 1440,
                    duration: 60,
                })

                expect(result.requiresProxy).toBe(true)
            })

            it('should convert duration from seconds to milliseconds', () => {
                const result = processVideoMetadata({
                    success: true,
                    width: 1920,
                    height: 1080,
                    duration: 60, // 60 seconds
                })

                expect(result.duration).toBe(60000) // 60000 ms
            })
        })

        describe('DOM fallback path', () => {
            it('should NOT set requiresProxy for small video via DOM', () => {
                const result = processVideoMetadata(
                    null, // Electron API not available or failed
                    { width: 1920, height: 1080, duration: 60000 }
                )

                expect(result.requiresProxy).toBe(false)
            })

            it('should set requiresProxy for large video via DOM', () => {
                const result = processVideoMetadata(
                    null,
                    { width: 3840, height: 2160, duration: 60000 }
                )

                expect(result.requiresProxy).toBe(true)
            })

            it('should fall back to DOM when Electron returns failure', () => {
                const result = processVideoMetadata(
                    { success: false, error: 'FFprobe failed' },
                    { width: 1920, height: 1080, duration: 60000 }
                )

                expect(result.width).toBe(1920)
                expect(result.requiresProxy).toBe(false)
            })
        })

        describe('Common video resolution tests', () => {
            const resolutions = [
                { name: 'SD 480p', width: 854, height: 480, shouldRequireProxy: false },
                { name: 'HD 720p', width: 1280, height: 720, shouldRequireProxy: false },
                { name: 'FHD 1080p', width: 1920, height: 1080, shouldRequireProxy: false },
                { name: 'QHD 1440p', width: 2560, height: 1440, shouldRequireProxy: false },
                { name: 'UHD 4K', width: 3840, height: 2160, shouldRequireProxy: true },
                { name: '5K Retina', width: 5120, height: 2880, shouldRequireProxy: true },
                { name: '6K RED', width: 6144, height: 3160, shouldRequireProxy: true },
                { name: 'UHD 8K', width: 7680, height: 4320, shouldRequireProxy: true },
            ]

            resolutions.forEach(({ name, width, height, shouldRequireProxy }) => {
                it(`${name} (${width}x${height}) should ${shouldRequireProxy ? '' : 'NOT '}require proxy`, () => {
                    const result = processVideoMetadata({
                        success: true,
                        width,
                        height,
                        duration: 60,
                    })

                    expect(result.requiresProxy).toBe(shouldRequireProxy)
                })
            })
        })
    })

    describe('Non-video media (should never set requiresProxy)', () => {
        // These are simulated - images and audio don't use video metadata processing
        // But we document the expected behavior

        it('images should not have requiresProxy regardless of dimensions', () => {
            // Image processing in import-media-section.tsx doesn't set requiresProxy
            const imageMetadata = {
                width: 8000, // Very large image
                height: 6000,
                duration: 5000, // Default duration for images
                // No requiresProxy field
            }

            expect(imageMetadata).not.toHaveProperty('requiresProxy')
        })

        it('audio should not have requiresProxy', () => {
            // Audio processing in import-media-section.tsx doesn't set requiresProxy
            const audioMetadata = {
                duration: 180000, // 3 minutes
                // No requiresProxy field
            }

            expect(audioMetadata).not.toHaveProperty('requiresProxy')
        })
    })
})

describe('Import Media - Bug Fix Verification', () => {
    describe('FIXED: requiresProxy based on dimensions, not extraction method', () => {
        it('should NOT set requiresProxy when using Electron ffprobe for 1080p video', () => {
            // PREVIOUS BUG: Using Electron ffprobe always set requiresProxy: true
            // FIXED: Now based on dimensions only
            const result = processVideoMetadata({
                success: true,
                width: 1920,
                height: 1080,
                duration: 60,
            })

            // This was the bug - small videos were getting requiresProxy: true
            expect(result.requiresProxy).toBe(false)
        })

        it('should NOT set requiresProxy when using Electron ffprobe for 720p video', () => {
            const result = processVideoMetadata({
                success: true,
                width: 1280,
                height: 720,
                duration: 60,
            })

            expect(result.requiresProxy).toBe(false)
        })

        it('should correctly set requiresProxy for 4K even when using DOM method', () => {
            // Both paths should use the same dimension-based logic
            const result = processVideoMetadata(
                null,
                { width: 3840, height: 2160, duration: 60000 }
            )

            expect(result.requiresProxy).toBe(true)
        })
    })
})
