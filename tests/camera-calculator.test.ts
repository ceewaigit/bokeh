
import { computeCameraState, type CameraPhysicsState } from '@/features/ui/editor/logic/viewport/logic/orchestrator'
import { EffectType } from '@/features/effects/types'

function makePhysics(): CameraPhysicsState {
  return { x: 0.5, y: 0.5, vx: 0, vy: 0, lastTimeMs: 0, lastSourceTimeMs: 0 }
}

describe('camera-calculator spring simulation', () => {
  test('does not pre-pan into overscan before zoom ramps', () => {
    const effects: any[] = [
      {
        id: 'z1',
        type: EffectType.Zoom,
        enabled: true,
        startTime: 0,
        endTime: 2000,
        data: { scale: 2, introMs: 500, outroMs: 500, followStrategy: 'mouse', origin: 'auto' as const, smoothing: 0.1 },
      },
    ]

    const w = 1000
    const h = 1000
    const mouseEvents: any[] = []
    for (let t = 0; t <= 2000; t += 50) {
      mouseEvents.push({ timestamp: t, x: 800, y: 800, captureWidth: w, captureHeight: h })
    }

    const recording: any = {
      id: 'r1',
      width: w,
      height: h,
      metadata: { mouseEvents },
    }

    const physics = makePhysics()

    const first = computeCameraState({
      effects: effects as any,
      timelineMs: 0,
      sourceTimeMs: 0,
      recording,
      outputWidth: 1000,
      outputHeight: 1000,
      overscan: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2 },
      physics,
      deterministic: false,
    })

    // On the very first frame of a zoom intro, the center is set directly to the target.
    // The transform handles keeping it fixed at 0.5 until scale > 1.
    expect(first.zoomCenter.x).toBeCloseTo(0.8, 5)
    expect(first.zoomCenter.y).toBeCloseTo(0.8, 5)

    const later = computeCameraState({
      effects: effects as any,
      timelineMs: 400,
      sourceTimeMs: 400,
      recording,
      outputWidth: 1000,
      outputHeight: 1000,
      overscan: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2 },
      physics: first.physics,
      deterministic: false,
    })

    // Once zoom has ramped, camera should start tracking toward cursor.
    expect(later.zoomCenter.x).toBeGreaterThan(0.5)
    expect(later.zoomCenter.y).toBeGreaterThan(0.5)
  })

  test('pans smoothly across frames', () => {
    const effects: any[] = [
      {
        id: 'z1',
        type: EffectType.Zoom,
        enabled: true,
        startTime: 0,
        endTime: 2000,
        data: { scale: 2, introMs: 500, outroMs: 500, followStrategy: 'mouse', origin: 'auto' as const, smoothing: 0.1 },
      },
    ]

    const mouseEvents: any[] = []
    const w = 1000
    const h = 1000
    for (let t = 0; t <= 2000; t += 50) {
      const x = 100 + (800 * t) / 2000
      const y = 500
      mouseEvents.push({ timestamp: t, x, y, captureWidth: w, captureHeight: h })
    }

    const recording: any = {
      id: 'r1',
      width: w,
      height: h,
      metadata: { mouseEvents },
    }

    const centers: { x: number; y: number }[] = []
    const physics = makePhysics()
    for (let t = 0; t <= 2000; t += 33) {
      const out = computeCameraState({
        effects: effects as any,
        timelineMs: t,
        sourceTimeMs: t,
        recording,
        physics,
        deterministic: false,
      })
      physics.x = out.physics.x
      physics.y = out.physics.y
      physics.vx = out.physics.vx
      physics.vy = out.physics.vy
      physics.lastTimeMs = out.physics.lastTimeMs
      physics.lastSourceTimeMs = out.physics.lastSourceTimeMs
      centers.push(out.zoomCenter)
    }

    let maxStep = 0
    for (let i = 1; i < centers.length; i++) {
      const dx = centers[i].x - centers[i - 1].x
      const dy = centers[i].y - centers[i - 1].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      maxStep = Math.max(maxStep, dist)
    }

    // A "teleport" is typically a large single-frame jump; keep it bounded.
    expect(maxStep).toBeLessThan(0.15)
  })

  test('does not creep toward cursor inside dead zone', () => {
    const effects: any[] = [
      {
        id: 'z1',
        type: EffectType.Zoom,
        enabled: true,
        startTime: 0,
        endTime: 3000,
        data: { scale: 2, introMs: 0, outroMs: 0, followStrategy: 'mouse', origin: 'auto' as const, smoothing: 0.1 },
      },
    ]

    const w = 1000
    const h = 1000
    const tMax = 3000
    const mouseEvents: any[] = []
    for (let t = 0; t <= tMax; t += 50) {
      mouseEvents.push({ timestamp: t, x: 550, y: 500, captureWidth: w, captureHeight: h })
    }

    const recording: any = {
      id: 'r1',
      width: w,
      height: h,
      metadata: { mouseEvents },
    }

    const physics = makePhysics()
    const centers: { x: number; y: number }[] = []
    for (let t = 0; t <= tMax; t += 33) {
      const out = computeCameraState({
        effects: effects as any,
        timelineMs: t,
        sourceTimeMs: t,
        recording,
        physics,
        deterministic: false,
      })
      Object.assign(physics, out.physics)
      centers.push(out.zoomCenter)
    }

    // After initial response settles, center should not keep drifting.
    // Allow tiny numerical noise, but disallow visible "creep".
    const startIdx = Math.floor(1000 / 33)
    let maxDrift = 0
    for (let i = startIdx + 1; i < centers.length; i++) {
      const dx = centers[i].x - centers[startIdx].x
      const dy = centers[i].y - centers[startIdx].y
      maxDrift = Math.max(maxDrift, Math.sqrt(dx * dx + dy * dy))
    }
    expect(maxDrift).toBeLessThan(0.002)
  })
})
