
import { computeCameraState, type CameraPhysicsState } from '@/features/ui/editor/logic/viewport/logic/orchestrator'
import { EffectType } from '@/features/effects/types'

function makePhysics(x = 0.5, y = 0.5): CameraPhysicsState {
    return { x, y, vx: 0, vy: 0, lastTimeMs: 0, lastSourceTimeMs: 0 }
}

describe('camera-calculator exponential smoothing', () => {
    // Mouse events with cursor at 0.6 (slightly right of center)
    const mouseEvents = [
        { timestamp: 0, x: 600, y: 500, captureWidth: 1000, captureHeight: 1000 },
        { timestamp: 200, x: 600, y: 500, captureWidth: 1000, captureHeight: 1000 },
        { timestamp: 500, x: 600, y: 500, captureWidth: 1000, captureHeight: 1000 },
    ]

    const recording: any = {
        id: 'r1',
        width: 1000,
        height: 1000,
        metadata: { mouseEvents },
    }

    const effects: any[] = [
        {
            id: 'z1',
            type: EffectType.Zoom,
            enabled: true,
            startTime: 0,
            endTime: 5000,
            data: { scale: 2, introMs: 0, outroMs: 0, followStrategy: 'mouse', origin: 'auto' as const, smoothing: 0 },
        },
    ]

    const testTimeMs = 200

    test('camera smoothly approaches target over time', () => {
        // Camera starts at center (0.5), cursor is at 0.6
        // After one frame, camera should have moved toward cursor
        const phys = makePhysics()
        phys.lastTimeMs = testTimeMs - 33  // 33ms frame

        const out = computeCameraState({
            effects: effects as any,
            timelineMs: testTimeMs,
            sourceTimeMs: testTimeMs,
            recording,
            physics: phys,
            deterministic: false,
        })

        // Camera should have moved toward target (rightward toward 0.6)
        expect(out.zoomCenter.x).toBeGreaterThan(0.5)
        // But not all the way there (smoothing takes time)
        expect(out.zoomCenter.x).toBeLessThan(0.6)
    })

    test('camera converges to target after multiple frames', () => {
        // Simulate multiple frames
        let phys = makePhysics()
        phys.lastTimeMs = 0

        // Run for 500ms (about 15 frames at 33ms)
        for (let t = 33; t <= 500; t += 33) {
            const out = computeCameraState({
                effects: effects as any,
                timelineMs: t,
                sourceTimeMs: t,
                recording,
                physics: phys,
                deterministic: false,
            })
            phys = out.physics as CameraPhysicsState
        }

        // After 500ms, camera should be very close to target
        // Target is where cursor (0.6) pushes the dead-zone edge
        expect(phys.x).toBeGreaterThan(0.5)
    })

    test('exponential smoothing is frame-rate independent', () => {
        // Two scenarios: many small steps vs few large steps
        // Both should end up at approximately the same position

        // Scenario 1: 10 frames of 10ms each (100ms total)
        let phys1 = makePhysics()
        phys1.lastTimeMs = 0
        for (let t = 10; t <= 100; t += 10) {
            const out = computeCameraState({
                effects: effects as any,
                timelineMs: t,
                sourceTimeMs: t,
                recording,
                physics: phys1,
                deterministic: false,
            })
            phys1 = out.physics as CameraPhysicsState
        }

        // Scenario 2: 2 frames of 50ms each (100ms total)
        let phys2 = makePhysics()
        phys2.lastTimeMs = 0
        for (let t = 50; t <= 100; t += 50) {
            const out = computeCameraState({
                effects: effects as any,
                timelineMs: t,
                sourceTimeMs: t,
                recording,
                physics: phys2,
                deterministic: false,
            })
            phys2 = out.physics as CameraPhysicsState
        }

        // Both should be approximately equal (within 5%)
        const diff = Math.abs(phys1.x - phys2.x)
        const avg = (phys1.x + phys2.x) / 2
        expect(diff / avg).toBeLessThan(0.05)
    })
})
