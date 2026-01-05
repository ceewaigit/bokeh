/**
 * Timeline Metadata Hook - Calculates timeline-level configuration for Remotion Player
 *
 * This hook computes the total duration, fps, and dimensions for the entire timeline,
 * which are used to configure the Remotion Player with stable props.
 * 
 * ARCHITECTURE: Timeline-Centric
 * - Clips remain INTACT (no slicing based on transcript edits)
 * - Duration is based on the original clip bounds
 * - Player skips over hidden regions during playback using Global Skip Ranges
 */

import { useMemo } from 'react';
import type { Project } from '@/types/project';
import { AspectRatioPreset } from '@/types/project';
import { buildFrameLayout, getTimelineDurationInFrames } from '@/features/ui/timeline/utils/frame-layout';
import { calculateCanvasDimensions } from '@/shared/constants/aspect-ratio-presets';
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service';

export interface TimelineMetadata {
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  totalDurationMs: number;
}

/**
 * Calculate timeline metadata from project
 *
 * This provides stable configuration for the Remotion Player that never changes
 * during playback, eliminating the clip-to-clip transition blinking.
 */
export function useTimelineMetadata(project: Project | null): TimelineMetadata | null {
  return useMemo(() => {
    if (!project?.timeline.tracks || !project.recordings) {
      return null;
    }

    // Get clips directly - NO slicing. Clips remain intact.
    const clips = TimelineDataService.getVideoClips(project);
    if (clips.length === 0) {
      return null;
    }

    // Calculate total timeline duration (max end time of any clip)
    // With Timeline-Centric architecture, this is the full clip duration
    const inferredDuration = Math.max(...clips.map((c) => c.startTime + c.duration));
    const totalDurationMs = inferredDuration

    // Get fps from the centralized service.
    const fps = TimelineDataService.getFps(project);
    const recordingsMap = TimelineDataService.getRecordingsMap(project);

    // Calculate duration in frames using frame layout to avoid rounding gaps.
    const frameLayout = buildFrameLayout(clips, fps, recordingsMap);
    const durationInFrames = getTimelineDurationInFrames(frameLayout);

    // Get source dimensions from first recording or fallback
    const sourceDimensions = TimelineDataService.getSourceDimensions(project);

    // Calculate canvas dimensions based on aspect ratio settings
    const canvasSettings = project.settings.canvas;
    const aspectRatioPreset = canvasSettings?.aspectRatio ?? AspectRatioPreset.Original;

    const { width, height } = calculateCanvasDimensions(
      aspectRatioPreset,
      1080, // base resolution
      canvasSettings.customWidth,
      canvasSettings.customHeight,
      sourceDimensions.width,
      sourceDimensions.height
    );

    return {
      durationInFrames,
      fps,
      width,
      height,
      totalDurationMs,
    };
  }, [project]);
}

