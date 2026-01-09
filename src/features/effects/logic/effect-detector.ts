import type { Effect, Recording, RecordingMetadata, Clip, ZoomEffectData } from '@/types/project'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import { ZoomDetector } from '@/features/effects/utils/zoom-detector'
import { ZOOM_TRANSITION_CONFIG } from '@/shared/config/physics-config'

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
    defaultIntroMs: ZOOM_TRANSITION_CONFIG.defaultIntroMs,
    defaultOutroMs: ZOOM_TRANSITION_CONFIG.defaultOutroMs
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
    const sourceIn = clip.sourceIn || 0
    const sourceOut = clip.sourceOut ?? recording.duration
    const clampedSourceOut = Math.min(recording.duration, Math.max(sourceIn, sourceOut))
    const sourceWindowDuration = Math.max(0, clampedSourceOut - sourceIn)

    const mouseEventsWindow = (effectiveMetadata?.mouseEvents || [])
        .filter(e => e.timestamp >= sourceIn && e.timestamp <= clampedSourceOut)
        .map(e => ({ ...e, timestamp: e.timestamp - sourceIn }))

    const clickEventsWindow = (effectiveMetadata?.clickEvents || [])
        .filter(e => e.timestamp >= sourceIn && e.timestamp <= clampedSourceOut)
        .map(e => ({ ...e, timestamp: e.timestamp - sourceIn }))

    const keyboardEventsWindow = (effectiveMetadata?.keyboardEvents || [])
        .filter(e => e.timestamp >= sourceIn && e.timestamp <= clampedSourceOut)
        .map(e => ({ ...e, timestamp: e.timestamp - sourceIn }))

    const scrollEventsWindow = (effectiveMetadata?.scrollEvents || [])
        .filter(e => e.timestamp >= sourceIn && e.timestamp <= clampedSourceOut)
        .map(e => ({ ...e, timestamp: e.timestamp - sourceIn }))

    const zoomBlocks = sourceWindowDuration > 0
        ? zoomDetector.detectZoomBlocks(
            mouseEventsWindow,
            recording.width || 1920,
            recording.height || 1080,
            sourceWindowDuration,
            // Pass additional events for action-based detection
            clickEventsWindow,
            keyboardEventsWindow,
            scrollEventsWindow,
            // Pass runtime config from UI
            {
                maxZoomsPerMinute: config.maxZoomsPerMinute,
                minZoomGapMs: config.minZoomGapMs
            }
        )
        : []

    const playbackRate = clip.playbackRate || 1
    const clipStart = clip.startTime

    if (zoomBlocks.length === 0) return { zoomEffects, screenEffects }

    const clipEnd = clipStart + clip.duration

    zoomBlocks.forEach((block, index) => {
        // Zoom blocks are generated in the clip's source-time window (0..sourceWindowDuration),
        // so mapping to timeline is just a playbackRate conversion.
        const timelineStart = clipStart + block.startTime / playbackRate
        const timelineEnd = clipStart + block.endTime / playbackRate

        // Create zoom effect
        const startTime = Math.max(clipStart, timelineStart)
        const endTime = Math.min(clipEnd, timelineEnd)
        if (endTime <= startTime) return

        const zoomEffect: Effect = {
            id: `zoom-timeline-${Date.now()}-${recording.id}-${index}`,
            type: EffectType.Zoom,
            startTime,
            endTime,
            data: {
                origin: 'auto',
                scale: block.scale || config.defaultZoomScale,
                targetX: block.targetX,
                targetY: block.targetY,
                screenWidth: block.screenWidth,
                screenHeight: block.screenHeight,
                introMs: block.introMs || config.defaultIntroMs,
                outroMs: block.outroMs || config.defaultOutroMs,
                smoothing: 50,
                followStrategy: ZoomFollowStrategy.Mouse,
                mouseIdlePx: 3
            } as ZoomEffectData,
            enabled: true
        }

        zoomEffects.push(zoomEffect)
    })

    return { zoomEffects, screenEffects }
}
