/**
 * Clip Context - Provides current clip data to all layers within a clip sequence
 *
 * This context provides clip-specific data without prop drilling.
 * Each ClipSequence provides its own ClipContext.
 *
 * SIMPLIFIED: All effects are now in timeline-space, no dual-space filtering needed.
 * LAZY LOADING: Metadata is loaded on-demand via useRecordingMetadata hook.
 * OPTIMIZED: Each filtered array is memoized separately to prevent unnecessary recalculations.
 */

import React, { createContext, useContext, useMemo, useRef, useEffect } from 'react';
import type { Clip, Effect, RecordingMetadata } from '@/types/project';
import { EffectType } from '@/types/project';
import { useComposition } from '../CompositionContext';
import { useVideoUrl } from '../../hooks/media/useVideoUrl';
import { useRecordingMetadata } from '../../hooks/media/useRecordingMetadata';
import {
  filterEffectsForClip,
  filterEventsForSourceRange,
} from '@/lib/effects/effect-filters';
import { normalizeClickEvents, normalizeMouseEvents } from '../../compositions/utils/events/event-normalizer';
import type { ClipContextValue } from '@/types';

const ClipContext = createContext<ClipContextValue | null>(null);

interface ClipProviderProps {
  clip: Clip;
  effects: Effect[];
  preferOffthreadVideo?: boolean;
  children: React.ReactNode;
}

export function ClipProvider({ clip, effects, preferOffthreadVideo, children }: ClipProviderProps) {
  const { getRecording, resources } = useComposition();
  const hasLoggedRef = useRef(false);

  // Get recording first (needed for metadata hook)
  const recording = getRecording(clip.recordingId);

  if (!recording) {
    throw new Error(`Recording not found: ${clip.recordingId}`);
  }

  // LAZY LOADING: Load metadata on-demand via hook
  const { metadata: lazyMetadata } = useRecordingMetadata({
    recordingId: recording.id,
    folderPath: recording.folderPath,
    metadataChunks: recording.metadataChunks,
    metadataUrls: resources?.metadataUrls,
    inlineMetadata: recording.metadata, // Fallback to already-loaded metadata
  });

  // Use lazy-loaded metadata, falling back to recording.metadata if available
  const metadata: RecordingMetadata | undefined = lazyMetadata || recording.metadata;
  const sourceIn = clip.sourceIn ?? 0;
  const sourceOut = clip.sourceOut ?? recording.duration;

  useEffect(() => {
    if (hasLoggedRef.current) return;
    hasLoggedRef.current = true;
  }, [clip.id, recording.id, recording.metadata, lazyMetadata, metadata, effects.length]);

  // ==========================================================================
  // MEMOIZED FILTERS - Each array is memoized separately for optimal performance
  // ==========================================================================

  // Filter cursor events - only recalculates when metadata or source range changes
  const cursorEvents = useMemo(
    () => normalizeMouseEvents(filterEventsForSourceRange(metadata?.mouseEvents ?? [], sourceIn, sourceOut)),
    [metadata?.mouseEvents, sourceIn, sourceOut]
  );

  // Filter click events
  const clickEvents = useMemo(
    () => normalizeClickEvents(filterEventsForSourceRange(metadata?.clickEvents ?? [], sourceIn, sourceOut)),
    [metadata?.clickEvents, sourceIn, sourceOut]
  );

  // Filter keystroke events
  const keystrokeEvents = useMemo(
    () => filterEventsForSourceRange(metadata?.keyboardEvents ?? [], sourceIn, sourceOut),
    [metadata?.keyboardEvents, sourceIn, sourceOut]
  );

  // Filter scroll events
  const scrollEvents = useMemo(
    () => filterEventsForSourceRange(metadata?.scrollEvents ?? [], sourceIn, sourceOut),
    [metadata?.scrollEvents, sourceIn, sourceOut]
  );

  // Filter effects - only recalculates when effects or clip changes
  const filteredEffects = useMemo(() => {
    const timelineFiltered = filterEffectsForClip(effects, clip).filter(effect =>
      effect.type !== EffectType.Crop || effect.clipId === clip.id
    );
    const merged = new Map<string, Effect>();

    for (const effect of timelineFiltered) {
      merged.set(effect.id, effect);
    }

    for (const effect of effects) {
      if (effect.type === EffectType.Background || effect.type === EffectType.Cursor) {
        merged.set(effect.id, effect);
      } else if (effect.type === EffectType.Crop && effect.clipId === clip.id) {
        merged.set(effect.id, effect);
      }
    }

    return Array.from(merged.values());
  }, [effects, clip]);

  // Use hook to resolve video URL based on environment
  // Pass clipId so URL lock invalidates when active clip changes
  const videoUrl = useVideoUrl({ recording, resources, clipId: clip.id, preferOffthreadVideo }) || '';

  // Compose final context value
  const value = useMemo<ClipContextValue>(
    () => ({
      clip,
      recording,
      videoUrl,
      cursorEvents,
      clickEvents,
      keystrokeEvents,
      scrollEvents,
      effects: filteredEffects,
    }),
    [clip, recording, videoUrl, cursorEvents, clickEvents, keystrokeEvents, scrollEvents, filteredEffects]
  );

  return <ClipContext.Provider value={value}>{children}</ClipContext.Provider>;
}

/**
 * Hook to access clip context
 * Throws if used outside ClipProvider
 */
export function useClipContext(): ClipContextValue {
  const context = useContext(ClipContext);
  if (!context) {
    throw new Error('useClipContext must be used within ClipProvider');
  }
  return context;
}
