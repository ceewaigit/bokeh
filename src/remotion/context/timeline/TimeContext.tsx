/**
 * Time Context - Provides time coordinate utilities throughout the composition tree
 *
 * This context eliminates prop drilling of timelinePosition and clips[] by providing
 * a centralized source of truth for time calculations.
 */

import React, { createContext, useContext, useMemo, useCallback } from 'react';
import type { Clip, Recording } from '@/types/project';
import type { TimeContextValue, VideoResources } from '@/types';
import { findClipAtTimelinePosition } from '@/lib/timeline/time-space-converter';

const TimeContext = createContext<TimeContextValue | null>(null);

interface TimeProviderProps {
  clips: Clip[];
  recordings: Recording[];
  resources: VideoResources;
  fps: number;
  children: React.ReactNode;
}

export function TimeProvider({ clips, recordings, resources, fps, children }: TimeProviderProps) {
  // PERFORMANCE FIX: Create stable function references using useCallback.
  // Previously, these were created inside useMemo, causing new references on every
  // clips/recordings change, which invalidated usePrecomputedCameraPath's memoization
  // and caused it to re-compute ALL frames (5360+ iterations) on every render.

  // Create efficient recordings lookup map (stable when recordings don't change)
  const recordingsMap = useMemo(() => new Map(recordings.map(r => [r.id, r])), [recordings]);

  // Stable getRecording function - only changes when recordingsMap changes
  const getRecording = useCallback((recordingId: string): Recording | null => {
    return recordingsMap.get(recordingId) || null;
  }, [recordingsMap]);

  // Stable getClipAtTimelinePosition function - only changes when clips change
  const getClipAtTimelinePosition = useCallback((timelineMs: number): Clip | null => {
    return findClipAtTimelinePosition(timelineMs, clips);
  }, [clips]);

  // Stable getVideoUrl function - provides SSOT access to video URLs
  const getVideoUrl = useCallback((recordingId: string): string | undefined => {
    return resources.videoUrls?.[recordingId];
  }, [resources.videoUrls]);

  const value = useMemo<TimeContextValue>(() => {
    // Calculate total timeline duration
    const totalDurationMs = clips.length > 0
      ? Math.max(...clips.map(c => c.startTime + c.duration))
      : 0;

    return {
      totalDurationMs,
      fps,
      clips,
      recordingsMap,
      resources,
      getClipAtTimelinePosition,
      getRecording,
      getVideoUrl,
    };
  }, [clips, fps, recordingsMap, resources, getClipAtTimelinePosition, getRecording, getVideoUrl]);

  return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
}

/**
 * Hook to access time context
 * Throws if used outside TimeProvider
 */
export function useTimeContext(): TimeContextValue {
  const context = useContext(TimeContext);
  if (!context) {
    throw new Error('useTimeContext must be used within TimeProvider');
  }
  return context;
}
