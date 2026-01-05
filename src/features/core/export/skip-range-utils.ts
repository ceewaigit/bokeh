import type { Clip, Effect } from '@/types/project'
import type { GlobalSkipRange } from '@/types/skip-ranges'
import { timelineToSource } from '@/features/ui/timeline/time/time-space-converter'

export interface ClipSegment {
  originalStart: number
  originalEnd: number
  clip: Clip
}

interface TimeRange {
  start: number
  end: number
}

export function mapTimelineToEffective(timeMs: number, skipRanges: GlobalSkipRange[]): number {
  if (skipRanges.length === 0) return timeMs
  let removed = 0
  for (const range of skipRanges) {
    if (timeMs >= range.end) {
      removed += range.end - range.start
      continue
    }
    if (timeMs > range.start) {
      removed += timeMs - range.start
    }
    break
  }
  return timeMs - removed
}

export function subtractSkipRanges(start: number, end: number, skipRanges: GlobalSkipRange[]): TimeRange[] {
  if (skipRanges.length === 0) return [{ start, end }]
  const ranges: TimeRange[] = []
  let cursor = start

  for (const skip of skipRanges) {
    if (skip.end <= cursor) continue
    if (skip.start >= end) break

    const rangeStart = Math.max(cursor, start)
    const rangeEnd = Math.min(skip.start, end)
    if (rangeEnd > rangeStart) {
      ranges.push({ start: rangeStart, end: rangeEnd })
    }

    cursor = Math.max(cursor, skip.end)
    if (cursor >= end) break
  }

  if (cursor < end) {
    ranges.push({ start: cursor, end })
  }

  return ranges
}

function sliceTimeRemapPeriods(
  periods: Clip['timeRemapPeriods'] | undefined,
  sourceIn: number,
  sourceOut: number
): Clip['timeRemapPeriods'] | undefined {
  if (!periods || periods.length === 0) return undefined
  const sliced = periods
    .filter(period => period.sourceEndTime > sourceIn && period.sourceStartTime < sourceOut)
    .map(period => ({
      ...period,
      sourceStartTime: Math.max(period.sourceStartTime, sourceIn),
      sourceEndTime: Math.min(period.sourceEndTime, sourceOut)
    }))
    .filter(period => period.sourceEndTime > period.sourceStartTime)
  return sliced.length > 0 ? sliced : undefined
}

function createSegmentId(baseId: string, index: number): string {
  return `${baseId}-skip-${index}`
}

export function applySkipRangesToClips(
  clips: Clip[],
  skipRanges: GlobalSkipRange[]
): { clips: Clip[]; segmentsByOriginalId: Map<string, ClipSegment[]> } {
  const segmentsByOriginalId = new Map<string, ClipSegment[]>()
  if (skipRanges.length === 0) {
    clips.forEach(clip => {
      segmentsByOriginalId.set(clip.id, [{
        originalStart: clip.startTime,
        originalEnd: clip.startTime + clip.duration,
        clip
      }])
    })
    return { clips, segmentsByOriginalId }
  }

  const nextClips: Clip[] = []

  clips.forEach((clip) => {
    const clipStart = clip.startTime
    const clipEnd = clip.startTime + clip.duration
    const keptRanges = subtractSkipRanges(clipStart, clipEnd, skipRanges)
    const segments: ClipSegment[] = []

    keptRanges.forEach((range, index) => {
      const duration = range.end - range.start
      if (duration <= 0) return

      const sourceIn = timelineToSource(range.start, clip)
      const sourceOut = timelineToSource(range.end, clip)
      const segmentId = createSegmentId(clip.id, index)
      const isSegmentStart = range.start <= clipStart + 0.5
      const isSegmentEnd = range.end >= clipEnd - 0.5

      const segment: Clip = {
        ...clip,
        id: segmentId,
        startTime: mapTimelineToEffective(range.start, skipRanges),
        duration,
        sourceIn,
        sourceOut,
        introFadeMs: isSegmentStart ? clip.introFadeMs : undefined,
        outroFadeMs: isSegmentEnd ? clip.outroFadeMs : undefined,
        transitionIn: isSegmentStart ? clip.transitionIn : undefined,
        transitionOut: isSegmentEnd ? clip.transitionOut : undefined,
        timeRemapPeriods: sliceTimeRemapPeriods(clip.timeRemapPeriods, sourceIn, sourceOut)
      }

      nextClips.push(segment)
      segments.push({
        originalStart: range.start,
        originalEnd: range.end,
        clip: segment
      })
    })

    if (segments.length > 0) {
      segmentsByOriginalId.set(clip.id, segments)
    }
  })

  return { clips: nextClips, segmentsByOriginalId }
}

export function applySkipRangesToEffects(
  effects: Effect[],
  skipRanges: GlobalSkipRange[],
  segmentsByOriginalId: Map<string, ClipSegment[]>
): Effect[] {
  if (skipRanges.length === 0) return effects
  const nextEffects: Effect[] = []

  effects.forEach((effect) => {
    const effectStart = effect.startTime
    const effectEnd = effect.endTime
    if (!Number.isFinite(effectStart) || !Number.isFinite(effectEnd)) return
    if (effectEnd <= effectStart) return

    const clipSegments = effect.clipId ? segmentsByOriginalId.get(effect.clipId) : null

    if (clipSegments && clipSegments.length > 0) {
      clipSegments.forEach((segment, index) => {
        const interStart = Math.max(effectStart, segment.originalStart)
        const interEnd = Math.min(effectEnd, segment.originalEnd)
        if (interEnd <= interStart) return

        const keptRanges = subtractSkipRanges(interStart, interEnd, skipRanges)
        keptRanges.forEach((range, rangeIndex) => {
          const nextStart = mapTimelineToEffective(range.start, skipRanges)
          const nextEnd = mapTimelineToEffective(range.end, skipRanges)
          if (nextEnd <= nextStart) return
          nextEffects.push({
            ...effect,
            id: `${effect.id}-skip-${index}-${rangeIndex}`,
            startTime: nextStart,
            endTime: nextEnd,
            clipId: segment.clip.id
          })
        })
      })
      return
    }

    const keptRanges = subtractSkipRanges(effectStart, effectEnd, skipRanges)
    keptRanges.forEach((range, index) => {
      const nextStart = mapTimelineToEffective(range.start, skipRanges)
      const nextEnd = mapTimelineToEffective(range.end, skipRanges)
      if (nextEnd <= nextStart) return
      nextEffects.push({
        ...effect,
        id: `${effect.id}-skip-${index}`,
        startTime: nextStart,
        endTime: nextEnd
      })
    })
  })

  return nextEffects
}
