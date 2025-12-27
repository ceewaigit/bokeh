import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { useKeyboardEvents } from '@/hooks/useKeyboardEvents'

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
    currentProject,
    currentTime,
    isPlaying,
    play,
    pause,
    seek,
    selectClip
  } = useProjectStore()

  const playbackSpeedRef = useRef(1)
  const shuttleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentTimeRef = useRef(currentTime)
  const currentProjectRef = useRef(currentProject)

  // Keep refs in sync
  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  useEffect(() => {
    currentProjectRef.current = currentProject
  }, [currentProject])

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause()
    } else {
      play()
    }
  }, [isPlaying, pause, play])

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
        // Use ref instead of stale closure
        seek(Math.max(0, currentTimeRef.current + frameTime))
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
        // Use refs instead of stale closures
        const maxTime = currentProjectRef.current?.timeline?.duration || 0
        seek(Math.min(maxTime, currentTimeRef.current + frameTime))
      }, 1000 / 30)
    }
  }, [pause, seek])

  const handleFramePrevious = useCallback(() => {
    const frameTime = 1000 / 30 // 30fps
    seek(Math.max(0, currentTimeRef.current - frameTime))
  }, [seek])

  const handleFrameNext = useCallback(() => {
    const frameTime = 1000 / 30
    const maxTime = currentProjectRef.current?.timeline?.duration || 0
    seek(Math.min(maxTime, currentTimeRef.current + frameTime))
  }, [seek])

  const handleFramePrevious10 = useCallback(() => {
    const frameTime = (1000 / 30) * 10
    seek(Math.max(0, currentTimeRef.current - frameTime))
  }, [seek])

  const handleFrameNext10 = useCallback(() => {
    const frameTime = (1000 / 30) * 10
    const maxTime = currentProjectRef.current?.timeline?.duration || 0
    seek(Math.min(maxTime, currentTimeRef.current + frameTime))
  }, [seek])

  const handleTimelineStart = useCallback(() => {
    seek(0)
  }, [seek])

  const handleTimelineEnd = useCallback(() => {
    const maxTime = currentProjectRef.current?.timeline?.duration || 0
    seek(maxTime)
  }, [seek])

  const handleClipPrevious = useCallback(() => {
    const project = currentProjectRef.current
    if (!project) return
    const time = currentTimeRef.current
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
    const project = currentProjectRef.current
    if (!project) return
    const time = currentTimeRef.current
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

  return {
    playbackSpeed: playbackSpeedRef.current
  }
}
