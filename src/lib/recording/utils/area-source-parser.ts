/**
 * Utilities for parsing and creating area source IDs.
 * Area source IDs use the format: "area:x,y,width,height[,displayId]"
 */

export interface AreaBounds {
  x: number
  y: number
  width: number
  height: number
  displayId?: number
}

/**
 * Parses an area source ID string into bounds object.
 * @param sourceId - Source ID in format "area:x,y,width,height[,displayId]"
 * @returns AreaBounds if valid, null otherwise
 */
export function parseAreaSourceId(sourceId: string): AreaBounds | null {
  if (!sourceId || !sourceId.startsWith('area:')) {
    return null
  }

  const parts = sourceId.slice(5).split(',').map(Number)

  if (parts.length < 4 || parts.slice(0, 4).some(isNaN)) {
    return null
  }

  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
    displayId: parts.length > 4 && !isNaN(parts[4]) ? parts[4] : undefined
  }
}

/**
 * Creates an area source ID string from bounds object.
 * @param bounds - The area bounds to encode
 * @returns Source ID string in format "area:x,y,width,height[,displayId]"
 */
export function createAreaSourceId(bounds: AreaBounds): string {
  const base = `area:${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
  return bounds.displayId !== undefined ? `${base},${bounds.displayId}` : base
}

/**
 * Checks if a source ID represents an area selection.
 * @param sourceId - The source ID to check
 */
export function isAreaSource(sourceId: string | undefined | null): boolean {
  return typeof sourceId === 'string' && sourceId.startsWith('area:')
}

/**
 * Checks if a source ID represents a window.
 * @param sourceId - The source ID to check
 */
export function isWindowSource(sourceId: string | undefined | null): boolean {
  return typeof sourceId === 'string' && sourceId.startsWith('window:')
}

/**
 * Checks if a source ID represents a screen/display.
 * @param sourceId - The source ID to check
 */
export function isScreenSource(sourceId: string | undefined | null): boolean {
  return typeof sourceId === 'string' && sourceId.startsWith('screen:')
}

/**
 * Extracts the display ID from a screen source ID.
 * @param sourceId - Source ID in format "screen:displayId:0"
 * @returns Display ID or 0 if not found
 */
export function parseScreenDisplayId(sourceId: string): number {
  if (!isScreenSource(sourceId)) return 0
  const match = sourceId.match(/screen:(\d+):/)
  return match ? parseInt(match[1]) : 0
}

/**
 * Extracts the window ID from a window source ID.
 * @param sourceId - Source ID in format "window:windowId:0"
 * @returns Window ID or 0 if not found
 */
export function parseWindowId(sourceId: string): number {
  if (!isWindowSource(sourceId)) return 0
  const match = sourceId.match(/window:(\d+):/)
  return match ? parseInt(match[1]) : 0
}
