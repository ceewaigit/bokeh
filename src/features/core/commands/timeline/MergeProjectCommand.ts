/**
 * MergeProjectCommand - Merge another project's content into the current timeline
 * 
 * This command properly imports content from a library project by:
 * 1. Receiving an already-loaded source project (loaded via ProjectIOService)
 * 2. Adding all recordings from the source to the current project
 * 3. Adding all clips from the source to the appropriate tracks (maintaining associations)
 * 4. Importing relevant effects
 * 
 * The source project should already be loaded with ProjectIOService.loadProject()
 * which handles path resolution, migrations, and asset loading. This eliminates
 * duplicate loading logic.
 */

import { Command, CommandResult } from '../base/Command'
import type { CommandContext } from '../base/CommandContext'
import type { Clip, Effect, Project, Recording } from '@/types/project'
import { EffectType, TrackType, TimelineItemType } from '@/types/project'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { removeClipFromTrack } from '@/features/ui/timeline/clips/clip-crud'
import { ProjectCleanupService } from '@/features/ui/timeline/project-cleanup'
import { RecordingStorage } from '@/features/core/storage/recording-storage'

// ============================================================================
// Types
// ============================================================================

export interface MergeProjectPayload {
    /** Fully loaded source project (via ProjectIOService.loadProject) */
    sourceProject: Project
    /** Starting time offset for imported clips (default: end of current timeline) */
    startTimeOffset?: number
    /** Whether to import effects from source project */
    importEffects?: boolean
}

interface ImportedItem {
    type: TimelineItemType
    id: string
    trackType?: TrackType
}

// ============================================================================
// Command
// ============================================================================

export class MergeProjectCommand extends Command<{ importedClipIds: string[] }> {
    private importedItems: ImportedItem[] = []
    private previousSelection?: string[]

    constructor(
        private context: CommandContext,
        private payload: MergeProjectPayload
    ) {
        super({
            name: 'MergeProject',
            description: `Import content from ${payload.sourceProject.name}`,
            category: 'timeline'
        })
    }

    canExecute(): boolean {
        return !!this.context.getProject() && !!this.payload.sourceProject
    }

    doExecute(): CommandResult<{ importedClipIds: string[] }> {
        const project = this.context.getProject()
        if (!project) {
            return { success: false, error: 'No active project' }
        }

        const sourceProject = this.payload.sourceProject
        this.previousSelection = [...this.context.getSelectedClips()]
        this.importedItems = []

        // Calculate start time offset for new clips
        // Default: append at the end of the current timeline
        let startTimeOffset = this.payload.startTimeOffset
        if (startTimeOffset === undefined) {
            const currentDuration = project.timeline.duration || 0
            startTimeOffset = currentDuration
        }

        const importedClipIds: string[] = []

        // Create ID mapping: old recording ID → new recording ID
        const recordingIdMap = new Map<string, string>()
        const clipIdMap = new Map<string, string>()

        this.context.getStore().updateProjectData((draft) => {
            // ================================================================
            // Step 1: Import all recordings with new IDs
            // ================================================================
            for (const sourceRecording of sourceProject.recordings) {
                const newId = `lib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                recordingIdMap.set(sourceRecording.id, newId)

                const clonedRecording: Recording = {
                    ...structuredClone(sourceRecording),
                    id: newId,
                }

                // Cache metadata if available
                if (sourceRecording.metadata) {
                    RecordingStorage.setMetadata(newId, sourceRecording.metadata)
                }

                // Copy blob URL from source recording to new recording
                // This is critical for video playback - URLs are cached by ID
                const sourceBlobUrl = RecordingStorage.getBlobUrl(sourceRecording.id)
                if (sourceBlobUrl) {
                    RecordingStorage.setBlobUrl(newId, sourceBlobUrl)
                }

                draft.recordings.push(clonedRecording)
                this.importedItems.push({ type: TimelineItemType.Recording, id: newId })
            }

            // ================================================================
            // Step 2: Import clips from each track
            // ================================================================
            for (const sourceTrack of sourceProject.timeline.tracks) {
                // Find or create matching track in target project
                let targetTrack = draft.timeline.tracks.find(t => t.type === sourceTrack.type)

                // Create track if it doesn't exist (e.g., Webcam track)
                if (!targetTrack) {
                    targetTrack = {
                        id: `track-${sourceTrack.type}-${Date.now()}`,
                        name: sourceTrack.name,
                        type: sourceTrack.type,
                        clips: [],
                        muted: false,
                        locked: false,
                    }
                    draft.timeline.tracks.push(targetTrack)
                    this.importedItems.push({ type: TimelineItemType.Recording, id: targetTrack.id }) // Track for undo
                }

                for (const sourceClip of sourceTrack.clips) {
                    const newRecordingId = recordingIdMap.get(sourceClip.recordingId)
                    if (!newRecordingId) continue // Skip if recording wasn't imported

                    const newClipId = `lib-clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                    clipIdMap.set(sourceClip.id, newClipId)

                    const clonedClip: Clip = {
                        ...structuredClone(sourceClip),
                        id: newClipId,
                        recordingId: newRecordingId,
                        startTime: sourceClip.startTime + startTimeOffset!,
                    }

                    targetTrack.clips.push(clonedClip)
                    importedClipIds.push(newClipId)
                    this.importedItems.push({
                        type: TimelineItemType.Clip,
                        id: newClipId,
                        trackType: sourceTrack.type
                    })
                }
            }

            // ================================================================
            // Step 3: Import effects (if requested)
            // ================================================================
            if (this.payload.importEffects !== false && sourceProject.timeline.effects) {
                if (!draft.timeline.effects) {
                    draft.timeline.effects = []
                }

                for (const sourceEffect of sourceProject.timeline.effects) {
                    // Import global effects (Zoom, Screen) and clip-specific effects
                    // NOTE: Webcam removed - webcam styling now lives on clip.layout
                    const isGlobalEffect = sourceEffect.type === EffectType.Zoom ||
                        sourceEffect.type === EffectType.Screen
                    const isClipEffect = sourceEffect.clipId && clipIdMap.has(sourceEffect.clipId)

                    if (!isGlobalEffect && !isClipEffect) continue

                    const newEffectId = `lib-effect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

                    const clonedEffect: Effect = {
                        ...structuredClone(sourceEffect),
                        id: newEffectId,
                        startTime: sourceEffect.startTime + startTimeOffset!,
                        endTime: sourceEffect.endTime + startTimeOffset!,
                    }

                    // Update clipId reference if this is a clip-specific effect
                    if (sourceEffect.clipId) {
                        clonedEffect.clipId = clipIdMap.get(sourceEffect.clipId)
                    }

                    draft.timeline.effects.push(clonedEffect)
                    this.importedItems.push({ type: TimelineItemType.Effect, id: newEffectId })
                }
            }

            // ================================================================
            // Step 4: Update timeline duration
            // ================================================================
            const newDuration = Math.max(
                draft.timeline.duration || 0,
                ...draft.timeline.tracks.flatMap(t =>
                    t.clips.map(c => c.startTime + c.duration)
                )
            )
            draft.timeline.duration = newDuration

            return draft
        })

        // Select the first imported clip
        if (importedClipIds.length > 0) {
            this.context.getStore().selectClip(importedClipIds[0])
        }

        return {
            success: true,
            data: { importedClipIds }
        }
    }

    doUndo(): CommandResult<{ importedClipIds: string[] }> {
        const project = this.context.getProject()
        if (!project) {
            return { success: false, error: 'No active project' }
        }

        const clipIds: string[] = []

        this.context.getStore().updateProjectData((draft) => {
            // Remove in reverse order: effects → clips → recordings
            const effects = this.importedItems.filter(i => i.type === TimelineItemType.Effect)
            const clips = this.importedItems.filter(i => i.type === TimelineItemType.Clip)
            const recordings = this.importedItems.filter(i => i.type === TimelineItemType.Recording)

            // Remove effects
            if (draft.timeline.effects && effects.length > 0) {
                const effectIds = new Set(effects.map(e => e.id))
                draft.timeline.effects = draft.timeline.effects.filter(e => !effectIds.has(e.id))
            }

            // Remove clips
            for (const clipItem of clips) {
                const clipInfo = ClipLookup.byId(draft, clipItem.id)
                if (clipInfo) {
                    removeClipFromTrack(draft, clipItem.id, clipInfo.track)
                    clipIds.push(clipItem.id)
                }
            }

            // Remove recordings
            const recordingIds = new Set(recordings.map(r => r.id))
            draft.recordings = draft.recordings.filter(r => !recordingIds.has(r.id))

            // Recalculate timeline duration
            draft.timeline.duration = Math.max(
                0,
                ...draft.timeline.tracks.flatMap(t =>
                    t.clips.map(c => c.startTime + c.duration)
                )
            )

            return draft
        })

        // Cleanup resources
        for (const item of this.importedItems) {
            if (item.type === TimelineItemType.Clip) {
                ProjectCleanupService.cleanupClipResources(item.id)
            } else if (item.type === TimelineItemType.Recording) {
                ProjectCleanupService.cleanupUnusedRecordings(project, item.id)
            }
        }

        // Restore selection
        const store = this.context.getStore()
        store.clearSelection()
        if (this.previousSelection && this.previousSelection.length > 0) {
            const [first, ...rest] = this.previousSelection
            if (first) {
                store.selectClip(first)
                rest.forEach(id => store.selectClip(id, true))
            }
        }

        return { success: true, data: { importedClipIds: clipIds } }
    }
}
