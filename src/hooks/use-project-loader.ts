import { useState, useCallback } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { ProjectIOService } from '@/lib/storage/project-io-service'
import { TimelineDataService } from '@/lib/timeline/timeline-data-service'
import { initializeDefaultWallpaper } from '@/lib/constants/default-effects'
import { calculateFullCameraPath } from '@/lib/effects/utils/camera-path-calculator'
import { EffectStore } from '@/lib/core/effects'
import { getZoomEffects } from '@/lib/effects/effect-filters'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
import { useRecordingsLibraryStore } from '@/stores/recordings-library-store'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'

export function useProjectLoader() {
    const [isLoading, setIsLoading] = useState(false)
    const [loadingMessage, setLoadingMessage] = useState('Loading...')

    const newProject = useProjectStore((s) => s.newProject)
    const setProject = useProjectStore((s) => s.setProject)
    const setCameraPathCache = useProjectStore((s) => s.setCameraPathCache)
    const setAutoZoom = useProjectStore((s) => s.setAutoZoom)
    const setPreviewReady = useProjectStore((s) => s.setPreviewReady)
    const clearLibrary = useRecordingsLibraryStore((s) => s.clearLibrary)

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
            const project = await ProjectIOService.loadProjectFromRecording(recording, {
                onProgress: setLoadingMessage
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
            const fps = TimelineDataService.getFps(project)
            const recordingsMap = TimelineDataService.getRecordingsMap(project)
            const frameLayout = TimelineDataService.getFrameLayout(project, fps)

            // Run the heavy calculation
            const cameraPath = calculateFullCameraPath({
                frameLayout,
                fps,
                videoWidth: project.settings.resolution.width,
                videoHeight: project.settings.resolution.height,
                effects: EffectStore.getAll(project),
                getRecording: (id) => recordingsMap.get(id),
                loadedMetadata: undefined
            })

            // Store in cache
            if (cameraPath) {
                setCameraPathCache(cameraPath)
            }

            const viewportWidth = window.innerWidth
            const allZoomEffects = getZoomEffects(EffectStore.getAll(project))
            const zoomBlocks = allZoomEffects.map((e: any) => ({
                startTime: e.startTime,
                endTime: e.endTime
            }))
            const adaptiveLimits = TimeConverter.calculateAdaptiveZoomLimits(
                project.timeline.duration,
                viewportWidth,
                zoomBlocks,
                TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX
            )

            // Calculate optimal zoom and clamp to adaptive limits
            const optimalZoom = TimeConverter.calculateOptimalZoom(project.timeline.duration, viewportWidth)
            const clampedZoom = Math.max(adaptiveLimits.min, Math.min(adaptiveLimits.max, optimalZoom))
            setAutoZoom(clampedZoom)

            // Clear library data to free memory once the workspace is ready
            clearLibrary()
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
    }, [newProject, setProject, setCameraPathCache, setAutoZoom, setPreviewReady, clearLibrary])

    return {
        isLoading,
        loadingMessage,
        loadRecording
    }
}
