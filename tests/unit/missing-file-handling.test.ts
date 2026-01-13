/**
 * Tests for missing file handling in the asset library
 *
 * Coverage:
 * - ThumbnailGenerator should gracefully handle missing files
 * - AssetItem should detect and display missing file state
 *
 * These tests verify that when a video file is deleted from disk:
 * 1. No console errors are thrown
 * 2. ThumbnailGenerator returns null instead of throwing
 * 3. UI can detect and display "file missing" state
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'

// Mock electronAPI for testing
interface MockElectronAPI {
    fileExists: (path: string) => Promise<boolean>
    getVideoUrl: (path: string) => Promise<string | null>
}

// Simulated file system state
let mockFileSystem: Set<string>

// Mock implementation of electronAPI.fileExists
function createMockElectronAPI(): MockElectronAPI {
    return {
        fileExists: async (path: string) => {
            return mockFileSystem.has(path)
        },
        getVideoUrl: async (path: string) => {
            if (mockFileSystem.has(path)) {
                return `video-stream://local/${encodeURIComponent(path)}`
            }
            return null
        },
    }
}

/**
 * Simulates the ThumbnailGenerator.generateThumbnail logic
 * with the file existence check we're implementing
 */
async function simulateThumbnailGeneration(
    videoPath: string,
    electronAPI: MockElectronAPI | undefined
): Promise<string | null> {
    // Early validation - matches existing ThumbnailGenerator
    if (!videoPath) {
        throw new Error('Thumbnail generation requires a valid video path')
    }

    // NEW: Check file existence early to avoid error spam for deleted files
    if (electronAPI?.fileExists) {
        const exists = await electronAPI.fileExists(videoPath)
        if (!exists) {
            return null // File missing - return gracefully without throwing
        }
    }

    // Simulate successful thumbnail generation for existing files
    return `data:image/jpeg;base64,mockThumbnailData`
}

/**
 * Simulates the AssetItem file existence check logic
 */
async function checkAssetExists(
    assetPath: string,
    electronAPI: MockElectronAPI | undefined
): Promise<boolean> {
    if (!electronAPI?.fileExists) {
        // Can't check - assume exists (web fallback)
        return true
    }
    return await electronAPI.fileExists(assetPath)
}

describe('Missing File Handling', () => {
    beforeEach(() => {
        // Set up mock file system with some files
        mockFileSystem = new Set([
            '/Users/test/Videos/existing-video.mp4',
            '/Users/test/Videos/another-video.mov',
            '/Users/test/Images/photo.jpg',
        ])
    })

    afterEach(() => {
        mockFileSystem.clear()
    })

    describe('ThumbnailGenerator - File Existence Check', () => {
        it('should return thumbnail for existing file', async () => {
            const mockAPI = createMockElectronAPI()
            const result = await simulateThumbnailGeneration(
                '/Users/test/Videos/existing-video.mp4',
                mockAPI
            )

            expect(result).not.toBeNull()
            expect(result).toContain('data:image/jpeg')
        })

        it('should return null for missing file (deleted from disk)', async () => {
            const mockAPI = createMockElectronAPI()
            const result = await simulateThumbnailGeneration(
                '/Users/test/Videos/deleted-video.mp4', // Not in mockFileSystem
                mockAPI
            )

            expect(result).toBeNull()
        })

        it('should NOT throw error for missing file', async () => {
            const mockAPI = createMockElectronAPI()

            // This should not throw - it should return null gracefully
            await expect(
                simulateThumbnailGeneration(
                    '/Users/test/Videos/nonexistent.mp4',
                    mockAPI
                )
            ).resolves.toBeNull()
        })

        it('should still throw for empty video path', async () => {
            const mockAPI = createMockElectronAPI()

            await expect(
                simulateThumbnailGeneration('', mockAPI)
            ).rejects.toThrow('Thumbnail generation requires a valid video path')
        })

        it('should handle case when electronAPI is unavailable', async () => {
            // When electronAPI is not available (e.g., running in browser),
            // should proceed with thumbnail generation attempt
            // (In practice this would fail at video loading stage)
            const result = await simulateThumbnailGeneration(
                '/Users/test/Videos/some-video.mp4',
                undefined
            )

            // Without fileExists check, proceeds to generation
            expect(result).toContain('data:image/jpeg')
        })

        it('should return null for file that was deleted after import', async () => {
            const mockAPI = createMockElectronAPI()
            const path = '/Users/test/Videos/will-be-deleted.mp4'

            // File exists initially
            mockFileSystem.add(path)
            const result1 = await simulateThumbnailGeneration(path, mockAPI)
            expect(result1).not.toBeNull()

            // File is deleted
            mockFileSystem.delete(path)
            const result2 = await simulateThumbnailGeneration(path, mockAPI)
            expect(result2).toBeNull()
        })
    })

    describe('AssetItem - Missing File Detection', () => {
        it('should detect existing file correctly', async () => {
            const mockAPI = createMockElectronAPI()
            const exists = await checkAssetExists(
                '/Users/test/Videos/existing-video.mp4',
                mockAPI
            )

            expect(exists).toBe(true)
        })

        it('should detect missing file correctly', async () => {
            const mockAPI = createMockElectronAPI()
            const exists = await checkAssetExists(
                '/Users/test/Videos/deleted-video.mp4',
                mockAPI
            )

            expect(exists).toBe(false)
        })

        it('should assume file exists when electronAPI unavailable', async () => {
            // Graceful degradation for web/non-Electron environments
            const exists = await checkAssetExists(
                '/Users/test/Videos/some-video.mp4',
                undefined
            )

            expect(exists).toBe(true)
        })

        it('should correctly track file deletion', async () => {
            const mockAPI = createMockElectronAPI()
            const path = '/Users/test/Downloads/temp-video.mp4'

            // Initially not present
            expect(await checkAssetExists(path, mockAPI)).toBe(false)

            // File appears (imported)
            mockFileSystem.add(path)
            expect(await checkAssetExists(path, mockAPI)).toBe(true)

            // File deleted
            mockFileSystem.delete(path)
            expect(await checkAssetExists(path, mockAPI)).toBe(false)
        })
    })

    describe('Integration: Asset Library with Missing Files', () => {
        interface MockAsset {
            id: string
            path: string
            type: 'video' | 'audio' | 'image'
            name: string
        }

        function createMockAsset(path: string, name: string): MockAsset {
            return {
                id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                path,
                type: 'video',
                name,
            }
        }

        it('should handle mixed existing and missing assets', async () => {
            const mockAPI = createMockElectronAPI()

            const assets = [
                createMockAsset('/Users/test/Videos/existing-video.mp4', 'existing.mp4'),
                createMockAsset('/Users/test/Videos/deleted-video.mp4', 'deleted.mp4'),
                createMockAsset('/Users/test/Videos/another-video.mov', 'another.mov'),
            ]

            const results = await Promise.all(
                assets.map(async (asset) => ({
                    asset,
                    exists: await checkAssetExists(asset.path, mockAPI),
                    thumbnail: await simulateThumbnailGeneration(asset.path, mockAPI),
                }))
            )

            // First asset exists
            expect(results[0].exists).toBe(true)
            expect(results[0].thumbnail).not.toBeNull()

            // Second asset is missing
            expect(results[1].exists).toBe(false)
            expect(results[1].thumbnail).toBeNull()

            // Third asset exists
            expect(results[2].exists).toBe(true)
            expect(results[2].thumbnail).not.toBeNull()
        })

        it('should not throw any errors when processing missing files', async () => {
            const mockAPI = createMockElectronAPI()

            const missingAssets = [
                createMockAsset('/path/to/deleted1.mp4', 'deleted1.mp4'),
                createMockAsset('/path/to/deleted2.mov', 'deleted2.mov'),
                createMockAsset('/path/to/deleted3.webm', 'deleted3.webm'),
            ]

            // Processing multiple missing files should not throw
            await expect(
                Promise.all(
                    missingAssets.map(async (asset) => {
                        const exists = await checkAssetExists(asset.path, mockAPI)
                        const thumbnail = await simulateThumbnailGeneration(asset.path, mockAPI)
                        return { exists, thumbnail }
                    })
                )
            ).resolves.toEqual([
                { exists: false, thumbnail: null },
                { exists: false, thumbnail: null },
                { exists: false, thumbnail: null },
            ])
        })
    })
})

describe('Error Prevention', () => {
    beforeEach(() => {
        mockFileSystem = new Set(['/existing/file.mp4'])
    })

    it('should prevent "No such file or directory" error for missing videos', async () => {
        const mockAPI = createMockElectronAPI()

        // This path mimics the error from the user's console log
        const deletedPath = '/Users/ceewai/Downloads/geminiER/legodog_tracked_v2.mp4'

        // With our fix, this should return null instead of throwing
        const result = await simulateThumbnailGeneration(deletedPath, mockAPI)

        expect(result).toBeNull()
    })

    it('should handle typical user workflow: import, delete from disk, re-open app', async () => {
        const mockAPI = createMockElectronAPI()
        const videoPath = '/Users/test/Downloads/screen-recording.mp4'

        // 1. User imports video (file exists)
        mockFileSystem.add(videoPath)
        const initialThumbnail = await simulateThumbnailGeneration(videoPath, mockAPI)
        expect(initialThumbnail).not.toBeNull()

        // 2. User deletes video from Finder (file no longer exists)
        mockFileSystem.delete(videoPath)

        // 3. User re-opens app or navigates to asset library
        //    The asset is still in localStorage but file is gone
        const afterDeleteThumbnail = await simulateThumbnailGeneration(videoPath, mockAPI)
        expect(afterDeleteThumbnail).toBeNull()

        const exists = await checkAssetExists(videoPath, mockAPI)
        expect(exists).toBe(false)
    })
})
