/**
 * useTimelineClipAssets - Composite hook for timeline clip assets and interactions
 *
 * Consolidates multiple asset-loading and interaction hooks to reduce
 * hook count in timeline-clip.tsx and better organize clip-specific state.
 */

import type Konva from 'konva'
import type { Clip, Recording } from '@/types/project'
import type { WaveformData } from '@/features/media/audio/waveform-analyzer'
import { useClipTrimInteraction } from './use-clip-trim-interaction'
import { useClipWaveform } from './use-clip-waveform'
import { useClipThumbnails } from './use-clip-thumbnails'

export interface UseTimelineClipAssetsOptions {
    /** The clip to load assets for */
    clip: Clip
    /** The recording associated with the clip */
    recording: Recording | undefined
    /** Other clips in the same track (for trim boundary calculation) */
    otherClipsInTrack: Clip[]
    /** Pixels per millisecond for timeline calculations */
    pixelsPerMs: number
    /** Height of the clip's inner content area */
    clipInnerHeight: number
    /** Whether to load waveforms */
    showWaveforms: boolean
    /** Whether to load thumbnails */
    showThumbnails: boolean
    /** Callback when trim start changes */
    onTrimStart?: (clipId: string, newStartTime: number) => void
    /** Callback when trim end changes */
    onTrimEnd?: (clipId: string, newEndTime: number) => void
}

export interface UseTimelineClipAssetsReturn {
    // Trim interaction state
    /** Current trim edge being dragged ('left' | 'right' | null) */
    trimEdge: 'left' | 'right' | null
    /** Preview of trim operation in progress */
    trimPreview: { startTime: number; endTime: number } | null
    /** Handler for starting a trim operation */
    handleTrimMouseDown: (edge: 'left' | 'right', e: Konva.KonvaEventObject<MouseEvent>) => void

    // Waveform data
    /** Audio waveform data for the clip */
    waveformData: WaveformData | null

    // Thumbnail data
    /** Video thumbnails for the clip */
    thumbnails: HTMLImageElement[]
    /** Whether thumbnails are currently loading */
    thumbnailsLoading: boolean
}

/**
 * Composite hook that consolidates clip asset loading and trim interaction.
 *
 * Reduces the number of individual hook calls in timeline-clip.tsx and
 * provides a single, well-organized interface for all clip-specific data.
 */
export function useTimelineClipAssets({
    clip,
    recording,
    otherClipsInTrack,
    pixelsPerMs,
    clipInnerHeight,
    showWaveforms: _showWaveforms,
    showThumbnails,
    onTrimStart,
    onTrimEnd,
}: UseTimelineClipAssetsOptions): UseTimelineClipAssetsReturn {
    // Trim interaction
    const {
        trimEdge,
        trimPreview,
        handleTrimMouseDown,
    } = useClipTrimInteraction({
        clip,
        recording,
        otherClipsInTrack,
        pixelsPerMs,
        onTrimStart,
        onTrimEnd,
    })

    // Waveform data - only load if waveforms are enabled and clip has audio
    const waveformData = useClipWaveform({
        clipId: clip.id,
        recording,
        sourceIn: clip.sourceIn ?? 0,
        sourceOut: clip.sourceOut ?? (clip.sourceIn ?? 0) + (recording?.duration ?? 0),
        samplesPerSecond: 50,
    })

    // Thumbnails - only load if thumbnails are enabled
    const { thumbnails, isLoading: thumbnailsLoading } = useClipThumbnails({
        clipId: clip.id,
        recording,
        sourceIn: clip.sourceIn ?? 0,
        sourceOut: clip.sourceOut ?? (clip.sourceIn ?? 0) + (recording?.duration ?? 0),
        clipInnerHeight,
        enabled: showThumbnails,
    })

    return {
        // Trim state
        trimEdge,
        trimPreview,
        handleTrimMouseDown,

        // Waveform
        waveformData,

        // Thumbnails
        thumbnails,
        thumbnailsLoading,
    }
}
