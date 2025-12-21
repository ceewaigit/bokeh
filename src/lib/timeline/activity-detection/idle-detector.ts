/**
 * Idle Activity Detector
 * Detects periods of inactivity (no mouse movement, no keyboard, no audio) for speed-up
 */

import type { Recording, RecordingMetadata, MouseEvent as RecordingMouseEvent, KeyboardEvent } from '@/types/project'
import type { SpeedUpPeriod, SpeedUpSuggestions, IdleDetectorConfig } from '@/types/speed-up'
import { SpeedUpType, DEFAULT_IDLE_CONFIG } from '@/types/speed-up'
import type { ActivityDetector } from './index'
import { calculateOverallSuggestion } from './index'

interface ActivityEvent {
  timestamp: number
  type: 'mouse' | 'keyboard'
  intensity: number // velocity for mouse, 1 for keyboard
}

/**
 * Idle Activity Detector - implements ActivityDetector interface
 * Detects periods with no meaningful activity for speed-up suggestions
 */
export class IdleActivityDetector implements ActivityDetector {
  readonly type = SpeedUpType.Idle

  constructor(private config: IdleDetectorConfig = DEFAULT_IDLE_CONFIG) { }

  /**
   * Analyze recording to detect idle periods
   */
  analyze(recording: Recording, metadata?: RecordingMetadata): SpeedUpSuggestions {
    const effectiveMetadata = metadata ?? recording.metadata
    // Check if we have cached results
    if (effectiveMetadata?.detectedIdlePeriods) {
      const periods: SpeedUpPeriod[] = effectiveMetadata.detectedIdlePeriods.map(p => ({
        type: SpeedUpType.Idle,
        startTime: p.startTime,
        endTime: p.endTime,
        suggestedSpeedMultiplier: p.suggestedSpeedMultiplier,
        confidence: p.confidence,
        metadata: {
          idleDurationMs: p.endTime - p.startTime
        }
      }))

      return {
        periods,
        overallSuggestion: calculateOverallSuggestion(periods)
      }
    }

    return this.analyzeWithConfig(recording, this.config, effectiveMetadata)
  }

  /**
   * Analyze recording with custom config (bypasses cache)
   * Used when user changes detection parameters
   */
  analyzeWithConfig(
    recording: Recording,
    customConfig: IdleDetectorConfig,
    metadata?: RecordingMetadata
  ): SpeedUpSuggestions {
    const effectiveMetadata = metadata ?? recording.metadata
    const mouseEvents = effectiveMetadata?.mouseEvents || []
    const keyboardEvents = effectiveMetadata?.keyboardEvents || []
    const recordingDuration = recording.duration

    // If recording has no metadata events at all, we cannot determine activity patterns
    // This happens with imported videos that weren't recorded with our app
    // Return empty periods instead of treating entire recording as idle
    if (mouseEvents.length === 0 && keyboardEvents.length === 0) {
      return { periods: [] }
    }

    // Build activity timeline
    const activityTimeline = this.buildActivityTimeline(mouseEvents, keyboardEvents)

    // Find idle gaps with custom config
    const idlePeriods = this.detectIdlePeriodsWithConfig(activityTimeline, recordingDuration, customConfig)

    return {
      periods: idlePeriods,
      overallSuggestion: calculateOverallSuggestion(idlePeriods)
    }
  }

  /**
   * Get periods that overlap with a specific time range
   */
  getPeriodsInRange(
    suggestions: SpeedUpSuggestions,
    startTime: number,
    endTime: number
  ): SpeedUpPeriod[] {
    return suggestions.periods.filter(period =>
      period.startTime < endTime && period.endTime > startTime
    )
  }

  /**
   * Build a timeline of activity events with calculated intensity
   */
  private buildActivityTimeline(
    mouseEvents: RecordingMouseEvent[],
    keyboardEvents: KeyboardEvent[]
  ): ActivityEvent[] {
    const events: ActivityEvent[] = []

    // Process mouse events - calculate velocity between consecutive events
    for (let i = 1; i < mouseEvents.length; i++) {
      const prev = mouseEvents[i - 1]
      const curr = mouseEvents[i]
      const dt = curr.timestamp - prev.timestamp

      if (dt > 0 && dt < 1000) { // Ignore gaps > 1 second (likely missing data)
        const distance = Math.sqrt(
          Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
        )
        const velocity = distance / (dt / 1000) // pixels per second

        events.push({
          timestamp: curr.timestamp,
          type: 'mouse',
          intensity: velocity
        })
      }
    }

    // Add keyboard events - any keystroke is activity
    for (const kb of keyboardEvents) {
      events.push({
        timestamp: kb.timestamp,
        type: 'keyboard',
        intensity: 1 // Binary: key pressed = activity
      })
    }

    // Sort by timestamp
    events.sort((a, b) => a.timestamp - b.timestamp)

    return events
  }

  /**
   * Find periods where ALL activity types are below threshold
   */
  private detectIdlePeriods(
    activityTimeline: ActivityEvent[],
    recordingDuration: number
  ): SpeedUpPeriod[] {
    return this.detectIdlePeriodsWithConfig(activityTimeline, recordingDuration, this.config)
  }

  /**
   * Find periods where ALL activity types are below threshold (with custom config)
   */
  private detectIdlePeriodsWithConfig(
    activityTimeline: ActivityEvent[],
    recordingDuration: number,
    config: IdleDetectorConfig
  ): SpeedUpPeriod[] {
    const periods: SpeedUpPeriod[] = []

    if (activityTimeline.length === 0) {
      // Entire recording is idle if no activity
      if (recordingDuration >= config.minIdleDurationMs) {
        periods.push(this.createIdlePeriodWithConfig(0, recordingDuration, config))
      }
      return periods
    }

    // Find timestamps where meaningful activity occurred
    const activeTimestamps: number[] = []

    for (const event of activityTimeline) {
      if (this.isActiveEventWithConfig(event, config)) {
        activeTimestamps.push(event.timestamp)
      }
    }

    if (activeTimestamps.length === 0) {
      // No meaningful activity in entire recording
      if (recordingDuration >= config.minIdleDurationMs) {
        periods.push(this.createIdlePeriodWithConfig(0, recordingDuration, config))
      }
      return periods
    }

    // Check for idle period at the beginning
    const firstActivity = activeTimestamps[0]
    if (firstActivity >= config.minIdleDurationMs) {
      periods.push(this.createIdlePeriodWithConfig(0, firstActivity, config))
    }

    // Find gaps between active timestamps
    for (let i = 0; i < activeTimestamps.length - 1; i++) {
      const gapStart = activeTimestamps[i]
      const gapEnd = activeTimestamps[i + 1]
      const gap = gapEnd - gapStart

      if (gap >= config.minIdleDurationMs) {
        periods.push(this.createIdlePeriodWithConfig(gapStart, gapEnd, config))
      }
    }

    // Check for idle period at the end
    const lastActivity = activeTimestamps[activeTimestamps.length - 1]
    if (recordingDuration - lastActivity >= config.minIdleDurationMs) {
      periods.push(this.createIdlePeriodWithConfig(lastActivity, recordingDuration, config))
    }

    return periods
  }

  /**
   * Check if an event represents meaningful activity
   */
  private isActiveEvent(event: ActivityEvent): boolean {
    return this.isActiveEventWithConfig(event, this.config)
  }

  /**
   * Check if an event represents meaningful activity (with custom config)
   */
  private isActiveEventWithConfig(event: ActivityEvent, config: IdleDetectorConfig): boolean {
    if (event.type === 'keyboard') {
      return true // Any keystroke is activity
    }
    if (event.type === 'mouse' && event.intensity > config.mouseVelocityThreshold) {
      return true // Mouse moving faster than threshold
    }
    return false
  }

  /**
   * Create an idle period with calculated speed multiplier
   */
  private createIdlePeriod(start: number, end: number): SpeedUpPeriod {
    return this.createIdlePeriodWithConfig(start, end, this.config)
  }

  /**
   * Create an idle period with calculated speed multiplier (with custom config)
   */
  private createIdlePeriodWithConfig(start: number, end: number, config: IdleDetectorConfig): SpeedUpPeriod {
    const duration = end - start

    // Longer idle periods can be sped up more aggressively
    let multiplier = config.defaultSpeedMultiplier
    if (duration > 20000) {
      multiplier = config.maxSpeedMultiplier // 3.0x for 20s+
    } else if (duration > 10000) {
      multiplier = 2.75 // 2.75x for 10-20s
    }

    // Calculate confidence based on duration clarity
    // Longer = more confident it's truly idle
    const confidence = Math.min(1, 0.6 + (duration / 30000) * 0.4)

    return {
      type: SpeedUpType.Idle,
      startTime: start,
      endTime: end,
      suggestedSpeedMultiplier: Math.min(multiplier, config.maxSpeedMultiplier),
      confidence,
      metadata: {
        idleDurationMs: duration
      }
    }
  }
}

// Export singleton instance for convenience
export const idleDetector = new IdleActivityDetector()
