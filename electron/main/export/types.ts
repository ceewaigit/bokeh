/**
 * Shared types for export module
 */

import type { MachineProfile } from '../utils/machine-profiler'
import type { X264Preset } from '@remotion/renderer'

// Bundle cache management
export interface BundleCache {
  location: string
  timestamp: number
  sourceHash?: string
}

// Chunk planning types
export interface ChunkPlanEntry {
  index: number
  startFrame: number
  endFrame: number
  startTimeMs: number
  endTimeMs: number
}

// Chunk result from worker
export interface ChunkResult {
  index: number
  path: string
  success: boolean
  error?: string
}

// Progress data from worker
export interface ProgressData {
  chunkIndex?: number
  chunkTotalFrames?: number
  chunkRenderedFrames?: number
  progress?: number
  stage?: 'rendering' | 'encoding' | 'finalizing' | 'complete'
  message?: string
}

// Aggregated progress for UI
export interface AggregatedProgress {
  progress: number
  stage: string
  message: string
  currentFrame?: number
  totalFrames?: number
  fps?: number
  etaSeconds?: number
}

// Common job configuration passed to workers
export interface ExportJobConfig {
  bundleLocation: string
  compositionMetadata: CompositionMetadata
  inputProps: Record<string, any>
  outputPath: string
  settings: ExportSettings
  offthreadVideoCacheSizeInBytes: number
  jpegQuality: number
  videoBitrate: string
  x264Preset: X264Preset
  useGPU: boolean
  concurrency: number
  ffmpegPath: string
  compositorDir: string | null
  chunkSizeFrames: number
  preFilteredMetadata?: Map<number, Map<string, any>> | Record<number, Record<string, any>>
  totalFrames: number
  totalChunks: number
}

// Composition metadata from Remotion
export interface CompositionMetadata {
  width: number
  height: number
  fps: number
  durationInFrames: number
  id: string
  defaultProps?: Record<string, any>
}

// Export settings from UI
export interface ExportSettings {
  quality?: 'ultra' | 'high' | 'medium' | 'low'
  resolution?: { width: number; height: number }
  framerate?: number
  format?: string
}

// Worker allocation result
export interface WorkerAllocation {
  workerCount: number
  concurrency: number
  useParallel: boolean
  memoryPerWorkerMB: number
  timeoutMs: number
}

// Export context combining machine profile and settings
export interface ExportContext {
  machineProfile: MachineProfile
  effectiveMemoryGB: number
  settings: ExportSettings
  totalDurationInFrames: number
  fps: number
}
