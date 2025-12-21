/**
 * Migration 001: Convert Source-Space Zoom Effects to Timeline-Space
 * 
 * This migration moves zoom effects from recording.effects[] (source-space)
 * to timeline.effects[] (timeline-space), making zoom effects independent
 * of clip positions.
 */

import type { Migration } from '../index'
import type { Project, Effect, Clip, Recording } from '@/types/project'
import { EffectType } from '@/types/project'

/**
 * Convert source time to timeline time for a given clip
 */
function sourceToTimelineTime(sourceMs: number, clip: Clip): number {
    const sourceIn = clip.sourceIn || 0
    const playbackRate = clip.playbackRate || 1
    // Timeline position = clipStart + (sourceTime - sourceIn) / playbackRate
    return clip.startTime + (sourceMs - sourceIn) / playbackRate
}

/**
 * Find all clips that use a specific recording and overlap with a time range
 */
function findClipsForSourceRange(
    sourceStart: number,
    sourceEnd: number,
    recordingId: string,
    allClips: Clip[]
): Clip[] {
    return allClips.filter(clip => {
        if (clip.recordingId !== recordingId) return false
        const clipSourceIn = clip.sourceIn || 0
        const clipSourceOut = clip.sourceOut ?? (clipSourceIn + clip.duration * (clip.playbackRate || 1))
        // Check for overlap
        return clipSourceIn < sourceEnd && clipSourceOut > sourceStart
    })
}

export const migration001: Migration = {
    version: 1,
    name: 'timeline_space_effects',
    description: 'Convert source-space zoom effects to timeline-space',

    migrate: (project: Project): Project => {
        // Deep clone to avoid mutation
        const newProject: Project = JSON.parse(JSON.stringify(project))

        // Ensure timeline.effects array exists
        if (!newProject.timeline.effects) {
            newProject.timeline.effects = []
        }

        // Get all clips from all tracks
        const allClips = newProject.timeline.tracks.flatMap(track => track.clips)

        // Process each recording's zoom effects
        for (const recording of newProject.recordings) {
            if (!recording.effects || recording.effects.length === 0) continue

            const zoomEffects = recording.effects.filter(e => e.type === EffectType.Zoom)
            const otherEffects = recording.effects.filter(e => e.type !== EffectType.Zoom)

            for (const effect of zoomEffects) {
                // Find clips that this effect intersects with
                const intersectingClips = findClipsForSourceRange(
                    effect.startTime,
                    effect.endTime,
                    recording.id,
                    allClips
                )

                if (intersectingClips.length === 0) {
                    // No clips use this portion of the recording - skip this effect
                    console.log(`[Migration 001] Skipping orphaned zoom effect ${effect.id} - no clips in source range`)
                    continue
                }

                // Use the first clip to calculate timeline position
                // Sort by timeline position and use earliest
                intersectingClips.sort((a, b) => a.startTime - b.startTime)
                const primaryClip = intersectingClips[0]

                // Calculate timeline-space times
                const timelineStart = sourceToTimelineTime(effect.startTime, primaryClip)
                const timelineEnd = sourceToTimelineTime(effect.endTime, primaryClip)

                // Create timeline-space version of the effect
                const timelineEffect: Effect = {
                    ...effect,
                    id: effect.id, // Preserve original ID
                    startTime: timelineStart,
                    endTime: timelineEnd,
                }

                // Add to timeline effects, avoiding duplicates
                const exists = newProject.timeline.effects!.some(e => e.id === effect.id)
                if (!exists) {
                    newProject.timeline.effects!.push(timelineEffect)
                    console.log(`[Migration 001] Migrated zoom effect ${effect.id}: source [${effect.startTime}-${effect.endTime}] → timeline [${timelineStart.toFixed(0)}-${timelineEnd.toFixed(0)}]`)
                }
            }

            // Keep only non-zoom effects on recording (cursor, background, etc. stay in source-space)
            recording.effects = otherEffects
        }

        console.log(`[Migration 001] Completed: ${newProject.timeline.effects!.filter(e => e.type === EffectType.Zoom).length} zoom effects now in timeline-space`)

        return newProject
    }
}
