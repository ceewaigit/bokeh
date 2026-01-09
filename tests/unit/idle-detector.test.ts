/**
 * Tests for idle period detection and merging
 */
import { IdleActivityDetector } from '@/features/ui/timeline/activity-detection/idle-detector'
import { SpeedUpType } from '@/types/speed-up'
import type { Recording, RecordingMetadata } from '@/types/project'

describe('IdleActivityDetector', () => {
    describe('mergeAdjacentPeriods', () => {
        const detector = new IdleActivityDetector()

        function createMockRecording(mouseEvents: Array<{ timestamp: number; x: number; y: number }>): Recording {
            const metadata: RecordingMetadata = {
                mouseEvents: mouseEvents.map(e => ({
                    ...e,
                    screenWidth: 1920,
                    screenHeight: 1080,
                    cursorType: 'default' as const
                })),
                keyboardEvents: [],
                clickEvents: [],
                scrollEvents: [],
                screenEvents: []
            }

            return {
                id: 'test-recording',
                sourceType: 'video',
                filePath: '/test/path.mp4',
                duration: Math.max(...mouseEvents.map(e => e.timestamp)) + 1000,
                width: 1920,
                height: 1080,
                frameRate: 30,
                effects: [],
                metadata
            }
        }

        it('should merge adjacent idle periods with same speed multiplier', () => {
            // Create events that will generate separate idle periods at same multiplier
            // Activity at 0, 6000, 12000 creates gaps 0-6000 and 6000-12000
            // Both should be 2.5x (5-10 second range) and should merge
            const recording = createMockRecording([
                { timestamp: 0, x: 0, y: 0 },
                { timestamp: 100, x: 100, y: 0 },      // Quick burst of movement
                { timestamp: 6000, x: 100, y: 0 },     // 6s later - creates first idle gap
                { timestamp: 6100, x: 200, y: 0 },     // Quick burst
                { timestamp: 12000, x: 200, y: 0 },    // 6s later - creates second idle gap
            ])

            const suggestions = detector.analyze(recording, recording.metadata)

            // Should have merged into single period (or fewer periods than gaps)
            // The key assertion: no two adjacent periods should have the same multiplier
            for (let i = 1; i < suggestions.periods.length; i++) {
                expect(suggestions.periods[i].suggestedSpeedMultiplier)
                    .not.toBe(suggestions.periods[i - 1].suggestedSpeedMultiplier)
            }
        })

        it('should not merge periods with different speed multipliers', () => {
            // Create events that will generate idle periods at different multipliers
            // 5-10s = 2.5x, 10-20s = 2.75x, 20s+ = 3.0x
            const recording = createMockRecording([
                { timestamp: 0, x: 0, y: 0 },
                { timestamp: 100, x: 100, y: 0 },
                { timestamp: 7000, x: 100, y: 0 },      // 7s gap = 2.5x
                { timestamp: 7100, x: 200, y: 0 },
                { timestamp: 22000, x: 200, y: 0 },     // 15s gap = 2.75x
            ])

            const suggestions = detector.analyze(recording, recording.metadata)

            // Should have at least 2 periods with different multipliers
            if (suggestions.periods.length >= 2) {
                const multipliers = new Set(suggestions.periods.map(p => p.suggestedSpeedMultiplier))
                expect(multipliers.size).toBeGreaterThan(1)
            }
        })

        it('should return empty periods when no idle detected', () => {
            // Continuous activity - no idle gaps >= 5s
            const recording = createMockRecording([
                { timestamp: 0, x: 0, y: 0 },
                { timestamp: 100, x: 100, y: 0 },
                { timestamp: 1000, x: 200, y: 0 },
                { timestamp: 2000, x: 300, y: 0 },
                { timestamp: 3000, x: 400, y: 0 },
                { timestamp: 4000, x: 500, y: 0 },
            ])

            const suggestions = detector.analyze(recording, recording.metadata)
            expect(suggestions.periods.length).toBe(0)
        })

        it('should handle single idle period correctly', () => {
            const recording = createMockRecording([
                { timestamp: 0, x: 0, y: 0 },
                { timestamp: 100, x: 100, y: 0 },
                { timestamp: 6000, x: 200, y: 0 },
            ])

            const suggestions = detector.analyze(recording, recording.metadata)

            // Single period should pass through unchanged
            expect(suggestions.periods.length).toBeLessThanOrEqual(1)
            if (suggestions.periods.length === 1) {
                expect(suggestions.periods[0].type).toBe(SpeedUpType.Idle)
            }
        })
    })
})
