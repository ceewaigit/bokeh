import type { Effect, Recording, RecordingMetadata, Clip, ZoomEffectData } from '@/types/project'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import { ZoomDetector } from '@/features/effects/utils/zoom-detector'

export interface EffectGenerationConfig {
    // Idle detection
    minIdleDurationMs: number        // Minimum idle duration to detect (ms), default: 5000

    // Zoom detection
    auto3DThreshold: number          // Minimum zoom scale to trigger auto 3D effect, default: 2.2
    auto3DImportanceThreshold: number // Minimum importance score to trigger 3D effect, default: 0.85
    defaultZoomScale: number         // Default scale for detected zoom blocks, default: 2.0
    maxZoomsPerMinute: number        // Maximum number of zoom blocks per minute, default: 4
    minZoomGapMs: number             // Minimum gap between zoom blocks (ms), default: 6000

    // Easing
    defaultIntroMs: number           // Default zoom in duration (ms), default: 300
    defaultOutroMs: number           // Default zoom out duration (ms), default: 300
}

export const DEFAULT_EFFECT_GENERATION_CONFIG: EffectGenerationConfig = {
    minIdleDurationMs: 5000,
    auto3DThreshold: 2.3,            // Only deep zooms get 3D
    auto3DImportanceThreshold: 0.9,  // Very selective 3D
    defaultZoomScale: 2.0,
    maxZoomsPerMinute: 5,            // Catches meaningful clicks
    minZoomGapMs: 5000,              // 5 seconds between zooms
    defaultIntroMs: 800,
    defaultOutroMs: 800
}

export interface GeneratedEffects {
    zoomEffects: Effect[]
    screenEffects: Effect[]
}

/**
 * Pure function to detect zoom effects from recording data
 */
export function detectZoomEffects(
    recording: Recording,
    clip: Clip,
    config: EffectGenerationConfig = DEFAULT_EFFECT_GENERATION_CONFIG,
    metadata?: RecordingMetadata
): GeneratedEffects {
    const zoomEffects: Effect[] = []
    const screenEffects: Effect[] = []

    const effectiveMetadata = metadata ?? recording.metadata
    const zoomDetector = new ZoomDetector()
    const zoomBlocks = zoomDetector.detectZoomBlocks(
        effectiveMetadata?.mouseEvents || [],
        recording.width || 1920,
        recording.height || 1080,
        recording.duration,
        // Pass additional events for action-based detection
        effectiveMetadata?.clickEvents || [],
        effectiveMetadata?.keyboardEvents || [],
        effectiveMetadata?.scrollEvents || [],
        // Pass runtime config from UI
        {
            maxZoomsPerMinute: config.maxZoomsPerMinute,
            minZoomGapMs: config.minZoomGapMs
        }
    )

    const sourceIn = clip.sourceIn || 0
    const playbackRate = clip.playbackRate || 1
    const clipStart = clip.startTime

    if (zoomBlocks.length === 0) {
        const timelineStart = clip.startTime
        const timelineEnd = clip.startTime + clip.duration
        if (timelineEnd > timelineStart) {
            const zoomEffect: Effect = {
                id: `zoom-fill-${recording.id}-${Math.round(timelineStart)}`,
                type: EffectType.Zoom,
                startTime: Math.max(0, timelineStart),
                endTime: Math.max(timelineStart + 100, timelineEnd),
                data: {
                    origin: 'auto',
                    scale: 5,
                    introMs: config.defaultIntroMs,
                    outroMs: config.defaultOutroMs,
                    smoothing: 50,
                    followStrategy: ZoomFollowStrategy.Center,
                    autoScale: 'fill'
                } as ZoomEffectData,
                enabled: true
            }
            zoomEffects.push(zoomEffect)
        }

        return { zoomEffects, screenEffects }
    }

    zoomBlocks.forEach((block, index) => {
        const timelineStart = clipStart + (block.startTime - sourceIn) / playbackRate
        const timelineEnd = clipStart + (block.endTime - sourceIn) / playbackRate

        // Create zoom effect
        const zoomEffect: Effect = {
            id: `zoom-timeline-${Date.now()}-${recording.id}-${index}`,
            type: EffectType.Zoom,
            startTime: Math.max(0, timelineStart),
            endTime: Math.max(timelineStart + 100, timelineEnd),
            data: {
                origin: 'auto',
                scale: block.scale || config.defaultZoomScale,
                targetX: block.targetX,
                targetY: block.targetY,
                screenWidth: block.screenWidth,
                screenHeight: block.screenHeight,
                introMs: block.introMs || config.defaultIntroMs,
                outroMs: block.outroMs || config.defaultOutroMs,
                smoothing: 0.1,
                followStrategy: ZoomFollowStrategy.Mouse
            } as ZoomEffectData,
            enabled: true
        }

        zoomEffects.push(zoomEffect)
    })

    return { zoomEffects, screenEffects }
}
