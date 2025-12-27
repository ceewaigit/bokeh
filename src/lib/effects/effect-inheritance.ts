/**
 * Effect Inheritance Utility
 *
 * Handles inheritance of effects from video clips to generated/image clips.
 * Generated clips inherit structural effects (Crop, Background, Zoom, Screen)
 * from their source video to maintain visual continuity.
 */

import { type PersistedVideoState } from '@/lib/timeline/frame-layout';
import type { ActiveClipDataAtFrame } from '@/types';
import type { Effect, Recording } from '@/types/project';
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout';
import { resolveClipDataForLayoutItem } from '@/remotion/utils/get-active-clip-data-at-frame';
import { EffectType } from '@/types/project';

export type { PersistedVideoState } from '@/lib/timeline/frame-layout';

interface ApplyInheritanceArgs {
    clipData: ActiveClipDataAtFrame;
    persistedState: PersistedVideoState;
    currentFrame: number;
    frameLayout: FrameLayoutItem[];
    fps: number;
    effects: Effect[];
    getRecording: (id: string) => Recording | null | undefined;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Apply effect inheritance from a video clip to a generated/image clip.
 *
 * Inheritable effects (if not overridden by the current clip):
 * - Crop: Structural framing
 * - Background: Visual backdrop
 * - Zoom: Camera positioning
 * - Screen: 3D perspective
 */
export function applyInheritance({
    clipData,
    persistedState,
    currentFrame,
    frameLayout,
    fps,
    effects,
    getRecording,
}: ApplyInheritanceArgs): ActiveClipDataAtFrame {
    const bgStart = persistedState.layoutItem.startFrame;
    const bgEnd = persistedState.layoutItem.endFrame;

    let videoFrame = currentFrame;
    if (currentFrame >= bgEnd) {
        videoFrame = bgEnd - 1;
    } else if (currentFrame < bgStart) {
        videoFrame = bgStart;
    }

    const videoData = resolveClipDataForLayoutItem({
        frame: videoFrame,
        layoutItem: persistedState.layoutItem,
        frameLayout,
        fps,
        effects,
        getRecording,
    });

    if (!videoData) return clipData;

    const hasOwnZoom = clipData.effects.find(e =>
        e.type === EffectType.Zoom &&
        e.startTime <= clipData.sourceTimeMs &&
        e.endTime > clipData.sourceTimeMs
    );
    const hasOwnScreen = clipData.effects.find(e =>
        e.type === EffectType.Screen &&
        e.startTime <= clipData.sourceTimeMs &&
        e.endTime > clipData.sourceTimeMs
    );
    const hasOwnCrop = clipData.effects.find(e =>
        e.type === EffectType.Crop &&
        e.startTime <= clipData.sourceTimeMs &&
        e.endTime > clipData.sourceTimeMs
    );
    const hasOwnBackground = clipData.effects.find(e =>
        e.type === EffectType.Background &&
        e.startTime <= clipData.sourceTimeMs &&
        e.endTime > clipData.sourceTimeMs
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
        recording: clipData.recording,
        effects: [...inheritedEffects, ...inheritedZoom, ...inheritedScreen, ...ownEffects],
    };
}
