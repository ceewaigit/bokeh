import { EffectLayerType } from '@/types/effects'
import type { Effect, ZoomEffectData } from '@/types/project'
import { ZoomFollowStrategy } from '@/types/project'

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
export const zoomTrackConfig = {
    label: 'Zoom',
    order: 0,
    colorKey: 'zoomBlock' as const,
    layerType: EffectLayerType.Zoom,
    getBlockLabel: (effect: Effect) => {
        const data = effect.data as ZoomEffectData
        if (data.autoScale === 'fill') return 'Fill'
        return `${data.scale?.toFixed(1) ?? '1.0'}×`
    }
}
