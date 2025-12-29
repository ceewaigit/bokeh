/**
 * Clip Reflow Operations
 * 
 * Core functions for maintaining contiguous clip layout on the timeline.
 * Extracted from timeline-operations.ts for better organization.
 */

import type { Project, Track, Clip } from '@/types/project'
import { TrackType, EffectType } from '@/types/project'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { EffectStore, isValidEffectTiming } from '@/lib/core/effects'
import { isGlobalEffectType } from '@/lib/effects/effect-classification'

/**
 * Calculate total timeline duration from clips and effects.
 */
export function calculateTimelineDuration(project: Project): number {
    let maxEndTime = 0
    for (const track of project.timeline.tracks) {
        for (const clip of track.clips) {
            maxEndTime = Math.max(maxEndTime, clip.startTime + clip.duration)
        }
    }
    const effects = EffectStore.getAll(project)
    for (const effect of effects) {
        if (
            isValidEffectTiming(effect) &&
            !isGlobalEffectType(effect.type) &&
            effect.endTime < Number.MAX_SAFE_INTEGER
        ) {
            maxEndTime = Math.max(maxEndTime, effect.endTime)
        }
    }
    return maxEndTime
}

/**
 * Sync crop effect time ranges to match their bound clips.
 * Call this after any operation that changes clip positions.
 */
export function syncCropEffectTimes(project: Project): void {
    const allEffects = EffectStore.getAll(project)
    if (allEffects.length === 0) return

    const videoClips = project.timeline.tracks
        .filter(t => t.type === TrackType.Video)
        .flatMap(t => t.clips)

    for (const effect of allEffects) {
        if (effect.type !== EffectType.Crop) continue

        let clip = effect.clipId ? videoClips.find(c => c.id === effect.clipId) : null

        if (!clip) {
            // Best-effort rebind for legacy crop effects without clipId
            let best: { clip: Clip; overlap: number } | null = null
            for (const candidate of videoClips) {
                const overlapStart = Math.max(candidate.startTime, effect.startTime)
                const overlapEnd = Math.min(candidate.startTime + candidate.duration, effect.endTime)
                const overlap = Math.max(0, overlapEnd - overlapStart)
                if (overlap > 0 && (!best || overlap > best.overlap)) {
                    best = { clip: candidate, overlap }
                }
            }
            if (best) {
                clip = best.clip
                effect.clipId = best.clip.id
            }
        }

        if (clip) {
            effect.startTime = clip.startTime
            effect.endTime = clip.startTime + clip.duration
        }
    }
}

/**
 * Find clip by ID across all tracks.
 */
export function findClipById(project: Project, clipId: string): { clip: Clip; track: Track } | null {
    for (const track of project.timeline.tracks) {
        const clip = track.clips.find(c => c.id === clipId)
        if (clip) return { clip, track }
    }
    return null
}

/**
 * Sort clips by their current startTime.
 */
export function sortClipsByTime(track: Track): void {
    track.clips.sort((a, b) => a.startTime - b.startTime)
}

/**
 * Reflow clips to maintain contiguous layout.
 * Array order is the single source of truth.
 */
export function reflowClips(
    track: Track,
    startFromIndex: number = 0
): void {
    if (track.clips.length === 0) return

    // Ensure durations are consistent with source bounds
    for (let i = 0; i < track.clips.length; i++) {
        const clip = track.clips[i]
        const expectedDuration = TimeConverter.computeEffectiveDuration(clip)

        if (Math.abs(clip.duration - expectedDuration) > 1) {
            track.clips[i] = { ...clip, duration: expectedDuration }
        }
    }

    // First clip always starts at 0
    if (startFromIndex === 0 && track.clips.length > 0) {
        if (track.clips[0].startTime !== 0) {
            track.clips[0] = { ...track.clips[0], startTime: 0 }
        }
    }

    // Each subsequent clip starts where the previous one ends
    for (let i = Math.max(1, startFromIndex); i < track.clips.length; i++) {
        const prevClip = track.clips[i - 1]
        const newStart = prevClip.startTime + prevClip.duration

        if (track.clips[i].startTime !== newStart) {
            track.clips[i] = { ...track.clips[i], startTime: newStart }
        }
    }
}
