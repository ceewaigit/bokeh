import type { Clip } from '@/types/project';
import { findClipAtTimelinePosition } from '@/features/ui/timeline/time/time-space-converter';

/**
 * Webcam clips can overlap (overlay track) and are not guaranteed to be sorted.
 * For "which webcam is active now?", we want deterministic behavior:
 * - Exact boundary: the clip that starts at `timeMs` wins
 * - Overlap: the newest clip (latest `startTime`) wins
 */
export function orderWebcamClipsForSelection(webcamClips: Clip[]): Clip[] {
  if (!webcamClips || webcamClips.length === 0) return [];
  return [...webcamClips].sort((a, b) => b.startTime - a.startTime);
}

export function selectActiveWebcamClipAtTime(
  orderedWebcamClipsNewestFirst: Clip[],
  timeMs: number
): Clip | null {
  if (!orderedWebcamClipsNewestFirst || orderedWebcamClipsNewestFirst.length === 0) return null;
  return findClipAtTimelinePosition(timeMs, orderedWebcamClipsNewestFirst) ?? null;
}

