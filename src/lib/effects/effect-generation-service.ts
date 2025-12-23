/**
 * Effect Generation Service
 * 
 * Central orchestrator for generating auto-detected effects from recording data.
 * - Zoom effects from action detection (clicks, typing, scrolls)
 * - Auto 3D screen effects for high-importance zooms
 * - Keystroke effects from keyboard events
 */

import type { Effect, Recording, RecordingMetadata, Clip, Project, ZoomEffectData } from '@/types/project'
import { EffectType, ScreenEffectPreset, ZoomFollowStrategy } from '@/types/project'
import { ZoomDetector } from './utils/zoom-detector'
import { EffectsFactory } from './effects-factory'
import { DEFAULT_MOCKUP_DATA } from '@/lib/constants/device-mockups'

/**
 * Configuration for effect generation
 * Allows users to customize how effects are auto-detected
 */
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
    defaultIntroMs: 400,
    defaultOutroMs: 400
}

export interface GeneratedEffects {
    zoomEffects: Effect[]
    screenEffects: Effect[]
}

export class EffectGenerationService {

    /**
     * Generate zoom and auto 3D screen effects for a recording
     * Returns effects in timeline-space, ready to be added to project
     */
    static generateZoomEffects(
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
                        scale: 1,
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

            // Auto 3D: Create Screen effect only for high-importance, deep zooms
            // Requires both scale threshold AND importance threshold for more selective 3D
            const hasHighImportance = (block.importance ?? 0) >= config.auto3DImportanceThreshold
            const hasDeepZoom = block.scale >= config.auto3DThreshold

            if (hasDeepZoom && hasHighImportance) {
                const screenEffect: Effect = {
                    id: `screen-auto-${zoomEffect.id}`,
                    type: EffectType.Screen,
                    startTime: zoomEffect.startTime,
                    endTime: zoomEffect.endTime,
                    data: {
                        preset: ScreenEffectPreset.Window,
                        introMs: block.introMs || config.defaultIntroMs,
                        outroMs: block.outroMs || config.defaultOutroMs
                    },
                    enabled: true
                }
                screenEffects.push(screenEffect)
            }
        })

        return { zoomEffects, screenEffects }
    }

    /**
     * Regenerate all auto-detected effects for a project
     * Clears existing zoom, auto-screen, and keystroke effects, then regenerates
     * Also re-runs idle detection with the provided config
     */
    static regenerateAllEffects(
        project: Project,
        config: EffectGenerationConfig = DEFAULT_EFFECT_GENERATION_CONFIG,
        metadataByRecordingId?: Map<string, RecordingMetadata>
    ): void {
        // Import idle detector dynamically to avoid circular deps
        const { IdleActivityDetector } = require('@/lib/timeline/activity-detection/idle-detector')

        // Clear existing auto-generated effects
        project.timeline.effects = (project.timeline.effects || []).filter(e => {
            // Keep background and cursor effects
            if (e.type === EffectType.Background || e.type === EffectType.Cursor) return true
            // Remove screen effects that were auto-generated (have 'screen-auto-' prefix)
            if (e.type === EffectType.Screen && e.id.startsWith('screen-auto-')) return false
            // Keep manually created screen effects
            if (e.type === EffectType.Screen) return true
            // Remove all zoom and keystroke effects
            if (e.type === EffectType.Zoom || e.type === EffectType.Keystroke) return false
            // Remove all crop effects (reset framing to default)
            if (e.type === EffectType.Crop) return false
            // Keep everything else
            return true
        })

        // Reset device mockup framing back to defaults (preserve other background settings).
        const backgroundEffect = project.timeline.effects.find(e => e.type === EffectType.Background)
        if (backgroundEffect?.data) {
            backgroundEffect.data = {
                ...(backgroundEffect.data as Record<string, unknown>),
                mockup: { ...DEFAULT_MOCKUP_DATA }
            } as any
        }

        // STEP 1: Reset clips to original state for each recording
        // This merges any split clips back into a single full-length clip at 1x speed
        for (const track of project.timeline.tracks) {
            // Group clips by recording
            const clipsByRecording = new Map<string, Clip[]>()
            for (const clip of track.clips) {
                const existing = clipsByRecording.get(clip.recordingId) || []
                existing.push(clip)
                clipsByRecording.set(clip.recordingId, existing)
            }

            // For each recording with clips, replace all clips with a single original clip
            for (const [recordingId, clips] of clipsByRecording) {
                const recording = project.recordings.find(r => r.id === recordingId)
                if (!recording) continue

                // Find the earliest start time among all clips for this recording
                const earliestStartTime = Math.min(...clips.map(c => c.startTime))

                // Remove all clips for this recording from track
                track.clips = track.clips.filter(c => c.recordingId !== recordingId)

                // Create a fresh clip with full source range at 1x speed
                const freshClip: Clip = {
                    id: `clip-${Date.now()}-${recordingId}`,
                    recordingId: recording.id,
                    startTime: earliestStartTime,
                    duration: recording.duration,  // Full recording duration
                    sourceIn: 0,
                    sourceOut: recording.duration,
                    playbackRate: 1
                }

                track.clips.push(freshClip)
            }

            // Sort clips by start time
            track.clips.sort((a, b) => a.startTime - b.startTime)
        }

        // Recalculate timeline duration
        const allClips = project.timeline.tracks.flatMap(t => t.clips)
        if (allClips.length > 0) {
            project.timeline.duration = Math.max(...allClips.map(c => c.startTime + c.duration))
        }

        // Regenerate effects for each recording
        for (const recording of project.recordings) {
            const metadataFromMap = metadataByRecordingId?.get(recording.id)
            let effectiveMetadata = metadataFromMap ?? recording.metadata
            if (effectiveMetadata && !Object.isExtensible(effectiveMetadata)) {
                effectiveMetadata = { ...effectiveMetadata } as RecordingMetadata
                if (metadataFromMap) {
                    metadataByRecordingId?.set(recording.id, effectiveMetadata)
                } else if (recording.metadata) {
                    recording.metadata = effectiveMetadata
                }
            }
            // Clear cached idle periods so they get re-detected with new config
            if (effectiveMetadata) {
                delete effectiveMetadata.detectedIdlePeriods
            }

            // Re-run idle detection with custom config and cache the results
            const idleDetector = new IdleActivityDetector()
            const idleConfig = {
                minIdleDurationMs: config.minIdleDurationMs,
                mouseVelocityThreshold: 5,     // Default
                defaultSpeedMultiplier: 2.5,   // Default
                maxSpeedMultiplier: 3.0        // Default
            }
            const idleSuggestions = idleDetector.analyzeWithConfig(recording, idleConfig, effectiveMetadata)

            // Cache the new idle periods
            if (effectiveMetadata && idleSuggestions.periods.length > 0) {
                effectiveMetadata.detectedIdlePeriods = idleSuggestions.periods.map((p: { startTime: number; endTime: number; suggestedSpeedMultiplier: number; confidence: number }) => ({
                    startTime: p.startTime,
                    endTime: p.endTime,
                    suggestedSpeedMultiplier: p.suggestedSpeedMultiplier,
                    confidence: p.confidence
                }))
            }

            const clipForRecording = allClips.find(c => c.recordingId === recording.id)
            if (!clipForRecording) continue

            const { zoomEffects, screenEffects } = this.generateZoomEffects(recording, clipForRecording, config, effectiveMetadata)

            // Add all effects to project
            for (const effect of [...zoomEffects, ...screenEffects]) {
                EffectsFactory.addEffectToProject(project, effect)
            }
        }

        // Regenerate keystroke effects
        EffectsFactory.syncKeystrokeEffects(project, metadataByRecordingId)

        // Mark as modified
        project.modifiedAt = new Date().toISOString()
    }
}
