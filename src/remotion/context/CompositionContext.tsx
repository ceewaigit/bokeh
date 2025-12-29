/**
 * CompositionContext - Unified context for composition-level data
 *
 * Merges CompositionConfigContext + TimeContext to eliminate:
 * - Duplicate fps in multiple contexts
 * - Duplicate recordingsMap construction
 * - Redundant provider nesting
 *
 * SSOT for: dimensions, fps, clips, recordings, resources
 */

import React, { createContext, useContext, useMemo, useCallback } from 'react';
import type { Clip, Recording } from '@/types/project';
import type { VideoResources } from '@/types';
import { findClipAtTimelinePosition } from '@/features/timeline/time/time-space-converter';

// ============================================================================
// TYPES
// ============================================================================

export interface CompositionContextValue {
  // Static dimensions (from CompositionConfigContext)
  compositionWidth: number;
  compositionHeight: number;
  videoWidth: number;
  videoHeight: number;
  sourceVideoWidth: number;
  sourceVideoHeight: number;

  // Core data (from TimeContext)
  fps: number;
  clips: Clip[];
  recordings: Recording[];
  resources: VideoResources;
  totalDurationMs: number;

  // Computed (single source of truth)
  recordingsMap: Map<string, Recording>;

  // Utilities
  getClipAtTimelinePosition: (timelineMs: number) => Clip | null;
  getRecording: (recordingId: string) => Recording | null;
  getVideoUrl: (recordingId: string) => string | undefined;
}

// ============================================================================
// CONTEXT
// ============================================================================

const CompositionContext = createContext<CompositionContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface CompositionProviderProps {
  // Dimensions
  compositionWidth: number;
  compositionHeight: number;
  videoWidth: number;
  videoHeight: number;
  sourceVideoWidth?: number;
  sourceVideoHeight?: number;

  // Core data
  fps: number;
  clips: Clip[];
  recordings: Recording[];
  resources: VideoResources;

  children: React.ReactNode;
}

export function CompositionProvider({
  compositionWidth,
  compositionHeight,
  videoWidth,
  videoHeight,
  sourceVideoWidth,
  sourceVideoHeight,
  fps,
  clips,
  recordings,
  resources,
  children,
}: CompositionProviderProps) {
  // Create efficient recordings lookup map (stable when recordings don't change)
  const recordingsMap = useMemo(
    () => new Map(recordings.map(r => [r.id, r])),
    [recordings]
  );

  // Calculate total timeline duration
  const totalDurationMs = useMemo(() => {
    if (clips.length === 0) return 0;
    return Math.max(...clips.map(c => c.startTime + c.duration));
  }, [clips]);

  // Stable getRecording function
  const getRecording = useCallback(
    (recordingId: string): Recording | null => {
      return recordingsMap.get(recordingId) || null;
    },
    [recordingsMap]
  );

  // Stable getClipAtTimelinePosition function
  const getClipAtTimelinePosition = useCallback(
    (timelineMs: number): Clip | null => {
      return findClipAtTimelinePosition(timelineMs, clips);
    },
    [clips]
  );

  // Stable getVideoUrl function
  const getVideoUrl = useCallback(
    (recordingId: string): string | undefined => {
      return resources.videoUrls?.[recordingId];
    },
    [resources.videoUrls]
  );

  const value = useMemo<CompositionContextValue>(
    () => ({
      // Dimensions
      compositionWidth,
      compositionHeight,
      videoWidth,
      videoHeight,
      sourceVideoWidth: sourceVideoWidth ?? videoWidth,
      sourceVideoHeight: sourceVideoHeight ?? videoHeight,

      // Core data
      fps,
      clips,
      recordings,
      resources,
      totalDurationMs,

      // Computed
      recordingsMap,

      // Utilities
      getClipAtTimelinePosition,
      getRecording,
      getVideoUrl,
    }),
    [
      compositionWidth,
      compositionHeight,
      videoWidth,
      videoHeight,
      sourceVideoWidth,
      sourceVideoHeight,
      fps,
      clips,
      recordings,
      resources,
      totalDurationMs,
      recordingsMap,
      getClipAtTimelinePosition,
      getRecording,
      getVideoUrl,
    ]
  );

  return (
    <CompositionContext.Provider value={value}>
      {children}
    </CompositionContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Get the full composition context.
 * @throws Error if used outside CompositionProvider
 */
export function useComposition(): CompositionContextValue {
  const ctx = useContext(CompositionContext);
  if (!ctx) {
    throw new Error(
      '[useComposition] Must be used within CompositionProvider. ' +
      'Ensure TimelineComposition wraps this component.'
    );
  }
  return ctx;
}

/**
 * Optional version that returns null if context is not available.
 */
export function useCompositionOptional(): CompositionContextValue | null {
  return useContext(CompositionContext);
}
