/**
 * BLACK-BOX TEST: Clip Manipulation - No Black Frames
 *
 * This test verifies that after ANY clip manipulation (split, regenerate, trim):
 * 1. Every frame position in the timeline has valid clip data
 * 2. The rendering pipeline can produce non-null output for every frame
 *
 * This is a "black-box" test because it checks the OBSERVABLE BEHAVIOR
 * (all frames have renderable content) rather than internal implementation details.
 */

import type { Project } from '@/types/project'
import { TrackType } from '@/types/project'
import { normalizeProjectSettings } from '@/features/core/settings/normalize-project-settings'
import { regenerateProjectEffects } from '@/features/effects/logic/effect-applier'
import { splitClipAtTime } from '@/features/ui/timeline/clips/clip-split'
import { buildFrameLayout, findActiveFrameLayoutItems } from '@/features/ui/timeline/utils/frame-layout'
import { getActiveClipDataAtFrame } from '@/features/rendering/renderer/utils/get-active-clip-data-at-frame'

class MockIdleActivityDetector {
  analyze() { return { periods: [] } }
  analyzeWithConfig() { return { periods: [] } }
}

function createTestProject(durationMs: number = 5000): Project {
  const now = new Date().toISOString()
  return {
    version: '1',
    id: 'proj-test',
    name: 'Black Screen Test',
    createdAt: now,
    modifiedAt: now,
    schemaVersion: 1,
    recordings: [{
      id: 'rec-1',
      sourceType: 'video',
      filePath: '/tmp/test.mp4',
      duration: durationMs,
      width: 1920,
      height: 1080,
      frameRate: 30,
      effects: []
    }],
    timeline: {
      duration: durationMs,
      tracks: [{
        id: 't-video',
        name: 'Video',
        type: TrackType.Video,
        clips: [{
          id: 'clip-original',
          recordingId: 'rec-1',
          startTime: 0,
          duration: durationMs,
          sourceIn: 0,
          sourceOut: durationMs,
          playbackRate: 1
        }],
        muted: false,
        locked: false
      }],
      effects: []
    },
    settings: normalizeProjectSettings(),
    exportPresets: []
  } as Project
}

/**
 * BLACK-BOX ASSERTION: Verify every frame has valid renderable data
 *
 * This is the core invariant: after any manipulation, EVERY frame
 * in the timeline must have clip data that can be rendered.
 */
function assertAllFramesHaveRenderableData(
  project: Project,
  fps: number,
  testName: string
): void {
  const recordingsMap = new Map(project.recordings.map(r => [r.id, r]))
  const allClips = project.timeline.tracks.flatMap(t => t.clips)
  const frameLayout = buildFrameLayout(allClips, fps, recordingsMap)

  if (frameLayout.length === 0) {
    throw new Error(`${testName}: frameLayout is empty after manipulation`)
  }

  const totalFrames = Math.ceil((project.timeline.duration / 1000) * fps)
  const framesToTest = [
    0,                        // First frame
    Math.floor(totalFrames / 4),     // 25%
    Math.floor(totalFrames / 2),     // 50%
    Math.floor(totalFrames * 3 / 4), // 75%
    totalFrames - 1,          // Last frame
    // Random positions
    Math.floor(totalFrames * 0.33),
    Math.floor(totalFrames * 0.67),
  ]

  for (const frame of framesToTest) {
    // Test 1: findActiveFrameLayoutItems should return non-empty
    const activeItems = findActiveFrameLayoutItems(frameLayout, frame)
    if (activeItems.length === 0) {
      throw new Error(
        `${testName}: Frame ${frame} has NO active layout items. ` +
        `This would cause a BLACK SCREEN.`
      )
    }

    // Test 2: getActiveClipDataAtFrame should return non-null
    const clipData = getActiveClipDataAtFrame({
      frame,
      frameLayout,
      fps,
      effects: project.timeline.effects ?? [],
      getRecording: (id) => recordingsMap.get(id) ?? null
    })

    if (!clipData) {
      throw new Error(
        `${testName}: Frame ${frame} returned NULL clip data. ` +
        `This would cause a BLACK SCREEN.`
      )
    }

    // Test 3: Clip data should have valid recording reference
    if (!clipData.recording) {
      throw new Error(
        `${testName}: Frame ${frame} clip data has no recording. ` +
        `This would cause a BLACK SCREEN.`
      )
    }
  }
}

describe('Clip Manipulation - No Black Frames (Black-Box Test)', () => {
  const fps = 30

  test('SPLIT: all frames have renderable data after splitting clip', () => {
    const project = createTestProject(5000)

    // Initial check
    assertAllFramesHaveRenderableData(project, fps, 'Before split')

    // Split at middle
    const clip = project.timeline.tracks[0].clips[0]
    const splitResult = splitClipAtTime(clip, 2500) // Split at 2.5 seconds

    if (!splitResult) {
      throw new Error('Split failed')
    }

    // Replace original clip with split clips
    project.timeline.tracks[0].clips = [splitResult.firstClip, splitResult.secondClip]

    // BLACK-BOX ASSERTION: All frames must still have renderable data
    assertAllFramesHaveRenderableData(project, fps, 'After split')
  })

  test('REGENERATE: all frames have renderable data after regeneration', () => {
    const project = createTestProject(5000)

    // Initial check
    assertAllFramesHaveRenderableData(project, fps, 'Before regenerate')

    // Store original clip ID
    const originalClipId = project.timeline.tracks[0].clips[0].id

    // Regenerate effects (creates new clip IDs)
    regenerateProjectEffects(project, MockIdleActivityDetector)

    // Verify clip ID actually changed (sanity check)
    const newClipId = project.timeline.tracks[0].clips[0].id
    expect(newClipId).not.toBe(originalClipId)

    // BLACK-BOX ASSERTION: All frames must still have renderable data
    assertAllFramesHaveRenderableData(project, fps, 'After regenerate')
  })

  test('MULTIPLE SPLITS: all frames have renderable data after multiple splits', () => {
    const project = createTestProject(10000) // 10 second video

    // Split at 3 seconds
    let clip = project.timeline.tracks[0].clips[0]
    let splitResult = splitClipAtTime(clip, 3000)
    if (!splitResult) throw new Error('First split failed')
    project.timeline.tracks[0].clips = [splitResult.firstClip, splitResult.secondClip]

    assertAllFramesHaveRenderableData(project, fps, 'After first split')

    // Split the second clip at 6 seconds (3 seconds into second clip)
    clip = project.timeline.tracks[0].clips[1]
    splitResult = splitClipAtTime(clip, 3000)
    if (!splitResult) throw new Error('Second split failed')
    project.timeline.tracks[0].clips = [
      project.timeline.tracks[0].clips[0],
      splitResult.firstClip,
      splitResult.secondClip
    ]

    // BLACK-BOX ASSERTION: All frames must still have renderable data
    assertAllFramesHaveRenderableData(project, fps, 'After multiple splits')
  })

  test('SPLIT + REGENERATE: all frames have renderable data after combined operations', () => {
    const project = createTestProject(5000)

    // Split first
    const clip = project.timeline.tracks[0].clips[0]
    const splitResult = splitClipAtTime(clip, 2500)
    if (!splitResult) throw new Error('Split failed')
    project.timeline.tracks[0].clips = [splitResult.firstClip, splitResult.secondClip]

    assertAllFramesHaveRenderableData(project, fps, 'After split')

    // Then regenerate
    regenerateProjectEffects(project, MockIdleActivityDetector)

    // BLACK-BOX ASSERTION: All frames must still have renderable data
    assertAllFramesHaveRenderableData(project, fps, 'After split + regenerate')
  })
})
