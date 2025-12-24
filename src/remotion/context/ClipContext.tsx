/**
 * Clip Context - Provides current clip data to all layers within a clip sequence
 *
 * This context provides clip-specific data without prop drilling.
 * Each ClipSequence provides its own ClipContext.
 *
 * SIMPLIFIED: All effects are now in timeline-space, no dual-space filtering needed.
 * LAZY LOADING: Metadata is loaded on-demand via useRecordingMetadata hook.
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { Clip, Effect, RecordingMetadata } from '@/types/project';
import { useTimeContext } from './TimeContext';
import { useVideoUrl } from '../hooks/useVideoUrl';
import { useRecordingMetadata } from '../hooks/useRecordingMetadata';
import type { ClipContextValue } from '@/types';

const ClipContext = createContext<ClipContextValue | null>(null);

interface ClipProviderProps {
  clip: Clip;
  effects: Effect[];
  preferOffthreadVideo?: boolean;
  children: React.ReactNode;
}

export function ClipProvider({ clip, effects, preferOffthreadVideo, children }: ClipProviderProps) {
  const { getRecording, resources } = useTimeContext();

  // Get recording first (needed for metadata hook)
  const recording = getRecording(clip.recordingId);

  // LAZY LOADING: Load metadata on-demand via hook
  const { metadata: lazyMetadata } = useRecordingMetadata({
    recordingId: recording?.id || '',
    folderPath: recording?.folderPath,
    metadataChunks: recording?.metadataChunks,
    metadataUrls: resources?.metadataUrls,
    inlineMetadata: recording?.metadata, // Fallback to already-loaded metadata
  });

  const value = useMemo<ClipContextValue>(() => {
    if (!recording) {
      throw new Error(`Recording not found: ${clip.recordingId}`);
    }

    // Use lazy-loaded metadata, falling back to recording.metadata if available
    const metadata: RecordingMetadata | undefined = lazyMetadata || recording.metadata;
    const sourceIn = clip.sourceIn ?? 0;
    const sourceOut = clip.sourceOut ?? recording.duration;

    // Filter metadata to only events within this clip's source range
    const cursorEvents = (metadata?.mouseEvents ?? []).filter((e) => e.timestamp >= sourceIn && e.timestamp <= sourceOut);

    const clickEvents = (metadata?.clickEvents ?? []).filter((e) => e.timestamp >= sourceIn && e.timestamp <= sourceOut);

    const keystrokeEvents = (metadata?.keyboardEvents ?? []).filter((e) => e.timestamp >= sourceIn && e.timestamp <= sourceOut);

    const scrollEvents = (metadata?.scrollEvents ?? []).filter((e) => e.timestamp >= sourceIn && e.timestamp <= sourceOut);

    // Filter effects by timeline range (all effects are now in timeline-space)
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;
    const filteredEffects = effects.filter(effect =>
      effect.startTime < clipEnd && effect.endTime > clipStart
    );

    return {
      clip,
      recording,
      videoUrl: '',
      cursorEvents,
      clickEvents,
      keystrokeEvents,
      scrollEvents,
      effects: filteredEffects,
    };
  }, [clip, effects, recording, lazyMetadata]);

  // Use hook to resolve video URL based on environment
  // Note: recording is already checked in useMemo above, use it directly here
  const videoUrl =
    useVideoUrl({ recording, resources, preferOffthreadVideo }) || '';

  // Merge into final context value
  const finalValue = useMemo(
    () => ({ ...value, videoUrl }),
    [value, videoUrl]
  );

  return <ClipContext.Provider value={finalValue}>{children}</ClipContext.Provider>;
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
