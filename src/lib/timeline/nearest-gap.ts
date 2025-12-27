export interface TimelineRange {
  startTime: number
  endTime: number
}

export function findNearestAvailableStart(
  desiredStart: number,
  duration: number,
  occupied: TimelineRange[]
): number {
  const safeStart = Math.max(0, desiredStart)
  if (occupied.length === 0) return safeStart

  const sorted = occupied
    .filter(range => Number.isFinite(range.startTime) && Number.isFinite(range.endTime) && range.endTime > range.startTime)
    .sort((a, b) => a.startTime - b.startTime)

  if (sorted.length === 0) return safeStart

  const overlaps = sorted.some(range =>
    safeStart < range.endTime && (safeStart + duration) > range.startTime
  )
  if (!overlaps) return safeStart

  const merged: Array<{ start: number; end: number }> = []
  for (const range of sorted) {
    const start = Math.max(0, range.startTime)
    const end = range.endTime
    const last = merged[merged.length - 1]
    if (!last || start > last.end) {
      merged.push({ start, end })
    } else {
      last.end = Math.max(last.end, end)
    }
  }

  const free: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const range of merged) {
    if (range.start > cursor) {
      free.push({ start: cursor, end: range.start })
    }
    cursor = Math.max(cursor, range.end)
  }
  free.push({ start: cursor, end: Number.POSITIVE_INFINITY })

  let bestStart = cursor
  let bestDistance = Number.POSITIVE_INFINITY

  for (const interval of free) {
    const intervalLength = interval.end - interval.start
    if (interval.end !== Number.POSITIVE_INFINITY && intervalLength < duration) {
      continue
    }

    let candidate = safeStart
    if (safeStart < interval.start) {
      candidate = interval.start
    } else if (interval.end !== Number.POSITIVE_INFINITY && safeStart > interval.end - duration) {
      candidate = interval.end - duration
    } else if (interval.end === Number.POSITIVE_INFINITY) {
      candidate = Math.max(interval.start, safeStart)
    }

    const distance = Math.abs(candidate - safeStart)
    if (distance < bestDistance || (distance === bestDistance && candidate < bestStart)) {
      bestDistance = distance
      bestStart = candidate
    }
  }

  return Math.max(0, bestStart)
}
