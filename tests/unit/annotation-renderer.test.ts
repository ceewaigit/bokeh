
import { calculateClipFadeOpacity } from '@/features/renderer/compositions/utils/effects/clip-fade'

describe('Annotation Rendering Logic', () => {
    describe('calculateClipFadeOpacity', () => {
        it('should return 1 when no fade is configured', () => {
            const opacity = calculateClipFadeOpacity({
                localFrame: 50,
                durationFrames: 100,
                introFadeDuration: 0,
                outroFadeDuration: 0,
            })
            expect(opacity).toBe(1)
        })

        it('should fade in correctly during intro', () => {
            // 30 frame fade in
            const duration = 30

            // Frame 0: 0 opacity
            expect(calculateClipFadeOpacity({
                localFrame: 0,
                durationFrames: 100,
                introFadeDuration: duration,
                outroFadeDuration: 0,
            })).toBe(0)

            // Frame 15: approx 0.5 opacity (smoothstep makes it slightly different from linear 0.5)
            const midOpacity = calculateClipFadeOpacity({
                localFrame: 15,
                durationFrames: 100,
                introFadeDuration: duration,
                outroFadeDuration: 0,
            })
            expect(midOpacity).toBeGreaterThan(0.4)
            expect(midOpacity).toBeLessThan(0.6)

            // Frame 30: 1 opacity
            expect(calculateClipFadeOpacity({
                localFrame: 30,
                durationFrames: 100,
                introFadeDuration: duration,
                outroFadeDuration: 0,
            })).toBe(1)
        })

        it('should fade out correctly during outro', () => {
            // 30 frame fade out, duration 100
            const outroDuration = 30
            const totalDuration = 100
            const outroStart = 70

            // Frame 70: 1 opacity (just starting fade)
            expect(calculateClipFadeOpacity({
                localFrame: 70,
                durationFrames: totalDuration,
                introFadeDuration: 0,
                outroFadeDuration: outroDuration,
            })).toBe(1)

            // Frame 85: approx 0.5 opacity
            const midOpacity = calculateClipFadeOpacity({
                localFrame: 85,
                durationFrames: totalDuration,
                introFadeDuration: 0,
                outroFadeDuration: outroDuration,
            })
            expect(midOpacity).toBeGreaterThan(0.4)
            expect(midOpacity).toBeLessThan(0.6)

            // Frame 100: 0 opacity
            expect(calculateClipFadeOpacity({
                localFrame: 100,
                durationFrames: totalDuration,
                introFadeDuration: 0,
                outroFadeDuration: outroDuration,
            })).toBe(0)
        })
    })

    describe('Shadow Style Logic', () => {
        // Porting the logic from AnnotationWrapper to test it in isolation
        function getShadowFilter(intensity: number) {
            if (intensity <= 0) return ''
            const alpha = Math.min(0.8, intensity / 100 * 0.8)
            const blur = Math.max(2, intensity / 100 * 20)
            const dist = Math.max(1, intensity / 100 * 8)
            return `drop-shadow(0px ${dist}px ${blur}px rgba(0,0,0,${alpha}))`
        }

        it('should return empty string for 0 intensity', () => {
            expect(getShadowFilter(0)).toBe('')
        })

        it('should generate valid drop-shadow values for partial intensity', () => {
            const filter = getShadowFilter(50)
            expect(filter).toContain('drop-shadow')
            // 50% intensity: 
            // alpha = 0.5 * 0.8 = 0.4
            // blur = 0.5 * 20 = 10
            // dist = 0.5 * 8 = 4
            expect(filter).toContain('4px')
            expect(filter).toContain('10px')
            expect(filter).toContain('rgba(0,0,0,0.4)')
        })

        it('should cap max values for 100 intensity', () => {
            const filter = getShadowFilter(100)
            // 100% intensity:
            // alpha = 0.8 (capped)
            // blur = 20
            // dist = 8
            expect(filter).toContain('8px')
            expect(filter).toContain('20px')
            expect(filter).toContain('rgba(0,0,0,0.8)')
        })
    })
})
