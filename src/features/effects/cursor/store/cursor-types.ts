/**
 * Cursor type definitions and mappings for custom cursor rendering
 */

import { staticFile, getRemotionEnvironment } from 'remotion';
import { CursorTheme } from '@/types/project';

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
 * Default (macOS) cursor dimensions (base size in pixels)
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
 * Tahoe cursor dimensions - all cursors are 32x32 base (scaled from 128x128 source)
 */
const TAHOE_CURSOR_DIMENSIONS: Partial<Record<CursorType, CursorDimension>> = {
  [CursorType.ARROW]: { width: 32, height: 32 },
  [CursorType.IBEAM]: { width: 32, height: 32 },
  [CursorType.POINTING_HAND]: { width: 32, height: 32 },
  [CursorType.OPEN_HAND]: { width: 32, height: 32 },
  [CursorType.CROSSHAIR]: { width: 32, height: 32 },
  [CursorType.RESIZE_LEFT_RIGHT]: { width: 32, height: 32 },
  [CursorType.RESIZE_UP_DOWN]: { width: 32, height: 32 },
  [CursorType.OPERATION_NOT_ALLOWED]: { width: 32, height: 32 }
}

/**
 * Default (macOS) hotspots as ratios (0-1)
 */
export const CURSOR_HOTSPOTS: Record<CursorType, CursorHotspot> = {
  [CursorType.ARROW]: { x: 0.15, y: 0.12 },
  [CursorType.IBEAM]: { x: 0.5, y: 0.5 },
  [CursorType.POINTING_HAND]: { x: 0.64, y: 0.18 },
  [CursorType.CLOSED_HAND]: { x: 0.5, y: 0.34 },
  [CursorType.OPEN_HAND]: { x: 0.5, y: 0.34 },
  [CursorType.CROSSHAIR]: { x: 0.5, y: 0.5 },
  [CursorType.RESIZE_LEFT]: { x: 0.5, y: 0.5 },
  [CursorType.RESIZE_RIGHT]: { x: 0.5, y: 0.5 },
  [CursorType.RESIZE_UP]: { x: 0.5, y: 0.5 },
  [CursorType.RESIZE_DOWN]: { x: 0.5, y: 0.5 },
  [CursorType.RESIZE_LEFT_RIGHT]: { x: 0.5, y: 0.5 },
  [CursorType.RESIZE_UP_DOWN]: { x: 0.5, y: 0.5 },
  [CursorType.CONTEXTUAL_MENU]: { x: 0.25, y: 0.175 },
  [CursorType.DISAPPEARING_ITEM]: { x: 0.5, y: 0.5 },
  [CursorType.DRAG_COPY]: { x: 0.25, y: 0.175 },
  [CursorType.DRAG_LINK]: { x: 0.25, y: 0.19 },
  [CursorType.OPERATION_NOT_ALLOWED]: { x: 0.5, y: 0.5 },
  [CursorType.IBEAM_VERTICAL]: { x: 0.5, y: 0.5 }
}

/**
 * Tahoe hotspots as ratios (extracted from .cur files)
 */
const TAHOE_CURSOR_HOTSPOTS: Partial<Record<CursorType, CursorHotspot>> = {
  [CursorType.ARROW]: { x: 2/128, y: 3/128 },           // hotspot (2,3)
  [CursorType.IBEAM]: { x: 65/128, y: 62/128 },         // hotspot (65,62)
  [CursorType.POINTING_HAND]: { x: 22/128, y: 3/128 },  // hotspot (22,3)
  [CursorType.OPEN_HAND]: { x: 38/128, y: 38/128 },     // hotspot (38,38)
  [CursorType.CROSSHAIR]: { x: 65/128, y: 65/128 },     // hotspot (65,65)
  [CursorType.RESIZE_LEFT_RIGHT]: { x: 30/128, y: 47/128 }, // hotspot (30,47)
  [CursorType.RESIZE_UP_DOWN]: { x: 47/128, y: 33/128 },    // hotspot (47,33)
  [CursorType.OPERATION_NOT_ALLOWED]: { x: 2/128, y: 2/128 } // hotspot (2,2)
}

/**
 * Get cursor dimensions for a specific theme
 */
export function getCursorDimensions(cursorType: CursorType, theme: CursorTheme = CursorTheme.Default): CursorDimension {
  if (theme === CursorTheme.Tahoe || theme === CursorTheme.TahoeNoTail) {
    return TAHOE_CURSOR_DIMENSIONS[cursorType] ?? CURSOR_DIMENSIONS[cursorType];
  }
  return CURSOR_DIMENSIONS[cursorType];
}

/**
 * Get cursor hotspot for a specific theme
 */
export function getCursorHotspot(cursorType: CursorType, theme: CursorTheme = CursorTheme.Default): CursorHotspot {
  if (theme === CursorTheme.Tahoe || theme === CursorTheme.TahoeNoTail) {
    return TAHOE_CURSOR_HOTSPOTS[cursorType] ?? CURSOR_HOTSPOTS[cursorType];
  }
  return CURSOR_HOTSPOTS[cursorType];
}

/** Default cursor theme */
export const DEFAULT_CURSOR_THEME = CursorTheme.Default;

/** Cursors available in Tahoe themes */
const TAHOE_AVAILABLE_CURSORS: Set<CursorType> = new Set([
  CursorType.ARROW,
  CursorType.IBEAM,
  CursorType.CROSSHAIR,
  CursorType.RESIZE_LEFT_RIGHT,
  CursorType.RESIZE_UP_DOWN,
  CursorType.POINTING_HAND,
  CursorType.OPEN_HAND,
  CursorType.OPERATION_NOT_ALLOWED
]);

/**
 * Determine which theme to use for a cursor type.
 * Falls back to Default theme if the type is not available in the requested theme.
 */
function getEffectiveTheme(cursorType: CursorType, requestedTheme: CursorTheme): CursorTheme {
  if (requestedTheme === CursorTheme.Default) {
    return CursorTheme.Default;
  }

  // Both Tahoe themes use the same available cursors
  if ((requestedTheme === CursorTheme.Tahoe || requestedTheme === CursorTheme.TahoeNoTail)
      && TAHOE_AVAILABLE_CURSORS.has(cursorType)) {
    return requestedTheme;
  }

  // Fall back to Default for unsupported cursor types
  return CursorTheme.Default;
}

/**
 * Get cursor image path for a given cursor type and theme.
 * Falls back to Default theme if cursor type is not available in requested theme.
 */
export function getCursorImagePath(
  cursorType: CursorType,
  theme: CursorTheme = DEFAULT_CURSOR_THEME
): string {
  const { isRendering } = getRemotionEnvironment();
  const effectiveTheme = getEffectiveTheme(cursorType, theme);

  // During Remotion export: Use staticFile to access bundled assets
  if (isRendering) {
    return staticFile(`cursors/${effectiveTheme}/${cursorType}.png`);
  }

  // During Electron preview: Use our custom protocol
  if (typeof window !== 'undefined' && window.electronAPI) {
    return `video-stream://assets/cursors/${effectiveTheme}/${cursorType}.png`;
  }

  // Fallback for development or tests
  return `/cursors/${effectiveTheme}/${cursorType}.png`;
}

/**
 * Convert Electron cursor type to custom cursor type
 */
export function electronToCustomCursor(electronType: string): CursorType {
  return ELECTRON_TO_CUSTOM_CURSOR[electronType] || CursorType.ARROW
}