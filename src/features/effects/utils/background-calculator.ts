/**
 * Background effect calculator
 * Pure functions for calculating background styles and properties
 * Used by both Remotion preview and export engines
 */

import type { BackgroundEffectData } from '@/types/project'
import { BackgroundType } from '@/types/project'
import { BACKGROUND_CONFIG } from '@/features/effects/config/physics-config'

// Destructure for convenience
const {
  maxShadowBlur: MAX_SHADOW_BLUR,
  shadowIntensityToOpacityDivisor: SHADOW_INTENSITY_TO_OPACITY_DIVISOR,
  shadowOffsetDivisor: SHADOW_OFFSET_DIVISOR,
  defaultImagePosition: DEFAULT_IMAGE_POSITION,
  defaultBackgroundColor: DEFAULT_BACKGROUND_COLOR
} = BACKGROUND_CONFIG


export interface BackgroundStyle {
  type: BackgroundType
  cssStyle?: React.CSSProperties
  canvasDrawing?: {
    type: 'fill' | 'gradient' | 'image'
    color?: string
    gradient?: {
      colors: string[]
      angle: number
      stops: number[]
    }
    image?: {
      url: string
      size: 'cover' | 'contain' | 'stretch'
      position: { x: number; y: number }
    }
  }
  blur?: number
}

/**
 * Calculate background style from effect data
 * Returns both CSS properties (for React) and canvas drawing instructions
 */
export function calculateBackgroundStyle(
  backgroundData: BackgroundEffectData | undefined,
  _width: number,
  _height: number
): BackgroundStyle {
  if (!backgroundData?.type) {
    return { type: BackgroundType.None }
  }

  switch (backgroundData.type) {
    case BackgroundType.Color:
      return {
        type: BackgroundType.Color,
        cssStyle: {
          backgroundColor: backgroundData.color || DEFAULT_BACKGROUND_COLOR
        },
        canvasDrawing: {
          type: 'fill',
          color: backgroundData.color || DEFAULT_BACKGROUND_COLOR
        }
      }

    case BackgroundType.Gradient:
      if (!backgroundData.gradient?.colors?.length) {
        return { type: BackgroundType.None }
      }
      return createGradientStyle(backgroundData.gradient)

    case BackgroundType.Wallpaper:
      // Wallpaper is gradient + optional image overlay
      const baseGradient = backgroundData.gradient?.colors?.length
        ? createGradientStyle(backgroundData.gradient)
        : { type: BackgroundType.None as const }

      if (backgroundData.wallpaper) {
        return {
          type: BackgroundType.Wallpaper,
          cssStyle: {
            backgroundImage: `url(${backgroundData.wallpaper})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          },
          canvasDrawing: {
            type: 'image',
            image: {
              url: backgroundData.wallpaper,
              size: 'cover',
              position: DEFAULT_IMAGE_POSITION
            }
          },
          blur: backgroundData.blur
        }
      }
      return baseGradient

    case BackgroundType.Image:
      if (!backgroundData.image) {
        return { type: BackgroundType.None }
      }
      return {
        type: BackgroundType.Image,
        cssStyle: {
          backgroundImage: `url(${backgroundData.image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: backgroundData.blur ? `blur(${backgroundData.blur}px)` : undefined
        },
        canvasDrawing: {
          type: 'image',
          image: {
            url: backgroundData.image,
            size: 'cover',
            position: DEFAULT_IMAGE_POSITION
          }
        },
        blur: backgroundData.blur
      }

    case BackgroundType.None:
    default:
      return { type: BackgroundType.None }
  }
}

/**
 * Create gradient style from gradient data
 */
function createGradientStyle(
  gradient: { colors: string[]; angle?: number },
): BackgroundStyle {
  const { colors, angle = 135 } = gradient

  // Calculate color stops for even distribution
  const stops = colors.map((_, index) =>
    index / (colors.length - 1)
  )

  // Create CSS gradient string
  const gradientColors = colors.map((color, index) =>
    `${color} ${stops[index] * 100}%`
  ).join(', ')

  return {
    type: BackgroundType.Gradient,
    cssStyle: {
      background: `linear-gradient(${angle}deg, ${gradientColors})`
    },
    canvasDrawing: {
      type: 'gradient',
      gradient: {
        colors,
        angle,
        stops
      }
    }
  }
}

/**
 * Calculate gradient coordinates for canvas
 * Converts angle to x1,y1,x2,y2 coordinates
 */
export function calculateGradientCoordinates(
  angle: number,
  width: number,
  height: number
): { x1: number; y1: number; x2: number; y2: number } {
  const angleRad = (angle * Math.PI) / 180
  const centerX = width / 2
  const centerY = height / 2

  // Calculate gradient line endpoints
  const x1 = centerX - Math.cos(angleRad) * width / 2
  const y1 = centerY - Math.sin(angleRad) * height / 2
  const x2 = centerX + Math.cos(angleRad) * width / 2
  const y2 = centerY + Math.sin(angleRad) * height / 2

  return { x1, y1, x2, y2 }
}

/**
 * Apply gradient to canvas context
 */
export function applyGradientToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  gradient: { colors: string[]; angle: number; stops: number[] },
  width: number,
  height: number
): void {
  const coords = calculateGradientCoordinates(gradient.angle, width, height)
  const canvasGradient = ctx.createLinearGradient(coords.x1, coords.y1, coords.x2, coords.y2)

  gradient.colors.forEach((color, index) => {
    canvasGradient.addColorStop(gradient.stops[index], color)
  })

  ctx.fillStyle = canvasGradient
  ctx.fillRect(0, 0, width, height)
}

/**
 * Calculate padding and corner radius transforms
 */
export function calculateVideoFrame(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding: number = 0,
  cornerRadius: number = 0
): {
  x: number
  y: number
  width: number
  height: number
  scale: number
  cornerRadius: number
} {
  if (padding === 0) {
    return {
      x: 0,
      y: 0,
      width: containerWidth,
      height: containerHeight,
      scale: 1,
      cornerRadius: 0
    }
  }

  // Calculate available space after padding
  const availableWidth = containerWidth - (padding * 2)
  const availableHeight = containerHeight - (padding * 2)

  // Calculate scale to fit video in available space
  const scaleX = availableWidth / videoWidth
  const scaleY = availableHeight / videoHeight
  const scale = Math.min(scaleX, scaleY)

  // Calculate final dimensions
  const finalWidth = videoWidth * scale
  const finalHeight = videoHeight * scale

  // Center the video
  const x = (containerWidth - finalWidth) / 2
  const y = (containerHeight - finalHeight) / 2

  return {
    x,
    y,
    width: finalWidth,
    height: finalHeight,
    scale,
    cornerRadius
  }
}

/**
 * Apply shadow effect to canvas
 */
export function applyShadowToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shadowIntensity: number = 0
): void {
  if (shadowIntensity <= 0) return

  const blur = Math.max(0, Math.min(MAX_SHADOW_BLUR, shadowIntensity / 2))
  const opacity = Math.max(0, Math.min(1, shadowIntensity / SHADOW_INTENSITY_TO_OPACITY_DIVISOR))

  ctx.shadowColor = `rgba(0, 0, 0, ${opacity})`
  ctx.shadowBlur = blur
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = blur / SHADOW_OFFSET_DIVISOR
}
