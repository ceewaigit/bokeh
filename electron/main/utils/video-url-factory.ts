/**
 * Unified video URL factory
 * Provides consistent URL generation for preview and export
 */

import { getVideoServer } from '../services/video-http-server'

export type VideoTarget = 'preview' | 'export'

/**
 * Create a video URL for the specified target environment
 * 
 * @param absPath - Path to the video file (can be absolute or contain protocol)
 * @param target - Target environment (preview uses custom protocol, export uses HTTP)
 * @returns URL that can be used in video elements
 */
export async function makeVideoSrc(absPath: string, target: VideoTarget): Promise<string> {
  // Clean the path - remove any existing protocol
  let cleanPath = absPath.replace(/^(file|video-stream):\/+/, '')
  
  // Remove 'local/' prefix if present  
  if (cleanPath.startsWith('local/')) {
    cleanPath = cleanPath.slice(6)
  }
  
  // Decode if encoded
  try {
    cleanPath = decodeURIComponent(cleanPath)
  } catch {
    // Use as-is if decode fails
  }

  if (target === 'preview') {
    // For Electron preview, use custom video-stream:// protocol
    const encodedPath = encodeURIComponent(cleanPath)
    return `video-stream://local/${encodedPath}`
  }

  // For export, use HTTP server
  const server = await getVideoServer()
  if (!server) {
    throw new Error('Failed to start video HTTP server')
  }
  return server.registerFile(cleanPath, 30 * 60 * 1000) // 30 minute TTL for exports
}

/**
 * Create a metadata URL for the specified target environment
 *
 * @param absPath - Path to the metadata JSON file
 * @param target - Target environment (preview uses local path, export uses HTTP)
 * @returns URL or path that can be used to fetch metadata
 */
export async function makeMetadataSrc(absPath: string, target: VideoTarget): Promise<string> {
  // Clean the path - remove any existing protocol
  let cleanPath = absPath.replace(/^file:\/+/, '')

  // Decode if encoded
  try {
    cleanPath = decodeURIComponent(cleanPath)
  } catch {
    // Use as-is if decode fails
  }

  if (target === 'preview') {
    // For preview, return local file path (loaded via electronAPI.readLocalFile)
    return cleanPath
  }

  // For export, use HTTP server with metadata type
  const server = await getVideoServer()
  if (!server) {
    throw new Error('Failed to start video HTTP server')
  }
  return server.registerFile(cleanPath, 30 * 60 * 1000, 'metadata') // 30 minute TTL
}
