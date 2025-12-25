/**
 * Aspect ratio presets for canvas sizing.
 *
 * These presets define the output canvas dimensions for export.
 * The video content is fitted within the canvas based on the aspect ratio.
 */

import { AspectRatioPreset } from '@/types/project'
import {
  Smartphone,
  Monitor,
  Maximize,
  RectangleHorizontal,
  Square,
  RectangleVertical
} from 'lucide-react'

// Aspect ratio preset configuration
export interface AspectRatioPresetConfig {
  /** Preset identifier */
  id: AspectRatioPreset
  /** Human-readable label */
  label: string
  /** Short description */
  description: string
  /** Width / height ratio */
  ratio: number
  /** Category for grouping in UI */
  category: 'standard' | 'social' | 'landing' | 'custom'
  /** Default padding for this preset (pixels) */
  defaultPadding: number
  /** Icon hint for UI (aspect ratio visualization) */
  iconRatio: { width: number; height: number }
  /** Optional icon component */
  icon?: React.ComponentType<{ className?: string }>
}

// Standard video aspect ratios
export const ASPECT_RATIO_PRESETS: AspectRatioPresetConfig[] = [
  // Original (keeps source aspect ratio)
  {
    id: AspectRatioPreset.Original,
    label: 'Original',
    description: 'Keep original video aspect ratio',
    ratio: 0, // Special case: uses source video ratio
    category: 'standard',
    defaultPadding: 60,
    iconRatio: { width: 16, height: 9 },
    icon: Maximize
  },
  // Standard landscape
  {
    id: AspectRatioPreset.Landscape16x9,
    label: '16:9',
    description: 'Standard widescreen',
    ratio: 16 / 9,
    category: 'standard',
    defaultPadding: 60,
    iconRatio: { width: 16, height: 9 },
    icon: Monitor
  },
  // Portrait (vertical)
  {
    id: AspectRatioPreset.Portrait9x16,
    label: '9:16',
    description: 'Vertical video (TikTok, Reels, Shorts)',
    ratio: 9 / 16,
    category: 'social',
    defaultPadding: 80,
    iconRatio: { width: 9, height: 16 },
    icon: Smartphone
  },
  // Square
  {
    id: AspectRatioPreset.Square1x1,
    label: '1:1',
    description: 'Square (Instagram, LinkedIn)',
    ratio: 1,
    category: 'social',
    defaultPadding: 60,
    iconRatio: { width: 1, height: 1 },
    icon: Square
  },
  // Portrait 4:5 (Instagram)
  {
    id: AspectRatioPreset.Portrait4x5,
    label: '4:5',
    description: 'Instagram portrait',
    ratio: 4 / 5,
    category: 'social',
    defaultPadding: 60,
    iconRatio: { width: 4, height: 5 },
    icon: RectangleVertical
  },
  // Ultrawide
  {
    id: AspectRatioPreset.Ultrawide21x9,
    label: '21:9',
    description: 'Ultrawide cinematic',
    ratio: 21 / 9,
    category: 'standard',
    defaultPadding: 80,
    iconRatio: { width: 21, height: 9 },
    icon: RectangleHorizontal
  },
  // Landing page feature (4:3 with generous padding)
  {
    id: AspectRatioPreset.LandingPageFeature,
    label: 'Landing Feature',
    description: 'Feature showcase with padding',
    ratio: 4 / 3,
    category: 'landing',
    defaultPadding: 100,
    iconRatio: { width: 4, height: 3 },
    icon: RectangleHorizontal
  },
  // Landing page hero (3:2 with extra padding)
  {
    id: AspectRatioPreset.LandingPageHero,
    label: 'Landing Hero',
    description: 'Hero section with extra padding',
    ratio: 3 / 2,
    category: 'landing',
    defaultPadding: 120,
    iconRatio: { width: 3, height: 2 },
    icon: RectangleHorizontal
  },
  // Custom
  {
    id: AspectRatioPreset.Custom,
    label: 'Custom',
    description: 'Custom dimensions',
    ratio: 0, // Uses custom width/height
    category: 'custom',
    defaultPadding: 60,
    iconRatio: { width: 16, height: 9 },
    icon: Square
  }
]

// Get aspect ratio preset by ID
export function getAspectRatioPreset(id: AspectRatioPreset): AspectRatioPresetConfig | undefined {
  return ASPECT_RATIO_PRESETS.find(p => p.id === id)
}

// Get presets by category
export function getPresetsByCategory(category: AspectRatioPresetConfig['category']): AspectRatioPresetConfig[] {
  return ASPECT_RATIO_PRESETS.filter(p => p.category === category)
}

/**
 * Calculate canvas dimensions from aspect ratio preset.
 *
 * @param preset - The aspect ratio preset
 * @param baseResolution - Base resolution to scale from (default 1080p height)
 * @param customWidth - Custom width (for Custom preset)
 * @param customHeight - Custom height (for Custom preset)
 * @param sourceWidth - Source video width (for Original preset)
 * @param sourceHeight - Source video height (for Original preset)
 * @returns Canvas dimensions { width, height }
 */
export function calculateCanvasDimensions(
  preset: AspectRatioPreset,
  baseResolution: number = 1080,
  customWidth?: number,
  customHeight?: number,
  sourceWidth?: number,
  sourceHeight?: number
): { width: number; height: number } {
  // Custom dimensions
  if (preset === AspectRatioPreset.Custom) {
    return {
      width: customWidth ?? 1920,
      height: customHeight ?? 1080
    }
  }

  // Original - use source dimensions
  if (preset === AspectRatioPreset.Original) {
    return {
      width: sourceWidth ?? 1920,
      height: sourceHeight ?? 1080
    }
  }

  // Get preset config
  const config = getAspectRatioPreset(preset)
  if (!config || config.ratio === 0) {
    // Fallback to 16:9
    return { width: Math.round(baseResolution * (16 / 9)), height: baseResolution }
  }

  // Calculate dimensions based on ratio
  // For landscape (ratio > 1), use height as base
  // For portrait (ratio < 1), use width as base (capped at reasonable size)
  if (config.ratio >= 1) {
    // Landscape or square
    return {
      width: Math.round(baseResolution * config.ratio),
      height: baseResolution
    }
  } else {
    // Portrait - width is smaller, calculate based on height
    return {
      width: Math.round(baseResolution * config.ratio),
      height: baseResolution
    }
  }
}

// Default canvas settings
export const DEFAULT_CANVAS_SETTINGS = {
  aspectRatio: AspectRatioPreset.Original,
  customWidth: 1920,
  customHeight: 1080
}

// Common resolutions for export
export const COMMON_RESOLUTIONS = [
  { label: '4K (2160p)', width: 3840, height: 2160 },
  { label: '1440p', width: 2560, height: 1440 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: '480p', width: 854, height: 480 },
]
