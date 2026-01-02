/**
 * TimelineContext - Unified Context for Timeline Data
 *
 * Consolidates CompositionContext (Static Data) and VideoDataContext (Derived Layout).
 *
 * SSOT for:
 * - Core Data: clips, recordings, effects, fps, dimensions
 * - Derived Data: recordingsMap, sortedClips, frameLayout
 * - Helpers: getRecording, getActiveClipData, getLayoutItem
 */

import React, { createContext, useContext, useMemo, useCallback } from 'react';
import type { Clip, Effect, Recording } from '@/types/project';
import type { VideoResources } from '@/types';
import type { ActiveClipDataAtFrame } from '@/types';
import {
    buildFrameLayout,
    findActiveFrameLayoutIndex,
    findActiveFrameLayoutItems,
    type FrameLayoutItem
} from '@/features/timeline/utils/frame-layout';
import { getActiveClipDataAtFrame } from '@/features/renderer/utils/get-active-clip-data-at-frame';
import { findClipAtTimelinePosition } from '@/features/timeline/time/time-space-converter';

// ============================================================================
// TYPES
// ============================================================================

export interface TimelineContextValue {
    // --- Dimensions ---
    compositionWidth: number;
    compositionHeight: number;
    videoWidth: number;
    videoHeight: number;
    sourceVideoWidth: number;
    sourceVideoHeight: number;

    // --- Core Data ---
    fps: number;
    clips: Clip[];
    recordings: Recording[];
    effects: Effect[];
    resources: VideoResources;
    totalDurationMs: number;

    // --- Derived lookup maps ---
    recordingsMap: Map<string, Recording>;

    // --- Derived Layout Data ---
    sortedClips: Clip[];
    frameLayout: FrameLayoutItem[];

    // --- Helpers ---
    getRecording: (recordingId: string) => Recording | undefined;
    getVideoUrl: (recordingId: string) => string | undefined;
    getClipAtTimelinePosition: (timelineMs: number) => Clip | null;

    // --- Layout Helpers (formerly VideoDataContext) ---
    getActiveClipData: (frame: number) => ActiveClipDataAtFrame | null;
    getActiveLayoutIndex: (frame: number) => number;
    getActiveLayoutItems: (frame: number) => FrameLayoutItem[];
    getLayoutItem: (index: number) => FrameLayoutItem | null;
    getPrevLayoutItem: (index: number) => FrameLayoutItem | null;
    getNextLayoutItem: (index: number) => FrameLayoutItem | null;
}

// ============================================================================
// CONTEXT
// ============================================================================

const TimelineContext = createContext<TimelineContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface TimelineProviderProps {
    // Dimensions
    compositionWidth: number;
    compositionHeight: number;
    videoWidth: number;
    videoHeight: number;
    sourceVideoWidth?: number;
    sourceVideoHeight?: number;

    // Core Data
    fps: number;
    clips: Clip[];
    recordings: Recording[];
    effects: Effect[];
    resources: VideoResources;

    children: React.ReactNode;
}

export function TimelineProvider({
    compositionWidth,
    compositionHeight,
    videoWidth,
    videoHeight,
    sourceVideoWidth,
    sourceVideoHeight,
    fps,
    clips,
    recordings,
    effects,
    resources,
    children,
}: TimelineProviderProps) {
    // 1. Efficient lookups
    const recordingsMap = useMemo(
        () => new Map(recordings.map((r) => [r.id, r])),
        [recordings]
    );

    // 2. Sorted Clips
    const sortedClips = useMemo(
        () => [...clips].sort((a, b) => a.startTime - b.startTime),
        [clips]
    );

    // 3. Frame Layout
    const frameLayout = useMemo(
        () => buildFrameLayout(sortedClips, fps, recordingsMap),
        [sortedClips, fps, recordingsMap]
    );

    // 4. Total Duration
    const totalDurationMs = useMemo(() => {
        if (clips.length === 0) return 0;
        return Math.max(...clips.map((c) => c.startTime + c.duration));
    }, [clips]);

    // --- Callbacks ---

    const getRecording = useCallback(
        (recordingId: string): Recording | undefined => recordingsMap.get(recordingId),
        [recordingsMap]
    );

    const getClipAtTimelinePosition = useCallback(
        (timelineMs: number): Clip | null => findClipAtTimelinePosition(timelineMs, clips),
        [clips]
    );

    const getVideoUrl = useCallback(
        (recordingId: string): string | undefined => resources.videoUrls?.[recordingId],
        [resources.videoUrls]
    );

    const getActiveClipData = useCallback(
        (frame: number): ActiveClipDataAtFrame | null => {
            // NOTE: getRecording returns undefined, but getActiveClipDataAtFrame expects null for not found
            // We wrap it to adapt types
            const lookupRecording = (id: string) => getRecording(id) ?? null;
            return getActiveClipDataAtFrame({
                frame,
                frameLayout,
                fps,
                effects,
                getRecording: lookupRecording,
            });
        },
        [frameLayout, fps, effects, getRecording]
    );

    const getActiveLayoutIndex = useCallback(
        (frame: number): number => findActiveFrameLayoutIndex(frameLayout, frame),
        [frameLayout]
    );

    const getActiveLayoutItems = useCallback(
        (frame: number): FrameLayoutItem[] => findActiveFrameLayoutItems(frameLayout, frame),
        [frameLayout]
    );

    const getLayoutItem = useCallback(
        (index: number): FrameLayoutItem | null => frameLayout[index] ?? null,
        [frameLayout]
    );

    const getPrevLayoutItem = useCallback(
        (index: number): FrameLayoutItem | null => (index > 0 ? frameLayout[index - 1] : null),
        [frameLayout]
    );

    const getNextLayoutItem = useCallback(
        (index: number): FrameLayoutItem | null => (index < frameLayout.length - 1 ? frameLayout[index + 1] : null),
        [frameLayout]
    );

    const value = useMemo<TimelineContextValue>(
        () => ({
            compositionWidth,
            compositionHeight,
            videoWidth,
            videoHeight,
            sourceVideoWidth: sourceVideoWidth ?? videoWidth,
            sourceVideoHeight: sourceVideoHeight ?? videoHeight,

            fps,
            clips,
            recordings,
            effects,
            resources,
            totalDurationMs,

            recordingsMap,
            sortedClips,
            frameLayout,

            getRecording,
            getVideoUrl,
            getClipAtTimelinePosition,
            getActiveClipData,
            getActiveLayoutIndex,
            getActiveLayoutItems,
            getLayoutItem,
            getPrevLayoutItem,
            getNextLayoutItem,
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
            effects,
            resources,
            totalDurationMs,
            recordingsMap,
            sortedClips,
            frameLayout,
            getRecording,
            getVideoUrl,
            getClipAtTimelinePosition,
            getActiveClipData,
            getActiveLayoutIndex,
            getActiveLayoutItems,
            getLayoutItem,
            getPrevLayoutItem,
            getNextLayoutItem,
        ]
    );

    return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
}

// ============================================================================
// HOOKS
// ============================================================================

export function useTimelineContext(): TimelineContextValue {
    const ctx = useContext(TimelineContext);
    if (!ctx) {
        throw new Error('useTimelineContext must be used within TimelineProvider');
    }
    return ctx;
}

export function useTimelineContextOptional(): TimelineContextValue | null {
    return useContext(TimelineContext);
}
