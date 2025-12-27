import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { clamp } from '@/lib/utils'

export type StageLike = {
  getPointerPosition?: () => { x: number; y: number } | null
  container?: () => { getBoundingClientRect: () => DOMRect } | null
}

export const getTimelineTimeFromX = (
  stageX: number,
  pixelsPerMs: number,
  duration: number
): number | null => {
  const x = stageX - TimelineConfig.TRACK_LABEL_WIDTH
  if (!Number.isFinite(x) || x <= 0) return null
  const time = TimeConverter.pixelsToMs(x, pixelsPerMs)
  return clamp(time, 0, duration)
}

export const getTimelineTimeFromStagePointer = (
  stage: StageLike | null,
  pixelsPerMs: number,
  duration: number
): number | null => {
  const pointerPos = stage?.getPointerPosition?.()
  if (!pointerPos) return null
  return getTimelineTimeFromX(pointerPos.x, pixelsPerMs, duration)
}

export const getTimelineTimeFromClientX = (
  stage: StageLike | null,
  clientX: number,
  pixelsPerMs: number,
  duration: number
): number | null => {
  const rect = stage?.container?.()?.getBoundingClientRect()
  if (!rect) return null
  return getTimelineTimeFromX(clientX - rect.left, pixelsPerMs, duration)
}
