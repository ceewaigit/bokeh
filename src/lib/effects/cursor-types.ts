/**
 * Cursor type definitions and mappings for custom cursor rendering
 */

import { staticFile, getRemotionEnvironment } from 'remotion';

export enum CursorType {
  ARROW = 'arrow',
  IBEAM = 'iBeam',
  POINTING_HAND = 'pointingHand',
  CLOSED_HAND = 'closedHand',
  OPEN_HAND = 'openHand',
  CROSSHAIR = 'crosshair',
  RESIZE_LEFT = 'resizeLeft',
  RESIZE_RIGHT = 'resizeRight',
  RESIZE_UP = 'resizeUp',
  RESIZE_DOWN = 'resizeDown',
  RESIZE_LEFT_RIGHT = 'resizeLeftRight',
  RESIZE_UP_DOWN = 'resizeUpDown',
  CONTEXTUAL_MENU = 'contextualMenu',
  DISAPPEARING_ITEM = 'disappearingItem',
  DRAG_COPY = 'dragCopy',
  DRAG_LINK = 'dragLink',
  OPERATION_NOT_ALLOWED = 'operationNotAllowed',
  IBEAM_VERTICAL = 'iBeamCursorForVerticalLayout'
}

/**
 * Map Electron cursor types to our custom cursor types
 */
export const ELECTRON_TO_CUSTOM_CURSOR: Record<string, CursorType> = {
  'default': CursorType.ARROW,
  'pointer': CursorType.POINTING_HAND,
  'text': CursorType.IBEAM,
  'vertical-text': CursorType.IBEAM_VERTICAL,
  'crosshair': CursorType.CROSSHAIR,
  'move': CursorType.OPEN_HAND,
  'grabbing': CursorType.CLOSED_HAND,
  'grab': CursorType.OPEN_HAND,
  'not-allowed': CursorType.OPERATION_NOT_ALLOWED,
  'context-menu': CursorType.CONTEXTUAL_MENU,
  'copy': CursorType.DRAG_COPY,
  'alias': CursorType.DRAG_LINK,
  'e-resize': CursorType.RESIZE_RIGHT,
  'w-resize': CursorType.RESIZE_LEFT,
  'n-resize': CursorType.RESIZE_UP,
  's-resize': CursorType.RESIZE_DOWN,
  'ew-resize': CursorType.RESIZE_LEFT_RIGHT,
  'ns-resize': CursorType.RESIZE_UP_DOWN,
  'ne-resize': CursorType.RESIZE_RIGHT,
  'nw-resize': CursorType.RESIZE_LEFT,
  'se-resize': CursorType.RESIZE_RIGHT,
  'sw-resize': CursorType.RESIZE_LEFT,
  'nesw-resize': CursorType.RESIZE_LEFT_RIGHT,
  'nwse-resize': CursorType.RESIZE_LEFT_RIGHT,
  'col-resize': CursorType.RESIZE_LEFT_RIGHT,
  'row-resize': CursorType.RESIZE_UP_DOWN,
  'all-scroll': CursorType.OPEN_HAND,
  'zoom-in': CursorType.CROSSHAIR,
  'zoom-out': CursorType.CROSSHAIR
}

/**
 * Cursor dimensions for proper aspect ratio
 */
export interface CursorDimension {
  width: number
  height: number
}

/**
 * Cursor hotspot configurations (where the "click point" is)
 * Values are ratios (0-1) of the cursor's rendered dimensions
 * This ensures they scale properly with any cursor size
 */
export interface CursorHotspot {
  x: number  // Ratio of width (0-1)
  y: number  // Ratio of height (0-1)
}

/**
 * Define dimensions for each cursor type (base size in pixels)
 */
export const CURSOR_DIMENSIONS: Record<CursorType, CursorDimension> = {
  [CursorType.ARROW]: { width: 24, height: 32 },
  [CursorType.IBEAM]: { width: 16, height: 32 },
  [CursorType.POINTING_HAND]: { width: 28, height: 28 },
  [CursorType.CLOSED_HAND]: { width: 28, height: 28 },
  [CursorType.OPEN_HAND]: { width: 32, height: 32 },
  [CursorType.CROSSHAIR]: { width: 24, height: 24 },
  [CursorType.RESIZE_LEFT]: { width: 24, height: 24 },
  [CursorType.RESIZE_RIGHT]: { width: 24, height: 24 },
  [CursorType.RESIZE_UP]: { width: 24, height: 24 },
  [CursorType.RESIZE_DOWN]: { width: 24, height: 24 },
  [CursorType.RESIZE_LEFT_RIGHT]: { width: 32, height: 24 },
  [CursorType.RESIZE_UP_DOWN]: { width: 24, height: 32 },
  [CursorType.CONTEXTUAL_MENU]: { width: 24, height: 32 },
  [CursorType.DISAPPEARING_ITEM]: { width: 24, height: 32 },
  [CursorType.DRAG_COPY]: { width: 24, height: 32 },
  [CursorType.DRAG_LINK]: { width: 24, height: 32 },
  [CursorType.OPERATION_NOT_ALLOWED]: { width: 28, height: 28 },
  [CursorType.IBEAM_VERTICAL]: { width: 32, height: 16 }
}

/**
 * Define hotspots for each cursor type as ratios of the cursor dimensions
 * These ratios work at any scale since they're proportional
 */
export const CURSOR_HOTSPOTS: Record<CursorType, CursorHotspot> = {
  [CursorType.ARROW]: { x: 0.15, y: 0.12 }, // Arrow tip position fine-tuned
  [CursorType.IBEAM]: { x: 0.5, y: 0.5 }, // Center of I-beam
  [CursorType.POINTING_HAND]: { x: 0.64, y: 0.18 }, // Finger tip position
  [CursorType.CLOSED_HAND]: { x: 0.5, y: 0.34 }, // Click point sits above center
  [CursorType.OPEN_HAND]: { x: 0.5, y: 0.34 }, // Click point sits above center
  [CursorType.CROSSHAIR]: { x: 0.5, y: 0.5 }, // Center intersection
  [CursorType.RESIZE_LEFT]: { x: 0.5, y: 0.5 }, // Center
  [CursorType.RESIZE_RIGHT]: { x: 0.5, y: 0.5 }, // Center
  [CursorType.RESIZE_UP]: { x: 0.5, y: 0.5 }, // Center
  [CursorType.RESIZE_DOWN]: { x: 0.5, y: 0.5 }, // Center
  [CursorType.RESIZE_LEFT_RIGHT]: { x: 0.5, y: 0.5 }, // Center
  [CursorType.RESIZE_UP_DOWN]: { x: 0.5, y: 0.5 }, // Center
  [CursorType.CONTEXTUAL_MENU]: { x: 0.25, y: 0.175 }, // Arrow tip
  [CursorType.DISAPPEARING_ITEM]: { x: 0.5, y: 0.5 }, // Center
  [CursorType.DRAG_COPY]: { x: 0.25, y: 0.175 }, // Arrow tip
  [CursorType.DRAG_LINK]: { x: 0.25, y: 0.19 }, // Arrow tip
  [CursorType.OPERATION_NOT_ALLOWED]: { x: 0.5, y: 0.5 }, // Center
  [CursorType.IBEAM_VERTICAL]: { x: 0.5, y: 0.5 } // Center
}

/**
 * Get cursor image path for a given cursor type
 */
export function getCursorImagePath(cursorType: CursorType): string {
  const { isRendering } = getRemotionEnvironment();
  
  // During Remotion export: Use staticFile to access bundled assets
  if (isRendering) {
    return staticFile(`cursors/${cursorType}.png`);
  }
  
  // During Electron preview: Use our custom protocol
  if (typeof window !== 'undefined' && window.electronAPI) {
    return `video-stream://assets/cursors/${cursorType}.png`;
  }
  
  // Fallback for development or tests
  return `/cursors/${cursorType}.png`;
}

/**
 * Convert Electron cursor type to custom cursor type
 */
export function electronToCustomCursor(electronType: string): CursorType {
  return ELECTRON_TO_CUSTOM_CURSOR[electronType] || CursorType.ARROW
}