/**
 * Shared zoom transformation utilities for video and cursor layers
 * Uses deterministic, frame-perfect easing without spring physics
 */

import type { ZoomBlock, ZoomTransitionStyle, CameraSettings } from '@/types/project';
import type { CameraMotionBlurState, MotionBlurConfig } from '@/features/rendering/motion-blur/types';
import type { ZoomTransform } from '@/features/rendering/renderer/types';
import { smoothStep, smootherStep, easeInOutCubic, clamp01 } from '@/features/rendering/canvas/math';
import { ZOOM_TRANSITION_CONFIG } from '@/shared/config/physics-config';

// Re-export easing functions for backwards compatibility
export { smoothStep, smootherStep, easeInOutCubic };

// Exported easing functions - used by rendering-warmup.ts for JIT pre-warming
export function easeInOutSine(p: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp01(p));
}

export function easeOutExpo(p: number): number {
  const x = clamp01(p);
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

export function easeInOutExpo(p: number): number {
  const x = clamp01(p);
  if (x === 0) return 0;
  if (x === 1) return 1;
  return x < 0.5
    ? Math.pow(2, 20 * x - 10) / 2
    : (2 - Math.pow(2, -20 * x + 10)) / 2;
}

export function easeInOutSigmoid(p: number, k: number = 10): number {
  const x = clamp01(p);
  const s = (t: number) => 1 / (1 + Math.exp(-k * (t - 0.5)));
  const s0 = s(0);
  const s1 = s(1);
  return (s(x) - s0) / (s1 - s0);
}

// Ease-out quint - strong deceleration, "settles" into position
export function easeOutQuint(p: number): number {
  const x = clamp01(p);
  return 1 - Math.pow(1 - x, 5);
}

/**
 * Hybrid "settle" easing curve optimized for zoom transitions.
 *
 * Standard easeOutQuint starts too fast for deep zooms (2.5x+), rushing to ~80%
 * immediately with no acceleration period. This hybrid curve provides:
 *
 * - First 50%: Smooth acceleration via smootherStep (no jarring start)
 * - 50-85%: Gradual deceleration phase
 * - Last 15%: Strong ease-out for natural "settling" into final position
 *
 * This creates camera-like motion that accelerates smoothly, then settles
 * elegantly regardless of zoom scale.
 */
export function easeSettleHybrid(p: number): number {
  const x = clamp01(p);

  if (x < 0.5) {
    // Smooth acceleration phase using scaled smootherStep
    const t = x / 0.5;  // Map 0-0.5 to 0-1
    return smootherStep(t) * 0.6;  // Reaches 60% at midpoint
  } else if (x < 0.85) {
    // Transition phase - gradual deceleration
    const t = (x - 0.5) / 0.35;  // Map 0.5-0.85 to 0-1
    const eased = t * t * (3 - 2 * t);  // smoothStep for smooth blending
    return 0.6 + eased * 0.3;  // 60% → 90%
  } else {
    // Settle phase - strong ease-out for natural settling
    const t = (x - 0.85) / 0.15;  // Map 0.85-1 to 0-1
    const easeOut = 1 - Math.pow(1 - t, 3);  // cubic ease-out
    return 0.9 + easeOut * 0.1;  // 90% → 100%
  }
}

/**
 * Single easing function for zoom transitions.
 * Used for both intro (zoom in) and outro (zoom out).
 */
function easeZoomProgress(style: ZoomTransitionStyle | undefined, progress: number): number {
  const p = clamp01(progress);
  switch (style ?? 'smoother') {
    case 'linear':
      return p;
    case 'cubic':
      return easeInOutCubic(p);
    case 'expo':
      return easeInOutExpo(p);
    case 'sigmoid':
      return easeInOutSigmoid(p);
    case 'sine':
      return easeInOutSine(p);
    case 'smoother':
    default:
      return smootherStep(p);
  }
}

/**
 * Normalize intro/outro durations to ensure they don't overlap and meet minimum
 * requirements based on zoom scale.
 *
 * @param blockDuration - Total duration of the zoom block in ms
 * @param introMs - Requested intro duration in ms
 * @param outroMs - Requested outro duration in ms
 * @param targetScale - Optional zoom scale (1.0+) to enforce minimum durations
 */
const normalizeEaseDurations = (
  blockDuration: number,
  introMs: number,
  outroMs: number,
  targetScale?: number
): { duration: number; intro: number; outro: number } => {
  const duration = Math.max(0, blockDuration);
  if (duration <= 0) {
    return { duration: 0, intro: 0, outro: 0 };
  }

  // Apply scale-based minimum constraints if scale is provided AND user set non-zero values.
  // If user explicitly sets 0, they want instant zoom - respect that choice.
  const minDuration = targetScale != null ? getMinDurationForScale(targetScale) : 0;
  const rawIntro = introMs > 0 ? Math.max(minDuration, introMs) : 0;
  const rawOutro = outroMs > 0 ? Math.max(minDuration, outroMs) : 0;

  let effectiveIntro = rawIntro;
  let effectiveOutro = rawOutro;

  // Normalize intro/outro so they never overlap (prevents jumps on short blocks).
  const totalEase = effectiveIntro + effectiveOutro;
  if (totalEase > duration && totalEase > 0) {
    const ratio = duration / totalEase;
    effectiveIntro *= ratio;
    effectiveOutro *= ratio;
  }

  return { duration, intro: effectiveIntro, outro: effectiveOutro };
};

export function getEffectiveZoomEaseDurations(
  blockDuration: number,
  introMs: number,
  outroMs: number,
  targetScale?: number
): { introMs: number; outroMs: number } {
  const { intro, outro } = normalizeEaseDurations(blockDuration, introMs, outroMs, targetScale);
  return { introMs: intro, outroMs: outro };
}

/**
 * Calculate adaptive intro/outro durations based on zoom scale and block duration.
 *
 * Uses logarithmic scaling to account for the multiplicative nature of zoom:
 * - A zoom from 1x→2x covers "1 unit" of scale
 * - A zoom from 2x→4x covers "2 units" but should feel proportionally similar
 *
 * Scale mapping (with logarithmic scaling):
 * - 1.0x → 600ms base
 * - 2.0x → 900ms (1.5x multiplier via log2)
 * - 4.0x → 1200ms (2x multiplier via log2)
 * - 7.0x → 1500ms (capped)
 *
 * This ensures deep zooms get proportionally more time to maintain smooth motion.
 */
export function calculateAdaptiveDurations(
  targetScale: number,
  blockDurationMs: number,
  userIntroMs?: number,
  userOutroMs?: number
): { introMs: number; outroMs: number } {
  // Log-based scaling: deeper zooms need proportionally more time
  // log2(1) = 0, log2(2) = 1, log2(4) = 2
  // This accounts for the multiplicative nature of zoom perception
  const clampedScale = Math.max(1, targetScale);
  const logScale = Math.log2(clampedScale);
  const scaleMultiplier = 1 + logScale * 0.5;  // 1x→1.0, 2x→1.5, 4x→2.0

  // Base timing - use user values if provided, otherwise defaults
  const baseIntro = userIntroMs ?? 600;
  const baseOutro = userOutroMs ?? 650;

  // Apply logarithmic scaling
  let introMs = baseIntro * scaleMultiplier;
  let outroMs = baseOutro * scaleMultiplier;

  // Clamp to reasonable bounds (300ms min to 2500ms max)
  introMs = Math.max(300, Math.min(2500, introMs));
  outroMs = Math.max(300, Math.min(2500, outroMs));

  // Never exceed 60% of block duration for total transitions
  const maxTotal = blockDurationMs * 0.6;
  const total = introMs + outroMs;
  if (total > maxTotal && total > 0) {
    const ratio = maxTotal / total;
    introMs *= ratio;
    outroMs *= ratio;
  }

  return { introMs, outroMs };
}

/**
 * Get minimum transition duration for a given zoom scale.
 * Deep zooms need more time to look smooth - prevents user from setting
 * durations too short for the zoom magnitude.
 *
 * @param scale - Target zoom scale (1.0+)
 * @returns Minimum duration in milliseconds
 */
export function getMinDurationForScale(scale: number): number {
  const clampedScale = Math.max(1, scale);
  if (clampedScale >= 5) return 900;
  if (clampedScale >= 4) return 800;
  if (clampedScale >= 3) return 600;
  if (clampedScale >= 2) return 400;
  if (clampedScale >= 1.5) return 300;
  return 200;
}

/**
 * Calculate refocus blur during zoom transitions.
 * Creates a camera-like defocus effect that peaks at the midpoint of intro/outro.
 * 
 * @param progress - Transition progress (0-1) within intro or outro phase
 * @param maxBlur - Maximum blur intensity (0-1)
 * @param transitionMs - Duration of the transition in milliseconds
 * @returns Blur amount for this moment
 */
function calculateRefocusBlurCurve(progress: number, maxBlur: number, transitionMs: number = 400): number {
  if (maxBlur <= 0) return 0;
  
  // Scale blur intensity based on transition duration
  // Short transitions (< 200ms) get reduced blur to avoid "glitchy" flash
  // Long transitions (> 600ms) get full blur
  const durationScale = Math.min(1, Math.max(0, (transitionMs - 150) / 450));
  if (durationScale <= 0) return 0;

  // Use smootherStep for softer activation/deactivation than raw sin
  // Map progress 0->1 to bell curve 0->1->0
  // sin(PI * smootherStep(p)) gives a nice bell with eased tails
  const curve = Math.sin(Math.PI * smootherStep(progress));
  
  return curve * maxBlur * durationScale;
}

/**
 * Calculate the zoom scale for a given time within a zoom block
 * This is now completely deterministic based on elapsed time
 */
export function calculateZoomScale(
  elapsed: number,
  blockDuration: number,
  targetScale: number,
  introMs: number = ZOOM_TRANSITION_CONFIG.defaultIntroMs,
  outroMs: number = ZOOM_TRANSITION_CONFIG.defaultOutroMs,
  transitionStyle?: ZoomTransitionStyle
): number {
  // Pass targetScale to enforce minimum duration constraints for deep zooms
  const { duration, intro: effectiveIntro, outro: effectiveOutro } = normalizeEaseDurations(blockDuration, introMs, outroMs, targetScale);
  if (duration <= 0) {
    return 1;
  }

  // Clamp elapsed time to valid range
  const clampedElapsed = Math.max(0, Math.min(duration, elapsed));

  if (clampedElapsed < effectiveIntro) {
    // Intro phase - zoom in
    const progress = effectiveIntro > 0 ? Math.min(1, Math.max(0, clampedElapsed / effectiveIntro)) : 1;
    const easedProgress = easeZoomProgress(transitionStyle, progress);
    return 1 + (targetScale - 1) * easedProgress;
  } else if (clampedElapsed > duration - effectiveOutro) {
    // Outro phase - zoom out
    const outroElapsed = clampedElapsed - (duration - effectiveOutro);
    const progress = effectiveOutro > 0 ? Math.min(1, Math.max(0, outroElapsed / effectiveOutro)) : 1;

    // Use same easing for outro
    const easedProgress = easeZoomProgress(transitionStyle, progress);

    return Math.max(1, targetScale - (targetScale - 1) * easedProgress);
  } else {
    // Hold phase - maintain exact zoom scale
    return targetScale;
  }
}

/**
 * Calculate the complete zoom transformation for a video element
 * Creates a cinematic zoom with optional smooth panning
 */
export function calculateZoomTransform(
  activeBlock: ZoomBlock | undefined,
  currentTimeMs: number,
  videoWidth: number,
  videoHeight: number,
  zoomCenter: { x: number; y: number }, // Camera center (normalized, can exceed 0-1 with overscan)
  overrideScale?: number,
  /** @deprecated Padding is handled via overscan in orchestrator. Kept for API compatibility. */
  _padding?: number,
  /** Disable refocus blur regardless of timing */
  disableRefocusBlur: boolean = false,
  /** Allow panning at scale=1 (used for mockup cursor centering). */
  allowPanWithoutZoom: boolean = false,
  /** Explicitly set the current scale (e.g. from physics), bypassing non-target interpolation. */
  currentScaleOverride?: number
): ZoomTransform {
  if (!activeBlock) {
    if (!allowPanWithoutZoom) {
      return {
        scale: currentScaleOverride ?? 1,
        scaleCompensationX: 0,
        scaleCompensationY: 0,
        panX: 0,
        panY: 0,
        refocusBlur: 0
      };
    }

    // Fallback for no-block pan
    // If physics says scale=1.45 but block is undefined (transitioning out?), we should respect physics.

    // But existing logic for no-block:
    /*
      const panX = (0.5 - zoomCenter.x) * videoWidth;
      const panY = (0.5 - zoomCenter.y) * videoHeight;
      return { scale: 1, ..., panX, panY }
    */
    // If I return actualScale, I should probably scale pan?
    // But 'pan without zoom' implies just centering.
    // I'll stick to legacy behavior for no-block unless I'm sure.
    // The physics calculator returns scale=1 if no block (or linearly interpolates out).
    // So currentScaleOverride should be 1.

    return {
      scale: currentScaleOverride ?? 1,
      scaleCompensationX: 0,
      scaleCompensationY: 0,
      panX: (0.5 - zoomCenter.x) * videoWidth,
      panY: (0.5 - zoomCenter.y) * videoHeight,
      refocusBlur: 0
    };
  }

  const blockDuration = activeBlock.endTime - activeBlock.startTime;
  const elapsed = currentTimeMs - activeBlock.startTime;

  const introMs = activeBlock.introMs ?? ZOOM_TRANSITION_CONFIG.defaultIntroMs;
  const outroMs = activeBlock.outroMs ?? ZOOM_TRANSITION_CONFIG.defaultOutroMs;

  // Calculate zoom scale - completely deterministic
  const targetScale = overrideScale ?? (activeBlock.scale || 2);
  const scale = currentScaleOverride ?? calculateZoomScale(
    elapsed,
    blockDuration,
    targetScale,
    introMs,
    outroMs,
    (activeBlock as any)?.transitionStyle as ZoomTransitionStyle | undefined
  );

  // Zoom mode determines UI complexity, not core algorithm
  // Both modes use the same smooth "zoom into cursor" formula
  // Keep the zoom fully locked on target during intro/hold.
  // For cursor-follow zooms, avoid blending back to center on outro to prevent the "zoom out to center" feel.
  const { duration, intro: effectiveIntro, outro: effectiveOutro } = normalizeEaseDurations(
    blockDuration,
    introMs,
    outroMs,
    targetScale
  );
  const clampedElapsed = Math.max(0, Math.min(duration, elapsed));
  const outroProgress = effectiveOutro > 0 && clampedElapsed > duration - effectiveOutro
    ? (clampedElapsed - (duration - effectiveOutro)) / effectiveOutro
    : 0;
  const shouldBlendBackToCenter = (() => {
    const follow = (activeBlock as any)?.followStrategy as string | undefined;
    if (follow === 'mouse' || follow == null) {
      const mode = (activeBlock as any)?.zoomIntoCursorMode as string | undefined;
      return mode === 'center';
    }
    return true;
  })();
  const zoomStrength = shouldBlendBackToCenter
    ? 1 - easeZoomProgress((activeBlock as any)?.transitionStyle as ZoomTransitionStyle | undefined, outroProgress)
    : 1;
  const blendedCenter = {
    x: 0.5 + (zoomCenter.x - 0.5) * zoomStrength,
    y: 0.5 + (zoomCenter.y - 0.5) * zoomStrength,
  };

  // IMPORTANT:
  // `zoomCenter` is a CAMERA CENTER (view center) in normalized source space.
  // It can go outside 0-1 when overscan/padding should be revealed.
  //
  // Our CSS transform is `translate(...) scale(...)` (scale applies first, then translate),
  // so to center the visible window on `zoomCenter`, we translate by:
  //   T = (0.5 - zoomCenter) * size * scale
  // Derived from: x_view_center = 0.5 - T/(size*scale)
  //
  // CRITICAL FIX: Scale the pan based on how much zoom has occurred.
  // When scale=1, we want NO panning. As scale approaches targetScale, we want full panning.
  // This prevents the ugly "pan first, then zoom" effect.
  const scaleProgress = targetScale > 1 ? clamp01((scale - 1) / (targetScale - 1)) : 0;
  const panBlend = allowPanWithoutZoom && targetScale <= 1 ? 1 : scaleProgress;

  const zoomIntoCursorMode = (activeBlock as any)?.zoomIntoCursorMode as
    | 'center'
    | 'cursor'
    | 'snap'
    | 'lead'
    | undefined;

  // Pan calculation: camera center to translate position
  // blendedCenter can go beyond 0-1 when allowOverscanReveal is true,
  // allowing the zoom to pan into the background/padding area
  const rawPanX = (0.5 - blendedCenter.x) * videoWidth * scale;
  const rawPanY = (0.5 - blendedCenter.y) * videoHeight * scale;

  // Determine phase: intro, hold, or outro
  const isIntroPhase = clampedElapsed < effectiveIntro;
  const isOutroPhase = clampedElapsed > duration - effectiveOutro && effectiveOutro > 0;

  // Outro scale progress: 0 at scale=targetScale, 1 at scale=1 (inverse of scaleProgress)
  // Used to smoothly blend from full pan back to zero during outro
  const outroScaleProgress = targetScale > 1 ? clamp01((targetScale - scale) / (targetScale - 1)) : 0;

  // Pan calculation strategy:
  // - "introPan" uses (scale-1): cursor stays fixed on screen during zoom (nice cinematic effect)
  // - "fullPan" uses (scale): allows camera to reach full range including padding edges
  //
  // Phase behavior:
  // 1. INTRO: Blend from introPan (cursor fixed) to fullPan (continuous with hold)
  //    - At start (scale=1): pan=0
  //    - At end (scale=targetScale): pan=fullPan (smooth transition to hold)
  // 2. HOLD: Use fullPan (camera can reach padding edges)
  // 3. OUTRO: Blend from fullPan back to introPan (smooth return to no-pan state)
  //    - At start (scale=targetScale): pan=fullPan (continuous with hold)
  //    - At end (scale=1): pan=0 (smooth return to un-zoomed state)
  const panX = (() => {
    if (zoomIntoCursorMode === 'snap') return rawPanX;
    if ((zoomIntoCursorMode === 'cursor' || zoomIntoCursorMode === 'lead' || zoomIntoCursorMode === undefined) && targetScale > 1) {
      const introPan = (0.5 - blendedCenter.x) * videoWidth * (scale - 1);

      if (isIntroPhase && effectiveIntro > 0) {
        // During intro: blend from "cursor stays fixed" to "full pan"
        return introPan + (rawPanX - introPan) * scaleProgress;
      } else if (isOutroPhase) {
        // During outro: blend from "full pan" back to "cursor stays fixed"
        // This ensures smooth return to un-panned state at scale=1
        return rawPanX + (introPan - rawPanX) * outroScaleProgress;
      } else {
        // During hold: use full pan formula to allow reaching padding edges
        return rawPanX;
      }
    }
    return rawPanX * panBlend;
  })();

  const panY = (() => {
    if (zoomIntoCursorMode === 'snap') return rawPanY;
    if ((zoomIntoCursorMode === 'cursor' || zoomIntoCursorMode === 'lead' || zoomIntoCursorMode === undefined) && targetScale > 1) {
      const introPan = (0.5 - blendedCenter.y) * videoHeight * (scale - 1);

      if (isIntroPhase && effectiveIntro > 0) {
        // During intro: blend from "cursor stays fixed" to "full pan"
        return introPan + (rawPanY - introPan) * scaleProgress;
      } else if (isOutroPhase) {
        // During outro: blend from "full pan" back to "cursor stays fixed"
        return rawPanY + (introPan - rawPanY) * outroScaleProgress;
      } else {
        // During hold: use full pan formula to allow reaching padding edges
        return rawPanY;
      }
    }
    return rawPanY * panBlend;
  })();

  // Calculate refocus blur - peaks mid-transition for camera-like focus pull
  // Default maxRefocusBlur is 0.4 (40% blur intensity) - can be wired to settings
  const maxRefocusBlur = 0.4;

  let refocusBlur = 0;
  if (!disableRefocusBlur) {
    if (clampedElapsed < effectiveIntro && effectiveIntro > 0) {
      // Intro phase - blur peaks mid-intro
      const introProgress = clampedElapsed / effectiveIntro;
      refocusBlur = calculateRefocusBlurCurve(introProgress, maxRefocusBlur, effectiveIntro);
    } else if (clampedElapsed > duration - effectiveOutro && effectiveOutro > 0) {
      // Outro phase - blur peaks mid-outro
      const outroElapsed = clampedElapsed - (duration - effectiveOutro);
      const outroProgressLocal = outroElapsed / effectiveOutro;
      refocusBlur = calculateRefocusBlurCurve(outroProgressLocal, maxRefocusBlur, effectiveOutro);
    }
  }

  return {
    scale,
    scaleCompensationX: 0,
    scaleCompensationY: 0,
    panX,
    panY,
    refocusBlur,
  };
}

/**
 * Apply zoom transformation to a point (for cursor positioning)
 * Matches the video transform which uses transformOrigin: '50% 50%'
 */
/**
 * Generate CSS transform string for video element with GPU acceleration
 * Now with sub-pixel rounding to prevent jitter
 */
export function getZoomTransformString(zoomTransform: ZoomTransform): string {
  // Higher precision to prevent quantization jitter at high zoom levels
  // 3 decimal places for translation (sub-pixel), 4 for scale (prevents jumps at high zoom)
  const translateX = Math.round((zoomTransform.scaleCompensationX + zoomTransform.panX) * 1000) / 1000;
  const translateY = Math.round((zoomTransform.scaleCompensationY + zoomTransform.panY) * 1000) / 1000;
  const scale = Math.round(zoomTransform.scale * 10000) / 10000;

  // Use transform3d for GPU acceleration and smoother animation
  return `translate3d(${translateX}px, ${translateY}px, 0) scale3d(${scale}, ${scale}, 1)`;
}

/**
 * Camera motion blur state for cinematic pan effects
 */
// clamp01 now imported from @/features/rendering/canvas/math

/**
 * Calculate motion blur from a translation delta between frames (content-space).
 * `deltaX/deltaY` are in pixels-per-frame (not px/sec).
 */
export function calculateCameraMotionBlurFromDelta(
  deltaX: number,
  deltaY: number,
  config: {
    maxBlurRadius: number;
    velocityThreshold: number;
    intensityMultiplier: number;
  }
): CameraMotionBlurState {
  const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  if (velocity <= 0.01) {
    return { blurRadius: 0, angle: 0, velocity };
  }

  // Lower threshold multiplier for more responsive blur activation
  const threshold = config.velocityThreshold * 0.2;
  const excessVelocity = Math.max(0, velocity - threshold);
  const blurRadius = Math.min(config.maxBlurRadius, excessVelocity * config.intensityMultiplier);
  const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

  return { blurRadius, angle, velocity };
}

/**
 * Deterministic camera motion blur derived from camera center movement.
 * This ignores pure zoom-only movement (scale changes) by basing velocity on center delta.
 *
 * Note: We convert camera center delta into a content translation delta (i.e. invert sign),
 * so the blur direction matches the visible content motion.
 */
export function calculateCameraMotionBlurFromCenters(
  prevCenter: { x: number; y: number },
  prevScale: number,
  currentCenter: { x: number; y: number },
  currentScale: number,
  drawWidth: number,
  drawHeight: number,
  config: {
    maxBlurRadius: number;
    velocityThreshold: number;
    intensityMultiplier: number;
  }
): CameraMotionBlurState {
  const avgScale = (prevScale + currentScale) / 2;
  const deltaCenterX = currentCenter.x - prevCenter.x;
  const deltaCenterY = currentCenter.y - prevCenter.y;

  // Convert center delta into content translation delta (pixels per frame).
  const deltaX = -deltaCenterX * drawWidth * avgScale;
  const deltaY = -deltaCenterY * drawHeight * avgScale;

  return calculateCameraMotionBlurFromDelta(deltaX, deltaY, config);
}

/**
 * Get motion blur config from camera settings.
 * Note: Threshold is now handled by soft knee curve in MotionBlurCanvas.
 * The intensity maps directly to shutter angle (50% = 90°, 100% = 180°).
 */
export function getMotionBlurConfig(settings?: CameraSettings): MotionBlurConfig {
  const _intensity = settings?.motionBlurIntensity ?? 50;
  return {
    enabled: settings?.motionBlurEnabled ?? true,
    maxBlurRadius: settings?.motionBlurClamp ?? 40,
    velocityThreshold: 0,  // Deprecated - soft knee handles smooth fade
    intensityMultiplier: 1.0,  // Shutter angle is now film-accurate in MotionBlurCanvas
  };
}
