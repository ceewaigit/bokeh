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
    motionBlurIntensity: 40,
    motionBlurThreshold: 30,
    refocusBlurEnabled: true,
    refocusBlurIntensity: 40
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
    motionBlurIntensity: 40,
    motionBlurThreshold: 30,
    refocusBlurEnabled: true,
    refocusBlurIntensity: 40
  },
  recording: {
    lowMemoryEncoder: false,
    useMacOSDefaults: true,
    includeAppWindows: false
  }
}
