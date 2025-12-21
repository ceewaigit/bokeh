/**
 * Export chunk planning
 * Determines optimal chunk sizes and builds chunk plans for parallel rendering
 */

import type { MachineProfile } from '../../utils/machine-profiler'
import type { ChunkPlanEntry } from './types'

/**
 * Determine optimal chunk size based on available memory
 * @param profile - Machine profile with memory info
 * @returns Optimal chunk size in frames
 */
export function getOptimalChunkSize(profile: MachineProfile): number {
  const availableGB = profile.availableMemoryGB || 2

  // Even with low memory, use larger chunks to reduce overhead
  // The bottleneck is worker count, not chunk size
  if (availableGB < 1) {
    return 1000 // Low memory: still use 1000 frames to reduce overhead
  } else if (availableGB < 4) {
    return 1500 // Medium memory
  } else if (availableGB < 8) {
    return 2000 // Good memory
  } else {
    return 2500 // High memory: larger chunks for best performance
  }
}

/**
 * Build a chunk plan for the given total frames
 * @param totalFrames - Total number of frames to render
 * @param chunkSize - Size of each chunk in frames
 * @param fps - Frames per second
 * @returns Array of chunk plan entries
 */
export function buildChunkPlan(
  totalFrames: number,
  chunkSize: number,
  fps: number
): ChunkPlanEntry[] {
  if (totalFrames <= 0) {
    return []
  }

  const numChunks = Math.ceil(totalFrames / chunkSize)
  const plan: ChunkPlanEntry[] = []

  for (let index = 0; index < numChunks; index++) {
    const startFrame = index * chunkSize
    const endFrame = Math.min(startFrame + chunkSize - 1, totalFrames - 1)
    const startTimeMs = (startFrame / fps) * 1000
    const endTimeMs = ((endFrame + 1) / fps) * 1000

    plan.push({
      index,
      startFrame,
      endFrame,
      startTimeMs,
      endTimeMs
    })
  }

  return plan
}

/**
 * Calculate chunk size based on video duration for stability
 * Prefers single-pass rendering for shorter videos to avoid memory issues
 * @param totalFrames - Total number of frames
 * @param durationSeconds - Video duration in seconds
 * @returns Optimal chunk size for the video
 */
export function calculateStableChunkSize(
  totalFrames: number,
  durationSeconds: number
): number {
  // Updated balance:
  // - Very short exports stay single-pass to avoid Chromium churn.
  // - Longer exports are chunked to keep memory stable and unlock parallelism.
  //
  // Chunking in a single worker is safe; parallel workers are still gated by allocator.

  if (durationSeconds < 45 || totalFrames <= 1800) {
    console.log(`Video (${durationSeconds.toFixed(1)}s) short, using single-pass rendering`)
    return totalFrames
  }

  if (durationSeconds < 180) {
    // ~45s–3min: 2–3 chunks
    const chunks = durationSeconds < 90 ? 2 : 3
    console.log(`Video (${durationSeconds.toFixed(1)}s) medium, using ${chunks}-chunk rendering`)
    return Math.ceil(totalFrames / chunks)
  }

  if (durationSeconds < 600) {
    // 3–10min: aim for ~30–45s chunks
    const targetChunkSeconds = 40
    const fps = totalFrames / durationSeconds
    const targetChunkFrames = Math.max(1200, Math.round(targetChunkSeconds * fps))
    const chunkSize = Math.min(totalFrames, targetChunkFrames)
    console.log(`Video (${durationSeconds.toFixed(1)}s) long, using chunkSize=${chunkSize} frames`)
    return chunkSize
  }

  // >10min: slightly larger chunks to reduce overhead
  const targetChunkSeconds = 60
  const fps = totalFrames / durationSeconds
  const targetChunkFrames = Math.max(1800, Math.round(targetChunkSeconds * fps))
  const chunkSize = Math.min(totalFrames, targetChunkFrames)
  console.log(`Video (${durationSeconds.toFixed(1)}s) very long, using chunkSize=${chunkSize} frames`)
  return chunkSize
}

/**
 * Calculate the video size estimate for smart chunking decisions
 * @param durationSeconds - Video duration in seconds
 * @returns Estimated video size in GB
 */
export function estimateVideoSizeGB(durationSeconds: number): number {
  // Rough estimate: 50MB per minute
  return (durationSeconds / 60) * 0.05
}
