import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { getEffectTrackConfig } from '@/features/ui/timeline/effect-track-registry'
import type { Effect } from '@/types/project'
import { EffectType } from '@/types/project'
import { clamp } from '@/shared/utils/utils'
import { getTimelineTimeFromClientX, getTimelineTimeFromStagePointer } from '@/features/playback'
import { TimelineConfig } from '@/features/ui/timeline/config'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'
import { AddEffectCommand } from '@/features/core/commands'

export interface DragToCreateState {
  isDragging: boolean
  effectType: EffectType
  startTime: number
  endTime: number
  isValid: boolean
}

export interface UseDragToCreateOptions {
  effectType: EffectType
  pixelsPerMs: number
  scrollLeftRef: RefObject<number>
  duration: number
  existingEffects: Effect[]
}

export interface UseDragToCreateReturn {
  dragState: DragToCreateState | null
  hoverState: DragToCreateState | null
  handlePointerDown: (e: KonvaEventObject<PointerEvent>) => boolean
  handlePointerMove: (e: KonvaEventObject<PointerEvent>) => void
  handlePointerLeave: () => void
  previewRect: { x: number; width: number } | null
}

type DragRuntimeState = {
  pointerId: number
  stage: any
  anchorTime: number
  currentTime: number
  prevCursor: string
}

function isOverlappingAny(time: number, effects: Effect[]): boolean {
  // Treat effects as [startTime, endTime) for overlap checks so boundaries are usable.
  return effects.some(e => time > e.startTime && time < e.endTime)
}

function getGapBoundaries(anchorTime: number, effects: Effect[]) {
  let prevEnd = 0
  let nextStart = Number.POSITIVE_INFINITY

  for (const effect of effects) {
    if (effect.endTime <= anchorTime) {
      prevEnd = Math.max(prevEnd, effect.endTime)
    }
    if (effect.startTime >= anchorTime) {
      nextStart = Math.min(nextStart, effect.startTime)
    }
  }

  return { prevEnd, nextStart }
}

export function useDragToCreate(options: UseDragToCreateOptions): UseDragToCreateReturn {
  const { effectType, pixelsPerMs, scrollLeftRef, duration, existingEffects } = options
  const executorRef = useCommandExecutor()

  const config = getEffectTrackConfig(effectType)
  const dragConfig = config?.dragToCreate

  const dragRef = useRef<DragRuntimeState | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const latestStateRef = useRef<DragToCreateState | null>(null)
  const [dragState, setDragState] = useState<DragToCreateState | null>(null)
  const hoverRafIdRef = useRef<number | null>(null)
  const hoverTimeRef = useRef<number | null>(null)
  const lastHoverRef = useRef<{ startTime: number; endTime: number } | null>(null)
  const [hoverState, setHoverState] = useState<DragToCreateState | null>(null)

  const previewRect = useMemo(() => {
    if (!dragState) return null
    const x = TimeConverter.msToPixels(dragState.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
    const width = TimeConverter.msToPixels(dragState.endTime - dragState.startTime, pixelsPerMs)
    return { x, width }
  }, [dragState, pixelsPerMs])

  const scheduleStateUpdate = useCallback(() => {
    if (rafIdRef.current !== null) return
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null
      const runtime = dragRef.current
      if (!runtime) return

      const { prevEnd, nextStart } = getGapBoundaries(runtime.anchorTime, existingEffects)

      const rawStart = Math.min(runtime.anchorTime, runtime.currentTime)
      const rawEnd = Math.max(runtime.anchorTime, runtime.currentTime)

      const draggingRight = runtime.currentTime >= runtime.anchorTime
      const constrainedStart = draggingRight ? rawStart : Math.max(rawStart, prevEnd)
      const constrainedEnd = draggingRight ? Math.min(rawEnd, nextStart) : rawEnd

      const safeStart = clamp(constrainedStart, 0, duration)
      const safeEnd = clamp(constrainedEnd, 0, duration)

      const minDurationMs = dragConfig?.minDurationMs ?? 0
      const isValid = safeEnd > safeStart && (safeEnd - safeStart) >= minDurationMs

      const next: DragToCreateState = {
        isDragging: true,
        effectType,
        startTime: safeStart,
        endTime: safeEnd,
        isValid
      }
      latestStateRef.current = next
      setDragState(next)
    })
  }, [dragConfig?.minDurationMs, duration, effectType, existingEffects])

  const computeHoverPreview = useCallback((pointerTime: number): DragToCreateState | null => {
    if (!dragConfig?.enabled) return null
    const minDurationMs = dragConfig.minDurationMs ?? 0
    if (minDurationMs <= 0) return null
    if (!Number.isFinite(pointerTime)) return null

    // If the pointer is effectively inside an effect, don't show hover ghost.
    if (isOverlappingAny(pointerTime, existingEffects)) return null

    const { prevEnd, nextStart } = getGapBoundaries(pointerTime, existingEffects)
    const gapStart = clamp(prevEnd, 0, duration)
    const gapEnd = clamp(nextStart, 0, duration)
    const gapDuration = gapEnd - gapStart
    if (gapDuration < minDurationMs) return null

    // Center the ghost on the pointer, then clamp into the gap.
    let startTime = pointerTime - (minDurationMs / 2)
    let endTime = startTime + minDurationMs

    // Clamp into the available gap.
    if (startTime < gapStart) {
      startTime = gapStart
      endTime = gapStart + minDurationMs
    }
    if (endTime > gapEnd) {
      endTime = gapEnd
      startTime = gapEnd - minDurationMs
    }
    startTime = clamp(startTime, gapStart, gapEnd)
    endTime = clamp(endTime, gapStart, gapEnd)

    return {
      isDragging: false,
      effectType,
      startTime,
      endTime,
      isValid: true
    }
  }, [dragConfig?.enabled, dragConfig?.minDurationMs, duration, effectType, existingEffects])

  const scheduleHoverUpdate = useCallback(() => {
    if (hoverRafIdRef.current !== null) return
    hoverRafIdRef.current = window.requestAnimationFrame(() => {
      hoverRafIdRef.current = null
      if (dragRef.current) return
      const time = hoverTimeRef.current
      if (time === null) {
        setHoverState(null)
        lastHoverRef.current = null
        return
      }
      const next = computeHoverPreview(time)
      if (!next) {
        if (lastHoverRef.current !== null) {
          lastHoverRef.current = null
          setHoverState(null)
        }
        return
      }

      const last = lastHoverRef.current
      // Avoid re-rendering if the preview is effectively unchanged.
      if (last && Math.abs(last.startTime - next.startTime) < 4 && Math.abs(last.endTime - next.endTime) < 4) {
        return
      }
      lastHoverRef.current = { startTime: next.startTime, endTime: next.endTime }
      setHoverState(next)
    })
  }, [computeHoverPreview])

  const endDrag = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }

    const runtime = dragRef.current
    dragRef.current = null

    if (runtime) document.body.style.cursor = runtime.prevCursor
  }, [])

  const handlePointerDown = useCallback((e: KonvaEventObject<PointerEvent>) => {
    if (!dragConfig?.enabled) return false
    if (e.evt.button !== 0) return false

    const stage = e.target?.getStage?.()
    if (!stage) return false

    const anchorTime = getTimelineTimeFromStagePointer(stage, pixelsPerMs, duration, scrollLeftRef.current ?? 0)
    if (anchorTime === null) return false

    if (isOverlappingAny(anchorTime, existingEffects)) return false

    // Initialize drag state
    const prevCursor = document.body.style.cursor
    if (dragConfig.cursorStyle) {
      document.body.style.cursor = dragConfig.cursorStyle
    }

    setHoverState(null)
    hoverTimeRef.current = null

    dragRef.current = {
      pointerId: e.evt.pointerId,
      stage,
      anchorTime,
      currentTime: anchorTime,
      prevCursor
    }

    const initial: DragToCreateState = {
      isDragging: true,
      effectType,
      startTime: anchorTime,
      endTime: anchorTime,
      isValid: false
    }
    latestStateRef.current = initial
    setDragState(initial)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const runtime = dragRef.current
      if (!runtime) return
      if (moveEvent.pointerId !== runtime.pointerId) return

      const nextTime = getTimelineTimeFromClientX(
        runtime.stage,
        moveEvent.clientX,
        pixelsPerMs,
        duration,
        scrollLeftRef.current ?? 0
      )
      if (nextTime === null) return

      runtime.currentTime = nextTime
      scheduleStateUpdate()
    }

    const commit = async () => {
      const finalState = latestStateRef.current
      if (!finalState?.isValid) return

      const created: Effect = {
        id: `${effectType}-timeline-${Date.now()}`,
        type: effectType,
        startTime: finalState.startTime,
        endTime: finalState.endTime,
        enabled: true,
        data: (dragConfig.createDefaultData?.() ?? {}) as any
      } as any

      await executorRef.current?.execute(AddEffectCommand, created)
    }

    const handlePointerUpOrCancel = async (upEvent: PointerEvent) => {
      const runtime = dragRef.current
      if (!runtime) return
      if (upEvent.pointerId !== runtime.pointerId) return

      // Commit before clearing state so we still have final bounds.
      await commit()

      endDrag()
      setDragState(null)
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUpOrCancel)
      window.removeEventListener('pointercancel', handlePointerUpOrCancel)
    }
    cleanupRef.current = cleanup

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerup', handlePointerUpOrCancel)
    window.addEventListener('pointercancel', handlePointerUpOrCancel)

    return true
  }, [dragConfig, duration, effectType, endDrag, executorRef, existingEffects, pixelsPerMs, scheduleStateUpdate, scrollLeftRef])

  const handlePointerMove = useCallback((e: KonvaEventObject<PointerEvent>) => {
    if (!dragConfig?.enabled) return
    if (dragRef.current) return
    const stage = e.target?.getStage?.()
    if (!stage) return
    const time = getTimelineTimeFromStagePointer(stage, pixelsPerMs, duration, scrollLeftRef.current ?? 0)
    hoverTimeRef.current = time
    scheduleHoverUpdate()
  }, [dragConfig?.enabled, duration, pixelsPerMs, scheduleHoverUpdate, scrollLeftRef])

  const handlePointerLeave = useCallback(() => {
    hoverTimeRef.current = null
    lastHoverRef.current = null
    if (hoverRafIdRef.current !== null) {
      window.cancelAnimationFrame(hoverRafIdRef.current)
      hoverRafIdRef.current = null
    }
    setHoverState(null)
  }, [])

  useEffect(() => {
    return () => {
      endDrag()
      latestStateRef.current = null
      if (hoverRafIdRef.current !== null) {
        window.cancelAnimationFrame(hoverRafIdRef.current)
        hoverRafIdRef.current = null
      }
    }
  }, [endDrag])

  return useMemo(() => ({
    dragState,
    handlePointerDown,
    hoverState,
    handlePointerMove,
    handlePointerLeave,
    previewRect
  }), [dragState, handlePointerDown, handlePointerLeave, handlePointerMove, hoverState, previewRect])
}
