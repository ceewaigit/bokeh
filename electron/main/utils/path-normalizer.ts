/**
 * Minimal path normalization utilities
 * Only what's actually needed for video file resolution
 */

import * as path from 'path'

/**
 * Normalize a path to work on current platform
 */
export function normalizeCrossPlatform(inputPath: string): string {
  if (!inputPath) return ''
  
  let normalized = inputPath
  
  // Remove any URL protocols
  normalized = normalized.replace(/^(file|video-stream):\/+/, '')
  
  // Remove 'local/' prefix if present
  if (normalized.startsWith('local/')) {
    normalized = normalized.slice(6)
  }
  
  // Handle URL encoding
  try {
    normalized = decodeURIComponent(normalized)
  } catch {
    // Use as-is if decode fails
  }
  
  // Platform-specific handling
  if (process.platform === 'win32') {
    // Windows: Convert forward slashes to backslashes
    normalized = normalized.replace(/\//g, '\\')
    // Fix drive letters
    if (normalized.match(/^[a-z]:/)) {
      normalized = normalized[0].toUpperCase() + normalized.slice(1)
    }
  } else {
    // Unix: Ensure forward slashes
    normalized = normalized.replace(/\\/g, '/')
    // Add leading slash if it looks like absolute path
    if (!normalized.startsWith('/') && normalized.match(/^(Users|home|var|tmp|opt)/i)) {
      normalized = '/' + normalized
    }
  }
  
  return path.normalize(normalized)
}

// findVideoFile removed; resolution now happens in IPC/protocol handlers
// to avoid broad filesystem fallbacks masking path bugs.
