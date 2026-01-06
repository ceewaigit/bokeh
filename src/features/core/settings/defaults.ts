import type { ProjectSettings } from '@/types/project'
import { AspectRatioPreset, ExportFormat, QualityLevel } from '@/types/project'
import type { StoreSettings } from '@/features/core/stores/slices/types'

export const DEFAULT_CAMERA_SETTINGS = {
  motionBlurEnabled: true,
  motionBlurIntensity: 100,
  motionBlurThreshold: 70,
  motionBlurSmoothWindow: 6,
  motionBlurRampRange: 0.5,
  motionBlurClamp: 60,
  motionBlurGamma: 1.0,
  motionBlurBlackLevel: 0,
  motionBlurSaturation: 1.0,
  motionBlurUseWebglVideo: true,
  motionBlurSamples: 32,
  refocusBlurEnabled: true,
  refocusBlurIntensity: 50,
  cameraSmoothness: 48,
  cameraDynamics: {
    stiffness: 60,
    damping: 15,
    mass: 1
  }
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
  camera: DEFAULT_CAMERA_SETTINGS,
  recording: {
    lowMemoryEncoder: false,
    useMacOSDefaults: true,
    includeAppWindows: false
  }
}