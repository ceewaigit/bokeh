import type { Project } from '@/types/project'
import { WaveformAnalyzer } from '@/lib/audio/waveform-analyzer'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { EffectStore, isValidEffectTiming } from '@/lib/core/effects'

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
            RecordingStorage.clearBlobUrl(recording.id)
            RecordingStorage.clearMetadataForRecording(recording.id)
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
            RecordingStorage.clearBlobUrl(recordingIdToCheck)
            // Clear metadata cache for the recording
            RecordingStorage.clearMetadataForRecording(recordingIdToCheck)

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
}
