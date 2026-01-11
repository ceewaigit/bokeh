import { EffectLayerType } from '@/features/effects/types'
import type { Effect, ZoomEffectData } from '@/types/project'
import { ZoomFollowStrategy } from '@/types/project'
import type { EffectTrackConfig } from '@/features/ui/timeline/effect-track-registry'

// Default zoom data
export const DEFAULT_ZOOM_DATA: ZoomEffectData = {
    origin: 'manual',
    scale: 2.0,
    introMs: 800,
    outroMs: 800,
    smoothing: 50,
    followStrategy: ZoomFollowStrategy.Mouse,
    mouseIdlePx: 3
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
            introMs: 800,
            outroMs: 800,
            smoothing: 50,
            followStrategy: ZoomFollowStrategy.Mouse,
            mouseIdlePx: 3
        })
    }
}
