/**
 * useEffectiveClipData Hook
 *
 * Resolves the effective clip data for the current frame, handling:
 * - Boundary overlap fallback (near clip transitions)
 * - Effect inheritance from previous video clip (for generated/image clips)
 *
 * This is the single source of truth for "what clip data should we render?"
 */

import { useMemo } from 'react';
import { EffectsFactory } from '@/lib/effects/effects-factory';
import { EffectType } from '@/types/project';
import type { Clip, Effect, Recording } from '@/types/project';
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout';
import type { ActiveClipDataAtFrame } from '@/types';
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame';

// ============================================================================
// TYPES
// ============================================================================

export interface PersistedVideoState {
    recording: Recording;
    clip: Clip;
    layoutItem: FrameLayoutItem;
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
    persistedVideoState: PersistedVideoState | null;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Resolves effective clip data with inheritance logic for generated/image clips.
 *
 * Key behaviors:
 * - Falls back to adjacent clip data during boundary overlaps
 * - Generated/image clips inherit layout effects from previous video clip
 * - Tracks persisted video state for smooth transitions
 */
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

        // ==========================================================================
        // 1. BOUNDARY FALLBACK
        // ==========================================================================
        // During preview boundary overlaps, fall back to adjacent clip data
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

        // ==========================================================================
        // 2. RESOLVE PERSISTED/INHERITED VIDEO STATE
        // ==========================================================================
        // Deterministically find the last "Video" clip in the timeline history
        // to serve as the background/base for Generated/Image clips.

        let persistedVideoState: PersistedVideoState | null = null;

        const isVideo = (rec: Recording | null | undefined) =>
            rec && (!rec.sourceType || rec.sourceType === 'video');

        // If current is video, it IS the state
        if (isVideo(clipData?.recording) && activeLayoutItem && clipData) {
            persistedVideoState = {
                recording: clipData.recording,
                clip: clipData.clip,
                layoutItem: activeLayoutItem,
                sourceTimeMs: clipData.sourceTimeMs,
            };
        }
        // If current is NOT video (or null), search backwards
        else {
            const currentIndex = activeLayoutItem ? frameLayout.indexOf(activeLayoutItem) : -1;
            // Start searching from the item before current, or from the end if no current item
            // (Only search if we have a layout to search)
            let searchIndex = currentIndex >= 0 ? currentIndex - 1 : -1;

            // Safety: if we have no active item but have prevLayoutItem (boundary case), use that index
            if (searchIndex < 0 && prevLayoutItem) {
                searchIndex = frameLayout.indexOf(prevLayoutItem);
            }

            if (searchIndex >= 0) {
                for (let i = searchIndex; i >= 0; i--) {
                    const item = frameLayout[i];
                    const rec = getRecording(item.clip.recordingId);

                    if (isVideo(rec)) {
                        // Found the last video clip. Evaluate it at its end frame.
                        const endFrame = item.startFrame + item.durationFrames - 1;
                        const videoData = getActiveClipDataAtFrame({
                            frame: endFrame,
                            frameLayout,
                            fps,
                            effects,
                            getRecording,
                        });

                        if (videoData) {
                            persistedVideoState = {
                                recording: videoData.recording,
                                clip: videoData.clip,
                                layoutItem: item,
                                sourceTimeMs: videoData.sourceTimeMs,
                            };
                        }
                        break; // Stop after finding the first valid video
                    }
                }
            }
        }

        // ==========================================================================
        // 3. APPLY INHERITANCE
        // ==========================================================================
        // Generated/image clips inherit structural effects from the persisted video state
        if (
            clipData &&
            ['generated', 'image'].includes(clipData.recording.sourceType || '') &&
            persistedVideoState &&
            isVideo(persistedVideoState.recording)
        ) {
            clipData = applyInheritance(
                clipData,
                persistedVideoState,
                currentFrame,
                frameLayout,
                fps,
                effects,
                getRecording
            );
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

// ============================================================================
// HELPER: Apply inheritance from video clip to generated/image clip
// ============================================================================

function applyInheritance(
    clipData: ActiveClipDataAtFrame,
    persistedState: PersistedVideoState,
    currentFrame: number,
    frameLayout: FrameLayoutItem[],
    fps: number,
    effects: Effect[],
    getRecording: (id: string) => Recording | null | undefined
): ActiveClipDataAtFrame {
    // Get video clip's data at its final frame (for stable inheritance)
    const videoFrame = Math.min(
        currentFrame,
        persistedState.layoutItem.startFrame + persistedState.layoutItem.durationFrames - 1
    );

    const videoData = getActiveClipDataAtFrame({
        frame: videoFrame,
        frameLayout,
        fps,
        effects,
        getRecording,
    });

    if (!videoData) return clipData;

    // Check which effects the current clip has
    const hasOwnZoom = EffectsFactory.getActiveEffectAtTime(
        clipData.effects, EffectType.Zoom, clipData.sourceTimeMs
    );
    const hasOwnScreen = EffectsFactory.getActiveEffectAtTime(
        clipData.effects, EffectType.Screen, clipData.sourceTimeMs
    );
    const hasOwnCrop = EffectsFactory.getActiveEffectAtTime(
        clipData.effects, EffectType.Crop, clipData.sourceTimeMs
    );
    const hasOwnBackground = EffectsFactory.getActiveEffectAtTime(
        clipData.effects, EffectType.Background, clipData.sourceTimeMs
    );

    // Inherit structural effects (Crop/Background) from video if not overridden
    const inheritedEffects = videoData.effects
        .filter((e) => {
            if (e.type === EffectType.Crop && hasOwnCrop) return false;
            if (e.type === EffectType.Background && hasOwnBackground) return false;
            return e.type === EffectType.Crop || e.type === EffectType.Background;
        })
        .map((e) => ({ ...e, startTime: -Infinity, endTime: Infinity }));

    // Inherit Zoom/Screen if not overridden
    const inheritedZoom = hasOwnZoom
        ? clipData.effects.filter((e) => e.type === EffectType.Zoom)
        : videoData.effects
            .filter((e) => e.type === EffectType.Zoom)
            .map((e) => ({ ...e, startTime: -Infinity, endTime: Infinity }));

    const inheritedScreen = hasOwnScreen
        ? clipData.effects.filter((e) => e.type === EffectType.Screen)
        : videoData.effects
            .filter((e) => e.type === EffectType.Screen)
            .map((e) => ({ ...e, startTime: -Infinity, endTime: Infinity }));

    // Keep remaining effects from current clip
    const ownEffects = clipData.effects.filter(
        (e) =>
            e.type !== EffectType.Zoom &&
            e.type !== EffectType.Screen &&
            (hasOwnCrop || e.type !== EffectType.Crop) &&
            (hasOwnBackground || e.type !== EffectType.Background)
    );

    return {
        ...clipData,
        recording: {
            ...persistedState.recording,
            // Preserve identity fields
            id: clipData.recording.id,
            sourceType: clipData.recording.sourceType,
            generatedSource: clipData.recording.generatedSource,
            imageSource: clipData.recording.imageSource,
            metadata: clipData.recording.metadata,
        },
        effects: [...inheritedEffects, ...inheritedZoom, ...inheritedScreen, ...ownEffects],
    };
}
