/**
 * Timeline Metadata Hook - Calculates timeline-level configuration for Remotion Player
 *
 * This hook computes the total duration, fps, and dimensions for the entire timeline,
 * which are used to configure the Remotion Player with stable props.
 */

import { useMemo } from 'react';
import type { Project } from '@/types/project';
import { AspectRatioPreset } from '@/types/project';
import { buildFrameLayout, getTimelineDurationInFrames } from '@/lib/timeline/frame-layout';
import { calculateCanvasDimensions } from '@/lib/constants/aspect-ratio-presets';

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

    // Extract all clips from all tracks
    const clips = project.timeline.tracks.flatMap((track) => track.clips);

    if (clips.length === 0) {
      return null;
    }

    // Calculate total timeline duration (max end time of any clip)
    const totalDurationMs = Math.max(...clips.map((c) => c.startTime + c.duration));

    // Get fps from project settings (preferred) or first recording.
    const firstClip = clips[0];
    const firstRecording = project.recordings.find((r) => r.id === firstClip.recordingId);

    if (!firstRecording) {
      return null;
    }

    const fps =
      project.settings?.frameRate ||
      firstRecording.frameRate ||
      60;

    // Calculate duration in frames using frame layout to avoid rounding gaps.
    const recordingsMap = new Map(project.recordings.map(r => [r.id, r]));
    const frameLayout = buildFrameLayout(clips, fps, recordingsMap);
    const durationInFrames = getTimelineDurationInFrames(frameLayout);

    // Get source dimensions from first recording
    const sourceWidth = firstRecording.width || 1920;
    const sourceHeight = firstRecording.height || 1080;

    // Calculate canvas dimensions based on aspect ratio settings
    const canvasSettings = project.settings?.canvas;
    const aspectRatioPreset = canvasSettings?.aspectRatio ?? AspectRatioPreset.Original;

    const { width, height } = calculateCanvasDimensions(
      aspectRatioPreset,
      1080, // base resolution
      canvasSettings?.customWidth,
      canvasSettings?.customHeight,
      sourceWidth,
      sourceHeight
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
