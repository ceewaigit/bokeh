import { useState, useCallback } from 'react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { ProjectIOService } from '@/features/core/storage/project-io-service'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { initializeDefaultWallpaper } from '@/features/effects/background'
import { calculateFullCameraPath } from '@/features/ui/editor/logic/viewport/logic/path-calculator'
import { EffectStore } from '@/features/effects/core/store'
import { ThumbnailGenerator } from '@/shared/utils/thumbnail-generator'
import { calculateCanvasDimensions } from '@/shared/constants/aspect-ratio-presets'
import { AspectRatioPreset } from '@/types/project'

/**
 * Project Loader Hook
 * 
 * Timeline-Centric Architecture:
 * - Clips are NOT sliced based on transcript edits
 * - Hidden regions are handled by the player sync via getGlobalTimelineSkips()
 */
export function useProjectLoader() {
    const [isLoading, setIsLoading] = useState(false)
    const [loadingMessage, setLoadingMessage] = useState('Loading...')

    const newProject = useProjectStore((s) => s.newProject)
    const setProject = useProjectStore((s) => s.setProject)
    const setCameraPathCache = useProjectStore((s) => s.setCameraPathCache)
    const setPreviewReady = useProjectStore((s) => s.setPreviewReady)

    const loadRecording = useCallback(async (
        recording: any,
        setLastSavedAt: (date: string | null) => void
    ) => {
        setIsLoading(true)
        setPreviewReady(false)
        setLoadingMessage('Loading recording...')

        try {
            // Initialize wallpaper if not already done
            await initializeDefaultWallpaper()

            // Use centralized ProjectIOService for project loading
            // awaitPlaybackPreparation: true ensures loading blocks until proxy is ready
            const project = await ProjectIOService.loadProject(recording, {
                onProgress: setLoadingMessage,
                awaitPlaybackPreparation: true
            })

            // Create project in store
            setLoadingMessage('Creating project...')
            newProject(project.name)

            // Set last saved timestamp to the project's modified time
            setLastSavedAt(project.modifiedAt || new Date().toISOString())

            // Set the project ONCE after all recordings are processed
            setProject(project)

            // Pre-compute camera path for smooth playback
            setLoadingMessage('Optimizing playback...')

            // Build frame layout once using centralized service
            // Timeline-Centric: use raw video clips (no slicing)
            const fps = TimelineDataService.getFps(project)
            const recordingsMap = TimelineDataService.getRecordingsMap(project)
            const videoClips = TimelineDataService.getVideoClips(project)
            const frameLayout = TimelineDataService.getFrameLayout(project, fps, videoClips)

            // Run the heavy calculation
            const canvasSettings = project.settings.canvas
            const aspectRatioPreset = canvasSettings?.aspectRatio ?? AspectRatioPreset.Original
            const sourceDimensions = TimelineDataService.getSourceDimensions(project)
            const canvasDimensions = calculateCanvasDimensions(
                aspectRatioPreset,
                1080, // base resolution
                canvasSettings?.customWidth,
                canvasSettings?.customHeight,
                sourceDimensions.width,
                sourceDimensions.height
            )

            const cameraPath = calculateFullCameraPath({
                frameLayout,
                fps,
                // Important: Camera path must match the timeline canvas, not the raw recording resolution.
                // Preview and renderer use `videoWidth/videoHeight` from TimelineComposition props.
                videoWidth: canvasDimensions.width,
                videoHeight: canvasDimensions.height,
                effects: EffectStore.getAll(project),
                getRecording: (id) => recordingsMap.get(id),
                loadedMetadata: undefined,
                cameraSettings: project.settings.camera
            })

            // Store in cache
            if (cameraPath) {
                setCameraPathCache(cameraPath, {
                    width: canvasDimensions.width,
                    height: canvasDimensions.height,
                })
            }

            // Auto-zoom is handled by the timeline layout (uses real container width).

            // NOTE: Library thumbnails are NOT cleared - they persist for instant
            // navigation back to the library. Only the generator cache is cleared.
            ThumbnailGenerator.clearAllCache()

            // Hide record button when entering workspace
            if ((window as any).electronAPI?.minimizeRecordButton) {
                (window as any).electronAPI.minimizeRecordButton()
            }

            setIsLoading(false)
            setLoadingMessage('Loading...')

            return true
        } catch (error) {
            console.error('Failed to load project:', error)
            alert(error instanceof Error ? error.message : 'Failed to load project')
            setIsLoading(false)
            setPreviewReady(false)
            return false
        }
    }, [newProject, setProject, setCameraPathCache, setPreviewReady])

    return {
        isLoading,
        loadingMessage,
        loadRecording,
    }
}
