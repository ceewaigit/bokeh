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
import { usePlaybackSettings } from '@/remotion/context/PlaybackSettingsContext';
import { calculateClipFadeDurations, calculateClipFadeOpacity, calculateGlowCrossfadeOpacity } from '../compositions/utils/clip-fade';
import type { Clip, Recording } from '@/types/project';
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout';

// ============================================================================
// TYPES
// ============================================================================

export interface ClipRenderStateOptions {
    clip: Clip;
    recording: Recording;
    startFrame: number;
    durationFrames: number;
    groupStartFrame: number;
    groupDuration: number;
    currentFrame: number;
    fps: number;
    isRendering: boolean;
    drawWidth: number;
    drawHeight: number;
    activeLayoutItem: FrameLayoutItem | null;
    prevLayoutItem: FrameLayoutItem | null;
    nextLayoutItem: FrameLayoutItem | null;
    shouldHoldPrevFrame: boolean;
    isNearBoundaryEnd: boolean;
    overlapFrames: number;
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

    return useMemo(() => {
        const {
            clip, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
            currentFrame, fps, isRendering, drawWidth, drawHeight,
            activeLayoutItem, prevLayoutItem, nextLayoutItem,
            shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames,
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
        const finalDuration = Math.max(groupDuration, durationFromGroupStart + (isHoldClip ? overlapFrames : gapFrames));

        // ==========================================================================
        // FRAME POSITION
        // ==========================================================================
        const localFrameRaw = currentFrame - startFrame;
        const localFrame = isHoldClip ? Math.min(localFrameRaw, durationFrames - 1) : localFrameRaw;
        const isPreloading = currentFrame < startFrame;

        // ==========================================================================
        // FADE CALCULATIONS
        // ==========================================================================
        const isNextContiguous = nextLayoutItem && nextLayoutItem.groupId === activeLayoutItem?.groupId;
        const isPrevContiguous = prevLayoutItem && prevLayoutItem.groupId === activeLayoutItem?.groupId;

        const wantsGlowIntro = isGlowMode && (
            (clip.id === activeLayoutItem?.clip.id && shouldHoldPrevFrame && !isPrevContiguous) ||
            (clip.id === nextLayoutItem?.clip.id && !isNextContiguous)
        );
        const wantsGlowOutro = isGlowMode && (
            (clip.id === activeLayoutItem?.clip.id && isNearBoundaryEnd && !isNextContiguous) ||
            (clip.id === prevLayoutItem?.clip.id && !isPrevContiguous)
        );

        const { introFadeDuration, outroFadeDuration } = calculateClipFadeDurations(
            clip, fps, isGlowMode, wantsGlowIntro, wantsGlowOutro
        );
        const fadeOpacity = calculateClipFadeOpacity({
            localFrame, durationFrames, introFadeDuration, outroFadeDuration
        });
        const glowOpacityOverride = calculateGlowCrossfadeOpacity({
            isGlowMode, clipId: clip.id, currentFrame, fps, shouldHoldPrevFrame,
            isNearBoundaryEnd, prevLayoutItem, activeLayoutItem, nextLayoutItem,
        });

        // ==========================================================================
        // OPACITY
        // ==========================================================================
        const effectiveOpacity = isPreloading
            ? 0
            : (glowOpacityOverride ?? (introFadeDuration > 0 || outroFadeDuration > 0 ? fadeOpacity : 1));

        // ==========================================================================
        // SCALING
        // ==========================================================================
        const baseWidth = recording.width || drawWidth;
        const baseHeight = recording.height || drawHeight;
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
        options.clip,
        options.recording,
        options.startFrame,
        options.durationFrames,
        options.groupStartFrame,
        options.groupDuration,
        options.currentFrame,
        options.fps,
        options.isRendering,
        options.drawWidth,
        options.drawHeight,
        options.activeLayoutItem,
        options.prevLayoutItem,
        options.nextLayoutItem,
        options.shouldHoldPrevFrame,
        options.isNearBoundaryEnd,
        options.overlapFrames,
        isGlowMode,
    ]);
}
