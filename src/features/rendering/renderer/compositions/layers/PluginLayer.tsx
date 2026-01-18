/**
 * PluginLayer - Renders active plugin effects in the Remotion composition
 *
 * This component filters plugin effects that are active at the current frame,
 * sorts them by z-index, and renders each plugin's output.
 *
 * Z-Index ranges by category:
 * - foreground: 80-100 (watermarks, progress bars)
 * - overlay: 50-79 (text, shapes, callouts)
 * - underlay: 10-29 (behind cursor effects)
 * - background: -10 to 0 (custom backgrounds)
 *
 * Zero-Prop Refactor:
 * - Consumes effects from useTimelineContext
 * - Consumes frame/layout from useFrameSnapshot
 */

import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { PluginRegistry } from '@/features/effects/config/plugin-registry'
import { frameToMs } from '../utils/time/frame-time'
import type { Effect, PluginEffectData } from '@/types/project'
import type { PluginFrameContext, PluginRenderProps } from '@/features/effects/config/plugin-sdk'
import { assertDefined } from '@/shared/errors'
import { useVideoPosition } from '@/features/rendering/renderer/context/layout/VideoPositionContext'
import { useTimelineContext } from '@/features/rendering/renderer/context/RenderingTimelineContext'

interface PluginLayerProps {
  layer?: 'below-cursor' | 'above-cursor'
}

export const PluginLayer: React.FC<PluginLayerProps> = ({
  layer = 'below-cursor'
}) => {
  // Pull core state from contexts
  // Use VideoPositionContext for consistency with other layers
  const { videoWidth, videoHeight } = useVideoPosition()
  // PERF: Use pre-computed pluginEffects from context (already filtered by layer and sorted)
  const { pluginEffects, fps } = useTimelineContext()
  const currentFrame = useCurrentFrame()

  const width = videoWidth
  const height = videoHeight
  const currentTimeMs = frameToMs(currentFrame, fps)

  // PERF: O(1) lookup for pre-filtered & pre-sorted effects by layer
  // Only time filtering remains (unavoidable, but on much smaller pre-filtered array)
  const layerEffects = layer === 'above-cursor'
    ? pluginEffects.aboveCursor
    : pluginEffects.belowCursor

  // Filter to active effects at current time (this is the only per-frame filter needed)
  const activeEffects = useMemo(() => {
    return layerEffects.filter(effect =>
      currentTimeMs >= effect.startTime && currentTimeMs <= effect.endTime
    )
  }, [layerEffects, currentTimeMs])

  if (activeEffects.length === 0) {
    return null
  }

  // above-cursor layer needs z-index above AnnotationLayer (300) but below WatermarkLayer (400)
  const layerZIndex = layer === 'above-cursor' ? 350 : undefined

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: layerZIndex }}>
      {activeEffects.map(effect => (
        <PluginEffectRenderer
          key={effect.id}
          effect={effect}
          frame={currentFrame}
          fps={fps}
          currentTimeMs={currentTimeMs}
          width={width}
          height={height}
        />
      ))}
    </AbsoluteFill>
  )
}

interface PluginEffectRendererProps {
  effect: Effect
  frame: number
  fps: number
  currentTimeMs: number
  width: number
  height: number
}

/**
 * PERFORMANCE: Memoized plugin effect renderer.
 *
 * Previously, plugin.render() was called fresh on every frame (60fps) with new object
 * references for frameContext and renderProps, causing heavy calculations to run
 * unnecessarily even when params hadn't changed.
 *
 * Now uses React.memo with useMemo to:
 * - Only recalculate progress when time/boundaries change
 * - Memoize frame context and render props
 * - Cache plugin render output based on stable dependencies
 */
const PluginEffectRenderer = React.memo<PluginEffectRendererProps>(({
  effect,
  frame,
  fps,
  currentTimeMs,
  width,
  height
}) => {
  const pluginData = effect.data as PluginEffectData
  const plugin = assertDefined(
    PluginRegistry.get(pluginData.pluginId),
    `[PluginLayer] Plugin not found: ${pluginData.pluginId}`
  )

  // Memoize progress calculation
  const { progress, durationFrames } = useMemo(() => {
    const duration = effect.endTime - effect.startTime
    const elapsed = currentTimeMs - effect.startTime
    return {
      progress: Math.max(0, Math.min(1, elapsed / duration)),
      durationFrames: Math.round((duration / 1000) * fps)
    }
  }, [currentTimeMs, effect.startTime, effect.endTime, fps])

  // Memoize frame context - stable reference when values don't change
  const frameContext = useMemo<PluginFrameContext>(() => ({
    frame,
    fps,
    progress,
    durationFrames,
    width,
    height
  }), [frame, fps, progress, durationFrames, width, height])

  // Memoize render props - params reference from pluginData
  const renderProps = useMemo<PluginRenderProps>(() => ({
    params: pluginData.params as Record<string, unknown>,
    frame: frameContext,
    width,
    height
  }), [pluginData.params, frameContext, width, height])

  // Memoize plugin render output - only re-render when props actually change
  const rendered = useMemo(() => plugin.render(renderProps), [plugin, renderProps])

  // Memoize position style
  const isTransition = plugin.category === 'transition'
  const positionStyle = useMemo<React.CSSProperties>(() => {
    if (!isTransition && pluginData.position) {
      return {
        position: 'absolute',
        left: `${pluginData.position.x}%`,
        top: `${pluginData.position.y}%`,
        transform: 'translate(-50%, -50%)',
        ...(pluginData.position.width ? { width: pluginData.position.width } : {}),
        ...(pluginData.position.height ? { height: pluginData.position.height } : {})
      }
    }
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
    }
  }, [isTransition, pluginData.position])

  return (
    <div
      data-effect-id={effect.id}
      data-plugin-id={pluginData.pluginId}
      style={{
        ...positionStyle,
        zIndex: pluginData.zIndex ?? 50,
        pointerEvents: 'none'
      }}
    >
      {rendered}
    </div>
  )
})

PluginEffectRenderer.displayName = 'PluginEffectRenderer'

export default PluginLayer
