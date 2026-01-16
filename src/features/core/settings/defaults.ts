import type { ProjectSettings, CameraDynamics } from '@/types/project'
import { AspectRatioPreset, ExportFormat, QualityLevel } from '@/types/project'
import type { StoreSettings } from '@/features/core/stores/slices/types'
import { ZOOM_VISUAL_CONFIG } from '@/shared/config/physics-config'

/**
 * Convert cameraSmoothness (0-100) to CameraDynamics spring parameters.
 *
 * Smoothness scale:
 * - 0 = Direct, snappy (high stiffness, responsive tracking)
 * - 50 = Balanced (matches original system feel)
 * - 100 = Cinematic, floaty (low stiffness, smooth lazy tracking)
 *
 * Damping is tuned to maintain ~critical damping (ζ ≈ 1) at each stiffness
 * level to prevent oscillation while feeling natural.
 *
 * Critical damping formula: c = 2√(k*m), with m=1: c = 2√k
 */
export function dynamicsFromSmoothness(smoothness: number): CameraDynamics {
    const t = Math.max(0, Math.min(1, smoothness / 100))

    // Stiffness: 150 (snappy) → 25 (floaty)
    // At t=0.5 (smoothness 50): stiffness = 62.5 ≈ original system's 60
    const stiffness = 150 - t * 125

    // Damping: maintain ~1.1x critical damping for slight overdamping (no bounce)
    // Critical damping = 2√stiffness, we use 1.1x for smooth settling
    const criticalDamping = 2 * Math.sqrt(stiffness)
    const damping = criticalDamping * 1.1

    return {
        stiffness,
        damping,
        mass: 1
    }
}

/**
 * Get effective camera dynamics from settings.
 * If cameraDynamics is explicitly set, use it. Otherwise derive from cameraSmoothness.
 */
export function getEffectiveDynamics(
    cameraDynamics?: CameraDynamics,
    cameraSmoothness?: number
): CameraDynamics {
    if (cameraDynamics) {
        return cameraDynamics
    }
    return dynamicsFromSmoothness(cameraSmoothness ?? 50)
}

export const DEFAULT_CAMERA_SETTINGS = {
  motionBlurEnabled: true,
  // Shutter angle: 50% = 90° (natural look), 100% = 180° (max film blur)
  motionBlurIntensity: 50,
  // Threshold is now handled by soft knee curve - this is legacy/unused
  motionBlurThreshold: 0,
  motionBlurSmoothWindow: 8,
  motionBlurRampRange: 0.5,
  // Max blur radius in pixels - prevents excessive blur on fast motion
  motionBlurClamp: 40,
  motionBlurGamma: 1.0,
  motionBlurBlackLevel: 0,
  motionBlurSaturation: 1.0,
  motionBlurUseWebglVideo: true,
  motionBlurSamples: 24,  // More samples = smoother blur trails
  refocusBlurEnabled: true,
  refocusBlurIntensity: ZOOM_VISUAL_CONFIG.defaultRefocusBlurIntensity,
  // Camera smoothness: 0 = direct/snappy, 50 = balanced, 100 = cinematic/floaty
  // This maps to spring dynamics via dynamicsFromSmoothness()
  cameraSmoothness: 50,
  // cameraDynamics is optional - if set, it overrides cameraSmoothness
  // Only for advanced users who want direct control over spring constants
  cameraDynamics: undefined as CameraDynamics | undefined
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  resolution: { width: 1920, height: 1080 },
  frameRate: 60,
  backgroundColor: '#000000',
  audio: {
    volume: 100,
    muted: false,
    fadeInDuration: 0.5,
    fadeOutDuration: 0.5,
    enhanceAudio: false
  },
  camera: DEFAULT_CAMERA_SETTINGS,
  canvas: {
    aspectRatio: AspectRatioPreset.Original,
    customWidth: 1920,
    customHeight: 1080
  }
}

/**
 * DEFAULT_STORE_SETTINGS - App-level preferences (persisted separately from projects)
 *
 * NOTE: Camera settings are NOT here - they live on DEFAULT_PROJECT_SETTINGS.camera
 * Camera settings are project-specific and saved/loaded with each project file.
 */
export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  quality: QualityLevel.High,
  format: ExportFormat.MP4,

  showTypingSuggestions: true,
  editing: {
    snapToGrid: true,
    showWaveforms: false,
    autoRipple: true
  },
  playback: { previewSpeed: 1 },
  recording: {
    lowMemoryEncoder: false,
    useMacOSDefaults: true,
    includeAppWindows: false
  }
}
