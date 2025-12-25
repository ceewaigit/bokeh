
/**
 * useEffectiveClipData Hook
 *
 * Resolves the effective clip data for the current frame, handling:
 * - Boundary overlap fallback (near clip transitions)
 * - Effect inheritance from previous video clip (for generated/image clips)
 */

import { useMemo } from 'react';
import type { Effect, Recording } from '@/types/project';
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout';
import type { ActiveClipDataAtFrame } from '@/types';
import { getActiveClipDataAtFrame, resolveClipDataForLayoutItem } from '@/remotion/utils/get-active-clip-data-at-frame';
import { applyInheritance, type PersistedVideoState } from '@/lib/effects/effect-inheritance';

// Re-export for consumers
export type { PersistedVideoState } from '@/lib/effects/effect-inheritance';

// Extended type to include calculated source time for consumers
export interface ResolvedVideoState extends PersistedVideoState {
    sourceTimeMs: number;
}

interface UseEffectiveClipDataOptions {
    activeClipData: ActiveClipDataAtFrame | null;
    currentFrame: number;
    frameLayout: FrameLayoutItem[];
    fps: number;
    effects: Effect[];
    getRecording: (id: string) => Recording | null | undefined;
    isRendering: boolean;

    // Boundary state
    isNearBoundaryStart: boolean;
    isNearBoundaryEnd: boolean;
    activeLayoutItem: FrameLayoutItem | null;
    prevLayoutItem: FrameLayoutItem | null;
    nextLayoutItem: FrameLayoutItem | null;
}

interface UseEffectiveClipDataResult {
    effectiveClipData: ActiveClipDataAtFrame | null;
    persistedVideoState: ResolvedVideoState | null;
}

export function useEffectiveClipData({
    activeClipData,
    currentFrame,
    frameLayout,
    fps,
    effects,
    getRecording,
    isRendering,
    isNearBoundaryStart,
    isNearBoundaryEnd,
    activeLayoutItem,
    prevLayoutItem,
    nextLayoutItem,
}: UseEffectiveClipDataOptions): UseEffectiveClipDataResult {

    return useMemo(() => {
        let clipData = activeClipData;

        // 1. BOUNDARY FALLBACK
        if (!clipData && !isRendering) {
            if (isNearBoundaryStart && prevLayoutItem && activeLayoutItem) {
                clipData = getActiveClipDataAtFrame({
                    frame: activeLayoutItem.startFrame - 1,
                    frameLayout,
                    fps,
                    effects,
                    getRecording,
                });
            } else if (isNearBoundaryEnd && nextLayoutItem) {
                clipData = getActiveClipDataAtFrame({
                    frame: nextLayoutItem.startFrame,
                    frameLayout,
                    fps,
                    effects,
                    getRecording,
                });
            }
        }

        // 2. RESOLVE PERSISTED/INHERITED VIDEO STATE
        const isVisualSource = (rec: Recording | null | undefined) =>
            rec && (!rec.sourceType || rec.sourceType === 'video' || rec.sourceType === 'image');

        let persistedVideoState: ResolvedVideoState | null = null;

        if (activeLayoutItem?.persistedVideoState) {
            // Strategy 1: Explicit constraint from layout (Pre-computed)
            const state = activeLayoutItem.persistedVideoState;

            // Calculate current source time on the background video
            let currentSourceTimeMs: number;

            if (state.isFrozen) {
                // If frozen, do NOT advance time. Stick to the clamped base time.
                currentSourceTimeMs = state.baseSourceTimeMs;
            } else {
                // Normal playback: advance time based on how far we are into the overlay
                const framesIntoOverlay = currentFrame - activeLayoutItem.startFrame;
                const msIntoOverlay = (framesIntoOverlay / fps) * 1000;
                currentSourceTimeMs = state.baseSourceTimeMs + (msIntoOverlay * (state.clip.playbackRate || 1));
            }

            persistedVideoState = {
                ...state,
                sourceTimeMs: currentSourceTimeMs
            };
        }
        else if (isVisualSource(clipData?.recording) && activeLayoutItem && clipData) {
            // Strategy 2: Self is visual
            persistedVideoState = {
                recording: clipData.recording,
                clip: clipData.clip,
                layoutItem: activeLayoutItem,
                baseSourceTimeMs: clipData.sourceTimeMs,
                sourceTimeMs: clipData.sourceTimeMs,
                isFrozen: false,
            };
        }

        // 3. APPLY INHERITANCE
        if (
            clipData &&
            ['generated'].includes(clipData.recording.sourceType || '') &&
            persistedVideoState &&
            isVisualSource(persistedVideoState.recording)
        ) {
            clipData = applyInheritance({
                clipData,
                persistedState: persistedVideoState,
                currentFrame,
                frameLayout,
                fps,
                effects,
                getRecording,
            });
        }

        return {
            effectiveClipData: clipData,
            persistedVideoState,
        };
    }, [
        activeClipData,
        currentFrame,
        frameLayout,
        fps,
        effects,
        getRecording,
        isRendering,
        isNearBoundaryStart,
        isNearBoundaryEnd,
        activeLayoutItem,
        prevLayoutItem,
        nextLayoutItem,
    ]);
}
