/**
 * Player Configuration Hook - Builds input props for TimelineComposition
 *
 * This hook prepares all the data needed by TimelineComposition in a type-safe,
 * memoized structure.
 * 
 * ARCHITECTURE: Timeline-Centric
 * - Clips remain INTACT (no destructive slicing)
 * - Hidden regions become "Global Skip Ranges" projected to timeline space
 * - Player skips over hidden regions during playback
 * - Renderers hide content when inside skip ranges
 */

import { useMemo } from 'react';
import type { Project } from '@/types/project';
import type { TimelineCompositionProps } from '@/types';
import { useWindowSurfaceStore } from '@/features/core/stores/window-surface-store';
import { EffectStore } from '@/features/effects/core/effects-store';
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service';

/**
 * Build timeline composition props from project
 *
 * Extracts and organizes all clips, recordings, and effects for the composition.
 * Clips remain intact - hidden regions are handled via Global Skip Ranges.
 */
export function usePlayerConfiguration(
  project: Project | null,
  videoWidth: number,
  videoHeight: number,
  fps: number,
  cameraSettingsOverride?: TimelineCompositionProps['cameraSettings']
) {
  const windowSurfaceMode = useWindowSurfaceStore((s) => s.mode)

  // OPTIMIZE: Memoize the deep clone of recordings to prevent referential instability
  // when other parts of the project change (like settings or cursor position).
  // This prevents the entire TimelineContext from invalidating downstream.
  const clonedRecordings = useMemo(() => {
    if (!project?.recordings) return [];
    return JSON.parse(JSON.stringify(project.recordings));
  }, [project?.recordings]);

  return useMemo(() => {
    if (!project?.timeline.tracks || !project.recordings) {
      return null;
    }

    // Get clips directly - NO slicing. Clips remain intact.
    // Hidden regions are handled by Global Skip Ranges during playback.
    const videoClips = TimelineDataService.getVideoClips(project);
    const audioClips = TimelineDataService.getAudioClips(project);
    const webcamClips = TimelineDataService.getWebcamClips(project);

    // We need at least video clips for the composition
    if (videoClips.length === 0) {
      return null;
    }

    // Get all recordings - DEEP COPY required to prevent revoked proxy errors.
    // Shallow copy is insufficient because nested objects (like metadata/capabilities)
    // remain proxies. If a re-transcription happens, these proxies are revoked.
    // Since Remotion might render a frame with stale context, we must ensure
    // we never expose a revoked proxy to the render tree.
    // JSON clone is fast enough for recordings metadata (typically < 1MB).
    // MOVED: Deep copy is now handled by clonedRecordings memo above.

    // Collect all effects from timeline.effects (the single source of truth)
    const effects = EffectStore.getAll(project);

    // Get Global Skip Ranges - projected hidden regions in timeline space
    const globalSkipRanges = TimelineDataService.getGlobalTimelineSkips(project);

    return {
      clips: videoClips,      // Intact video clips (no slicing)
      audioClips,             // Intact audio clips
      webcamClips,            // Intact webcam clips
      recordings: clonedRecordings,
      effects,
      globalSkipRanges,       // NEW: Skip ranges for playback and rendering
      videoWidth,
      videoHeight,
      fps,
      backgroundColor: windowSurfaceMode === 'solid' ? '#000' : 'transparent',
      enhanceAudio: project.settings.audio.enhanceAudio,
      cameraSettings: cameraSettingsOverride ?? project.settings.camera,
    };
  }, [
    project,
    videoWidth,
    videoHeight,
    fps,
    cameraSettingsOverride,
    windowSurfaceMode,
    clonedRecordings
  ]);
}
