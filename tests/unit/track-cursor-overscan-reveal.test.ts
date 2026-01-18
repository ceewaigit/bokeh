/**
 * Track Cursor Overscan Reveal Tests
 *
 * Ensures that in "track cursor" mode (followStrategy=Mouse), the camera can pan far enough
 * to reveal background padding (overscan) when the recorded cursor is at the video edge.
 */

import type { Effect, Recording, RecordingMetadata, MouseEvent } from '@/types/project'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import { computeCameraState } from '@/features/ui/editor/logic/viewport/logic/orchestrator'

describe('track cursor overscan reveal', () => {
  it('pans to reveal right padding when cursor hits right edge', () => {
    const zoomEffect: Effect = {
      id: 'zoom-1',
      type: EffectType.Zoom,
      enabled: true,
      startTime: 0,
      endTime: 10_000,
      data: {
        origin: 'manual',
        scale: 2,
        introMs: 0,
        outroMs: 0,
        smoothing: 0,
        followStrategy: ZoomFollowStrategy.Mouse,
        mouseFollowAlgorithm: 'deadzone',
        zoomIntoCursorMode: 'cursor',
      },
    } as unknown as Effect

    const sourceWidth = 1000
    const sourceHeight = 1000

    const mouseEvents: MouseEvent[] = [
      {
        timestamp: 0,
        x: sourceWidth,
        y: sourceHeight / 2,
        captureWidth: sourceWidth,
        captureHeight: sourceHeight,
        cursorType: 'default',
      } as unknown as MouseEvent,
    ]

    const recording: Recording = {
      id: 'rec-1',
      width: sourceWidth,
      height: sourceHeight,
    } as unknown as Recording

    const metadata: RecordingMetadata = {
      mouseEvents,
    } as unknown as RecordingMetadata

    // Overscan is expressed relative to draw size.
    // right=0.2 means the output includes 20% of the draw width as padding on the right.
    const overscan = { left: 0, right: 0.2, top: 0, bottom: 0 }

    const halfWindowX = 0.25 // at 2x zoom with matching aspect ratios
    const expectedMaxCenterX = 1 - halfWindowX + overscan.right

    const result = computeCameraState({
      effects: [zoomEffect],
      timelineMs: 0,
      sourceTimeMs: 0,
      recording,
      metadata,
      outputWidth: sourceWidth,
      outputHeight: sourceHeight,
      overscan,
      physics: { x: 0.5, y: 0.5, vx: 0, vy: 0, lastTimeMs: 0, lastSourceTimeMs: 0 },
      deterministic: true,
      allowOverscanReveal: true,
    })

    // Allow a small epsilon because the deadzone algorithm and smoothing can make
    // the exact value slightly under the clamp max depending on implementation details.
    expect(result.zoomCenter.x).toBeGreaterThanOrEqual(expectedMaxCenterX - 1e-3)
  })
})

