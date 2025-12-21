/**
 * Unified speed-up detection types
 * Supports typing, idle, and future detection types through a common abstraction
 */

export enum SpeedUpType {
  Typing = 'typing',
  Idle = 'idle'
}

/**
 * Unified period for any speed-up detection
 * Works with SpeedUpApplicationService for all speed-up types
 */
export interface SpeedUpPeriod {
  type: SpeedUpType
  startTime: number           // Source timestamp (ms)
  endTime: number             // Source timestamp (ms)
  suggestedSpeedMultiplier: number
  confidence: number          // 0-1

  // Type-specific metadata
  metadata?: SpeedUpMetadata
}

export interface SpeedUpMetadata {
  // Typing-specific
  keyCount?: number
  averageWpm?: number

  // Idle-specific
  idleDurationMs?: number
}

export interface SpeedUpSuggestions {
  periods: SpeedUpPeriod[]
  overallSuggestion?: {
    speedMultiplier: number
    timeSavedMs: number
  }
}

/**
 * Configuration for idle detection
 */
export interface IdleDetectorConfig {
  minIdleDurationMs: number        // Default: 5000 (5 seconds)
  mouseVelocityThreshold: number   // Pixels per second to consider "activity"
  defaultSpeedMultiplier: number   // Default: 2.5x
  maxSpeedMultiplier: number       // Default: 3.0x
}

export const DEFAULT_IDLE_CONFIG: IdleDetectorConfig = {
  minIdleDurationMs: 5000,
  mouseVelocityThreshold: 5,    // 5 pixels/second = essentially stationary
  defaultSpeedMultiplier: 2.5,
  maxSpeedMultiplier: 3.0
}
