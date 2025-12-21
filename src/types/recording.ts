/**
 * Recording-related type definitions
 */

import { RecordingSourceType } from './project'

export interface ElectronMetadata {
  timestamp: number
  mouseX?: number  // Optional for keyboard events, in physical pixels
  mouseY?: number  // Optional for keyboard events, in physical pixels
  eventType: 'mouse' | 'click' | 'keypress' | 'scroll'
  key?: string
  modifiers?: string[]
  keyEventType?: 'keydown' | 'keyup'
  velocity?: { x: number; y: number }
  scrollDelta?: { x: number; y: number }
  captureWidth?: number   // Physical pixels - capture area dimensions
  captureHeight?: number  // Physical pixels - capture area dimensions
  screenWidth?: number    // Physical pixels - full screen dimensions (for zoom coordinate normalization)
  screenHeight?: number   // Physical pixels - full screen dimensions (for zoom coordinate normalization)
  scaleFactor?: number
  cursorType?: string
  sourceBounds?: { x: number; y: number; width: number; height: number }
  sourceType?: RecordingSourceType
  // Debugging fields - logical coordinates before scaling
  logicalX?: number
  logicalY?: number
}

export interface ElectronRecordingResult {
  videoPath: string  // File path from streaming
  duration: number
  metadata: ElectronMetadata[]
  hasAudio?: boolean
  captureArea?: {
    fullBounds: { x: number; y: number; width: number; height: number }
    workArea: { x: number; y: number; width: number; height: number }
    scaleFactor: number
    sourceType?: RecordingSourceType
    sourceId?: string
  }
}

export interface RecordingSource {
  id: string
  name: string
  type: RecordingSourceType
  thumbnail?: string
  bounds?: { x: number; y: number; width: number; height: number }
}