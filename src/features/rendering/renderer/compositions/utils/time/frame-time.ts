/**
 * Frame-Time Conversion Utilities
 *
 * Centralized utilities for converting between frames and milliseconds.
 * Eliminates duplicated `(frame / fps) * 1000` patterns across the codebase.
 */

/**
 * Convert a frame number to milliseconds
 * @param frame - The frame number
 * @param fps - Frames per second
 * @returns Time in milliseconds
 */
export const frameToMs = (frame: number, fps: number): number => {
  return (frame / fps) * 1000;
};

/**
 * Convert milliseconds to a frame number (rounded)
 * @param ms - Time in milliseconds
 * @param fps - Frames per second
 * @returns Frame number (rounded to nearest integer)
 */
export const msToFrame = (ms: number, fps: number): number => {
  return Math.round((ms / 1000) * fps);
};

/**
 * Convert milliseconds to a frame number (floored)
 * Use this when you need the frame that contains the given time
 * @param ms - Time in milliseconds
 * @param fps - Frames per second
 * @returns Frame number (floored)
 */
export const msToFrameFloor = (ms: number, fps: number): number => {
  return Math.floor((ms / 1000) * fps);
};

/**
 * Convert milliseconds to a frame number (ceiled)
 * Use this when you need the first frame index *after* the given time,
 * e.g. to compute an exclusive `endFrame` that fully covers a time range.
 * @param ms - Time in milliseconds
 * @param fps - Frames per second
 * @returns Frame number (ceiled)
 */
export const msToFrameCeil = (ms: number, fps: number): number => {
  return Math.ceil((ms / 1000) * fps);
};

/**
 * Get the duration of a single frame in milliseconds
 * @param fps - Frames per second
 * @returns Duration of one frame in milliseconds
 */
export const frameDurationMs = (fps: number): number => {
  return 1000 / fps;
};
