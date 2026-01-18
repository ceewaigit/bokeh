export type VideoShadowStyleInput = {
  shadowIntensity: number
  mockupEnabled?: boolean
  frameWidth?: number
  frameHeight?: number
  sourceWidth?: number
  sourceHeight?: number
}

export type VideoShadowStyleOutput = {
  boxShadow?: string
  filter?: string
}

export function getVideoShadowStyle(input: VideoShadowStyleInput): VideoShadowStyleOutput {
  const { shadowIntensity, mockupEnabled, frameWidth, frameHeight, sourceWidth, sourceHeight } = input

  if (mockupEnabled || shadowIntensity <= 0) return {}

  const blurPx = shadowIntensity * 0.5
  const alpha = Math.min(0.6, shadowIntensity / 100)
  const shadowArgs = `0px 10px ${blurPx}px rgba(0,0,0,${alpha})`

  const hasDimensions =
    typeof frameWidth === 'number'
    && typeof frameHeight === 'number'
    && typeof sourceWidth === 'number'
    && typeof sourceHeight === 'number'
    && frameWidth > 0
    && frameHeight > 0
    && sourceWidth > 0
    && sourceHeight > 0

  if (hasDimensions) {
    const frameAspect = frameWidth / frameHeight
    const sourceAspect = sourceWidth / sourceHeight
    const aspectMismatch = Math.abs(frameAspect - sourceAspect) > 0.0001

    if (aspectMismatch) {
      return { filter: `drop-shadow(${shadowArgs})` }
    }
  }

  return { boxShadow: shadowArgs }
}
