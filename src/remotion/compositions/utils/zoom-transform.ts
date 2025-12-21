/**
 * Shared zoom transformation utilities for video and cursor layers
 * Uses deterministic, frame-perfect easing without spring physics
 */

import React from 'react';
import type { ZoomBlock } from '@/types/project';
import type { CameraMotionBlurState, CameraSettings, MotionBlurConfig, ZoomTransform } from '@/types';

/**
 * Professional easing curves for smooth, cinematic zoom
 * These are deterministic and frame-perfect
 */

// Smooth ease-in-out-cubic for consistent speed
export const easeInOutCubic = (t: number): number => {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/**
 * Hermite smoothstep interpolation (t² × (3 - 2t))
 * Creates smooth transitions with zero first-derivative at endpoints
 * This is the key to cinematic, film-quality zoom transitions
 */
export const smoothStep = (t: number): number => {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
};

/**
 * Faster smoothstep variant using Ken Perlin's improved formula (t³ × (t × (6t - 15) + 10))
 * Has zero first AND second derivative at endpoints - even smoother
 */
export const smootherStep = (t: number): number => {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
};

// Professional zoom easing - asymmetric for cinematic feel
// Now using smootherStep for ultra-smooth transitions
const professionalZoomIn = (progress: number): number => {
  // Fast approach, slow landing - feels responsive yet polished
  return smootherStep(progress);
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
  introMs: number = 450,
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
  padding?: number,
  /** Disable refocus blur regardless of timing */
  disableRefocusBlur: boolean = false,
  /** Allow panning at scale=1 (used for mockup cursor centering). */
  allowPanWithoutZoom: boolean = false
): ZoomTransform {
  if (!activeBlock) {
    if (!allowPanWithoutZoom) {
      return {
        scale: 1,
        scaleCompensationX: 0,
        scaleCompensationY: 0,
        panX: 0,
        panY: 0,
        refocusBlur: 0
      };
    }

    const panX = (0.5 - zoomCenter.x) * videoWidth;
    const panY = (0.5 - zoomCenter.y) * videoHeight;
    return {
      scale: 1,
      scaleCompensationX: 0,
      scaleCompensationY: 0,
      panX,
      panY,
      refocusBlur: 0
    };
  }

  const blockDuration = activeBlock.endTime - activeBlock.startTime;
  const elapsed = currentTimeMs - activeBlock.startTime;

  // Calculate zoom scale - completely deterministic
  const targetScale = overrideScale ?? (activeBlock.scale || 2);
  const scale = calculateZoomScale(
    elapsed,
    blockDuration,
    targetScale,
    activeBlock.introMs,
    activeBlock.outroMs
  );

  // Keep the zoom fully locked on target during intro/hold; only blend back to center on outro.
  const { duration, outro: effectiveOutro } = normalizeEaseDurations(
    blockDuration,
    activeBlock.introMs ?? 500,
    activeBlock.outroMs ?? 500
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
  const scaleProgress = targetScale > 1 ? Math.max(0, (scale - 1) / (targetScale - 1)) : 0;
  const panBlend = allowPanWithoutZoom && targetScale <= 1 ? 1 : smoothStep(scaleProgress);

  const rawPanX = (0.5 - blendedCenter.x) * videoWidth * scale;
  const rawPanY = (0.5 - blendedCenter.y) * videoHeight * scale;
  const panX = rawPanX * panBlend;
  const panY = rawPanY * panBlend;

  // Calculate refocus blur - peaks mid-transition for camera-like focus pull
  // Default maxRefocusBlur is 0.4 (40% blur intensity) - can be wired to settings
  const maxRefocusBlur = 0.4;
  const { intro: effectiveIntro } = normalizeEaseDurations(
    blockDuration,
    activeBlock.introMs ?? 450,
    activeBlock.outroMs ?? 800
  );

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
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

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

  if (velocity < config.velocityThreshold) {
    return { blurRadius: 0, angle: 0, velocity };
  }

  const excessVelocity = velocity - config.velocityThreshold;
  const blurFraction = clamp01((excessVelocity * config.intensityMultiplier) / Math.max(0.0001, config.maxBlurRadius));

  // Ease-in the blur for a more camera-like onset, while keeping the cap exact.
  const eased = smootherStep(blurFraction);
  const blurRadius = eased * config.maxBlurRadius;
  const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

  return { blurRadius, angle, velocity };
}

/**
 * Calculate motion blur based on camera pan velocity between frames.
 * Returns blur radius and direction for a cinematic pan effect.
 */
export function calculateCameraMotionBlur(
  prevPanX: number,
  prevPanY: number,
  currentPanX: number,
  currentPanY: number,
  config: {
    maxBlurRadius: number;
    velocityThreshold: number;
    intensityMultiplier: number;
  }
): CameraMotionBlurState {
  return calculateCameraMotionBlurFromDelta(
    currentPanX - prevPanX,
    currentPanY - prevPanY,
    config
  );
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
 * Create SVG filter element for directional motion blur.
 * Returns null if no motion blur should be applied.
 */
export function createMotionBlurSvg(
  blurRadius: number,
  filterId: string
): React.ReactNode {
  if (blurRadius <= 0.2) return null;

  return React.createElement('svg', {
    style: { position: 'absolute', width: 0, height: 0 },
    children: React.createElement('defs', null,
      React.createElement('filter', {
        id: filterId,
        x: '-50%',
        y: '-50%',
        width: '200%',
        height: '200%',
      },
        React.createElement('feGaussianBlur', {
          in: 'SourceGraphic',
          stdDeviation: `${blurRadius * 1.5} 0`,
          result: 'blur',
        })
      )
    )
  });
}

/**
 * Get motion blur config from camera settings.
 */
export function getMotionBlurConfig(settings?: CameraSettings): MotionBlurConfig {
  const intensity = settings?.motionBlurIntensity ?? 40;
  const threshold = settings?.motionBlurThreshold ?? 30;
  return {
    enabled: settings?.motionBlurEnabled ?? true,
    maxBlurRadius: (intensity / 100) * 6,
    velocityThreshold: 5 + (threshold / 100) * 20,
    intensityMultiplier: 0.05 + (intensity / 100) * 0.15,
  };
}
