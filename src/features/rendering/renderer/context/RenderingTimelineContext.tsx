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
import type { Clip, Effect, Recording, PluginEffectData } from '@/types/project';
import { EffectType } from '@/types/project';
import type { VideoResources } from '@/types';
import type { ActiveClipDataAtFrame } from '@/types';
import { KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config';
import {
    buildFrameLayout,
    buildWebcamFrameLayout,
    findActiveFrameLayoutIndex,
    findActiveFrameLayoutItems,
    type FrameLayoutItem,
    type WebcamFrameLayoutItem
} from '@/features/ui/timeline/utils/frame-layout';
import { getActiveClipDataAtFrame } from '@/features/rendering/renderer/utils/get-active-clip-data-at-frame';
import { findClipAtTimelinePosition } from '@/features/ui/timeline/time/time-space-converter';

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

    // --- PERF: Pre-computed effect indices (computed once per effects change) ---
    effectsByType: Map<EffectType, Effect[]>;
    effectsByClipId: Map<string, Effect[]>;
    pluginEffects: {
        belowCursor: Effect[];
        aboveCursor: Effect[];
    };
    keystrokeStyleEffect: Effect | undefined;
    hasSubtitleEffects: boolean;

    // --- Derived Layout Data ---
    sortedClips: Clip[];
    frameLayout: FrameLayoutItem[];
    webcamFrameLayout: WebcamFrameLayoutItem[];

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
    webcamClips?: Clip[];
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
    webcamClips,
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

    // PERF: Pre-compute effect indices (computed once per effects change)
    // This enables O(1) lookups instead of O(n) filtering per frame
    const effectsByType = useMemo(() => {
        const map = new Map<EffectType, Effect[]>();
        for (const effect of effects) {
            const list = map.get(effect.type) ?? [];
            list.push(effect);
            map.set(effect.type, list);
        }
        return map;
    }, [effects]);

    const effectsByClipId = useMemo(() => {
        const map = new Map<string, Effect[]>();
        for (const effect of effects) {
            const clipId = (effect as { clipId?: string }).clipId;
            if (!clipId) continue;
            const list = map.get(clipId) ?? [];
            list.push(effect);
            map.set(clipId, list);
        }
        return map;
    }, [effects]);

    const pluginEffects = useMemo(() => {
        const plugins = effectsByType.get(EffectType.Plugin) ?? [];
        const enabled = plugins.filter(e => e.enabled !== false);
        const CURSOR_Z_INDEX = 100;
        return {
            belowCursor: enabled
                .filter(e => ((e.data as PluginEffectData)?.zIndex ?? 50) < CURSOR_Z_INDEX)
                .sort((a, b) => ((a.data as PluginEffectData)?.zIndex ?? 50) - ((b.data as PluginEffectData)?.zIndex ?? 50)),
            aboveCursor: enabled
                .filter(e => ((e.data as PluginEffectData)?.zIndex ?? 50) >= CURSOR_Z_INDEX)
                .sort((a, b) => ((a.data as PluginEffectData)?.zIndex ?? 50) - ((b.data as PluginEffectData)?.zIndex ?? 50)),
        };
    }, [effectsByType]);

    const keystrokeStyleEffect = useMemo(() => {
        return (effectsByType.get(EffectType.Keystroke) ?? [])
            .find(e => e.id === KEYSTROKE_STYLE_EFFECT_ID);
    }, [effectsByType]);

    const hasSubtitleEffects = useMemo(() => {
        return (effectsByType.get(EffectType.Subtitle) ?? [])
            .some(e => e.enabled !== false);
    }, [effectsByType]);

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

    // 3b. Webcam Frame Layout (with grouping for frame bleeding prevention)
    const webcamFrameLayout = useMemo(
        () => buildWebcamFrameLayout(webcamClips ?? [], fps),
        [webcamClips, fps]
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

            // PERF: Pre-computed effect indices
            effectsByType,
            effectsByClipId,
            pluginEffects,
            keystrokeStyleEffect,
            hasSubtitleEffects,

            sortedClips,
            frameLayout,
            webcamFrameLayout,

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
            effectsByType,
            effectsByClipId,
            pluginEffects,
            keystrokeStyleEffect,
            hasSubtitleEffects,
            sortedClips,
            frameLayout,
            webcamFrameLayout,
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
