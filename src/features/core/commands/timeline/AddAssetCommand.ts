/**
 * AddAssetCommand - Add an external asset (video/image/audio) to the timeline.
 *
 * This command owns the full logic for importing assets:
 * 1. Creates a recording from the asset using the factory
 * 2. Adds the recording to the project
 * 3. Creates a clip on the appropriate track
 *
 * Supports undo/redo by tracking the created recording and clip IDs.
 *
 * NOTE: This command does NOT extend TimelineCommand. Effect sync is intentionally
 * skipped for add operations because:
 * - Video clips are added via addClipToTrack() which places them at the end
 *   or at a specific position without shifting existing clips
 * - Webcam clips use WebcamTrackValidator for collision detection, not reflow
 * - New clips don't affect existing effects' timing (no ripple effect)
 *
 * If future requirements need effect sync on add (e.g., ripple insert mode),
 * refactor to extend TimelineCommand and use deferClipChange() with 'add' type.
 */

import { Command, CommandResult } from '../base/Command'
import type { CommandContext } from '../base/CommandContext'
import type { Clip, TrackType } from '@/types/project'
import { createRecording, type RecordingType } from '@/features/ui/timeline/clips/recording-factory'
import { addClipToTrack, removeClipFromTrack } from '@/features/ui/timeline/clips/clip-crud'
import { ProjectCleanupService } from '@/features/ui/timeline/project-cleanup'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'

// ============================================================================
// Types
// ============================================================================

export interface AssetDetails {
    path: string
    duration: number
    width: number
    height: number
    type: 'video' | 'audio' | 'image'
    frameRate?: number
    name?: string
    requiresProxy?: boolean
}

interface AddAssetPayload {
    asset: AssetDetails
    options?: number | { startTime?: number; insertIndex?: number; trackType?: TrackType; inheritCrop?: boolean }
}

// ============================================================================
// Command
// ============================================================================

export class AddAssetCommand extends Command<{ clipId: string }> {
    private clipId?: string
    private recordingId?: string
    private previousSelection?: string[]

    constructor(
        private context: CommandContext,
        private payload: AddAssetPayload
    ) {
        super({
            name: 'AddAsset',
            description: `Add asset ${payload.asset.name}`,
            category: 'timeline'
        })
    }

    canExecute(): boolean {
        return !!this.context.getProject()
    }

    doExecute(): CommandResult<{ clipId: string }> {
        const project = this.context.getProject()
        if (!project) {
            return { success: false, error: 'No active project' }
        }

        this.previousSelection = [...this.context.getSelectedClips()]

        let newClip: Clip | null = null

        // Use updateProjectData to ensure persistence and reactivity
        this.context.getStore().updateProjectData((draft) => {
            const { asset, options } = this.payload

            // Normalize options
            let startTime: number | undefined
            let trackType: TrackType | undefined
            let insertIndex: number | undefined

            if (typeof options === 'number') {
                startTime = options
            } else if (typeof options === 'object') {
                startTime = options.startTime
                trackType = options.trackType
                insertIndex = options.insertIndex
            }

            // 1. Create recording using factory
            const recordingType: RecordingType = asset.type === 'image' ? 'image' : 'video'
            const recording = createRecording({
                type: recordingType,
                source: 'external',
                filePath: asset.path,
                duration: asset.duration,
                width: asset.width,
                height: asset.height,
                frameRate: asset.frameRate,
                hasAudio: asset.type === 'video' || asset.type === 'audio',
                imageSource: asset.type === 'image' ? {
                    imagePath: asset.path,
                    sourceWidth: asset.width,
                    sourceHeight: asset.height,
                } : undefined,
                requiresProxy: asset.requiresProxy
            })

            // 2. Add recording to project
            draft.recordings.push(recording)

            // 3. Create clip on track
            newClip = addClipToTrack(draft, recording.id, startTime, {
                trackType,
                insertIndex
            })

            return draft
        })

        if (!newClip) {
            return { success: false, error: 'Failed to add asset' }
        }

        const createdClip = newClip as Clip
        this.clipId = createdClip.id
        this.recordingId = createdClip.recordingId

        // Select the new clip
        this.context.getStore().selectClip(createdClip.id)

        return {
            success: true,
            data: { clipId: createdClip.id }
        }
    }

    doUndo(): CommandResult<{ clipId: string }> {
        const project = this.context.getProject()
        if (!project || !this.clipId || !this.recordingId) {
            return { success: false, error: 'No clip to undo' }
        }

        const clipId = this.clipId
        const recordingId = this.recordingId

        this.context.getStore().updateProjectData((draft) => {
            const clipInfo = ClipLookup.byId(draft, clipId)
            if (clipInfo) {
                removeClipFromTrack(draft, clipId, clipInfo.track)
            }

            // Remove the recording we created
            draft.recordings = draft.recordings.filter(r => r.id !== recordingId)

            return draft
        })

        ProjectCleanupService.cleanupClipResources(clipId)
        ProjectCleanupService.cleanupUnusedRecordings(project, recordingId)

        const store = this.context.getStore()
        store.clearSelection()
        if (this.previousSelection && this.previousSelection.length > 0) {
            const [first, ...rest] = this.previousSelection
            if (first) {
                store.selectClip(first)
                rest.forEach(id => store.selectClip(id, true))
            }
        }

        return {
            success: true,
            data: { clipId }
        }
    }

    doRedo(): CommandResult<{ clipId: string }> {
        return this.doExecute()
    }
}
