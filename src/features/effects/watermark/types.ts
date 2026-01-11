export enum WatermarkLayout {
  IconOnly = 'icon-only',
  TextOnly = 'text-only',
  IconTextHorizontal = 'icon-text-horizontal',
  TextIconHorizontal = 'text-icon-horizontal',
  IconTextStacked = 'icon-text-stacked',
  TextIconStacked = 'text-icon-stacked',
}

export enum WatermarkAnimationType {
  None = 'none',
  Fade = 'fade',
}

export enum WatermarkPulseAnimation {
  None = 'none',
  Breathe = 'breathe',
  Pulse = 'pulse',
}

export interface WatermarkTextStyle {
  fontFamily: string
  fontWeight: number | string
  fontSize: number
  color: string
  textShadow?: {
    enabled: boolean
    offsetX: number
    offsetY: number
    blur: number
    color: string
  }
  textOutline?: {
    enabled: boolean
    width: number
    color: string
  }
  textUnderline?: {
    enabled: boolean
    thickness: number
    offset: number
    color: string
  }
}

export interface WatermarkContainerStyle {
  background?: {
    enabled: boolean
    color: string
    paddingX: number
    paddingY: number
    borderRadius: number
  }
}

export interface WatermarkAnimationConfig {
  entry: { type: WatermarkAnimationType; durationMs: number }
  exit: { type: WatermarkAnimationType; durationMs: number }
  continuous: { type: WatermarkPulseAnimation; period: number; amplitude: number }
}

export interface WatermarkEffectData {
  enabled: boolean
  forceEnabled: boolean
  layout: WatermarkLayout
  text: string
  iconPath: string | null
  /**
   * Percent of composition height.
   * Example: 8 means "8% of the video height".
   */
  iconSize: number
  opacity: number
  offsetX: number
  offsetY: number
  containerStyle?: WatermarkContainerStyle
  textStyle: WatermarkTextStyle
  animations: WatermarkAnimationConfig
}

export type WatermarkTextShadow = NonNullable<WatermarkTextStyle['textShadow']>
export type WatermarkTextOutline = NonNullable<WatermarkTextStyle['textOutline']>
export type WatermarkTextUnderline = NonNullable<WatermarkTextStyle['textUnderline']>
export type WatermarkContainerBackground = NonNullable<NonNullable<WatermarkContainerStyle['background']>>

export type WatermarkEffectDataPatch =
  Partial<Omit<WatermarkEffectData, 'textStyle' | 'animations' | 'containerStyle'>> & {
    containerStyle?: Partial<Omit<WatermarkContainerStyle, 'background'>> & {
      background?: Partial<WatermarkContainerBackground>
    }
    textStyle?: Partial<Omit<WatermarkTextStyle, 'textShadow' | 'textOutline' | 'textUnderline'>> & {
      textShadow?: Partial<WatermarkTextShadow>
      textOutline?: Partial<WatermarkTextOutline>
      textUnderline?: Partial<WatermarkTextUnderline>
    }
    animations?: Partial<Omit<WatermarkAnimationConfig, 'entry' | 'exit' | 'continuous'>> & {
      entry?: Partial<WatermarkAnimationConfig['entry']>
      exit?: Partial<WatermarkAnimationConfig['exit']>
      continuous?: Partial<WatermarkAnimationConfig['continuous']>
    }
  }
