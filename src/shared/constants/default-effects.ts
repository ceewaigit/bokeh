import type { BackgroundEffectData, CursorEffectData, CursorMotionPreset, KeystrokeEffectData, ParallaxLayer, ScreenEffectData, ZoomEffectData, WebcamEffectData } from '@/types/project'
import { BackgroundType, CursorStyle, KeystrokePosition, ScreenEffectPreset, ZoomFollowStrategy } from '@/types/project'
import { getZoomTransformString } from '@/features/canvas/math/transforms/zoom-transform'

// Re-export schema helpers for gradual migration
export { getEffectDefaults, getEffectSchema, getParamConstraints } from '@/features/effects/config/effect-schemas'


// Default parallax layers and background data moved to feature config

// Default zoom data moved to feature config

// Default screen effect data moved directly to feature config



// Default keystroke effect data moved to feature config

// Default webcam effect data moved to feature config
// Wallpaper utils moved to features/background/utils
