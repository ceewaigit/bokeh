import type { WatermarkEffectData, WatermarkEffectDataPatch } from './types'
import { WatermarkAnimationType, WatermarkLayout, WatermarkPulseAnimation } from './types'

// Watermarks should support transparency; use the backgroundless logo mark.
export const DEFAULT_BOKEH_ICON_PATH = '/brand/bokeh_watermark.svg'
export const DEFAULT_BOKEH_TEXT = 'bokeh.video'

export const WATERMARK_Z_INDEX = 400

export const FONT_FAMILY_OPTIONS = [
  { label: 'Inter', value: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' },
  { label: 'System', value: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' },
  { label: 'Serif', value: 'ui-serif, Georgia, Cambria, Times New Roman, Times, serif' },
  { label: 'Mono', value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace' },
] as const

export const FONT_WEIGHT_OPTIONS = [
  { label: 'Regular', value: 400 },
  { label: 'Medium', value: 500 },
  { label: 'Semibold', value: 600 },
  { label: 'Bold', value: 700 },
] as const

export const SUPPORTED_ICON_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] as const

export function createDefaultWatermarkEffectData(): WatermarkEffectData {
  return {
    enabled: true,
    forceEnabled: true,
    layout: WatermarkLayout.IconTextHorizontal,
    text: DEFAULT_BOKEH_TEXT,
    iconPath: null,
    iconSize: 5,
    opacity: 0.5,
    offsetX: 24,
    offsetY: 24,
    containerStyle: {
      background: {
        enabled: true,
        color: 'rgba(0,0,0,0.22)',
        paddingX: 10,
        paddingY: 6,
        borderRadius: 12,
      },
    },
    textStyle: {
      fontFamily: FONT_FAMILY_OPTIONS[0].value,
      fontWeight: 600,
      fontSize: 18,
      color: '#FFFFFF',
      textShadow: {
        enabled: true,
        offsetX: 0,
        offsetY: 1,
        blur: 6,
        color: 'rgba(0,0,0,0.55)',
      },
      textOutline: {
        enabled: false,
        width: 2,
        color: 'rgba(0,0,0,0.9)',
      },
      textUnderline: {
        enabled: true,
        thickness: 2,
        offset: 2,
        // Use text color; shadow/outline ensures contrast on light backgrounds.
        color: '#FFFFFF',
      },
    },
    animations: {
      entry: { type: WatermarkAnimationType.Fade, durationMs: 300 },
      exit: { type: WatermarkAnimationType.Fade, durationMs: 300 },
      continuous: { type: WatermarkPulseAnimation.None, period: 2400, amplitude: 0.02 },
    },
  }
}

/*
TODO: Migrate all the gate logic to a subscription store or some other global state manager.
FOR NOW: This is just a placeholder for the gate logic.
*/
type WatermarkGate = {
  forceEnabled: boolean
  toggleDisabled: boolean
  customizationLocked: boolean
}

export function getWatermarkGate(): WatermarkGate {
  // TODO(subscription): wire this to real subscription state.
  return { forceEnabled: true, toggleDisabled: true, customizationLocked: true }
}

export function normalizeWatermarkEffectData(input?: WatermarkEffectDataPatch | null): WatermarkEffectData {
  const defaults = createDefaultWatermarkEffectData()
  const gate = getWatermarkGate()

  const defaultShadow = defaults.textStyle.textShadow!
  const defaultOutline = defaults.textStyle.textOutline!
  const defaultUnderline = defaults.textStyle.textUnderline!
  const defaultContainerBg = defaults.containerStyle?.background ?? {
    enabled: false,
    color: 'rgba(0,0,0,0.18)',
    paddingX: 10,
    paddingY: 6,
    borderRadius: 12,
  }

  const merged: WatermarkEffectData = {
    ...defaults,
    ...(input ?? {}),
    containerStyle: {
      ...defaults.containerStyle,
      ...((input?.containerStyle ?? {}) as Partial<NonNullable<WatermarkEffectData['containerStyle']>>),
      background: {
        ...defaultContainerBg,
        ...((input?.containerStyle?.background ?? {}) as Partial<NonNullable<NonNullable<WatermarkEffectData['containerStyle']>['background']>>),
      },
    },
    textStyle: {
      ...defaults.textStyle,
      ...((input?.textStyle ?? {}) as Partial<WatermarkEffectData['textStyle']>),
      textShadow: {
        ...defaultShadow,
        ...((input?.textStyle?.textShadow ?? {}) as Partial<NonNullable<WatermarkEffectData['textStyle']['textShadow']>>),
      },
      textOutline: {
        ...defaultOutline,
        ...((input?.textStyle?.textOutline ?? {}) as Partial<NonNullable<WatermarkEffectData['textStyle']['textOutline']>>),
      },
      textUnderline: {
        ...defaultUnderline,
        ...((input?.textStyle?.textUnderline ?? {}) as Partial<NonNullable<WatermarkEffectData['textStyle']['textUnderline']>>),
      },
    },
    animations: {
      ...defaults.animations,
      ...((input?.animations ?? {}) as Partial<WatermarkEffectData['animations']>),
      entry: {
        ...defaults.animations.entry,
        ...((input?.animations?.entry ?? {}) as Partial<WatermarkEffectData['animations']['entry']>),
      },
      exit: {
        ...defaults.animations.exit,
        ...((input?.animations?.exit ?? {}) as Partial<WatermarkEffectData['animations']['exit']>),
      },
      continuous: {
        ...defaults.animations.continuous,
        ...((input?.animations?.continuous ?? {}) as Partial<WatermarkEffectData['animations']['continuous']>),
      },
    },
  }

  const clampedOpacity = Number.isFinite(merged.opacity) ? Math.min(1, Math.max(0, merged.opacity)) : defaults.opacity
  const clampedIconSize = Number.isFinite(merged.iconSize) ? Math.min(50, Math.max(1, merged.iconSize)) : defaults.iconSize

  const withClamps = {
    ...merged,
    opacity: clampedOpacity,
    iconSize: clampedIconSize,
  }

  if (gate.forceEnabled) {
    return { ...withClamps, enabled: true, forceEnabled: true }
  }

  return { ...withClamps, forceEnabled: false }
}
