/**
 * FFmpeg binary resolver using @ffmpeg-installer/ffmpeg
 * Uses bundled static FFmpeg binary that works reliably across all environments
 */

import path from 'path';
import { app } from 'electron';
import fs from 'fs';

/**
 * Resolves the FFmpeg binary path for the current platform.
 * We require @ffmpeg-installer/ffmpeg to avoid broad fallbacks masking issues.
 */
export function resolveFfmpegPath(): string {
  // Use @ffmpeg-installer/ffmpeg (reliable, static binary)
  try {
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    if (fs.existsSync(ffmpegPath)) {
      console.log(`[FFmpeg Resolver] Using @ffmpeg-installer binary: ${ffmpegPath}`);
      return ffmpegPath;
    }
  } catch (error) {
    // fall through to error below
  }

  throw new Error('FFmpeg not found. Ensure @ffmpeg-installer/ffmpeg is installed and bundled.');
}

/**
 * Resolves the FFprobe binary path for the current platform.
 * Uses @ffprobe-installer/ffprobe for reliable static binary.
 */
export function resolveFfprobePath(): string {
  // Use @ffprobe-installer/ffprobe (reliable, static binary)
  try {
    const ffprobePath = require('@ffprobe-installer/ffprobe').path;
    if (fs.existsSync(ffprobePath)) {
      console.log(`[FFmpeg Resolver] Using @ffprobe-installer binary: ${ffprobePath}`);
      return ffprobePath;
    }
  } catch (error) {
    // fall through to error below
  }

  throw new Error('FFprobe not found. Ensure @ffprobe-installer/ffprobe is installed and bundled.');
}

/**
 * Gets the compositor directory for Remotion's binariesDirectory option
 * Returns null in development to let Remotion auto-detect
 */
export function getCompositorDirectory(): string | null {
  if (!app.isPackaged) {
    // Development: Let Remotion auto-detect from node_modules
    return null;
  }

  // Production: Point to unpacked ASAR location
  const platform = process.platform;
  const arch = process.arch;

  let compositorName = '';
  if (platform === 'darwin') {
    compositorName = arch === 'arm64'
      ? '@remotion/compositor-darwin-arm64'
      : '@remotion/compositor-darwin-x64';
  } else if (platform === 'win32') {
    compositorName = '@remotion/compositor-win32-x64';
  } else if (platform === 'linux') {
    compositorName = arch === 'arm64'
      ? '@remotion/compositor-linux-arm64'
      : '@remotion/compositor-linux-x64';
  }

  const compositorPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    compositorName
  );

  if (fs.existsSync(compositorPath)) {
    console.log(`[FFmpeg Resolver] Compositor directory: ${compositorPath}`);
    return compositorPath;
  }

  console.warn(`[FFmpeg Resolver] Compositor not found at: ${compositorPath}, using auto-detect`);
  return null;
}
