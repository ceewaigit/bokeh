import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { useKeyboardEvents } from '@/hooks/useKeyboardEvents'
import { useShallow } from 'zustand/react/shallow'

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
        const frameTime = (1000 / 30) * playbackSpeedRef.current
        const currentTime = useProjectStore.getState().currentTime
        seek(Math.max(0, currentTime + frameTime))
      }, 1000 / 30)
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
        const frameTime = (1000 / 30) * playbackSpeedRef.current
        const state = useProjectStore.getState()
        const currentTime = state.currentTime
        const maxTime = state.currentProject?.timeline?.duration || 0
        seek(Math.min(maxTime, currentTime + frameTime))
      }, 1000 / 30)
    }
  }, [pause, seek])

  const handleFramePrevious = useCallback(() => {
    const frameTime = 1000 / 30 // 30fps
    const currentTime = useProjectStore.getState().currentTime
    seek(Math.max(0, currentTime - frameTime))
  }, [seek])

  const handleFrameNext = useCallback(() => {
    const frameTime = 1000 / 30
    const state = useProjectStore.getState()
    const maxTime = state.currentProject?.timeline?.duration || 0
    seek(Math.min(maxTime, state.currentTime + frameTime))
  }, [seek])

  const handleFramePrevious10 = useCallback(() => {
    const frameTime = (1000 / 30) * 10
    const currentTime = useProjectStore.getState().currentTime
    seek(Math.max(0, currentTime - frameTime))
  }, [seek])

  const handleFrameNext10 = useCallback(() => {
    const frameTime = (1000 / 30) * 10
    const state = useProjectStore.getState()
    const maxTime = state.currentProject?.timeline?.duration || 0
    seek(Math.min(maxTime, state.currentTime + frameTime))
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
    seek(Math.max(0, currentTime - 1000))
  }, [seek])

  const handleJumpForward1s = useCallback(() => {
    const state = useProjectStore.getState()
    const maxTime = state.currentProject?.timeline?.duration || 0
    seek(Math.min(maxTime, state.currentTime + 1000))
  }, [seek])

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
    { event: 'clipNext', handler: handleClipNext }
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
    handleClipNext
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
    jumpForward1s: handleJumpForward1s
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
    handleJumpForward1s
  ])
}
