import { ipcMain, app, dialog } from 'electron'
import path from 'path'
import { getBundleLocation } from './export/bundle-manager'
import { resolveVideoUrls, resolveMetadataUrls, extractClipsFromSegments, extractEffectsFromSegments, downsampleRecordingMetadata, isExportInProgress } from './export/index'
import { getRecordingsDirectory } from '../config'
import { getVideoServer } from '../video-http-server'
import { killRemotionChromiumProcesses } from '../utils/remotion-chromium-cleanup'

export function setupThumbnailHandler() {
    ipcMain.handle('generate-thumbnail', async (event, { segments, recordings, metadata, settings, projectFilePath, frame, outputPath, preferOffthreadVideo, cleanupAfterRender }) => {
        const shouldCleanup = cleanupAfterRender !== false
        try {
            console.log('[Thumbnail] Generating thumbnail at frame:', frame)

            const projectFolder = projectFilePath ? path.dirname(projectFilePath) : undefined

            // 1. Resolve output path (prefer renderer-provided path to avoid modal blocking)
            let filePath = outputPath as string | undefined
            if (!filePath) {
                const { canceled, filePath: selectedPath } = await dialog.showSaveDialog({
                    title: 'Save Thumbnail',
                    defaultPath: path.join(app.getPath('desktop'), `thumbnail-${Date.now()}`),
                    filters: [
                        { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }
                    ]
                })

                if (canceled || !selectedPath) {
                    return { success: false, canceled: true }
                }
                filePath = selectedPath
            }

            // 2. Prepare input props (similar to export)
            const bundleLocation = await getBundleLocation()
            const { renderStill, selectComposition } = await import('@remotion/renderer')

            // Start video server if not running
            await getVideoServer()

            const recordingsDir = getRecordingsDirectory()
            const { videoUrls, videoFilePaths } = await resolveVideoUrls(recordings, projectFolder, recordingsDir)
            const metadataUrls = await resolveMetadataUrls(recordings, projectFolder, recordingsDir)

            // Prepare clips and effects
            const allClips = extractClipsFromSegments(segments)
            const segmentEffects = extractEffectsFromSegments(segments)

            // Downsample recordings
            const fps = settings.framerate || 30
            const recordingsEntries = Array.from(new Map(recordings).entries())
            const downsampledRecordings = recordingsEntries
                .map(([id, recording]) => {
                    const base = recording && typeof recording === 'object' ? recording : {}
                    return downsampleRecordingMetadata({ ...(base as any), id }, fps)
                })

            const nativeSourceWidth = downsampledRecordings.reduce((max, r: any) => Math.max(max, r?.width || 0), 0) || 1920
            const nativeSourceHeight = downsampledRecordings.reduce((max, r: any) => Math.max(max, r?.height || 0), 0) || 1080

            const recordingEffects = downsampledRecordings.flatMap((r: any) => r.effects || [])
            const allEffects = (() => {
                const merged = [...segmentEffects, ...recordingEffects]
                const seen = new Set<string>()
                return merged.filter((e: any) => {
                    const id = e?.id
                    if (!id || seen.has(id)) return false
                    seen.add(id)
                    return true
                })
            })()

            const inputProps = {
                clips: allClips,
                recordings: downsampledRecordings,
                effects: allEffects,
                videoWidth: settings.resolution?.width || 1920,
                videoHeight: settings.resolution?.height || 1080,
                sourceVideoWidth: nativeSourceWidth,
                sourceVideoHeight: nativeSourceHeight,
                fps,
                metadata: Object.fromEntries(metadata instanceof Map ? metadata : new Map(metadata)),
                projectFolder,

                resources: {
                    videoUrls,
                    videoUrlsHighRes: videoUrls,
                    videoFilePaths,
                    metadataUrls,
                },

                playback: {
                    isPlaying: false,
                    isScrubbing: false,
                    isHighQualityPlaybackEnabled: true,
                    previewMuted: true,
                    previewVolume: 1,
                },

                renderSettings: {
                    isGlowMode: false,
                    preferOffthreadVideo: preferOffthreadVideo ?? false,
                    enhanceAudio: false,
                    isEditingCrop: false,
                },

                cropSettings: {
                    cropData: null,
                },

                zoomSettings: {
                    isEditing: false,
                    zoomData: null,
                },
            }

            // 3. Select composition and render still
            console.log('[Thumbnail] Selecting composition...')
            const composition = await selectComposition({
                serveUrl: bundleLocation,
                id: 'TimelineComposition',
                inputProps
            })

            console.log('[Thumbnail] Rendering still...')
            await renderStill({
                composition,
                serveUrl: bundleLocation,
                frame,
                output: filePath,
                imageFormat: filePath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg',
                timeoutInMilliseconds: 30000, // 30s timeout
            })

            console.log('[Thumbnail] Saved to:', filePath)
            return { success: true, filePath }

        } catch (error) {
            console.error('[Thumbnail] Error generating thumbnail:', error)
            return { success: false, error: error instanceof Error ? error.message : String(error) }
        } finally {
            if (!shouldCleanup) {
                return
            }

            if (global.gc) {
                global.gc()
            }

            if (!isExportInProgress()) {
                const killStats = killRemotionChromiumProcesses({ graceMs: 0 })
                if (killStats.matched > 0) {
                    console.log('[Thumbnail] Cleaned up Chromium processes', killStats)
                }
            }
        }
    })
}
