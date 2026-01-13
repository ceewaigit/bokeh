/**
 * Path validation utilities for safe file operations.
 * Prevents path traversal attacks and ensures paths are within allowed directories.
 */

import * as path from 'path'

/**
 * Check if a candidate path is safely within a base directory.
 * Prevents path traversal attacks by ensuring:
 * 1. The relative path doesn't start with '..'
 * 2. The relative path is not absolute
 * 3. A valid relative path exists
 *
 * @param candidate - The path to validate
 * @param base - The base directory the path must be within
 * @returns true if candidate is safely within base, false otherwise
 */
export function isPathWithin(candidate: string, base: string): boolean {
  const rel = path.relative(base, candidate)
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel)
}
