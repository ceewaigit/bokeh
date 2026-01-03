/**
 * ImportMediaCommand - Unified command for all media imports
 * 
 * This is the single entry point for importing media into the timeline.
 * It handles:
 * - File imports (drag-drop, file picker)
 * - Library imports
 * - Optional aspect ratio update to match imported media
 * - Full undo/redo support
 */

import { Command, CommandResult } from '../base/Command'
import type { CommandContext } from '../base/CommandContext'
import type { Clip, Recording, CanvasSettings } from '@/types/project'
import { AspectRatioPreset, TrackType } from '@/types/project'
import { addRecordingToProject } from '@/features/timeline/clips/clip-creation'
import { findClipById } from '@/features/timeline/clips/clip-reflow'
import { removeClipFromTrack } from '@/features/timeline/clips/clip-crud'
import { ProjectCleanupService } from '@/features/timeline/project-cleanup'
import { createRecording } from '@/features/timeline/clips/recording-factory'
import { DEFAULT_CANVAS_SETTINGS } from '@/shared/constants/aspect-ratio-presets'

// ============================================================================
// Types
// ============================================================================

/** Source type for the import */
export type ImportSource = 'file' | 'library' | 'drop'

/** Payload for importing media */
export interface ImportMediaPayload {
    /** Source of the import */
    source: ImportSource

    /** 
     * Either asset details (for new imports) or an existing Recording (for library imports).
     * For library imports, the recording should already be properly configured.
     */
    media: ImportMediaDetails | Recording

    /** Track to add to (default: video) */
    trackType?: TrackType

    /** Whether to update canvas aspect ratio to match media dimensions */
    updateAspectRatio?: boolean

    /** Optional starting time for the clip */
    startTime?: number
}

/** Details for a new media import */
export interface ImportMediaDetails {
    type: 'video' | 'image'
    filePath: string
    duration: number
    width: number
    height: number
    frameRate?: number
    hasAudio?: boolean
}

// ============================================================================
// Helpers
// ============================================================================

function isRecording(media: ImportMediaDetails | Recording): media is Recording {
    return 'id' in media && 'sourceType' in media
}

function createRecordingFromDetails(details: ImportMediaDetails, source: ImportSource): Recording {
    const recordingSource = source === 'library' ? 'library' : 'external'

    return createRecording({
        type: details.type,
        source: recordingSource,
        filePath: details.filePath,
        duration: details.duration,
        width: details.width,
        height: details.height,
        frameRate: details.frameRate,
        hasAudio: details.hasAudio,
        imageSource: details.type === 'image' ? {
            imagePath: details.filePath,
            sourceWidth: details.width,
            sourceHeight: details.height,
        } : undefined,
    })
}

// ============================================================================
// Command
// ============================================================================

export class ImportMediaCommand extends Command<{ clipId: string; recordingId: string }> {
    private clipId?: string
    private recordingId?: string
    private previousSelection?: string[]
    private previousCanvasSettings?: CanvasSettings

    constructor(
        private context: CommandContext,
        private payload: ImportMediaPayload
    ) {
        super({
            name: 'ImportMedia',
            description: `Import media from ${payload.source}`,
            category: 'timeline'
        })
    }

    canExecute(): boolean {
        return !!this.context.getProject()
    }

    doExecute(): CommandResult<{ clipId: string; recordingId: string }> {
        const project = this.context.getProject()
        if (!project) {
            return { success: false, error: 'No active project' }
        }

        this.previousSelection = [...this.context.getSelectedClips()]

        // Create or use existing recording
        let recording: Recording
        if (isRecording(this.payload.media)) {
            recording = this.payload.media
        } else {
            recording = createRecordingFromDetails(this.payload.media, this.payload.source)
        }

        // Store for undo
        this.recordingId = recording.id

        // Save previous canvas settings for undo
        if (this.payload.updateAspectRatio) {
            this.previousCanvasSettings = project.settings.canvas
                ? { ...project.settings.canvas }
                : undefined
        }

        let newClip: Clip | null = null

        // Add recording and create clip
        this.context.getStore().updateProjectData((draft) => {
            // Add recording if not exists
            if (!draft.recordings.some(r => r.id === recording.id)) {
                draft.recordings.push(recording)
            }

            // Create clip
            newClip = addRecordingToProject(
                draft,
                recording,
                { trackType: this.payload.trackType }
            )

            // Update aspect ratio if requested
            if (this.payload.updateAspectRatio && newClip) {
                draft.settings.canvas = {
                    ...(draft.settings.canvas ?? DEFAULT_CANVAS_SETTINGS),
                    aspectRatio: AspectRatioPreset.Custom,
                    customWidth: recording.width,
                    customHeight: recording.height,
                }
            }

            return draft
        })

        if (!newClip) {
            return { success: false, error: 'Failed to create clip' }
        }

        const createdClip = newClip as Clip
        this.clipId = createdClip.id
        this.context.getStore().selectClip(createdClip.id)

        return {
            success: true,
            data: {
                clipId: createdClip.id,
                recordingId: recording.id
            }
        }
    }

    doUndo(): CommandResult<{ clipId: string; recordingId: string }> {
        const project = this.context.getProject()
        if (!project || !this.clipId || !this.recordingId) {
            return { success: false, error: 'No clip to undo' }
        }

        const clipId = this.clipId
        const recordingId = this.recordingId

        this.context.getStore().updateProjectData((draft) => {
            // Remove clip
            const clipInfo = findClipById(draft, clipId)
            if (clipInfo) {
                removeClipFromTrack(draft, clipId, clipInfo.track)
            }

            // Remove recording
            draft.recordings = draft.recordings.filter(r => r.id !== recordingId)

            // Restore canvas settings
            if (this.payload.updateAspectRatio) {
                draft.settings.canvas = this.previousCanvasSettings ?? DEFAULT_CANVAS_SETTINGS
            }

            return draft
        })

        // Cleanup resources
        ProjectCleanupService.cleanupClipResources(clipId)
        ProjectCleanupService.cleanupUnusedRecordings(project, recordingId)

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

        return { success: true, data: { clipId, recordingId } }
    }

    doRedo(): CommandResult<{ clipId: string; recordingId: string }> {
        // Re-execute the command
        return this.doExecute()
    }
}
