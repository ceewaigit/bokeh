/**
 * Time Coordinate Hooks - Abstracts time calculations using Remotion's useCurrentFrame
 *
 * These hooks provide clean access to time in different coordinate systems without
 * requiring manual calculations or prop drilling.
 */

import { useCurrentFrame } from 'remotion';
import { useComposition } from '../../context/CompositionContext';
import { useClipContext } from '../../context/timeline/ClipContext';
import { clipRelativeToSource } from '@/lib/timeline/time-space-converter';
import { useMemo } from 'react';

/**
 * Get the current source time (recording timestamp) for the current frame
 *
 * This is the primary hook for time-based calculations. It handles all the
 * complexity of converting from Remotion's frame counter to source time.
 *
 * @returns Source time in milliseconds
 */
export function useSourceTime(): number {
  const frame = useCurrentFrame();
  const { fps } = useComposition();
  const { clip } = useClipContext();

  return useMemo(() => {
    // Convert frame to clip-relative milliseconds
    const clipRelativeMs = (frame / fps) * 1000;

    // Convert to source time
    return clipRelativeToSource(clipRelativeMs, clip);
  }, [frame, fps, clip]);
}
