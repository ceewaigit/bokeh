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
import { getAllPluginEffects } from '@/features/effects/effect-filters'
import { frameToMs } from '../utils/time/frame-time'
import type { Effect, PluginEffect, PluginEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import type { PluginFrameContext, PluginRenderProps } from '@/features/effects/config/plugin-sdk'
import { assertDefined } from '@/lib/errors'
import { useVideoPosition } from '@/remotion/context/layout/VideoPositionContext'
import { useTimelineContext } from '@/remotion/context/TimelineContext'

interface PluginLayerProps {
  layer?: 'below-cursor' | 'above-cursor'
}

export const PluginLayer: React.FC<PluginLayerProps> = ({
  layer = 'below-cursor'
}) => {
  // Pull core state from contexts
  // Use VideoPositionContext for consistency with other layers
  const { videoWidth, videoHeight } = useVideoPosition()
  const { effects, fps } = useTimelineContext()
  const currentFrame = useCurrentFrame()

  const width = videoWidth
  const height = videoHeight
  const currentTimeMs = frameToMs(currentFrame, fps)

  // Effects list is typically stable while playing; avoid re-filtering/sorting every frame.
  const allPluginEffects = useMemo(() => getAllPluginEffects(effects), [effects])

  // Filter to active effects at current time that are enabled
  const activePluginEffects = useMemo(() => {
    return allPluginEffects.filter(effect => {
      if (!effect.enabled) return false
      return currentTimeMs >= effect.startTime && currentTimeMs <= effect.endTime
    })
  }, [allPluginEffects, currentTimeMs])

  // Filter by layer (below cursor: z < 100, above cursor: z >= 100)
  const layerThreshold = 100
  const layerFilteredEffects = useMemo(() => {
    return activePluginEffects.filter(effect => {
      const isPlugin = effect.type === EffectType.Plugin
      const data = isPlugin ? (effect as PluginEffect).data : null
      const zIndex = data?.zIndex ?? 50
      return layer === 'above-cursor' ? zIndex >= layerThreshold : zIndex < layerThreshold
    })
  }, [activePluginEffects, layer])

  // Sort by z-index (lower z-index renders first, higher renders on top)
  const sortedEffects = useMemo(() => {
    return [...layerFilteredEffects].sort((a, b) => {
      const aData = a.type === EffectType.Plugin ? (a as PluginEffect).data : null
      const bData = b.type === EffectType.Plugin ? (b as PluginEffect).data : null
      return (aData?.zIndex ?? 50) - (bData?.zIndex ?? 50)
    })
  }, [layerFilteredEffects])

  if (sortedEffects.length === 0) {
    return null
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {sortedEffects.map(effect => (
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

const PluginEffectRenderer: React.FC<PluginEffectRendererProps> = ({
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

  // Calculate progress through effect duration
  const duration = effect.endTime - effect.startTime
  const elapsed = currentTimeMs - effect.startTime
  const progress = Math.max(0, Math.min(1, elapsed / duration))
  const durationFrames = Math.round((duration / 1000) * fps)

  // Build frame context for plugin
  const frameContext: PluginFrameContext = {
    frame,
    fps,
    progress,
    durationFrames,
    width,
    height
  }

  // Build render props
  const renderProps: PluginRenderProps = {
    params: pluginData.params as Record<string, unknown>,
    frame: frameContext,
    width,
    height
  }

  // Get the plugin to check its category
  const isTransition = plugin.category === 'transition'

  // Calculate position style if plugin has position data
  // For transition plugins, always use fullscreen regardless of position data
  const positionStyle: React.CSSProperties = (!isTransition && pluginData.position) ? {
    position: 'absolute',
    left: `${pluginData.position.x}%`,
    top: `${pluginData.position.y}%`,
    transform: 'translate(-50%, -50%)',
    // Apply width/height if specified
    ...(pluginData.position.width ? { width: pluginData.position.width } : {}),
    ...(pluginData.position.height ? { height: pluginData.position.height } : {})
  } : {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  }

  const rendered = plugin.render(renderProps)

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
}

export default PluginLayer
