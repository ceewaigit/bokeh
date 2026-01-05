import type { Project, Clip, Effect } from '@/types/project'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { reflowClips, calculateTimelineDuration } from './clips/clip-reflow'
import { EffectStore } from '@/features/effects/core/store'

/**
 * Service for applying speed-up suggestions to clips by splitting them
 * This creates separate clips for sped-up sections with increased playback rates
 * 
 * Supports all speed-up types (typing, idle, future detectors)
 */
export class SpeedUpApplicationService {
    /**
     * Apply speed-up suggestions to a clip by splitting and remapping
     * This modifies the clip's playback speed variably without splitting it
     * Returns the affected clip and original state for undo
     * 
     * @param periods - Array of speed-up periods with startTime, endTime, and suggestedSpeedMultiplier
     * @param speedUpTypes - Which types of speed-up are being applied (for setting flags)
     */
    static applySpeedUpToClip(
        project: Project,
        clipId: string,
        periods: Array<{ startTime: number; endTime: number; suggestedSpeedMultiplier: number }>,
        speedUpTypes: Array<'typing' | 'idle'> = ['typing']
    ): { affectedClips: string[]; originalClips: Clip[] } {
        const affectedClips: string[] = []
        const originalClips: Clip[] = []

        const result = ClipLookup.byId(project, clipId)
        if (!result) {
            console.error('applySpeedUpToClip: Clip not found:', clipId)
            return { affectedClips: [], originalClips }
        }

        const { clip: sourceClip, track } = result
        const clipIndex = track.clips.findIndex(c => c.id === clipId)

        // Save original clip state for undo
        originalClips.push({ ...sourceClip })

        // 1. Capture existing clip-bound effects (e.g. Crop) BEFORE we remove the clip
        const allEffects = EffectStore.getAll(project)
        const clipBoundEffects = allEffects.filter(e => e.clipId === clipId)

        // Get clip's source range and base playback rate
        const sourceIn = sourceClip.sourceIn || 0
        const sourceOut = sourceClip.sourceOut || (sourceIn + sourceClip.duration * (sourceClip.playbackRate || 1))
        const baseRate = sourceClip.playbackRate || 1

        // Filter and sort periods within the clip's source range
        const validPeriods = periods
            .filter(p => p.endTime > sourceIn && p.startTime < sourceOut)
            .map(p => ({
                start: Math.max(p.startTime, sourceIn),
                end: Math.min(p.endTime, sourceOut),
                speedMultiplier: p.suggestedSpeedMultiplier
            }))
            .sort((a, b) => a.start - b.start)

        if (validPeriods.length === 0) {
            return { affectedClips: [clipId], originalClips }
        }

        // Get FPS from project settings or default to 60
        const fps = project.settings.frameRate
        const minDuration = 1000 / fps // Minimum duration is 1 frame

        // 1. Generate initial segments covering the entire source range
        interface Segment {
            start: number
            end: number
            speedMultiplier: number
        }

        const segments: Segment[] = []
        let currentPos = sourceIn

        for (const period of validPeriods) {
            // Add gap before speed-up period (normal speed)
            if (currentPos < period.start) {
                segments.push({
                    start: currentPos,
                    end: period.start,
                    speedMultiplier: 1
                })
            }

            // Add speed-up period
            segments.push({
                start: period.start,
                end: period.end,
                speedMultiplier: period.speedMultiplier
            })

            currentPos = period.end
        }

        // Add remaining portion after last speed-up period (normal speed)
        if (currentPos < sourceOut) {
            segments.push({
                start: currentPos,
                end: sourceOut,
                speedMultiplier: 1
            })
        }

        // 2. Merge small segments to prevent sub-frame clips
        // We iterate and merge any segment < minDuration into its neighbor
        const mergedSegments: Segment[] = []

        for (const segment of segments) {
            const duration = segment.end - segment.start

            if (duration < minDuration) {
                // Segment is too small. Merge it.
                if (mergedSegments.length > 0) {
                    // Merge into previous segment
                    const prev = mergedSegments[mergedSegments.length - 1]
                    prev.end = segment.end
                    // Note: We keep the speed of the previous segment. 
                    // This effectively "eats" the small segment into the previous one.
                } else {
                    // If it's the very first segment and too small, we can't merge backwards.
                    // We'll add it for now, and hope the next one merges backwards into it?
                    // Or we just drop it? No, dropping changes sourceIn.
                    // We must keep it or merge forward.
                    // Let's add it, but check next time.
                    mergedSegments.push(segment)
                }
            } else {
                // Check if we can merge with previous if they have same speed
                if (mergedSegments.length > 0) {
                    const prev = mergedSegments[mergedSegments.length - 1]
                    if (prev.speedMultiplier === segment.speedMultiplier) {
                        prev.end = segment.end
                    } else {
                        mergedSegments.push(segment)
                    }
                } else {
                    mergedSegments.push(segment)
                }
            }
        }

        // Final pass to catch any remaining tiny segments (like the first one if it was small)
        // If the first segment is still small and there's a second one, merge first into second.
        if (mergedSegments.length > 1 && (mergedSegments[0].end - mergedSegments[0].start) < minDuration) {
            const first = mergedSegments[0]
            const second = mergedSegments[1]
            second.start = first.start
            mergedSegments.shift()
        }

        // Remove the original clip
        track.clips.splice(clipIndex, 1)

        // Determine which flags to set based on speed-up types
        const hasTyping = speedUpTypes.includes('typing')
        const hasIdle = speedUpTypes.includes('idle')

        // 3. Create new clips from merged segments
        let timelinePosition = sourceClip.startTime
        const newClips: Clip[] = []
        const effectsToAdd: Effect[] = []

        for (let i = 0; i < mergedSegments.length; i++) {
            const segment = mergedSegments[i]
            const sourceDuration = segment.end - segment.start

            // Skip effectively zero length segments
            if (sourceDuration <= 0.001) continue

            // Apply speed directly to playbackRate
            const effectiveRate = baseRate * segment.speedMultiplier

            // Calculate duration based on combined speed
            // Use precise float division
            const clipDuration = sourceDuration / effectiveRate

            const newClip: Clip = {
                id: `${sourceClip.id}-part-${i}`,
                recordingId: sourceClip.recordingId,
                startTime: timelinePosition,
                duration: clipDuration,
                sourceIn: segment.start,
                sourceOut: segment.end,
                // Lock bounds to segment - prevents expansion beyond these limits
                lockedSourceIn: segment.start,
                lockedSourceOut: segment.end,
                playbackRate: effectiveRate,
                // Only mark segments as applied if they actually have speed applied
                // Normal-speed segments should still show remaining suggestions
                typingSpeedApplied: hasTyping && segment.speedMultiplier !== 1,
                idleSpeedApplied: hasIdle && segment.speedMultiplier !== 1,
                timeRemapPeriods: [],
                // Preserve fades on edges
                introFadeMs: i === 0 ? sourceClip.introFadeMs : undefined,
                outroFadeMs: i === mergedSegments.length - 1 ? sourceClip.outroFadeMs : undefined
            }

            newClips.push(newClip)
            affectedClips.push(newClip.id)

            // Re-apply original clip-bound effects to this new clip segment
            for (const originalEffect of clipBoundEffects) {
                const clonedEffect = {
                    ...originalEffect,
                    id: crypto.randomUUID(), // New unique ID
                    clipId: newClip.id,      // Bind to new clip
                    startTime: timelinePosition,
                    endTime: timelinePosition + clipDuration,
                    // Note: We copy 'data' and other props directly.
                    // For Crop, Screen, etc., the data is spatial and applies to the whole clip.
                }
                effectsToAdd.push(clonedEffect)
            }

            timelinePosition += clipDuration
        }

        // Insert new clips at the original position (array order is the source of truth)
        track.clips.splice(clipIndex, 0, ...newClips)

        // NO SORTING - array order IS the source of truth
        // New clips are already at the correct array index via splice()

        // 4. Update Project Effects
        // Remove old effects bound to the deleted clip
        for (const effect of clipBoundEffects) {
            EffectStore.remove(project, effect.id)
        }
        // Add new migrated effects
        if (effectsToAdd.length > 0) {
            EffectStore.addMany(project, effectsToAdd)
        }

        // Reflow to ensure all clips are contiguous
        reflowClips(track, 0)

        // Update timeline duration
        project.timeline.duration = calculateTimelineDuration(project)
        project.modifiedAt = new Date().toISOString()

        return { affectedClips, originalClips }
    }
}
