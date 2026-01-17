/**
 * Hit testing utilities for canvas overlay editor
 *
 * Detects which positioned elements (plugins, annotations, webcam, cursor) the user
 * is clicking/hovering over in the video canvas.
 *
 * Integrated to support unified hit testing across all layer types.
 */

import { EffectType } from '@/features/effects/types'
import type { Effect, PluginEffectData, AnnotationData } from '@/types/project'
import { AnnotationType } from '@/types/project'
import { PluginRegistry } from '@/features/effects/config/plugin-registry'
import {
  percentToPixels,
  isPointInRect,
  isPointInRotatedRect,
  rotatePointAroundAnchor,
  inverseCameraTransformPoint,
  type VideoRect
} from '@/features/rendering/canvas/math/coordinates'


export type HandlePosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'
  | 'arrow-start'
  | 'arrow-end'
  | 'rotate'

export type HitLayerType = EffectType | 'cursor' | 'background'

export interface HitTestResult {
  effectId: string
  effectType: HitLayerType
  hitType: 'body' | 'handle'
  handlePosition?: HandlePosition
  // For specialized layers that might not map 1:1 to an effect ID (like cursor)
  data?: unknown
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

// Z-Indexes matching those in renderer logic
const Z_INDEX = {
  CURSOR: 80,
  WEBCAM: 70,
  ANNOTATION: 60,
  PLUGIN: 50,
  BACKGROUND: 0
}

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
    // NOTE: Webcam case removed - webcam styling now lives on clip.layout
    default:
      return false
  }
}

/**
 * Get the bounds of a positioned effect in canvas pixels
 * @deprecated Use getEffectLayout(effect, snapshot) instead to ensure consistent coordinate system
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
      // Note: We don't have measureAnnotationBox here easily without context, 
      // but usually for hit testing we can rely on passed width/height or approximate
      // For now, assume width/height is populated or default.
      // Ideally, the caller ensures these values are accurate or we'd need to measure again.

      const width = annotationData.width
        ? (annotationData.width / 100) * videoRect.width
        : 100 // Fallback if unmeasured
      const height = annotationData.height
        ? (annotationData.height / 100) * videoRect.height
        : 40 // Fallback if unmeasured

      const center = percentToPixels(
        annotationData.position.x,
        annotationData.position.y,
        videoRect
      )

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
    // Rotation handle is above the top-center
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

import type { FrameSnapshot } from '@/features/rendering/renderer/engine/layout-engine'
import { getVideoRectFromSnapshot } from '@/features/ui/editor/logic/preview-point-transforms'

/**
 * Get the bounds of a positioned effect using the Frame Snapshot
 * (Preferred over getEffectBounds)
 */
export function getEffectLayout(
  effect: Effect,
  snapshot: FrameSnapshot
): EffectBounds | null {
  const videoRect = getVideoRectFromSnapshot(snapshot)
  return getEffectBounds(effect, videoRect)
}

/**
 * Helper to extract camera transform from FrameSnapshot
 */
export function getCameraTransformFromSnapshot(snapshot: FrameSnapshot): {
  scale: number
  panX: number
  panY: number
} | null {
  const zt = snapshot.camera.zoomTransform
  if (!zt) return null

  const scale = (zt as any).scale ?? 1
  const panX = (zt as any).panX ?? 0
  const panY = (zt as any).panY ?? 0

  // Return null for identity transform
  if (scale === 1 && panX === 0 && panY === 0) return null

  return { scale, panX, panY }
}

/**
 * Unified Hit Tester
 * Checks all layers (Cursor, Webcam, Annotations, Plugins) respecting logic and priority
 *
 * Coordinate System:
 * - All hit-testing happens in VIDEO SPACE (not screen space)
 * - Mouse coordinates are transformed from screen space to video space using inverse camera transform
 * - Effect bounds are calculated in video space
 * - Handle hit zones are scaled inversely so they match the visual handle size on screen
 */
export function hitTestPreviewLayer(
  mouseX: number,
  mouseY: number,
  effects: Effect[],
  snapshot: FrameSnapshot,
  options?: {
    selectedEffectId?: string | null
    cursorRect?: EffectBounds | null
    canSelectBackground?: boolean
  }
): HitTestResult | null {
  const videoRect = getVideoRectFromSnapshot(snapshot)
  const selectedEffectId = options?.selectedEffectId

  // Extract camera transform from snapshot using helper
  const cameraTransform = getCameraTransformFromSnapshot(snapshot)
  const cameraScale = cameraTransform?.scale ?? 1

  // Transform mouse to VIDEO SPACE for consistent hit-testing
  // All bounds and handle positions are calculated in video space
  let testX = mouseX
  let testY = mouseY
  if (cameraTransform) {
    const inverted = inverseCameraTransformPoint(mouseX, mouseY, videoRect, cameraTransform)
    testX = inverted.x
    testY = inverted.y
  }

  // Collect all hittable items
  const hittableItems: {
    id: string
    type: HitLayerType
    bounds: EffectBounds
    zIndex: number
  }[] = []

  // 1. Effects (Annotations, Plugins, Webcam)
  effects.forEach(effect => {
    if (!isPositionableEffect(effect)) return

    // Skip disabled effects
    if (effect.enabled === false) return

    const bounds = getEffectBounds(effect, videoRect)
    if (!bounds) return

    hittableItems.push({
      id: effect.id,
      type: effect.type,
      bounds,
      zIndex: getEffectZIndex(effect)
    })
  })

  // 2. Cursor (if active/visible)
  if (options?.cursorRect) {
    hittableItems.push({
      id: 'cursor-layer',
      type: 'cursor',
      bounds: options.cursorRect,
      zIndex: Z_INDEX.CURSOR
    })
  }

  // Sort by Z-Index (Descending)
  hittableItems.sort((a, b) => b.zIndex - a.zIndex)

  // 1. Check Handles FIRST (High Priority - only for selected effect)
  // Handle hit zones are inverse-scaled to match visual handle size on screen
  if (selectedEffectId) {
    const selectedItem = hittableItems.find(item => item.id === selectedEffectId)
    if (selectedItem && (selectedItem.type === EffectType.Annotation || selectedItem.type === EffectType.Plugin)) {
      const handle = hitTestHandles(testX, testY, selectedItem.bounds, cameraScale)
      if (handle) {
        return {
          effectId: selectedItem.id,
          effectType: selectedItem.type,
          hitType: 'handle',
          handlePosition: handle
        }
      }
    }
  }

  // 2. Check Bodies
  for (const item of hittableItems) {
    // Cursor hit testing usually needs a bit of padding due to small size
    // But cursorRect should already encompass the visual area
    if (hitTestBody(testX, testY, item.bounds)) {
      return {
        effectId: item.id,
        effectType: item.type,
        hitType: 'body'
      }
    }
  }

  return null
}

/**
 * Legacy wrapper for backward compatibility if needed, 
 * or for specific "just effects" testing
 */
export function hitTestEffects(
  mouseX: number,
  mouseY: number,
  effects: Effect[],
  snapshot: FrameSnapshot,
  selectedEffectId: string | null = null,
): HitTestResult | null {
  return hitTestPreviewLayer(mouseX, mouseY, effects, snapshot, { selectedEffectId })
}

/**
 * Get the z-index of an effect for sorting
 */
function getEffectZIndex(effect: Effect): number {
  switch (effect.type) {
    case EffectType.Plugin: {
      const pluginData = effect.data as PluginEffectData
      return pluginData.zIndex ?? Z_INDEX.PLUGIN
    }
    case EffectType.Annotation:
      return Z_INDEX.ANNOTATION
    // NOTE: Webcam case removed - webcam styling now lives on clip.layout
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
    // NOTE: Webcam case removed - webcam styling now lives on clip.layout
    default:
      return false
  }
}
