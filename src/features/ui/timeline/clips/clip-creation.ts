/**
 * Clip Creation Operations
 *
 * Low-level functions for creating clips from recordings.
 *
 * Note: For adding external assets (video/image/audio files), use AddAssetCommand
 * which owns the full import flow with undo/redo support.
 */

import type { Project, Recording, Clip } from '@/types/project'
import { TrackType } from '@/types/project'
import { addClipToTrack } from './clip-crud'

/**
 * Add recording to project and create a clip.
 *
 * Used internally by core-slice when a recording is completed.
 * For external asset imports, use AddAssetCommand instead.
 *
 * Note: recording-level `recording.effects` is legacy; all effects live on `project.timeline.effects`.
 */
export function addRecordingToProject(
    project: Project,
    recording: Recording,
    options?: { trackType?: TrackType }
): Clip | null {
    // Add to recordings if not exists
    const exists = project.recordings.find((r) => r.id === recording.id)
    if (!exists) {
        project.recordings.push(recording)
    }

    // Create clip
    const clip = addClipToTrack(project, recording.id, undefined, options)

    return clip
}
