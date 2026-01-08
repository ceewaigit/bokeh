/**
 * Time Coordinate Hooks - Abstracts time calculations using Remotion's useCurrentFrame
 *
 * These hooks provide clean access to time in different coordinate systems without
 * requiring manual calculations or prop drilling.
 */

import { useCurrentFrame } from 'remotion';
import { useComposition } from '../../context/CompositionContext';
import { useClipContext } from '../../context/timeline/ClipContext';
import { useMemo } from 'react';

/**
 * Get the current source time (recording timestamp) for the current frame
 *
 * MUST match exactly how Remotion's Video component positions the video:
 * - Video uses: startFrom = msToFrame(sourceIn, fps)
 * - At composition frame N with playbackRate R: video shows source frame (startFrom + N * R)
 * - Convert to ms: (startFrom + N * R) / fps * 1000
 *
 * @returns Source time in milliseconds
 */
export function useSourceTime(): number {
  const frame = useCurrentFrame();
  const { fps } = useComposition();
  const { clip } = useClipContext();

  return useMemo(() => {
    const playbackRate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1;
    const sourceIn = clip.sourceIn || 0;

    // frame is clip-relative (starts at 0 when clip starts)
    // Convert frame to elapsed time, then multiply by playback rate
    const clipElapsedMs = (frame / fps) * 1000;
    const sourceTimeMs = sourceIn + clipElapsedMs * playbackRate;

    return sourceTimeMs;
  }, [frame, fps, clip]);
}
