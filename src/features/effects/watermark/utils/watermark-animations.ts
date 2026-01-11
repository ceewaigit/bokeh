import { interpolate } from 'remotion'
import type { WatermarkEffectData } from '../types'
import { WatermarkAnimationType, WatermarkPulseAnimation } from '../types'

export function calculateWatermarkAnimations(
  data: WatermarkEffectData,
  frame: number,
  fps: number,
  startFrame: number,
  endFrame: number
): { opacityMultiplier: number; scale: number } {
  let opacityMultiplier = 1

  const entry = data.animations.entry
  if (entry.type === WatermarkAnimationType.Fade) {
    const entryFrames = Math.max(1, Math.round((entry.durationMs / 1000) * fps))
    opacityMultiplier *= interpolate(frame, [startFrame, startFrame + entryFrames], [0.4, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  }

  const exit = data.animations.exit
  if (exit.type === WatermarkAnimationType.Fade) {
    const exitFrames = Math.max(1, Math.round((exit.durationMs / 1000) * fps))
    opacityMultiplier *= interpolate(frame, [endFrame - exitFrames, endFrame], [1, 0.4], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  }

  const continuous = data.animations.continuous
  let scale = 1
  if (continuous.type !== WatermarkPulseAnimation.None) {
    const periodFrames = Math.max(1, Math.round((continuous.period / 1000) * fps))
    const phase = (2 * Math.PI * (frame % periodFrames)) / periodFrames
    const amp = Math.max(0, continuous.amplitude)

    const wave =
      continuous.type === WatermarkPulseAnimation.Pulse
        ? Math.abs(Math.sin(phase))
        : (Math.sin(phase) + 1) / 2

    scale = 1 + amp * wave
  }

  return { opacityMultiplier, scale }
}

