export interface TimeInterval {
  startTime: number
  endTime: number
}

export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return []

  const sorted = [...intervals].sort((a, b) => a.startTime - b.startTime)
  const merged: TimeInterval[] = [{ ...sorted[0] }]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]
    if (current.startTime <= last.endTime) {
      last.endTime = Math.max(last.endTime, current.endTime)
    } else {
      merged.push({ ...current })
    }
  }

  return merged
}
