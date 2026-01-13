import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useKeyboardEvents } from '@/features/core/keyboard/hooks/use-keyboard-events'
import { useShallow } from 'zustand/react/shallow'

const FRAME_TIME_MS = 1000 / 30

const clampTime = (time: number, maxTime: number): number => {
  return Math.max(0, Math.min(maxTime, time))
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

  const handlePlayPause = useCallback(() => {
    const isPlaying = useProjectStore.getState().isPlaying
    if (isPlaying) {
      pause()
    } else {
      play()
    }
  }, [pause, play])

  const handleShuttleReverse = useCallback(() => {
    // Always clear existing interval first to prevent stacking
    if (shuttleIntervalRef.current) {
      clearInterval(shuttleIntervalRef.current)
      shuttleIntervalRef.current = null
    }

    playbackSpeedRef.current = Math.max(-4, playbackSpeedRef.current - 1)
    if (playbackSpeedRef.current === 0) playbackSpeedRef.current = -1

    pause()

    if (playbackSpeedRef.current !== 0) {
      shuttleIntervalRef.current = setInterval(() => {
        const frameTime = FRAME_TIME_MS * playbackSpeedRef.current
        const currentTime = useProjectStore.getState().currentTime
        const maxTime = useProjectStore.getState().currentProject?.timeline?.duration || 0
        seek(clampTime(currentTime + frameTime, maxTime))
      }, FRAME_TIME_MS)
    }
  }, [pause, seek])

  const handleShuttleStop = useCallback(() => {
    if (shuttleIntervalRef.current) {
      clearInterval(shuttleIntervalRef.current)
      shuttleIntervalRef.current = null
    }
    playbackSpeedRef.current = 1
    pause()
  }, [pause])

  const handleShuttleForward = useCallback(() => {
    // Always clear existing interval first to prevent stacking
    if (shuttleIntervalRef.current) {
      clearInterval(shuttleIntervalRef.current)
      shuttleIntervalRef.current = null
    }

    playbackSpeedRef.current = Math.min(4, playbackSpeedRef.current + 1)
    if (playbackSpeedRef.current === 0) playbackSpeedRef.current = 1

    pause()

    if (playbackSpeedRef.current !== 0) {
      shuttleIntervalRef.current = setInterval(() => {
        const frameTime = FRAME_TIME_MS * playbackSpeedRef.current
        const state = useProjectStore.getState()
        const currentTime = state.currentTime
        const maxTime = state.currentProject?.timeline?.duration || 0
        seek(clampTime(currentTime + frameTime, maxTime))
      }, FRAME_TIME_MS)
    }
  }, [pause, seek])

  const handleFramePrevious = useCallback(() => {
    const frameTime = FRAME_TIME_MS
    const currentTime = useProjectStore.getState().currentTime
    const maxTime = useProjectStore.getState().currentProject?.timeline?.duration || 0
    seek(clampTime(currentTime - frameTime, maxTime))
  }, [seek])

  const handleFrameNext = useCallback(() => {
    const frameTime = FRAME_TIME_MS
    const state = useProjectStore.getState()
    const maxTime = state.currentProject?.timeline?.duration || 0
    seek(clampTime(state.currentTime + frameTime, maxTime))
  }, [seek])

  const handleFramePrevious10 = useCallback(() => {
    const frameTime = FRAME_TIME_MS * 10
    const currentTime = useProjectStore.getState().currentTime
    const maxTime = useProjectStore.getState().currentProject?.timeline?.duration || 0
    seek(clampTime(currentTime - frameTime, maxTime))
  }, [seek])

  const handleFrameNext10 = useCallback(() => {
    const frameTime = FRAME_TIME_MS * 10
    const state = useProjectStore.getState()
    const maxTime = state.currentProject?.timeline?.duration || 0
    seek(clampTime(state.currentTime + frameTime, maxTime))
  }, [seek])

  const handleTimelineStart = useCallback(() => {
    seek(0)
  }, [seek])

  const handleTimelineEnd = useCallback(() => {
    const maxTime = useProjectStore.getState().currentProject?.timeline?.duration || 0
    seek(maxTime)
  }, [seek])

  const handleClipPrevious = useCallback(() => {
    const project = useProjectStore.getState().currentProject
    if (!project) return
    const time = useProjectStore.getState().currentTime
    const clips = project.timeline.tracks
      .flatMap(t => t.clips)
      .sort((a, b) => a.startTime - b.startTime)
      .filter(c => c.startTime < time)

    if (clips.length > 0) {
      const clip = clips[clips.length - 1]
      seek(clip.startTime)
      selectClip(clip.id)
    }
  }, [seek, selectClip])

  const handleClipNext = useCallback(() => {
    const project = useProjectStore.getState().currentProject
    if (!project) return
    const time = useProjectStore.getState().currentTime
    const clips = project.timeline.tracks
      .flatMap(t => t.clips)
      .sort((a, b) => a.startTime - b.startTime)
      .filter(c => c.startTime > time)

    if (clips.length > 0) {
      const clip = clips[0]
      seek(clip.startTime)
      selectClip(clip.id)
    }
  }, [seek, selectClip])

  const handleJumpBackward1s = useCallback(() => {
    const currentTime = useProjectStore.getState().currentTime
    const maxTime = useProjectStore.getState().currentProject?.timeline?.duration || 0
    seek(clampTime(currentTime - 1000, maxTime))
  }, [seek])

  const handleJumpForward1s = useCallback(() => {
    const state = useProjectStore.getState()
    const maxTime = state.currentProject?.timeline?.duration || 0
    seek(clampTime(state.currentTime + 1000, maxTime))
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
    if (!enabled && shuttleIntervalRef.current) {
      clearInterval(shuttleIntervalRef.current)
      shuttleIntervalRef.current = null
    }
  }, [enabled])

  useEffect(() => {
    return () => {
      if (shuttleIntervalRef.current) {
        clearInterval(shuttleIntervalRef.current)
        shuttleIntervalRef.current = null
      }
    }
  }, [])

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
