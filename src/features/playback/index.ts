/**
 * Playback Domain
 *
 * Consolidated playback-related logic:
 * - PlaybackService: manages play/pause state
 * - PlayheadService: manages playhead position and clip tracking
 * - usePlayback: keyboard shortcuts for playback control
 * - usePlayheadState: computed hook for playhead state
 */

// Services
export { playbackService, PlaybackService } from './services/playback-service'
export { PlayheadService, type PlayheadState } from './services/playhead-service'

// Hooks
export { useTimelinePlayback } from './hooks/use-playback'
export { usePlayheadState, computePlayheadState } from './hooks/use-playhead'

// Utils
export { getTimelineTimeFromX, getTimelineTimeFromClientX, getTimelineTimeFromStagePointer } from './utils/seek-utils'
