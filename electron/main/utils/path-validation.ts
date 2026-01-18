/**
 * Path validation utilities for safe file operations.
 * Prevents path traversal attacks and ensures paths are within allowed directories.
 */

import * as path from 'path'
import * as fsSync from 'fs'

/**
 * Safely resolve a path, handling symlinks and non-existent paths.
 * On macOS, /var is a symlink to /private/var. When checking if a file is within
 * the temp directory, we need to resolve symlinks consistently even for non-existent files.
 * This walks up the directory tree to find an existing parent and resolves symlinks from there.
 */
function safeResolve(p: string): string {
  const normalized = path.resolve(p)
  try {
    return fsSync.realpathSync(normalized)
  } catch {
    // File doesn't exist - resolve symlinks on existing parent directories
    // This handles cases like /var/folders/... where /var -> /private/var
    let current = normalized
    while (current !== path.dirname(current)) {
      current = path.dirname(current)
      try {
        const resolvedParent = fsSync.realpathSync(current)
        const relativePart = path.relative(current, normalized)
        return path.join(resolvedParent, relativePart)
      } catch {
        continue
      }
    }
    return normalized
  }
}

/**
 * Check if a candidate path is safely within a base directory.
 * Prevents path traversal attacks by ensuring:
 * 1. Symlinks are resolved to prevent symlink-based attacks
 * 2. The relative path doesn't start with '..'
 * 3. The relative path is not absolute
 * 4. A valid relative path exists
 *
 * @param candidate - The path to validate
 * @param base - The base directory the path must be within
 * @returns true if candidate is safely within base, false otherwise
 */
export function isPathWithin(candidate: string, base: string): boolean {
  // Resolve symlinks to prevent symlink-based path traversal
  const realCandidate = safeResolve(candidate)
  const realBase = safeResolve(base)

  const rel = path.relative(realBase, realCandidate)
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * Check if a candidate path is within any of the allowed directories.
 * @param candidate - The path to validate
 * @param allowedDirs - Array of allowed base directories
 * @returns true if candidate is within any allowed directory
 */
export function isPathWithinAny(candidate: string, allowedDirs: string[]): boolean {
  return allowedDirs.some(dir => isPathWithin(candidate, dir))
}
