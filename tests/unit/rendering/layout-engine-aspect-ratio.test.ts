import { calculateFrameSnapshot } from '@/features/rendering/renderer/engine/layout-engine'
import type { FrameSnapshotOptions } from '@/features/rendering/renderer/engine/layout-engine'
import type { ActiveClipDataAtFrame } from '@/features/rendering/renderer/types'
import type { Clip, Recording } from '@/types/project'

function makeVideoRecording(id: string, width: number, height: number): Recording {
  return {
    id,
    name: id,
    sourceType: 'video',
    filePath: `/tmp/${id}.mp4`,
    folderPath: '/tmp',
    createdAt: new Date().toISOString(),
    duration: 10_000,
    width,
    height,
    metadata: null,
    captureArea: undefined,
    capabilities: {},
    hasAudio: false,
  } as unknown as Recording
}

function makeClip(id: string, recordingId: string, startTime: number, duration: number): Clip {
  return {
    id,
    recordingId,
    startTime,
    duration,
    sourceIn: 0,
    sourceOut: duration,
  }
}

describe('layout-engine aspect ratio stability', () => {
  it('keeps the frame rect stable across clip switches', () => {
    // Project canvas (stable across timeline)
    const canvasWidth = 3218
    const canvasHeight = 2960

    // Composition can be downscaled for preview, but aspect ratio remains the same.
    const compositionWidth = 900
    const compositionHeight = 828

    const screenRecording = makeVideoRecording('screen', canvasWidth, canvasHeight)
    const imported = makeVideoRecording('imported', 1280, 720)

    const clipA = makeClip('clip-a', screenRecording.id, 0, 1000)
    const clipB = makeClip('clip-b', imported.id, 1000, 1000)

    const baseOptions: Omit<FrameSnapshotOptions, 'currentTimeMs' | 'currentFrame' | 'activeClipData'> = {
      fps: 30,
      compositionWidth,
      compositionHeight,
      videoWidth: canvasWidth,
      videoHeight: canvasHeight,
      // Explicitly provide stable "source" dimensions for the timeline canvas.
      sourceVideoWidth: canvasWidth,
      sourceVideoHeight: canvasHeight,
      frameLayout: [],
      recordingsMap: new Map(),
      clipEffects: [],
      getRecording: () => null,
      isRendering: false,
    }

    const activeA: ActiveClipDataAtFrame = {
      clip: clipA,
      recording: screenRecording,
      sourceTimeMs: 0,
      effects: [],
    }

    const activeB: ActiveClipDataAtFrame = {
      clip: clipB,
      recording: imported,
      sourceTimeMs: 0,
      effects: [],
    }

    const snapA = calculateFrameSnapshot({
      ...baseOptions,
      currentTimeMs: 0,
      currentFrame: 0,
      activeClipData: activeA,
    })

    const snapB = calculateFrameSnapshot({
      ...baseOptions,
      currentTimeMs: 1000,
      currentFrame: 30,
      activeClipData: activeB,
    })

    // EXPECTATION: The preview "frame" is stable (used for background/framing).
    // Clip content is scaled/letterboxed separately by the renderer.
    expect(snapA.layout.drawWidth).toBe(snapB.layout.drawWidth)
    expect(snapA.layout.drawHeight).toBe(snapB.layout.drawHeight)
    expect(snapA.layout.offsetX).toBe(snapB.layout.offsetX)
    expect(snapA.layout.offsetY).toBe(snapB.layout.offsetY)
  })
})
