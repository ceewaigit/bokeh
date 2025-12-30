/**
 * Clip Creation Operations
 * 
 * Functions for creating clips from recordings and assets.
 * Extracted from timeline-operations.ts.
 */

import type { Project, Recording, Clip, VideoRecording, ImageRecording } from '@/types/project'
import { TrackType } from '@/types/project'
import { addClipToTrack } from './clip-crud'

// Simple ID generator to avoid external dependencies
function generateId(): string {
    return Math.random().toString(36).substr(2, 9)
}

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
 * Add recording with effects
 */
export function addRecordingToProject(
    project: Project,
    recording: Recording,
    createEffects: (recording: Recording) => void,
    options?: { trackType?: TrackType }
): Clip | null {
    // Add to recordings if not exists
    const exists = project.recordings.find((r) => r.id === recording.id)
    if (!exists) {
        project.recordings.push(recording)
        // Create default effects for the new recording
        createEffects(recording)
    }

    // Create clip
    const clip = addClipToTrack(project, recording.id, undefined, options)

    return clip
}

/**
 * Add asset as recording and clip
 */
export function addAssetRecording(
    project: Project,
    asset: AssetDetails,
    startTimeOrOptions?: number | { startTime?: number; insertIndex?: number; trackType?: TrackType; inheritCrop?: boolean }
): Clip | null {
    const recordingId = generateId()

    // Common properties for all recording types (from RecordingBase + filePath)
    // Note: We don't construct RecordingBase directly, but the properties match.
    const commonProps = {
        id: recordingId,
        duration: asset.duration,
        width: asset.width,
        height: asset.height,
        frameRate: asset.frameRate || 30,
        hasAudio: asset.type === 'video' || asset.type === 'audio',
        effects: [],
        filePath: asset.path,
    }

    let recording: Recording

    if (asset.type === 'image') {
        const imageRecording: ImageRecording = {
            ...commonProps,
            sourceType: 'image',
            imageSource: {
                imagePath: asset.path,
                sourceWidth: asset.width,
                sourceHeight: asset.height
            }
        }
        recording = imageRecording
    } else {
        // Video or Audio defaults to VideoRecording structure
        const videoRecording: VideoRecording = {
            ...commonProps,
            sourceType: 'video',
        }
        recording = videoRecording
    }

    // Determine start time from options
    let startTime = typeof startTimeOrOptions === 'number' ? startTimeOrOptions : undefined
    if (typeof startTimeOrOptions === 'object' && startTimeOrOptions.startTime !== undefined) {
        startTime = startTimeOrOptions.startTime
    }

    // 1. Add recording
    project.recordings.push(recording)

    // 2. Add clip
    return addClipToTrack(project, recording.id, startTime)
}
