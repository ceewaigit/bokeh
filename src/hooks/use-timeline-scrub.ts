import { useCallback, useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { getTimelineTimeFromClientX, getTimelineTimeFromStagePointer } from '@/features/timeline/playback/seek-utils'
import { timeObserver } from '@/features/timeline/time/time-observer'

interface TimelineScrubOptions {
  duration: number
  pixelsPerMs: number
  onSeek?: (time: number) => void
}

export const useTimelineScrub = ({ duration, pixelsPerMs, onSeek }: TimelineScrubOptions) => {
  const isScrubbing = useProjectStore((s) => s.isScrubbing)
  const setScrubbing = useProjectStore((s) => s.setScrubbing)
  const stageRef = useRef<any>(null)
  const pointerDownRef = useRef(false)
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const scrubStartThreshold = 2

  const seekFromStage = useCallback((stage: any) => {
    if (!onSeek) return
    const time = getTimelineTimeFromStagePointer(stage, pixelsPerMs, duration)
    if (time === null) return
    // DECOUPLED: Push to timeObserver immediately for playhead UI
    timeObserver.pushTime(time)
    onSeek(time)
  }, [duration, onSeek, pixelsPerMs])

  const seekFromClientX = useCallback((clientX: number) => {
    if (!onSeek) return
    const time = getTimelineTimeFromClientX(stageRef.current, clientX, pixelsPerMs, duration)
    if (time === null) return
    // DECOUPLED: Push to timeObserver immediately for playhead UI
    timeObserver.pushTime(time)
    onSeek(time)
  }, [duration, onSeek, pixelsPerMs])

  const handleScrubStart = useCallback((e: any) => {
    if (!onSeek) return
    const stage = e?.target?.getStage?.()
    if (!stage) return
    stageRef.current = stage
    pointerDownRef.current = true
    pointerDownPosRef.current = stage.getPointerPosition?.() ?? null
    seekFromStage(stage)

    const clearPointerDown = () => {
      pointerDownRef.current = false
      pointerDownPosRef.current = null
    }
    window.addEventListener('mouseup', clearPointerDown, { once: true })
    window.addEventListener('touchend', clearPointerDown, { once: true })
    window.addEventListener('touchcancel', clearPointerDown, { once: true })
  }, [onSeek, seekFromStage, setScrubbing])

  const handleScrubMove = useCallback((e: any) => {
    if (!pointerDownRef.current) return false
    const stage = e?.target?.getStage?.() ?? stageRef.current
    if (!stage) return true
    if (!isScrubbing) {
      const currentPos = stage.getPointerPosition?.()
      const startPos = pointerDownPosRef.current
      if (currentPos && startPos) {
        const dx = currentPos.x - startPos.x
        const dy = currentPos.y - startPos.y
        if (Math.hypot(dx, dy) < scrubStartThreshold) return true
      }
      setScrubbing(true)
    }
    seekFromStage(stage)
    return true
  }, [isScrubbing, seekFromStage, setScrubbing])

  const handleScrubEnd = useCallback(() => {
    pointerDownRef.current = false
    pointerDownPosRef.current = null
    if (isScrubbing) {
      setScrubbing(false)
    }
  }, [isScrubbing, setScrubbing])

  useEffect(() => {
    if (!isScrubbing) return

    const endScrub = () => setScrubbing(false)
    const handleMouseMove = (event: MouseEvent) => {
      seekFromClientX(event.clientX)
    }
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 0) return
      seekFromClientX(event.touches[0].clientX)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('mouseup', endScrub)
    window.addEventListener('touchend', endScrub)
    window.addEventListener('touchcancel', endScrub)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('mouseup', endScrub)
      window.removeEventListener('touchend', endScrub)
      window.removeEventListener('touchcancel', endScrub)
    }
  }, [isScrubbing, seekFromClientX, setScrubbing])

  return { handleScrubStart, handleScrubMove, handleScrubEnd }
}
