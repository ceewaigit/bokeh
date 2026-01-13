import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useKeyboardEvents } from '@/features/core/keyboard/hooks/use-keyboard-events'
import { useShallow } from 'zustand/react/shallow'

const FRAME_TIME_MS = 1000 / 30

const clampTime = (time: number, maxTime: number): number => {
  return Math.max(0, Math.min(maxTime, time))
}

/**
 * Helper to get playback-related state from project store.
 * Used in event handlers and intervals where we need fresh state.
 */
function getPlaybackState() {
  const state = useProjectStore.getState()
  return {
    currentTime: state.currentTime,
    maxTime: state.currentProject?.timeline?.duration ?? 0,
    project: state.currentProject,
    isPlaying: state.isPlaying,
  }
}

interface UseTimelinePlaybackProps {
  enabled?: boolean
}

/**
 * Hook that handles playback-related keyboard shortcuts only.
 * Editing operations are handled by useCommandKeyboard.
 *
 * in interval callbacks without triggering effect re-runs on every time change.
 */
export function useTimelinePlayback({ enabled = true }: UseTimelinePlaybackProps = {}) {
  const {
    play,
    pause,
    seek,
    selectClip
  } = useProjectStore(useShallow((s) => ({
    play: s.play,
    pause: s.pause,
    seek: s.seek,
    selectClip: s.selectClip
  })))

  const playbackSpeedRef = useRef(1)
  const shuttleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Helper to clear shuttle interval
  const clearShuttleInterval = useCallback(() => {
    if (shuttleIntervalRef.current) {
      clearInterval(shuttleIntervalRef.current)
      shuttleIntervalRef.current = null
    }
  }, [])

  const handlePlayPause = useCallback(() => {
    const { isPlaying } = getPlaybackState()
    isPlaying ? pause() : play()
  }, [pause, play])

  const handleShuttleReverse = useCallback(() => {
    clearShuttleInterval()

    playbackSpeedRef.current = Math.max(-4, playbackSpeedRef.current - 1)
    if (playbackSpeedRef.current === 0) playbackSpeedRef.current = -1

    pause()

    if (playbackSpeedRef.current !== 0) {
      shuttleIntervalRef.current = setInterval(() => {
        const { currentTime, maxTime } = getPlaybackState()
        seek(clampTime(currentTime + FRAME_TIME_MS * playbackSpeedRef.current, maxTime))
      }, FRAME_TIME_MS)
    }
  }, [clearShuttleInterval, pause, seek])

  const handleShuttleStop = useCallback(() => {
    clearShuttleInterval()
    playbackSpeedRef.current = 1
    pause()
  }, [clearShuttleInterval, pause])

  const handleShuttleForward = useCallback(() => {
    clearShuttleInterval()
    playbackSpeedRef.current = Math.min(4, playbackSpeedRef.current + 1)
    if (playbackSpeedRef.current === 0) playbackSpeedRef.current = 1
    pause()

    if (playbackSpeedRef.current !== 0) {
      shuttleIntervalRef.current = setInterval(() => {
        const { currentTime, maxTime } = getPlaybackState()
        seek(clampTime(currentTime + FRAME_TIME_MS * playbackSpeedRef.current, maxTime))
      }, FRAME_TIME_MS)
    }
  }, [clearShuttleInterval, pause, seek])

  const handleFramePrevious = useCallback(() => {
    const { currentTime, maxTime } = getPlaybackState()
    seek(clampTime(currentTime - FRAME_TIME_MS, maxTime))
  }, [seek])

  const handleFrameNext = useCallback(() => {
    const { currentTime, maxTime } = getPlaybackState()
    seek(clampTime(currentTime + FRAME_TIME_MS, maxTime))
  }, [seek])

  const handleFramePrevious10 = useCallback(() => {
    const { currentTime, maxTime } = getPlaybackState()
    seek(clampTime(currentTime - FRAME_TIME_MS * 10, maxTime))
  }, [seek])

  const handleFrameNext10 = useCallback(() => {
    const { currentTime, maxTime } = getPlaybackState()
    seek(clampTime(currentTime + FRAME_TIME_MS * 10, maxTime))
  }, [seek])

  const handleTimelineStart = useCallback(() => {
    seek(0)
  }, [seek])

  const handleTimelineEnd = useCallback(() => {
    const { maxTime } = getPlaybackState()
    seek(maxTime)
  }, [seek])

  const handleClipPrevious = useCallback(() => {
    const { project, currentTime } = getPlaybackState()
    if (!project) return
    const clips = project.timeline.tracks
      .flatMap(t => t.clips)
      .sort((a, b) => a.startTime - b.startTime)
      .filter(c => c.startTime < currentTime)

    if (clips.length > 0) {
      const clip = clips[clips.length - 1]
      seek(clip.startTime)
      selectClip(clip.id)
    }
  }, [seek, selectClip])

  const handleClipNext = useCallback(() => {
    const { project, currentTime } = getPlaybackState()
    if (!project) return
    const clips = project.timeline.tracks
      .flatMap(t => t.clips)
      .sort((a, b) => a.startTime - b.startTime)
      .filter(c => c.startTime > currentTime)

    if (clips.length > 0) {
      const clip = clips[0]
      seek(clip.startTime)
      selectClip(clip.id)
    }
  }, [seek, selectClip])

  const handleJumpBackward1s = useCallback(() => {
    const { currentTime, maxTime } = getPlaybackState()
    seek(clampTime(currentTime - 1000, maxTime))
  }, [seek])

  const handleJumpForward1s = useCallback(() => {
    const { currentTime, maxTime } = getPlaybackState()
    seek(clampTime(currentTime + 1000, maxTime))
  }, [seek])

  const handleEscape = useCallback(() => {
    // Clear all selection (clips and effects) when Escape is pressed
    useProjectStore.getState().clearSelection()
  }, [])

  const bindings = useMemo(() => ([
    { event: 'playPause', handler: handlePlayPause },
    { event: 'shuttleReverse', handler: handleShuttleReverse },
    { event: 'shuttleStop', handler: handleShuttleStop },
    { event: 'shuttleForward', handler: handleShuttleForward },
    { event: 'framePrevious', handler: handleFramePrevious },
    { event: 'frameNext', handler: handleFrameNext },
    { event: 'framePrevious10', handler: handleFramePrevious10 },
    { event: 'frameNext10', handler: handleFrameNext10 },
    { event: 'timelineStart', handler: handleTimelineStart },
    { event: 'timelineEnd', handler: handleTimelineEnd },
    { event: 'clipPrevious', handler: handleClipPrevious },
    { event: 'clipNext', handler: handleClipNext },
    { event: 'escape', handler: handleEscape }
  ]), [
    handlePlayPause,
    handleShuttleReverse,
    handleShuttleStop,
    handleShuttleForward,
    handleFramePrevious,
    handleFrameNext,
    handleFramePrevious10,
    handleFrameNext10,
    handleTimelineStart,
    handleTimelineEnd,
    handleClipPrevious,
    handleClipNext,
    handleEscape
  ])

  useKeyboardEvents(bindings, enabled)

  useEffect(() => {
    if (!enabled) clearShuttleInterval()
  }, [enabled, clearShuttleInterval])

  useEffect(() => {
    return clearShuttleInterval
  }, [clearShuttleInterval])

  return useMemo(() => ({
    playbackSpeed: playbackSpeedRef.current,
    shuttleReverse: handleShuttleReverse,
    shuttleStop: handleShuttleStop,
    shuttleForward: handleShuttleForward,
    framePrevious: handleFramePrevious,
    frameNext: handleFrameNext,
    framePrevious10: handleFramePrevious10,
    frameNext10: handleFrameNext10,
    timelineStart: handleTimelineStart,
    timelineEnd: handleTimelineEnd,
    clipPrevious: handleClipPrevious,
    clipNext: handleClipNext,
    playPause: handlePlayPause,
    jumpBackward1s: handleJumpBackward1s,
    jumpForward1s: handleJumpForward1s,
    escape: handleEscape
  }), [
    handleShuttleReverse,
    handleShuttleStop,
    handleShuttleForward,
    handleFramePrevious,
    handleFrameNext,
    handleFramePrevious10,
    handleFrameNext10,
    handleTimelineStart,
    handleTimelineEnd,
    handleClipPrevious,
    handleClipNext,
    handlePlayPause,
    handleJumpBackward1s,
    handleJumpForward1s,
    handleEscape
  ])
}
