import { EffectLayerType } from '@/features/effects/types'
import type { Effect, ZoomEffectData } from '@/types/project'
import { ZoomFollowStrategy } from '@/types/project'
import type { EffectTrackConfig } from '@/features/ui/timeline/effect-track-registry'
import { ZOOM_TRANSITION_CONFIG, CAMERA_CONFIG } from '@/shared/config/physics-config'

// ============================================================================
// SINGLE SOURCE OF TRUTH FOR ZOOM DEFAULTS
// Import these constants instead of hardcoding values elsewhere
// ============================================================================
export const DEFAULT_MOUSE_IDLE_PX = 6           // Jitter filter threshold (px) - filters trackpad noise
export const DEFAULT_DEAD_ZONE_RATIO = CAMERA_CONFIG.deadZoneRatio  // Camera dead zone (0-1)
export const DEFAULT_ZOOM_SCALE = 2.0
export const DEFAULT_ZOOM_SMOOTHING = 50

// Default zoom data (uses constants above)
export const DEFAULT_ZOOM_DATA: ZoomEffectData = {
    origin: 'manual',
    scale: DEFAULT_ZOOM_SCALE,
    introMs: ZOOM_TRANSITION_CONFIG.defaultIntroMs,
    outroMs: ZOOM_TRANSITION_CONFIG.defaultOutroMs,
    smoothing: DEFAULT_ZOOM_SMOOTHING,
    zoomMode: 'simple',  // Simple frame-scale zoom by default
    followStrategy: ZoomFollowStrategy.Mouse,
    mouseIdlePx: DEFAULT_MOUSE_IDLE_PX,
    deadZoneRatio: DEFAULT_DEAD_ZONE_RATIO,
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
            ...DEFAULT_ZOOM_DATA
        })
    }
}
