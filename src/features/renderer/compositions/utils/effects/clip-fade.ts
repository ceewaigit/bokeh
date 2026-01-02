/**
 * Clip fade utilities shared across renderers.
 */

import type { ClipFadeDurations, FadeOpacityOptions, GlowCrossfadeOptions } from '@/types';

/**
 * Calculate clip fade opacity for intro/outro transitions.
 */
export function calculateClipFadeOpacity(opts: FadeOpacityOptions): number {
  const {
    localFrame,
    durationFrames,
    introFadeDuration,
    outroFadeDuration,
    minOpacity = 0,
  } = opts;

  let fadeOpacity = 1;
  const smoothstep = (t: number) => t * t * (3 - 2 * t);

  // Intro fade (fade in from minOpacity to 1)
  if (introFadeDuration > 0 && localFrame >= 0 && localFrame < introFadeDuration) {
    const progress = smoothstep(localFrame / introFadeDuration);
    fadeOpacity = minOpacity + (1 - minOpacity) * progress;
  }

  // Outro fade (fade out from 1 to minOpacity)
  const outroStartFrame = durationFrames - outroFadeDuration;
  if (outroFadeDuration > 0 && localFrame >= outroStartFrame) {
    const outroProgress = smoothstep((localFrame - outroStartFrame) / outroFadeDuration);
    const outroOpacity = 1 - (1 - minOpacity) * outroProgress;
    fadeOpacity = Math.min(fadeOpacity, outroOpacity);
  }

  return fadeOpacity;
}

/**
 * Calculate glow crossfade opacity override for smooth clip transitions.
 * Returns null if no override is needed.
 */
export function calculateGlowCrossfadeOpacity(opts: GlowCrossfadeOptions): number | null {
  const {
    isGlowMode,
    clipId,
    currentFrame,
    fps,
    shouldHoldPrevFrame,
    isNearBoundaryEnd,
    prevLayoutItem,
    activeLayoutItem,
    nextLayoutItem,
  } = opts;

  if (!isGlowMode || !activeLayoutItem) return null;

  const crossfadeFrames = Math.max(2, Math.round(fps * 0.12));

  const shouldCrossfadeIntro = shouldHoldPrevFrame
    && prevLayoutItem
    && clipId === prevLayoutItem.clip.id
    && activeLayoutItem.startFrame === currentFrame;

  const shouldCrossfadeOutro = isNearBoundaryEnd
    && nextLayoutItem
    && clipId === activeLayoutItem.clip.id
    && currentFrame >= activeLayoutItem.endFrame - crossfadeFrames;

  if (shouldCrossfadeIntro) {
    const crossfadeProgress = Math.min(
      1,
      Math.max(0, (currentFrame - activeLayoutItem.startFrame) / crossfadeFrames)
    );
    return 1 - crossfadeProgress;
  }

  if (shouldCrossfadeOutro) {
    const startFadeFrame = activeLayoutItem.startFrame + activeLayoutItem.durationFrames - crossfadeFrames;
    const crossfadeProgress = Math.min(
      1,
      Math.max(0, (currentFrame - startFadeFrame) / crossfadeFrames)
    );
    return 1 - crossfadeProgress;
  }

  return null;
}

/**
 * Calculate clip fade durations considering glow mode.
 */
export function calculateClipFadeDurations(
  clip: { introFadeMs?: number; outroFadeMs?: number },
  fps: number,
  isGlowMode: boolean,
  wantsGlowIntro: boolean,
  wantsGlowOutro: boolean
): ClipFadeDurations {
  const baseIntroFadeDuration = clip.introFadeMs
    ? Math.round((clip.introFadeMs / 1000) * fps)
    : 0;
  const baseOutroFadeDuration = clip.outroFadeMs
    ? Math.round((clip.outroFadeMs / 1000) * fps)
    : 0;

  const glowCrossfadeFrames = isGlowMode ? Math.max(2, Math.round(fps * 0.12)) : 0;

  return {
    introFadeDuration: Math.max(baseIntroFadeDuration, wantsGlowIntro ? glowCrossfadeFrames : 0),
    outroFadeDuration: Math.max(baseOutroFadeDuration, wantsGlowOutro ? glowCrossfadeFrames : 0),
  };
}
