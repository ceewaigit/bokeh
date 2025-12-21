/**
 * Export type definitions
 */

import type { ExportFormat, QualityLevel } from './project'

export interface ExportSettings {
  format: ExportFormat
  quality: QualityLevel
  resolution: {
    width: number
    height: number
  }
  framerate: number
  outputPath?: string

  // Advanced settings
  bitrate?: number
  codec?: string
  keyframeInterval?: number

  // Effect settings
  includeEffects?: boolean
  includeCursor?: boolean
  includeKeystrokes?: boolean
  includeAnnotations?: boolean
  enhanceAudio?: boolean

  // Performance settings are dynamically calculated in export-handler.ts based on quality level and system resources
  useHardwareAcceleration?: boolean
}