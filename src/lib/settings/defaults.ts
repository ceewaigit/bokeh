import type { ProjectSettings } from '@/types/project'
import { AspectRatioPreset, ExportFormat, QualityLevel } from '@/types/project'
import type { StoreSettings } from '@/stores/slices/types'

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
  camera: {
    motionBlurEnabled: true,
    motionBlurIntensity: 50,
    motionBlurThreshold: 50,
    motionBlurSmoothWindow: 6,
    motionBlurRampRange: 0.5,
    motionBlurClamp: 60,
    motionBlurGamma: 1.0,
    motionBlurBlackLevel: -0.13,
    motionBlurSaturation: 1.0,
    refocusBlurEnabled: true,
    refocusBlurIntensity: 50
  },
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
  camera: {
    motionBlurEnabled: true,
    motionBlurIntensity: 50,
    motionBlurThreshold: 50,
    motionBlurSmoothWindow: 6,
    motionBlurRampRange: 0.5,
    motionBlurClamp: 60,
    motionBlurGamma: 1.0,
    motionBlurBlackLevel: -0.13,
    motionBlurSaturation: 1.0,
    refocusBlurEnabled: true,
    refocusBlurIntensity: 50
  },
  recording: {
    lowMemoryEncoder: false,
    useMacOSDefaults: true,
    includeAppWindows: false
  }
}
