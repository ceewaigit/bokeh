import type { Project, SubtitleEffectData } from '@/types/project'
import { EffectType, TrackType } from '@/types/project'
import { WaveformAnalyzer } from '@/features/media/audio/waveform-analyzer'
import { ThumbnailGenerator } from '@/shared/utils/thumbnail-generator'
import { ProjectStorage } from '@/features/core/storage/project-storage'
import { EffectStore, isValidEffectTiming } from '@/features/effects/core/store'

export class ProjectCleanupService {
    /**
     * Removes orphaned recordings that are not referenced by any clips.
     * Should be called on project load to prevent memory accumulation.
     */
    static cleanupOrphanedRecordings(project: Project): void {
        const usedRecordingIds = new Set(
            project.timeline.tracks.flatMap(t => t.clips.map(c => c.recordingId))
        )

        // Find orphaned recordings
        const orphanedRecordings = project.recordings.filter(r => !usedRecordingIds.has(r.id))

        // Clean up resources for each orphaned recording
        for (const recording of orphanedRecordings) {
            ThumbnailGenerator.clearCacheForRecording(recording.id)
            ProjectStorage.clearBlobUrl(recording.id)
            ProjectStorage.clearMetadataForRecording(recording.id)
            if (project.timeline.transcriptEdits?.[recording.id]) {
                delete project.timeline.transcriptEdits[recording.id]
            }
        }

        // Remove subtitle effects for orphaned recordings
        if (orphanedRecordings.length > 0 && project.timeline.effects) {
            const orphanedIds = new Set(orphanedRecordings.map(r => r.id))
            project.timeline.effects = project.timeline.effects.filter(e => {
                if (e.type === EffectType.Subtitle) {
                    return !orphanedIds.has((e.data as SubtitleEffectData).recordingId)
                }
                return true
            })
        }

        // Remove orphaned recordings from the project
        if (orphanedRecordings.length > 0) {
            project.recordings = project.recordings.filter(r => usedRecordingIds.has(r.id))
            console.log(`[ProjectCleanupService] Cleaned up ${orphanedRecordings.length} orphaned recording(s)`)
        }
    }

    /**
     * Removes effects with invalid timing to prevent runtime crashes.
     */
    static cleanupInvalidEffects(project: Project): void {
        EffectStore.ensureArray(project)
        const effects = EffectStore.getAll(project)
        const validEffects = effects.filter(isValidEffectTiming)

        if (validEffects.length !== effects.length) {
            project.timeline.effects = validEffects
            project.modifiedAt = new Date().toISOString()
            console.warn(`[ProjectCleanupService] Removed ${effects.length - validEffects.length} invalid effect(s)`)
        }
    }

    /**
     * Checks if a recording is still used by any clips in the project.
     * If not, cleans up associated resources (caches, blob URLs, etc.)
     */
    static cleanupUnusedRecordings(project: Project, recordingIdToCheck: string): void {
        const stillUsed = project.timeline.tracks
            .flatMap(t => t.clips)
            .some(c => c.recordingId === recordingIdToCheck)

        if (!stillUsed) {
            // Clear thumbnail cache for the recording
            ThumbnailGenerator.clearCacheForRecording(recordingIdToCheck)
            // Clear blob URL for the recording
            ProjectStorage.clearBlobUrl(recordingIdToCheck)
            // Clear metadata cache for the recording
            ProjectStorage.clearMetadataForRecording(recordingIdToCheck)
            if (project.timeline.transcriptEdits?.[recordingIdToCheck]) {
                delete project.timeline.transcriptEdits[recordingIdToCheck]
            }

            // Remove subtitle effects for this recording
            if (project.timeline.effects) {
                project.timeline.effects = project.timeline.effects.filter(e => {
                    if (e.type === EffectType.Subtitle) {
                        return (e.data as SubtitleEffectData).recordingId !== recordingIdToCheck
                    }
                    return true
                })
            }

            // Note: WaveformAnalyzer cache is per-clip, not per-recording,
            // so we can't easily clear it by recording ID here without tracking clip IDs.
            // However, WaveformAnalyzer.clearCache(clipId) is usually called when a specific clip is removed.
        }
    }

    /**
     * Cleans up resources for a specific clip
     */
    static cleanupClipResources(clipId: string): void {
        WaveformAnalyzer.clearCache(clipId)
    }

    /**
     * WEBCAM-SPECIFIC: Clean up transcript edits and subtitle effects when a webcam recording
     * is no longer used on the webcam track.
     * 
     * This is called when a webcam clip is deleted. It checks if ANY webcam clips still
     * use this recording - if not, it cleans up transcript-related data.
     * 
     * Note: The recording media itself may still be used on other tracks (e.g., main timeline).
     * This method only cleans up webcam-specific derived data (transcripts, subtitles).
     */
    static cleanupWebcamRecordingData(project: Project, recordingId: string): void {
        // Check if any webcam clips still use this recording
        const stillUsedAsWebcam = project.timeline.tracks
            .filter(t => t.type === TrackType.Webcam)
            .flatMap(t => t.clips)
            .some(c => c.recordingId === recordingId)

        if (stillUsedAsWebcam) {
            return // Recording still has webcam clips, don't cleanup
        }

        // Clean up transcript edits for this recording
        if (project.timeline.transcriptEdits?.[recordingId]) {
            delete project.timeline.transcriptEdits[recordingId]
            console.log(`[ProjectCleanupService] Cleaned up transcript edits for webcam recording ${recordingId}`)
        }

        // Clean up subtitle effects for this recording
        if (project.timeline.effects) {
            const beforeCount = project.timeline.effects.length
            project.timeline.effects = project.timeline.effects.filter(e => {
                if (e.type === EffectType.Subtitle) {
                    return (e.data as SubtitleEffectData).recordingId !== recordingId
                }
                return true
            })
            const removed = beforeCount - project.timeline.effects.length
            if (removed > 0) {
                console.log(`[ProjectCleanupService] Removed ${removed} subtitle effect(s) for webcam recording ${recordingId}`)
            }
        }
    }
}
