import { EffectLayerType } from '@/features/effects/types'
import type { Effect, ZoomEffectData } from '@/types/project'
import { ZoomFollowStrategy } from '@/types/project'
import type { EffectTrackConfig } from '@/features/ui/timeline/effect-track-registry'
import { ZOOM_TRANSITION_CONFIG } from '@/shared/config/physics-config'

// Default zoom data
export const DEFAULT_ZOOM_DATA: ZoomEffectData = {
    origin: 'manual',
    scale: 2.0,
    introMs: ZOOM_TRANSITION_CONFIG.defaultIntroMs,
    outroMs: ZOOM_TRANSITION_CONFIG.defaultOutroMs,
    smoothing: 50,
    zoomMode: 'simple',  // Simple frame-scale zoom by default
    followStrategy: ZoomFollowStrategy.Mouse,
    mouseIdlePx: 3,
    transitionStyle: 'smoother',  // Smoother easing for better animation
    mouseFollowAlgorithm: 'deadzone',
    zoomIntoCursorMode: 'cursor'
}

// Zoom Track Configuration
export const zoomTrackConfig: EffectTrackConfig = {
    label: 'Zoom',
    order: 0,
    colorKey: 'zoomBlock' as const,
    layerType: EffectLayerType.Zoom,
    getBlockLabel: (effect: Effect) => {
        const data = effect.data as ZoomEffectData
        if (data.autoScale === 'fill') return 'Fill'
        return `${data.scale?.toFixed(1) ?? '1.0'}×`
    },
    alwaysShowTrack: true,
    dragToCreate: {
        enabled: true,
        minDurationMs: 500,
        cursorStyle: 'crosshair',
        createDefaultData: () => ({
            ...DEFAULT_ZOOM_DATA,
            origin: 'manual',
            scale: 2.0,
            introMs: ZOOM_TRANSITION_CONFIG.defaultIntroMs,
            outroMs: ZOOM_TRANSITION_CONFIG.defaultOutroMs,
            smoothing: 50,
            zoomMode: 'simple',
            followStrategy: ZoomFollowStrategy.Mouse,
            mouseIdlePx: 3,
            transitionStyle: 'smoother',
            mouseFollowAlgorithm: 'deadzone',
            zoomIntoCursorMode: 'cursor'
        })
    }
}
