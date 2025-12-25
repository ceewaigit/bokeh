/**
 * Player Configuration Hook - Builds input props for TimelineComposition
 *
 * This hook prepares all the data needed by TimelineComposition in a type-safe,
 * memoized structure.
 * 
 * SIMPLIFIED: Zoom effects are now always in timeline-space, no conversion needed.
 */

import { useMemo } from 'react';
import type { Project } from '@/types/project';
import { TrackType } from '@/types/project';
import type { TimelineCompositionProps } from '@/types';
import { useWindowAppearanceStore } from '@/stores/window-appearance-store';
import { EffectStore } from '@/lib/core/effects';

/**
 * Build timeline composition props from project
 *
 * Extracts and organizes all clips, recordings, and effects for the composition.
 * All effects (including zoom) are now stored in timeline-space.
 */
export function usePlayerConfiguration(
  project: Project | null,
  videoWidth: number,
  videoHeight: number,
  fps: number,
  cameraSettingsOverride?: TimelineCompositionProps['cameraSettings']
) {
  const windowSurfaceMode = useWindowAppearanceStore((s) => s.mode)

  return useMemo(() => {
    if (!project?.timeline.tracks || !project.recordings) {
      return null;
    }

    // Separate video clips and audio clips based on track type
    const videoTrack = project.timeline.tracks.find((t) => t.type === TrackType.Video);
    const audioTrack = project.timeline.tracks.find((t) => t.type === TrackType.Audio);

    const videoClips = videoTrack?.clips || [];
    const audioClips = audioTrack?.clips || [];

    // We need at least video clips for the composition
    if (videoClips.length === 0) {
      return null;
    }

    // Get all recordings
    const recordings = project.recordings;

    // Collect all effects from timeline.effects (the single source of truth)
    const effects = EffectStore.getAll(project);

    return {
      clips: videoClips,  // Only video clips for the main video rendering
      audioClips,         // Separate audio clips for audio rendering
      recordings,
      effects,
      videoWidth,
      videoHeight,
      fps,
      backgroundColor: windowSurfaceMode === 'solid' ? '#000' : 'transparent',
      enhanceAudio: project.settings.audio?.enhanceAudio,
      cameraSettings: cameraSettingsOverride ?? project.settings.camera,
    };
  }, [project, videoWidth, videoHeight, fps, windowSurfaceMode, cameraSettingsOverride]);
}
