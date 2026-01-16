import type { Project, RecordingMetadata, Clip } from '@/types/project'
import { EffectType, BackgroundType } from '@/types/project'
import { EffectStore } from '@/features/effects/core/effects-store'
import { EffectInitialization } from '@/features/effects/core/initialization'
import { DEFAULT_MOCKUP_DATA } from '@/shared/constants/device-mockups'
import { DEFAULT_CURSOR_DATA } from '@/features/effects/cursor/config'
import { getDefaultWallpaper } from '@/features/effects/background'
import { detectZoomEffects, DEFAULT_EFFECT_GENERATION_CONFIG, type EffectGenerationConfig } from './effect-detector'
import { markModified } from '@/features/core/stores/store-utils'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { TimelineSyncService } from '@/features/effects/sync/timeline-sync-service'

/** Result of regeneration with detected trim opportunities */
export interface RegenerationResult {
    trimSuggestions: Array<{
        recordingId: string
        startSavedMs: number
        endSavedMs: number
        totalSavedMs: number
    }>
}

/**
 * Regenerate all auto-detected effects for a project.
 * Synchronous to allow usage inside Zustand/Immer producers.
 * Dependencies like IdleActivityDetector must be provided by the caller.
 */
export function regenerateProjectEffects(
    project: Project,
    IdleActivityDetector: any,
    config: EffectGenerationConfig = DEFAULT_EFFECT_GENERATION_CONFIG,
    metadataByRecordingId?: Map<string, RecordingMetadata>
): RegenerationResult {
    // Clear existing auto-generated effects using EffectStore
    EffectStore.ensureArray(project)
    const allEffects = EffectStore.getAll(project)

    // Check if there's a valid webcam clip with a valid recording
    const webcamTrack = project.timeline.tracks.find(t => t.type === 'webcam')

    // Clean up orphaned webcam clips (clips without valid recordings)
    if (webcamTrack) {
        webcamTrack.clips = webcamTrack.clips.filter(clip =>
            project.recordings.some(r => r.id === clip.recordingId)
        )
    }

    // Filter to keep only certain effects
    project.timeline.effects = allEffects.filter(e => {
        if (e.type === EffectType.Background || e.type === EffectType.Cursor) return true
        if (e.type === EffectType.Screen && e.id.startsWith('screen-auto-')) return false
        if (e.type === EffectType.Screen) return true
        if (e.type === EffectType.Zoom || e.type === EffectType.Keystroke) return false
        if (e.type === EffectType.Crop) return false
        return true
    })

    // Reset device mockup framing and wallpaper back to defaults
    const backgroundEffect = project.timeline.effects!.find(e => e.type === EffectType.Background)
    if (backgroundEffect?.data) {
        const defaultWallpaper = getDefaultWallpaper()
        backgroundEffect.data = {
            ...(backgroundEffect.data as unknown as Record<string, unknown>),
            mockup: { ...DEFAULT_MOCKUP_DATA },
            // Reset to default wallpaper (Wallpaper 1) if available
            ...(defaultWallpaper ? {
                type: BackgroundType.Wallpaper,
                wallpaper: defaultWallpaper
            } : {})
        } as any
    }

    // Reset cursor effect to defaults
    const cursorEffect = project.timeline.effects!.find(e => e.type === EffectType.Cursor)
    if (cursorEffect) {
        cursorEffect.data = { ...DEFAULT_CURSOR_DATA }
    }

    const trimSuggestions = new Map<string, { recordingId: string; startSavedMs: number; endSavedMs: number; totalSavedMs: number }>()

    for (const track of project.timeline.tracks) {
        const clipsByRecording = new Map<string, Clip[]>()
        for (const clip of track.clips) {
            const existing = clipsByRecording.get(clip.recordingId) || []
            existing.push(clip)
            clipsByRecording.set(clip.recordingId, existing)
        }

        for (const [recordingId, clips] of clipsByRecording) {
            const recording = project.recordings.find(r => r.id === recordingId)
            if (!recording) continue

            const earliestStartTime = Math.min(...clips.map(c => c.startTime))
            track.clips = track.clips.filter(c => c.recordingId !== recordingId)

            const trimMetadata = metadataByRecordingId?.get(recordingId) ?? recording.metadata
            const trimIdleDetector = new IdleActivityDetector()
            const idleAnalysis = trimIdleDetector.analyze(recording, trimMetadata)
            const periods = idleAnalysis.periods

            let startSavedMs = 0
            let endSavedMs = 0

            if (periods.length > 0) {
                if (periods[0].startTime === 0) {
                    startSavedMs = periods[0].endTime
                }
                const lastPeriod = periods[periods.length - 1]
                if (lastPeriod.endTime >= recording.duration - 100) {
                    endSavedMs = lastPeriod.endTime - lastPeriod.startTime
                }
            }

            if (startSavedMs > 0 || endSavedMs > 0) {
                trimSuggestions.set(recordingId, {
                    recordingId,
                    startSavedMs,
                    endSavedMs,
                    totalSavedMs: startSavedMs + endSavedMs
                })
            }

            const freshClip: Clip = {
                id: `clip-${Date.now()}-${recordingId}`,
                recordingId: recording.id,
                startTime: earliestStartTime,
                duration: recording.duration,
                sourceIn: 0,
                sourceOut: recording.duration,
                playbackRate: 1
            }

            track.clips.push(freshClip)
        }
        track.clips.sort((a, b) => a.startTime - b.startTime)
    }

    const allClips = project.timeline.tracks.flatMap(t => t.clips)
    if (allClips.length > 0) {
        project.timeline.duration = Math.max(...allClips.map(c => c.startTime + c.duration))
    }

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
        if (effectiveMetadata) {
            delete (effectiveMetadata as any).detectedIdlePeriods
        }

        const idleDetector = new IdleActivityDetector()
        const idleConfig = {
            minIdleDurationMs: config.minIdleDurationMs,
            mouseVelocityThreshold: 5,
            defaultSpeedMultiplier: 2.5,
            maxSpeedMultiplier: 3.0
        }
        const idleSuggestions = idleDetector.analyzeWithConfig(recording, idleConfig, effectiveMetadata)

        if (effectiveMetadata && idleSuggestions.periods.length > 0) {
            (effectiveMetadata as any).detectedIdlePeriods = idleSuggestions.periods.map((p: any) => ({
                startTime: p.startTime,
                endTime: p.endTime,
                suggestedSpeedMultiplier: p.suggestedSpeedMultiplier,
                confidence: p.confidence
            }))
        }

        const clipForRecording = allClips.find(c => c.recordingId === recording.id)
        if (!clipForRecording) continue

        const { zoomEffects, screenEffects } = detectZoomEffects(recording, clipForRecording, config, effectiveMetadata)

        for (const effect of [...zoomEffects, ...screenEffects]) {
            EffectStore.add(project, effect)
        }
    }

    EffectInitialization.syncKeystrokeEffects(project, metadataByRecordingId)

    // Clean up effects bound to old clip IDs that no longer exist
    // This prevents orphaned effect references after regeneration creates new clip IDs
    TimelineSyncService.cleanupOrphanedEffects(project)

    // Clear TimelineDataService caches to ensure frame layout uses fresh clip data
    // This matches behavior of clip manipulation commands (trim, split, etc.)
    TimelineDataService.invalidateCache(project)

    markModified(project)

    return {
        trimSuggestions: Array.from(trimSuggestions.values())
    }
}