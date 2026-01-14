/**
 * useClipRenderState Hook
 *
 * Consolidates ALL shared rendering logic for clip renderers:
 * - Sequence timing (duration, hold frames)
 * - Frame position (local frame, clamped)
 * - Fade calculations (intro/outro, glow mode)
 * - Opacity calculation
 * - Scaling transforms
 *
 * This eliminates ~60 lines of duplicated code from each renderer.
 */

import { useMemo } from 'react';
import { usePlaybackSettings } from '@/features/rendering/renderer/context/playback/PlaybackSettingsContext';
import { useVideoPosition } from '@/features/rendering/renderer/context/layout/VideoPositionContext';
import { useProjectStore } from '@/features/core/stores/project-store';
import { calculateClipFadeDurations, calculateClipFadeOpacity, calculateGlowCrossfadeOpacity } from '../../compositions/utils/effects/clip-fade';
import type { Clip, Recording } from '@/types/project';

// ============================================================================
// TYPES
// ============================================================================

export interface ClipRenderStateOptions {
    clip: Clip;
    recording: Recording | undefined;
    startFrame: number;
    durationFrames: number;
    groupStartFrame: number;
    groupDuration: number;
    currentFrame: number;
    fps: number;
    isRendering: boolean;
}

export interface ClipRenderState {
    // Sequence timing
    finalDuration: number;

    // Frame position
    localFrame: number;
    isPreloading: boolean;

    // Opacity
    effectiveOpacity: number;

    // Scaling
    baseWidth: number;
    baseHeight: number;
    scaleX: number;
    scaleY: number;
    scaleTransform: string;

    // Fade state (for debugging)
    introFadeDuration: number;
    outroFadeDuration: number;
}

// ============================================================================
// HOOK
// ============================================================================

export function useClipRenderState(options: ClipRenderStateOptions): ClipRenderState {
    const { renderSettings } = usePlaybackSettings();
    const { isGlowMode } = renderSettings;
    const glowCrossfadeEnabled = renderSettings.glowCrossfade !== false;
    const glowFadeMode = isGlowMode && glowCrossfadeEnabled;

    // Pull layout and boundary state from context (Zero-Prop)
    // accessible because Renderers are children of VideoPositionProvider
    const {
        drawWidth,
        drawHeight,
        activeLayoutItem = null,
        prevLayoutItem = null,
        nextLayoutItem = null,
        boundaryState
    } = useVideoPosition();

    const shouldHoldPrevFrame = boundaryState?.shouldHoldPrevFrame ?? false;
    const isNearBoundaryEnd = boundaryState?.isNearBoundaryEnd ?? false;
    const overlapFrames = boundaryState?.overlapFrames ?? 0;

    // During scrubbing, don't hide preloading clips - prevents black screen during fast seeks
    const isScrubbing = useProjectStore((s) => s.isScrubbing);

    return useMemo(() => {
        const {
            clip, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
            currentFrame, fps, isRendering,
        } = options;

        // ==========================================================================
        // SEQUENCE TIMING
        // ==========================================================================
        const currentClipEndFrame = startFrame + durationFrames;
        const durationFromGroupStart = currentClipEndFrame - groupStartFrame;

        const isHoldPrevClip = !isRendering && shouldHoldPrevFrame && prevLayoutItem?.clip.id === clip.id;
        const isHoldActiveClipAtEnd = !isRendering && isNearBoundaryEnd && activeLayoutItem?.clip.id === clip.id;
        const isHoldClip = isHoldPrevClip || isHoldActiveClipAtEnd;

        const gapFrames = nextLayoutItem ? Math.max(0, nextLayoutItem.startFrame - currentClipEndFrame) : 0;
        const holdFrames = isHoldClip ? Math.max(overlapFrames, gapFrames) : gapFrames;
        const finalDuration = Math.max(groupDuration, durationFromGroupStart + holdFrames);

        // ==========================================================================
        // FRAME POSITION
        // ==========================================================================
        const localFrameRaw = currentFrame - startFrame;
        const localFrame = isHoldClip ? Math.min(localFrameRaw, durationFrames - 1) : localFrameRaw;
        // ARCHITECTURAL FIX: Use GROUP-level start frame for preloading check.
        // Within a contiguous group, groupStartFrame is STABLE and doesn't change
        // as you navigate between clips. This eliminates stale memo issues where
        // currentFrame is fresh but startFrame is from a previous clip.
        // The video element persists across clip boundaries (keyed by groupId),
        // so once currentFrame >= groupStartFrame, the video is active for the entire group.
        const isPreloading = currentFrame < groupStartFrame;

        // ==========================================================================
        // FADE CALCULATIONS
        // ==========================================================================
        const isNextContiguous = nextLayoutItem && nextLayoutItem.groupId === activeLayoutItem?.groupId;
        const isPrevContiguous = prevLayoutItem && prevLayoutItem.groupId === activeLayoutItem?.groupId;

        const wantsGlowIntro = glowFadeMode && (
            (clip.id === activeLayoutItem?.clip.id && shouldHoldPrevFrame && !isPrevContiguous) ||
            (clip.id === nextLayoutItem?.clip.id && !isNextContiguous)
        );
        const wantsGlowOutro = glowFadeMode && (
            (clip.id === activeLayoutItem?.clip.id && isNearBoundaryEnd && !isNextContiguous) ||
            (clip.id === prevLayoutItem?.clip.id && !isPrevContiguous)
        );

        const { introFadeDuration, outroFadeDuration } = calculateClipFadeDurations(
            clip, fps, glowFadeMode, wantsGlowIntro, wantsGlowOutro
        );
        const fadeOpacity = calculateClipFadeOpacity({
            localFrame, durationFrames, introFadeDuration, outroFadeDuration
        });
        const glowOpacityOverride = calculateGlowCrossfadeOpacity({
            isGlowMode: glowFadeMode, clipId: clip.id, currentFrame, fps, shouldHoldPrevFrame,
            isNearBoundaryEnd, prevLayoutItem, activeLayoutItem, nextLayoutItem,
        });

        // ==========================================================================
        // OPACITY
        // ==========================================================================
        // During scrubbing, don't set opacity to 0 for preloading clips - this prevents
        // black screen flashes when React reconciles clips with temporarily wrong timing
        const effectiveOpacity = (isPreloading && !isScrubbing)
            ? 0
            : (glowOpacityOverride ?? (introFadeDuration > 0 || outroFadeDuration > 0 ? fadeOpacity : 1));

        // ==========================================================================
        // SCALING
        // ==========================================================================
        const baseWidth = recording?.width || drawWidth;
        const baseHeight = recording?.height || drawHeight;
        const scaleX = baseWidth > 0 ? drawWidth / baseWidth : 1;
        const scaleY = baseHeight > 0 ? drawHeight / baseHeight : 1;
        const scaleTransform = `scale(${scaleX}, ${scaleY})`;

        return {
            finalDuration,
            localFrame,
            isPreloading,
            effectiveOpacity,
            baseWidth,
            baseHeight,
            scaleX,
            scaleY,
            scaleTransform,
            introFadeDuration,
            outroFadeDuration,
        };
    }, [
        options, glowFadeMode,
        drawWidth, drawHeight,
        activeLayoutItem, prevLayoutItem, nextLayoutItem,
        shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames,
        isScrubbing
    ]);
}
