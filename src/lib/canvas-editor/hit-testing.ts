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
import type { Effect, PluginEffectData, AnnotationData, AnnotationStyle } from '@/types/project'
import { AnnotationType } from '@/types/project'
import { PluginRegistry } from '@/features/effects/config/plugin-registry'
import {
  percentToPixels,
  isPointInRect,
  isPointInRotatedRect,
  rotatePointAroundAnchor,
  inverseCameraTransformPoint,
  type VideoRect,
  type CameraTransform
} from './coordinate-utils'

export type HandlePosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'
  | 'rotate'

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
  /** Rotation in degrees (clockwise positive) */
  rotation?: number
  /** Center point for rotation anchor */
  centerX?: number
  centerY?: number
}

const HANDLE_SIZE = 16       // Slightly larger visual handle for easier targeting
const HANDLE_HIT_PADDING = 8 // Generous hit zone for corner/edge resize handles

import { resolvePadding, getAnnotationLabel, measureAnnotationBox } from './annotation-utils'

// Removed local implementations of getTextMeasureContext, resolvePadding, getAnnotationLabel, measureAnnotationBox

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
  videoRect: VideoRect,
  scale: number = 1
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
      const rotation = annotationData.rotation ?? 0

      if (annotationData.type === AnnotationType.Arrow) {
        const start = percentToPixels(
          annotationData.position.x,
          annotationData.position.y,
          videoRect
        )
        const rawEnd = annotationData.endPosition ?? { x: annotationData.position.x + 10, y: annotationData.position.y + 10 }
        const end = percentToPixels(rawEnd.x, rawEnd.y, videoRect)
        const strokeWidth = annotationData.style?.strokeWidth ?? 3
        const arrowHead = annotationData.style?.arrowHeadSize ?? 10
        // Padding doesn't technically scale but for hit-test safety maybe should? Leave for now.
        const padding = Math.max(strokeWidth, arrowHead) + 6

        const minX = Math.min(start.x, end.x) - padding
        const minY = Math.min(start.y, end.y) - padding
        const maxX = Math.max(start.x, end.x) + padding
        const maxY = Math.max(start.y, end.y) + padding

        // Arrow center is midpoint between start and end
        const centerX = (start.x + end.x) / 2
        const centerY = (start.y + end.y) / 2

        return {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          rotation,
          centerX,
          centerY,
        }
      }

      if (annotationData.type === AnnotationType.Highlight) {
        const topLeft = percentToPixels(
          annotationData.position.x,
          annotationData.position.y,
          videoRect
        )
        const width = ((annotationData.width ?? 20) / 100) * videoRect.width
        const height = ((annotationData.height ?? 10) / 100) * videoRect.height
        // Highlight center is its geometric center
        const centerX = topLeft.x + width / 2
        const centerY = topLeft.y + height / 2
        return {
          x: topLeft.x,
          y: topLeft.y,
          width,
          height,
          rotation,
          centerX,
          centerY,
        }
      }

      // Standard Annotations (Text, Keyboard) - Center Anchored
      const center = percentToPixels(
        annotationData.position.x,
        annotationData.position.y,
        videoRect
      )

      const measured = measureAnnotationBox(annotationData)
      // Standard Annotations render at fixed pixel size relative to draw dimensions (unscaled by video scale)
      const measuredWidth = measured.width
      const measuredHeight = measured.height

      const width = annotationData.width
        ? (annotationData.width / 100) * videoRect.width
        : measuredWidth
      const height = annotationData.height
        ? (annotationData.height / 100) * videoRect.height
        : measuredHeight

      return {
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        rotation,
        centerX: center.x,
        centerY: center.y,
      }
    }

    // Note: Webcam is handled separately via WebcamLayer, not OverlayEditor

    default:
      return null
  }
}

const ROTATION_HANDLE_DISTANCE = 30 // Distance of rotation handle above the element

/**
 * Check if a point hits any of the 8 resize handles or the rotation handle
 * Handles are rotated around the element center when the element is rotated
 */
function hitTestHandles(
  mouseX: number,
  mouseY: number,
  bounds: EffectBounds,
  cameraScale: number = 1
): HandlePosition | null {
  const rotation = bounds.rotation ?? 0
  const centerX = bounds.centerX ?? (bounds.x + bounds.width / 2)
  const centerY = bounds.centerY ?? (bounds.y + bounds.height / 2)

  // Inverse scale handle size to match visual overlay
  const inverseScale = 1 / cameraScale
  // Use slightly larger hit zone than visual size (10px visual vs 16px hit)
  const scaledHandleSize = HANDLE_SIZE * inverseScale
  const scaledHitPadding = HANDLE_HIT_PADDING * inverseScale
  const hitSize = scaledHandleSize + scaledHitPadding * 2

  // Define handle positions in unrotated space
  const handlePositions: { position: HandlePosition; x: number; y: number }[] = [
    { position: 'top-left', x: bounds.x, y: bounds.y },
    { position: 'top', x: bounds.x + bounds.width / 2, y: bounds.y },
    { position: 'top-right', x: bounds.x + bounds.width, y: bounds.y },
    { position: 'right', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    { position: 'bottom-right', x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { position: 'bottom', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
    { position: 'bottom-left', x: bounds.x, y: bounds.y + bounds.height },
    { position: 'left', x: bounds.x, y: bounds.y + bounds.height / 2 },
    // Rotation handle is above the top-center (also scaled distance?)
    // Visual overlay scales rotation distance. We should too.
    { position: 'rotate', x: bounds.x + bounds.width / 2, y: bounds.y - (ROTATION_HANDLE_DISTANCE * inverseScale) },
  ]

  for (const handle of handlePositions) {
    // Rotate handle position around center if element is rotated
    const rotatedHandle = rotation !== 0
      ? rotatePointAroundAnchor(handle.x, handle.y, centerX, centerY, rotation)
      : { x: handle.x, y: handle.y }

    const handleRect = {
      x: rotatedHandle.x - hitSize / 2,
      y: rotatedHandle.y - hitSize / 2,
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
 * Accounts for element rotation
 */
function hitTestBody(
  mouseX: number,
  mouseY: number,
  bounds: EffectBounds
): boolean {
  const rotation = bounds.rotation ?? 0
  const centerX = bounds.centerX ?? (bounds.x + bounds.width / 2)
  const centerY = bounds.centerY ?? (bounds.y + bounds.height / 2)

  return isPointInRotatedRect(mouseX, mouseY, bounds, rotation, centerX, centerY)
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
 * @param scale - Scale factor (Screen / Original Resolution)
 * @param cameraTransform - Optional camera transform for zoom/pan (inverse applied to mouse)
 */
export function hitTestEffects(
  mouseX: number,
  mouseY: number,
  effects: Effect[],
  videoRect: VideoRect,
  selectedEffectId: string | null = null,
  scale: number = 1,
  cameraTransform?: CameraTransform | null
): HitTestResult | null {
  // Apply inverse camera transform to mouse position for accurate hit-testing
  // This converts screen coordinates to annotation-space coordinates
  let testX = mouseX
  let testY = mouseY
  if (cameraTransform && cameraTransform.scale !== 1) {
    const inverted = inverseCameraTransformPoint(mouseX, mouseY, videoRect, cameraTransform)
    testX = inverted.x
    testY = inverted.y
  }

  // Filter to positionable effects and get their bounds
  const positionableEffects = effects
    // console.log('[HitTest] Checking', effects.length, 'effects at', testX, testY, 'Rect:', videoRect)
    .filter(isPositionableEffect)
    .map(effect => ({
      effect,
      bounds: getEffectBounds(effect, videoRect, scale),
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
      const handle = hitTestHandles(testX, testY, selected.bounds, cameraTransform?.scale ?? 1)
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
    if (hitTestBody(testX, testY, bounds)) {
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
      // All annotation types are resizable (Text/Keyboard scales font, Highlight scales box)
      return true
    }
    // Note: Webcam is handled separately via WebcamLayer, not OverlayEditor
    default:
      return false
  }
}
