/**
 * Clip Creation Operations
 * 
 * Functions for creating clips from recordings and assets.
 * Uses the recording factory for consistent recording creation.
 */

import type { Project, Recording, Clip } from '@/types/project'
import { TrackType } from '@/types/project'
import { addClipToTrack } from './clip-crud'
import { createRecording, type RecordingType } from './recording-factory'

export interface AssetDetails {
    path: string
    duration: number
    width: number
    height: number
    type: 'video' | 'audio' | 'image'
    frameRate?: number
    name?: string
}

/**
 * Add recording to project and create a clip.
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

/**
 * Add asset as recording and clip.
 * 
 * Uses the recording factory for consistent recording creation with proper capabilities.
 */
export function addAssetRecording(
    project: Project,
    asset: AssetDetails,
    startTimeOrOptions?: number | { startTime?: number; insertIndex?: number; trackType?: TrackType; inheritCrop?: boolean }
): Clip | null {
    // Map asset type to recording type
    const recordingType: RecordingType = asset.type === 'image' ? 'image' : 'video'

    // Use factory to create properly configured recording
    const recording = createRecording({
        type: recordingType,
        source: 'external', // Assets are always external imports
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
    })

    // Determine start time and options
    let startTime = typeof startTimeOrOptions === 'number' ? startTimeOrOptions : undefined
    let trackType: TrackType | undefined
    if (typeof startTimeOrOptions === 'object' && startTimeOrOptions.startTime !== undefined) {
        startTime = startTimeOrOptions.startTime
    }
    if (typeof startTimeOrOptions === 'object' && startTimeOrOptions.trackType !== undefined) {
        trackType = startTimeOrOptions.trackType
    }

    // 1. Add recording
    project.recordings.push(recording)

    // 2. Add clip
    let insertIndex: number | undefined
    if (typeof startTimeOrOptions === 'object' && startTimeOrOptions.insertIndex !== undefined) {
        insertIndex = startTimeOrOptions.insertIndex
    }

    const clip = addClipToTrack(project, recording.id, startTime, {
        trackType,
        insertIndex
    })

    return clip
}

