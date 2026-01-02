/**
 * Shared zoom transformation utilities for video and cursor layers
 * Uses deterministic, frame-perfect easing without spring physics
 */

import type { ZoomBlock } from '@/types/project';
import type { CameraMotionBlurState, CameraSettings, MotionBlurConfig, ZoomTransform } from '@/types';
import { smoothStep, smootherStep, easeInOutCubic, clamp01 } from '@/features/canvas/math';

// Re-export easing functions for backwards compatibility
export { smoothStep, smootherStep, easeInOutCubic };

// Professional zoom easing - asymmetric for cinematic feel
// Now using smootherStep for ultra-smooth transitions
const professionalZoomIn = (progress: number): number => {
  // Fast approach, slow landing - feels responsive yet polished
  const eased = smootherStep(progress);
  // Softer takeoff to reduce early-frame jumpiness.
  return Math.pow(eased, 1.35);
};

const professionalZoomOut = (progress: number): number => {
  // Symmetric ease for smooth exit
  return smootherStep(progress);
};

const normalizeEaseDurations = (
  blockDuration: number,
  introMs: number,
  outroMs: number
): { duration: number; intro: number; outro: number } => {
  const duration = Math.max(0, blockDuration);
  if (duration <= 0) {
    return { duration: 0, intro: 0, outro: 0 };
  }

  // Normalize intro/outro so they never overlap (prevents jumps on short blocks).
  const rawIntro = Math.max(0, introMs);
  const rawOutro = Math.max(0, outroMs);
  let effectiveIntro = rawIntro;
  let effectiveOutro = rawOutro;
  const totalEase = effectiveIntro + effectiveOutro;
  if (totalEase > duration && totalEase > 0) {
    const ratio = duration / totalEase;
    effectiveIntro *= ratio;
    effectiveOutro *= ratio;
  }

  return { duration, intro: effectiveIntro, outro: effectiveOutro };
};

/**
 * Calculate refocus blur during zoom transitions.
 * Creates a camera-like defocus effect that peaks at the midpoint of intro/outro.
 * The blur follows a bell curve: 0 -> peak -> 0 during each transition phase.
 * 
 * @param progress - Transition progress (0-1) within intro or outro phase
 * @param maxBlur - Maximum blur intensity (0-1)
 * @returns Blur amount for this moment (0 at start/end, max at midpoint)
 */
function calculateRefocusBlurCurve(progress: number, maxBlur: number): number {
  if (maxBlur <= 0) return 0;
  // Bell curve: sin(π * progress) peaks at 0.5
  // This creates: 0 -> maxBlur -> 0 over the transition
  return Math.sin(Math.PI * progress) * maxBlur;
}

/**
 * Calculate the zoom scale for a given time within a zoom block
 * This is now completely deterministic based on elapsed time
 */
export function calculateZoomScale(
  elapsed: number,
  blockDuration: number,
  targetScale: number,
  introMs: number = 800,
  outroMs: number = 800
): number {
  const { duration, intro: effectiveIntro, outro: effectiveOutro } = normalizeEaseDurations(
    blockDuration,
    introMs,
    outroMs
  );
  if (duration <= 0) {
    return 1;
  }

  // Clamp elapsed time to valid range
  const clampedElapsed = Math.max(0, Math.min(duration, elapsed));

  if (clampedElapsed < effectiveIntro) {
    // Intro phase - zoom in smoothly
    const progress = effectiveIntro > 0 ? Math.min(1, Math.max(0, clampedElapsed / effectiveIntro)) : 1;
    const easedProgress = professionalZoomIn(progress);
    return 1 + (targetScale - 1) * easedProgress;
  } else if (clampedElapsed > duration - effectiveOutro) {
    // Outro phase - zoom out smoothly
    const outroElapsed = clampedElapsed - (duration - effectiveOutro);
    const progress = effectiveOutro > 0 ? Math.min(1, Math.max(0, outroElapsed / effectiveOutro)) : 1;
    const easedProgress = professionalZoomOut(progress);
    return targetScale - (targetScale - 1) * easedProgress;
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
  zoomCenter: { x: number; y: number }, // Fixed zoom center (normalized 0-1)
  overrideScale?: number,
  /** Padding amount in pixels - used to calculate pan for revealing padding */
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

  const introMs = activeBlock.introMs ?? 800;
  const outroMs = activeBlock.outroMs ?? 800;

  // Calculate zoom scale - completely deterministic
  const targetScale = overrideScale ?? (activeBlock.scale || 2);
  const scale = currentScaleOverride ?? calculateZoomScale(
    elapsed,
    blockDuration,
    targetScale,
    introMs,
    outroMs
  );

  // Keep the zoom fully locked on target during intro/hold; only blend back to center on outro.
  const { duration, intro: effectiveIntro, outro: effectiveOutro } = normalizeEaseDurations(
    blockDuration,
    introMs,
    outroMs
  );
  const clampedElapsed = Math.max(0, Math.min(duration, elapsed));
  const outroProgress = effectiveOutro > 0 && clampedElapsed > duration - effectiveOutro
    ? (clampedElapsed - (duration - effectiveOutro)) / effectiveOutro
    : 0;
  const zoomStrength = 1 - easeInOutCubic(Math.min(1, Math.max(0, outroProgress)));
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

  // Revert to center-origin math as SharedVideoController uses transformOrigin: 'center center'
  const rawPanX = (0.5 - blendedCenter.x) * videoWidth * scale;
  const rawPanY = (0.5 - blendedCenter.y) * videoHeight * scale;
  const panX = rawPanX * panBlend;
  const panY = rawPanY * panBlend;

  // Calculate refocus blur - peaks mid-transition for camera-like focus pull
  // Default maxRefocusBlur is 0.4 (40% blur intensity) - can be wired to settings
  const maxRefocusBlur = 0.4;

  let refocusBlur = 0;
  if (!disableRefocusBlur) {
    if (clampedElapsed < effectiveIntro && effectiveIntro > 0) {
      // Intro phase - blur peaks mid-intro
      const introProgress = clampedElapsed / effectiveIntro;
      refocusBlur = calculateRefocusBlurCurve(introProgress, maxRefocusBlur);
    } else if (clampedElapsed > duration - effectiveOutro && effectiveOutro > 0) {
      // Outro phase - blur peaks mid-outro
      const outroElapsed = clampedElapsed - (duration - effectiveOutro);
      const outroProgressLocal = outroElapsed / effectiveOutro;
      refocusBlur = calculateRefocusBlurCurve(outroProgressLocal, maxRefocusBlur);
    }
  }

  return {
    scale,
    scaleCompensationX: 0,
    scaleCompensationY: 0,
    panX,
    panY,
    refocusBlur
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
  // Round translations to 2 decimal places to prevent sub-pixel jitter
  const translateX = Math.round((zoomTransform.scaleCompensationX + zoomTransform.panX) * 100) / 100;
  const translateY = Math.round((zoomTransform.scaleCompensationY + zoomTransform.panY) * 100) / 100;
  const scale = Math.round(zoomTransform.scale * 1000) / 1000; // 3 decimal places for scale

  // Use transform3d for GPU acceleration and smoother animation
  return `translate3d(${translateX}px, ${translateY}px, 0) scale3d(${scale}, ${scale}, 1)`;
}

/**
 * Camera motion blur state for cinematic pan effects
 */
// clamp01 now imported from @/features/canvas/math

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
 */
export function getMotionBlurConfig(settings?: CameraSettings): MotionBlurConfig {
  const intensity = settings?.motionBlurIntensity ?? 50;
  const threshold = settings?.motionBlurThreshold ?? 50;
  return {
    enabled: settings?.motionBlurEnabled ?? true,
    maxBlurRadius: (intensity / 100) * 40, // Slightly increased max range
    velocityThreshold: (threshold / 100) * 10, // Reduced from 40 to 10 to catch slower cinematic pans
    // Adjusted multiplier for more consistent shutter-angle feel
    intensityMultiplier: 2.0 + (intensity / 100) * 4.0,
  };
}

/**
 * Motion blur intensity result for CSS integration.
 */
export interface MotionBlurIntensity {
  /** Blur radius in pixels (0 = no blur) */
  blurPx: number;
  /** Scale factor for X-axis (1 = no stretch) */
  scaleX: number;
  /** Scale factor for Y-axis (1 = no stretch) */
  scaleY: number;
}

/**
 * Calculate motion blur intensity with smooth easing to prevent flickering.
 * Uses exponential moving average for smooth transitions.
 * 
 * @param velocity - Camera velocity in pixels per frame
 * @param config - Motion blur configuration
 * @param prevIntensity - Previous frame's blur intensity (for smoothing)
 * @returns Blur parameters for CSS integration
 */
export function calculateMotionBlurIntensity(
  velocity: { x: number; y: number },
  config: MotionBlurConfig,
  prevIntensity: number = 0
): MotionBlurIntensity {
  if (!config.enabled) {
    return { blurPx: 0, scaleX: 1, scaleY: 1 };
  }

  const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

  // Smooth easing factor (exponential moving average)
  // Lower = smoother transitions, higher = more responsive
  const easingFactor = 0.25; // Slower easing for subtler transitions

  // Velocity threshold in pixels per frame (higher = requires more speed to trigger)
  const threshold = config.velocityThreshold * 15;

  // Target intensity based on velocity - MUCH more subtle
  // Max blur capped at 3-4px for subtle effect (was up to 30px)
  const maxSubtleBlur = Math.min(4, config.maxBlurRadius * 0.15);
  const targetIntensity = speed > threshold
    ? clamp01((speed - threshold) / 100) * maxSubtleBlur // Increased divisor for gentler curve
    : 0;

  // Smoothly transition to target (prevents abrupt on/off flickering)
  const smoothedIntensity = prevIntensity + (targetIntensity - prevIntensity) * easingFactor;

  // Only apply blur if above minimum threshold (prevents micro-blur noise)
  const blurPx = smoothedIntensity < 0.3 ? 0 : Math.round(smoothedIntensity * 10) / 10;

  // Direction-based scale stretch (enhanced for more noticeable directionality)
  // Since blur is subtle, we rely more on directional stretching
  if (blurPx > 0 && speed > 0.1) {
    const normalizedX = velocity.x / speed;
    const normalizedY = velocity.y / speed;
    // Slightly more stretch to compensate for reduced blur radius
    const stretchAmount = Math.min(0.008, blurPx * 0.002);

    return {
      blurPx,
      scaleX: 1 + Math.abs(normalizedX) * stretchAmount,
      scaleY: 1 + Math.abs(normalizedY) * stretchAmount,
    };
  }

  return { blurPx, scaleX: 1, scaleY: 1 };
}
