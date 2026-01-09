import type { Project, Clip, Effect } from '@/types/project'
import { EffectType, TrackType } from '@/types/project'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { reflowClips, calculateTimelineDuration } from './clips/clip-reflow'
import { EffectStore } from '@/features/effects/core/store'
import { TimeRange } from './time/time-range'

interface SpeedUpApplyOptions {
    syncLinkedTracks?: boolean
    updateEffects?: boolean
}

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
        speedUpTypes: Array<'typing' | 'idle'> = ['typing'],
        options: SpeedUpApplyOptions = {}
    ): { affectedClips: string[]; originalClips: Clip[]; modifiedEffects: Effect[] } {
        const affectedClips: string[] = []
        const originalClips: Clip[] = []
        const modifiedEffects: Effect[] = []
        const syncLinkedTracks = options.syncLinkedTracks ?? true
        const updateEffects = options.updateEffects ?? true

        const result = ClipLookup.byId(project, clipId)
        if (!result) {
            console.error('applySpeedUpToClip: Clip not found:', clipId)
            return { affectedClips: [], originalClips, modifiedEffects: [] }
        }

        const { clip: sourceClip, track } = result
        const clipIndex = track.clips.findIndex(c => c.id === clipId)

        const originalClip = { ...sourceClip }
        originalClips.push(originalClip)

        const shouldUpdateEffects = updateEffects && track.type === TrackType.Video

        // 1. Capture existing clip-bound effects (e.g. Crop) BEFORE we remove the clip
        const allEffects = shouldUpdateEffects ? EffectStore.getAll(project) : []
        const clipBoundEffects = shouldUpdateEffects ? allEffects.filter(e => e.clipId === clipId) : []

        // Capture overlapping "unbound" effects (like Zoom) that should move with the content
        // These are effects that are NOT clip-bound but spatially overlap the clip's timeline range
        const overlappingEffects = shouldUpdateEffects ? allEffects.filter(e =>
            !e.clipId && // Not bound to any specific clip
            e.type !== EffectType.Background && // Backgrounds don't move
            e.startTime < (sourceClip.startTime + sourceClip.duration) &&
            e.endTime > sourceClip.startTime
        ) : []

        // Save initial state of effects that will be modified
        if (shouldUpdateEffects) {
            for (const effect of overlappingEffects) {
                modifiedEffects.push({ ...effect })
            }
        }

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
            return { affectedClips: [clipId], originalClips, modifiedEffects: [] }
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
            if (shouldUpdateEffects) {
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
            }

            timelinePosition += clipDuration
        }

        // Insert new clips at the original position (array order is the source of truth)
        track.clips.splice(clipIndex, 0, ...newClips)

        // NO SORTING - array order IS the source of truth
        // New clips are already at the correct array index via splice()

        if (shouldUpdateEffects) {
            // 4. Update Project Effects
            // Remove old effects bound to the deleted clip
            for (const effect of clipBoundEffects) {
                EffectStore.remove(project, effect.id)
            }
            // Add new migrated effects
            if (effectsToAdd.length > 0) {
                EffectStore.addMany(project, effectsToAdd)
            }
        }

        // Reflow to ensure all clips are contiguous
        reflowClips(track, 0)

        // Update timeline duration
        project.timeline.duration = calculateTimelineDuration(project)
        project.modifiedAt = new Date().toISOString()

        // 5. Shift generic effects that are AFTER the modified clip
        // When we speed up a clip, it shortens. We must pull following effects back by the delta.
        // newClips contains the new segments.
        const newTotalDuration = newClips.reduce((sum, c) => sum + c.duration, 0)
        const oldDuration = sourceClip.duration
        const delta = newTotalDuration - oldDuration
        const originalEnd = originalClip.startTime + oldDuration

        // Helper to map a timeline position (relative to original clip start) to new timeline position
        const mapTimelinePositionToNew = (originalTimelinePos: number): number | null => {
            // 1. Convert to source time
            // sourceTime = sourceIn + (dt * baseRate)
            const dt = originalTimelinePos - sourceClip.startTime
            const sourceTime = sourceIn + (dt * baseRate)

            // 2. Find which segment this source time falls into
            let timeSoFar = 0
            for (const segment of mergedSegments) {
                // Check inclusion with small epsilon for float errors
                if (sourceTime >= segment.start - 0.001 && sourceTime <= segment.end + 0.001) {
                    // Found the segment
                    const offsetInSegment = Math.max(0, sourceTime - segment.start)

                    // effectiveRate = baseRate * multiplier
                    const effectiveRate = baseRate * segment.speedMultiplier

                    // duration = offset / rate
                    const newDt = timeSoFar + (offsetInSegment / effectiveRate)

                    return sourceClip.startTime + newDt
                }

                // Add full duration of this segment to timeSoFar
                const segmentSourceDuration = segment.end - segment.start
                const segmentEffectiveRate = baseRate * segment.speedMultiplier
                timeSoFar += segmentSourceDuration / segmentEffectiveRate
            }

            return null
        }

        if (shouldUpdateEffects) {
            // 6. Update overlapping effects (Zoom, etc.)
            for (const effect of overlappingEffects) {
                // Case 1: Start is inside
                if (effect.startTime >= sourceClip.startTime && effect.startTime <= originalEnd) {
                    const newStart = mapTimelinePositionToNew(effect.startTime)
                    if (newStart !== null) {
                        effect.startTime = newStart
                    }
                } else if (effect.startTime > originalEnd) {
                    // Starts after -> shift by total delta
                    effect.startTime += delta
                }

                // Case 2: End is inside
                if (effect.endTime >= sourceClip.startTime && effect.endTime <= originalEnd) {
                    const newEnd = mapTimelinePositionToNew(effect.endTime)
                    if (newEnd !== null) {
                        effect.endTime = newEnd
                    }
                } else if (effect.endTime > originalEnd) {
                    // Ends after -> shift by total delta
                    effect.endTime += delta
                }
            }

            // 7. Shift remaining independent effects that start strictly AFTER the original clip
            for (const effect of allEffects) {
                // Skip effects we just added or modified
                if (effectsToAdd.some(e => e.id === effect.id)) continue
                if (overlappingEffects.some(e => e.id === effect.id)) continue
                if (effect.type === EffectType.Background) continue

                // If effect starts at or after the point where the timeline shifted (original clip end),
                // shift it by delta.
                if (effect.startTime >= originalEnd - 0.01) {
                    // Save original state before modification if not already saved
                    if (!modifiedEffects.some(e => e.id === effect.id)) {
                        modifiedEffects.push({ ...effect })
                    }
                    effect.startTime += delta
                    effect.endTime += delta
                }
            }
        }

        if (syncLinkedTracks && track.type === TrackType.Video) {
            this.syncWebcamClips(project, originalClip, periods, speedUpTypes, delta)
        }

        return { affectedClips, originalClips, modifiedEffects }
    }

    private static syncWebcamClips(
        project: Project,
        sourceClip: Clip,
        periods: Array<{ startTime: number; endTime: number; suggestedSpeedMultiplier: number }>,
        speedUpTypes: Array<'typing' | 'idle'>,
        delta: number
    ): void {
        const webcamTracks = project.timeline.tracks.filter(track => track.type === TrackType.Webcam)
        if (webcamTracks.length === 0) return

        const sourceRange = TimeRange.fromClip(sourceClip)
        const epsilon = 0.001
        const hasShift = Math.abs(delta) > epsilon

        let shifted = false

        for (const webcamTrack of webcamTracks) {
            const overlapping = webcamTrack.clips.filter(clip =>
                TimeRange.overlaps(sourceRange, TimeRange.fromClip(clip))
            )

            const syncedClipIds = new Set<string>()
            for (const clip of overlapping) {
                const result = SpeedUpApplicationService.applySpeedUpToClip(
                    project,
                    clip.id,
                    periods,
                    speedUpTypes,
                    { syncLinkedTracks: false, updateEffects: false }
                )
                for (const clipId of result.affectedClips) {
                    syncedClipIds.add(clipId)
                }
            }

            if (!hasShift) continue

            for (const clip of webcamTrack.clips) {
                if (syncedClipIds.has(clip.id)) continue
                if (clip.startTime >= sourceRange.endTime - epsilon) {
                    clip.startTime += delta
                    shifted = true
                }
            }
        }

        if (shifted) {
            project.timeline.duration = calculateTimelineDuration(project)
            project.modifiedAt = new Date().toISOString()
        }
    }
}
