/**
 * Hit testing utilities for canvas overlay editor
 *
 * Detects which positioned elements (plugins, annotations) the user
 * is clicking/hovering over in the video canvas.
 *
 * Note: Webcam uses its own positioning system via WebcamLayer and
 * DOM-based hover detection in preview-area-remotion.tsx.
 */

import { EffectType } from '@/types/effects'
import type { Effect, PluginEffectData, AnnotationData } from '@/types/project'
import { PluginRegistry } from '@/lib/effects/config/plugin-registry'
import { percentToPixels, isPointInRect, type VideoRect } from './coordinate-utils'

export type HandlePosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'

export interface HitTestResult {
  effectId: string
  effectType: EffectType
  hitType: 'body' | 'handle'
  handlePosition?: HandlePosition
}

export interface EffectBounds {
  x: number
  y: number
  width: number
  height: number
}

const HANDLE_SIZE = 12
const HANDLE_HIT_PADDING = 4 // Extra padding for easier handle clicks

/**
 * Check if an effect is positionable (has drag/resize support)
 */
export function isPositionableEffect(effect: Effect): boolean {
  switch (effect.type) {
    case EffectType.Plugin: {
      const pluginData = effect.data as PluginEffectData
      const plugin = PluginRegistry.get(pluginData.pluginId)
      return plugin?.positioning?.enabled === true
    }
    case EffectType.Annotation: {
      const annotationData = effect.data as AnnotationData
      // All annotation types are positionable
      return annotationData.position !== undefined
    }
    // Note: Webcam is handled separately via WebcamLayer, not OverlayEditor
    default:
      return false
  }
}

/**
 * Get the bounds of a positioned effect in canvas pixels
 */
export function getEffectBounds(
  effect: Effect,
  videoRect: VideoRect
): EffectBounds | null {
  switch (effect.type) {
    case EffectType.Plugin: {
      const pluginData = effect.data as PluginEffectData
      if (!pluginData.position) return null

      const plugin = PluginRegistry.get(pluginData.pluginId)
      if (!plugin?.positioning?.enabled) return null

      const center = percentToPixels(pluginData.position.x, pluginData.position.y, videoRect)

      // Use position.width/height if available, otherwise estimate from plugin
      const width = pluginData.position.width ?? 100
      const height = pluginData.position.height ?? 100

      return {
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
      }
    }

    case EffectType.Annotation: {
      const annotationData = effect.data as AnnotationData
      if (!annotationData.position) return null

      // Annotation positions use 0-100% coordinates
      const center = percentToPixels(
        annotationData.position.x,
        annotationData.position.y,
        videoRect
      )

      // Width/height are also percentages of canvas
      const width = ((annotationData.width ?? 10) / 100) * videoRect.width
      const height = ((annotationData.height ?? 5) / 100) * videoRect.height

      return {
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
      }
    }

    // Note: Webcam is handled separately via WebcamLayer, not OverlayEditor

    default:
      return null
  }
}

/**
 * Check if a point hits any of the 8 resize handles
 */
function hitTestHandles(
  mouseX: number,
  mouseY: number,
  bounds: EffectBounds
): HandlePosition | null {
  const handlePositions: { position: HandlePosition; x: number; y: number }[] = [
    { position: 'top-left', x: bounds.x, y: bounds.y },
    { position: 'top', x: bounds.x + bounds.width / 2, y: bounds.y },
    { position: 'top-right', x: bounds.x + bounds.width, y: bounds.y },
    { position: 'right', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    { position: 'bottom-right', x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { position: 'bottom', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
    { position: 'bottom-left', x: bounds.x, y: bounds.y + bounds.height },
    { position: 'left', x: bounds.x, y: bounds.y + bounds.height / 2 },
  ]

  const hitSize = HANDLE_SIZE + HANDLE_HIT_PADDING * 2

  for (const handle of handlePositions) {
    const handleRect = {
      x: handle.x - hitSize / 2,
      y: handle.y - hitSize / 2,
      width: hitSize,
      height: hitSize,
    }

    if (isPointInRect(mouseX, mouseY, handleRect)) {
      return handle.position
    }
  }

  return null
}

/**
 * Check if a point hits the body of an effect (not handles)
 */
function hitTestBody(
  mouseX: number,
  mouseY: number,
  bounds: EffectBounds
): boolean {
  return isPointInRect(mouseX, mouseY, bounds)
}

/**
 * Hit test all positionable effects at a given point
 * Returns the topmost hit effect (highest z-index)
 *
 * @param mouseX - Mouse X in canvas pixel coordinates (relative to composition)
 * @param mouseY - Mouse Y in canvas pixel coordinates (relative to composition)
 * @param effects - All effects at current time
 * @param videoRect - Video position from VideoPositionContext
 * @param selectedEffectId - Currently selected effect (for handle priority)
 */
export function hitTestEffects(
  mouseX: number,
  mouseY: number,
  effects: Effect[],
  videoRect: VideoRect,
  selectedEffectId: string | null = null
): HitTestResult | null {
  // Filter to positionable effects and get their bounds
  const positionableEffects = effects
    .filter(isPositionableEffect)
    .map(effect => ({
      effect,
      bounds: getEffectBounds(effect, videoRect),
      zIndex: getEffectZIndex(effect),
    }))
    .filter((item): item is { effect: Effect; bounds: EffectBounds; zIndex: number } =>
      item.bounds !== null
    )
    // Sort by z-index descending (top-most first)
    .sort((a, b) => b.zIndex - a.zIndex)

  // First, check handles of selected effect (they have priority)
  if (selectedEffectId) {
    const selected = positionableEffects.find(e => e.effect.id === selectedEffectId)
    if (selected) {
      const handle = hitTestHandles(mouseX, mouseY, selected.bounds)
      if (handle) {
        return {
          effectId: selected.effect.id,
          effectType: selected.effect.type,
          hitType: 'handle',
          handlePosition: handle,
        }
      }
    }
  }

  // Then check bodies (top-most first)
  for (const { effect, bounds } of positionableEffects) {
    if (hitTestBody(mouseX, mouseY, bounds)) {
      return {
        effectId: effect.id,
        effectType: effect.type,
        hitType: 'body',
      }
    }
  }

  return null
}

/**
 * Get the z-index of an effect for sorting
 */
function getEffectZIndex(effect: Effect): number {
  switch (effect.type) {
    case EffectType.Plugin: {
      const pluginData = effect.data as PluginEffectData
      return pluginData.zIndex ?? 50
    }
    case EffectType.Annotation:
      return 60 // Annotations above plugins
    case EffectType.Webcam:
      return 70 // Webcam above annotations
    default:
      return 50
  }
}

/**
 * Get cursor style for a given handle position
 */
export function getHandleCursor(position: HandlePosition): string {
  switch (position) {
    case 'top-left':
    case 'bottom-right':
      return 'nwse-resize'
    case 'top-right':
    case 'bottom-left':
      return 'nesw-resize'
    case 'top':
    case 'bottom':
      return 'ns-resize'
    case 'left':
    case 'right':
      return 'ew-resize'
    default:
      return 'default'
  }
}

/**
 * Check if an effect supports resizing
 */
export function isResizableEffect(effect: Effect): boolean {
  switch (effect.type) {
    case EffectType.Plugin: {
      const pluginData = effect.data as PluginEffectData
      const plugin = PluginRegistry.get(pluginData.pluginId)
      return plugin?.positioning?.resizable === true
    }
    case EffectType.Annotation: {
      const annotationData = effect.data as AnnotationData
      // Highlight type is resizable
      return annotationData.type === 'highlight'
    }
    // Note: Webcam is handled separately via WebcamLayer, not OverlayEditor
    default:
      return false
  }
}
