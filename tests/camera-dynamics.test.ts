
import { computeCameraState, type CameraPhysicsState } from '@/features/editor/logic/viewport/logic/orchestrator'
import { EffectType } from '@/types/effects'

function makePhysics(x = 0.5, y = 0.5): CameraPhysicsState {
    return { x, y, vx: 0, vy: 0, lastTimeMs: 0, lastSourceTimeMs: 0 }
}

describe('camera-calculator physics dynamics', () => {
    const recording: any = {
        id: 'r1',
        width: 1000,
        height: 1000,
        metadata: { mouseEvents: [{ timestamp: 0, x: 600, y: 500, captureWidth: 1000, captureHeight: 1000 }] },
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

    test('higher stiffness moves camera faster', () => {
        // Scenario: target at 0.6, current at 0.5. dt = 33ms.
        // 0.6 is inside the visibility window [0.25, 0.75] at zoom 2x, so no hard snap occurs.

        // Low stiffness
        const physLow = makePhysics()
        const outLow = computeCameraState({
            effects: effects as any,
            timelineMs: 33,
            sourceTimeMs: 33,
            recording,
            physics: physLow,
            deterministic: false,
            cameraDynamics: { stiffness: 20, damping: 20, mass: 1 }
        })
        const distLow = outLow.zoomCenter.x - 0.5

        // High stiffness
        const physHigh = makePhysics()
        const outHigh = computeCameraState({
            effects: effects as any,
            timelineMs: 33,
            sourceTimeMs: 33,
            recording,
            physics: physHigh,
            deterministic: false,
            cameraDynamics: { stiffness: 300, damping: 20, mass: 1 }
        })
        const distHigh = outHigh.zoomCenter.x - 0.5

        // Expect reasonable movement
        expect(distLow).toBeGreaterThan(0)
        expect(distHigh).toBeGreaterThan(distLow * 1.5) // Significantly faster
    })

    test('updates velocity in physics state', () => {
        const phys = makePhysics()
        const out = computeCameraState({
            effects: effects as any,
            timelineMs: 33,
            sourceTimeMs: 33,
            recording,
            physics: phys,
            deterministic: false,
            cameraDynamics: { stiffness: 100, damping: 10, mass: 1 }
        })

        expect(out.physics.vx).not.toBe(0)
        expect(out.physics.x).toBeGreaterThan(0.5)
    })

    test('cameraSmoothness maps to reasonable spring behavior', () => {
        // Check that legacy parameter still works

        // Very smooth (high value 90) -> slow spring
        const outSmooth = computeCameraState({
            effects: effects as any,
            timelineMs: 33,
            sourceTimeMs: 33,
            recording,
            physics: makePhysics(),
            deterministic: false,
            cameraSmoothness: 90
        })

        // Very tight (low value 10) -> fast spring
        const outTight = computeCameraState({
            effects: effects as any,
            timelineMs: 33,
            sourceTimeMs: 33,
            recording,
            physics: makePhysics(),
            deterministic: false,
            cameraSmoothness: 10
        })

        const distSmooth = outSmooth.zoomCenter.x - 0.5
        const distTight = outTight.zoomCenter.x - 0.5

        expect(distTight).toBeGreaterThan(distSmooth * 1.2)
    })
})
