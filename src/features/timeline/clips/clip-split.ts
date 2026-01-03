/**
 * Clip Split Operations
 * 
 * Functions for splitting clips at specific time points.
 * Extracted from timeline-operations.ts for better organization.
 */

import type { Project, Clip } from '@/types/project'
import { EffectCreation } from '@/features/effects/core/creation'
import { EffectInitialization } from '@/features/effects/core/initialization'
import { getCropEffectForClip } from '@/features/effects/core/filters'
import { EffectStore } from '@/features/effects/core/store'
import { findClipById, syncCropEffectTimes } from './clip-reflow'

/**
 * Split a single clip into two at the specified relative time.
 * Returns null if the split point is invalid.
 */
export function splitClipAtTime(
    clip: Clip,
    relativeSplitTime: number
): { firstClip: Clip; secondClip: Clip } | null {
    if (relativeSplitTime <= 0 || relativeSplitTime >= clip.duration) {
        return null
    }

    const { clipRelativeToSource } = require('../time/time-space-converter')

    const clipSourceIn = clip.sourceIn ?? 0
    const clipSourceOut = clip.sourceOut ?? (clipSourceIn + (clip.duration * (clip.playbackRate || 1)))

    const sourceSplitAbsolute = clipRelativeToSource(relativeSplitTime, clip)
    const sourceSplitPoint = sourceSplitAbsolute - clipSourceIn

    const firstClip: Clip = {
        id: crypto.randomUUID(),
        recordingId: clip.recordingId,
        startTime: clip.startTime,
        duration: relativeSplitTime,
        sourceIn: clipSourceIn,
        sourceOut: clipSourceIn + sourceSplitPoint,
        playbackRate: clip.playbackRate,
        introFadeMs: clip.introFadeMs,
    }

    // Copy speed-up flags
    if (clip.typingSpeedApplied) firstClip.typingSpeedApplied = true
    if (clip.idleSpeedApplied) firstClip.idleSpeedApplied = true

    // Handle timeRemapPeriods
    if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
        const splitSourceTime = clipSourceIn + sourceSplitPoint
        const firstPeriods = clip.timeRemapPeriods
            .filter(p => p.sourceStartTime < splitSourceTime)
            .map(p => ({
                ...p,
                sourceEndTime: Math.min(p.sourceEndTime, splitSourceTime)
            }))
        if (firstPeriods.length > 0) {
            firstClip.timeRemapPeriods = firstPeriods
        }
    }

    const secondClip: Clip = {
        id: crypto.randomUUID(),
        recordingId: clip.recordingId,
        startTime: clip.startTime + relativeSplitTime,
        duration: clip.duration - relativeSplitTime,
        sourceIn: clipSourceIn + sourceSplitPoint,
        sourceOut: clipSourceOut,
        playbackRate: clip.playbackRate,
        outroFadeMs: clip.outroFadeMs,
    }

    // Copy speed-up flags
    if (clip.typingSpeedApplied) secondClip.typingSpeedApplied = true
    if (clip.idleSpeedApplied) secondClip.idleSpeedApplied = true

    // Handle timeRemapPeriods
    if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
        const splitSourceTime = clipSourceIn + sourceSplitPoint
        const secondPeriods = clip.timeRemapPeriods
            .filter(p => p.sourceEndTime > splitSourceTime)
            .map(p => ({
                ...p,
                sourceStartTime: Math.max(p.sourceStartTime, splitSourceTime)
            }))
        if (secondPeriods.length > 0) {
            secondClip.timeRemapPeriods = secondPeriods
        }
    }

    return { firstClip, secondClip }
}

/**
 * Execute split clip operation on a clip in the project.
 */
export function executeSplitClip(
    project: Project,
    clipId: string,
    splitTime: number  // Timeline space
): { firstClip: Clip; secondClip: Clip } | null {
    const result = findClipById(project, clipId)
    if (!result) return null

    const { clip, track } = result

    // Get crop effect before split
    const allEffects = EffectStore.getAll(project)
    const originalCropEffect = getCropEffectForClip(allEffects, clip)

    // Convert timeline position to clip-relative time
    const clipRelativeTime = splitTime - clip.startTime

    const splitResult = splitClipAtTime(clip, clipRelativeTime)
    if (!splitResult) return null

    const clipIndex = track.clips.findIndex(c => c.id === clipId)
    track.clips.splice(clipIndex, 1, splitResult.firstClip, splitResult.secondClip)

    // Handle crop effect: copy to both new clips
    if (originalCropEffect && originalCropEffect.data) {
        const firstCropEffect = EffectCreation.createCropEffect({
            clipId: splitResult.firstClip.id,
            startTime: splitResult.firstClip.startTime,
            endTime: splitResult.firstClip.startTime + splitResult.firstClip.duration,
            cropData: originalCropEffect.data as any
        })
        EffectStore.add(project, firstCropEffect)

        const secondCropEffect = EffectCreation.createCropEffect({
            clipId: splitResult.secondClip.id,
            startTime: splitResult.secondClip.startTime,
            endTime: splitResult.secondClip.startTime + splitResult.secondClip.duration,
            cropData: originalCropEffect.data as any
        })
        EffectStore.add(project, secondCropEffect)

        EffectStore.remove(project, originalCropEffect.id)
    }

    project.modifiedAt = new Date().toISOString()
    syncCropEffectTimes(project)

    // Sync keystroke effects
    try {
        EffectInitialization.syncKeystrokeEffects(project)
    } catch (e) {
        console.error('Failed to sync keystroke effects during split', e)
    }

    return {
        firstClip: splitResult.firstClip,
        secondClip: splitResult.secondClip
    }
}
