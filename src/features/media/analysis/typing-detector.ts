/**
 * Typing Activity Detector
 * Detects typing periods in recordings for speed-up suggestions
 */

import type { KeyboardEvent, Recording, RecordingMetadata } from '@/types/project'
import type { SpeedUpPeriod, SpeedUpSuggestions } from '@/types/speed-up'
import { SpeedUpType } from '@/types/speed-up'
import type { ActivityDetector } from './index'
import { calculateOverallSuggestion } from './index'
import { countPrintableCharacters, getPrintableCharFromKey } from '@/features/core/keyboard/keyboard-utils'

const MIN_TYPING_DURATION = 2000 // 2 seconds minimum
const MAX_GAP_BETWEEN_KEYS = 3000 // 3 seconds max gap
const MIN_KEYS_FOR_TYPING = 8 // minimum keys to consider typing
const TYPING_CHARS = /^[a-zA-Z0-9\s.,;:!?\-_(){}[\]"'`~@#$%^&*+=<>/\\|]$/

/**
 * Typing Activity Detector - implements ActivityDetector interface
 */
export class TypingActivityDetector implements ActivityDetector {
  readonly type = SpeedUpType.Typing

  /**
   * Analyze keyboard events to detect typing periods (with automatic caching)
   */
  analyze(recording: Recording, metadata?: RecordingMetadata): SpeedUpSuggestions {
    const effectiveMetadata = metadata ?? recording.metadata
    // Check if we have cached results
    if (effectiveMetadata?.detectedTypingPeriods) {
      const periods: SpeedUpPeriod[] = effectiveMetadata.detectedTypingPeriods.map(p => ({
        type: SpeedUpType.Typing,
        startTime: p.startTime,
        endTime: p.endTime,
        suggestedSpeedMultiplier: p.suggestedSpeedMultiplier,
        confidence: 0.8, // Default confidence for cached results
        metadata: {
          keyCount: p.keyCount,
          averageWpm: p.averageWPM
        }
      }))

      return {
        periods,
        overallSuggestion: calculateOverallSuggestion(periods)
      }
    }

    // No cache, perform analysis
    const keyboardEvents = effectiveMetadata?.keyboardEvents || []
    if (!keyboardEvents || keyboardEvents.length === 0) {
      return { periods: [] }
    }

    // Filter to actual typing characters (exclude pure navigation/modifier keys)
    const typingEvents = keyboardEvents.filter(event =>
      this.isTypingKey(event.key) &&
      (!event.modifiers || event.modifiers.length === 0) // exclude shortcuts
    )

    if (typingEvents.length < MIN_KEYS_FOR_TYPING) {
      return { periods: [] }
    }

    const periods = this.detectTypingPeriods(typingEvents)
    const overallSuggestion = calculateOverallSuggestion(periods)

    return {
      periods,
      overallSuggestion
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
   * Check if a key is considered a typing key
   */
  private isTypingKey(key: string): boolean {
    // Accept alphanumeric and punctuation characters
    if (key.length === 1 && TYPING_CHARS.test(key)) {
      return true
    }

    // Common typing keys
    const typingKeys = ['Space', 'Backspace', 'Delete', 'Enter', 'Return', 'Tab']
    if (typingKeys.includes(key)) return true

    // uiohook "code"-style values (KeyA, Digit1, Numpad5, etc)
    return getPrintableCharFromKey(key) !== null
  }

  /**
   * Detect continuous typing periods from filtered events
   */
  private detectTypingPeriods(typingEvents: KeyboardEvent[]): SpeedUpPeriod[] {
    const periods: SpeedUpPeriod[] = []
    let currentPeriod: KeyboardEvent[] = []

    for (let i = 0; i < typingEvents.length; i++) {
      const event = typingEvents[i]
      const lastEvent = currentPeriod[currentPeriod.length - 1]

      // Start new period or continue current one
      if (!lastEvent || (event.timestamp - lastEvent.timestamp) <= MAX_GAP_BETWEEN_KEYS) {
        currentPeriod.push(event)
      } else {
        // Gap too large, finish current period and start new one
        if (this.isValidTypingPeriod(currentPeriod)) {
          periods.push(this.createTypingPeriod(currentPeriod))
        }
        currentPeriod = [event]
      }
    }

    // Don't forget the last period
    if (this.isValidTypingPeriod(currentPeriod)) {
      periods.push(this.createTypingPeriod(currentPeriod))
    }

    return periods
  }

  /**
   * Check if a period qualifies as typing
   */
  private isValidTypingPeriod(events: KeyboardEvent[]): boolean {
    if (events.length < MIN_KEYS_FOR_TYPING) return false

    const duration = events[events.length - 1].timestamp - events[0].timestamp
    return duration >= MIN_TYPING_DURATION
  }

  /**
   * Create a SpeedUpPeriod from events
   */
  private createTypingPeriod(events: KeyboardEvent[]): SpeedUpPeriod {
    const startTime = events[0].timestamp
    const endTime = events[events.length - 1].timestamp
    const duration = endTime - startTime
    const keyCount = events.length

    // Calculate WPM (assuming average word is 5 characters)
    const charactersTyped = countPrintableCharacters(events)
    const words = charactersTyped / 5
    const minutes = duration / 60000
    const averageWpm = minutes > 0 ? words / minutes : 0

    // Calculate confidence based on pattern analysis
    const confidence = this.calculateConfidence(events, averageWpm)

    // Suggest speed multiplier based on typing speed and pattern
    const suggestedSpeedMultiplier = this.calculateSpeedSuggestion(averageWpm, confidence, duration)

    return {
      type: SpeedUpType.Typing,
      startTime,
      endTime,
      suggestedSpeedMultiplier,
      confidence,
      metadata: {
        keyCount,
        averageWpm
      }
    }
  }

  /**
   * Calculate confidence that this is actually typing (vs random key presses)
   */
  private calculateConfidence(events: KeyboardEvent[], wpm: number): number {
    let confidence = 0.5 // base confidence

    // Higher confidence for reasonable WPM
    if (wpm >= 20 && wpm <= 120) {
      confidence += 0.3
    } else if (wpm >= 10 && wpm <= 150) {
      confidence += 0.1
    }

    // Check for typing patterns
    const hasSpaces = events.some(e => e.key === 'Space')
    const hasBackspace = events.some(e => e.key === 'Backspace')
    const hasLetters = events.some(e => /^[a-zA-Z]$/.test(e.key))

    if (hasSpaces) confidence += 0.1
    if (hasBackspace) confidence += 0.1
    if (hasLetters) confidence += 0.1

    // Check for consistent timing (not too erratic)
    const intervals: number[] = []
    for (let i = 1; i < events.length; i++) {
      intervals.push(events[i].timestamp - events[i - 1].timestamp)
    }

    if (intervals.length > 1) {
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const variance = intervals.reduce((sum, interval) =>
        sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length
      const stdDev = Math.sqrt(variance)

      // Lower standard deviation suggests more consistent typing
      if (stdDev < avgInterval * 0.5) {
        confidence += 0.1
      }
    }

    return Math.min(1, Math.max(0, confidence))
  }

  /**
   * Calculate suggested speed multiplier
   */
  private calculateSpeedSuggestion(wpm: number, confidence: number, duration: number): number {
    // Base speed suggestion on typing speed
    let speedMultiplier = 1.0

    // Slower typing = more speed-up potential
    if (wpm < 30) {
      speedMultiplier = 3.0
    } else if (wpm < 50) {
      speedMultiplier = 2.5
    } else if (wpm < 70) {
      speedMultiplier = 2.0
    } else {
      speedMultiplier = 1.5
    }

    // Reduce multiplier for low confidence
    speedMultiplier *= confidence

    // Longer periods can handle more speed-up
    if (duration > 10000) { // 10+ seconds
      speedMultiplier *= 1.1
    }

    // Reasonable bounds
    return Math.min(4.0, Math.max(1.2, speedMultiplier))
  }
}

// Export singleton instance for convenience
export const typingDetector = new TypingActivityDetector()
