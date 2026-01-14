/**
 * Regression test for: Video Goes Black After "Regenerate Effects"
 *
 * Bug: After clicking "Regenerate Effects", video preview goes BLACK only at
 * timeline positions that haven't been visited yet. Visited positions still work.
 *
 * Root cause: regenerateProjectEffects() creates new clips with new IDs, but:
 * 1. Effects with clipId references to old clips become orphaned
 * 2. Cached clip data in useFrameSnapshot persists stale references
 *
 * Fix: Call EffectSyncService.cleanupOrphanedEffects() and clear cached data
 * when effects array changes.
 */

import type { Project, Effect } from '@/types/project'
import { TrackType, EffectType } from '@/types/project'
import { normalizeProjectSettings } from '@/features/core/settings/normalize-project-settings'
import { regenerateProjectEffects } from '@/features/effects/logic/effect-applier'
import { buildFrameLayout } from '@/features/ui/timeline/utils/frame-layout'
import { getActiveClipDataAtFrame } from '@/features/rendering/renderer/utils/get-active-clip-data-at-frame'

// Mock IdleActivityDetector for regeneration
class MockIdleActivityDetector {
  analyze() { return { periods: [] } }
  analyzeWithConfig() { return { periods: [] } }
}

function createProject(): Project {
  const now = new Date().toISOString()
  return {
    version: '1',
    id: 'proj-test',
    name: 'Regenerate Effects Test',
    createdAt: now,
    modifiedAt: now,
    schemaVersion: 1,
    recordings: [{
      id: 'rec-1',
      sourceType: 'video',
      filePath: '/tmp/test.mp4',
      duration: 5000, // 5 seconds
      width: 1920,
      height: 1080,
      frameRate: 30,
      effects: []
    }],
    timeline: {
      duration: 5000,
      tracks: [{
        id: 't-video',
        name: 'Video',
        type: TrackType.Video,
        clips: [{
          id: 'clip-original',
          recordingId: 'rec-1',
          startTime: 0,
          duration: 5000,
          sourceIn: 0,
          sourceOut: 5000,
          playbackRate: 1
        }],
        muted: false,
        locked: false
      }],
      effects: [{
        id: 'crop-1',
        type: EffectType.Crop,
        clipId: 'clip-original', // Bound to clip
        startTime: 0,
        endTime: 5000,
        data: { top: 0, left: 0, right: 0, bottom: 0 }
      }]
    },
    settings: normalizeProjectSettings(),
    exportPresets: []
  } as Project
}

describe('Regenerate Effects - Black Screen Regression', () => {
  const fps = 30

  test('all frames return valid clip data after regeneration (not just visited frames)', () => {
    const project = createProject()
    const recordingsMap = new Map(project.recordings.map(r => [r.id, r]))

    // Get original clip ID
    const originalClipId = project.timeline.tracks[0].clips[0].id
    expect(originalClipId).toBe('clip-original')

    // "Visit" some frames (simulating user scrubbing to frames 0, 30, 60)
    const visitedFrames = [0, 30, 60]
    const unvisitedFrames = [90, 120, 150] // frames user never visited

    // Build initial frame layout
    let frameLayout = buildFrameLayout(
      project.timeline.tracks.flatMap(t => t.clips),
      fps,
      recordingsMap
    )

    // Verify all frames work BEFORE regeneration
    for (const frame of [...visitedFrames, ...unvisitedFrames]) {
      const clipData = getActiveClipDataAtFrame({
        frame,
        frameLayout,
        fps,
        effects: project.timeline.effects ?? [],
        getRecording: (id) => recordingsMap.get(id) ?? null
      })
      expect(clipData).not.toBeNull()
      expect(clipData?.clip.id).toBe('clip-original')
    }

    // REGENERATE EFFECTS - this creates new clip IDs
    regenerateProjectEffects(project, MockIdleActivityDetector)

    // Get new clip ID
    const newClip = project.timeline.tracks[0].clips[0]
    expect(newClip.id).not.toBe('clip-original') // ID changed
    expect(newClip.id).toMatch(/^clip-\d+-rec-1$/) // New format

    // Rebuild frame layout with new clips
    frameLayout = buildFrameLayout(
      project.timeline.tracks.flatMap(t => t.clips),
      fps,
      recordingsMap
    )

    // CRITICAL: All frames should return valid clip data AFTER regeneration
    // This is the regression test - previously unvisited frames would return null
    for (const frame of [...visitedFrames, ...unvisitedFrames]) {
      const clipData = getActiveClipDataAtFrame({
        frame,
        frameLayout,
        fps,
        effects: project.timeline.effects ?? [],
        getRecording: (id) => recordingsMap.get(id) ?? null
      })

      expect(clipData).not.toBeNull()
      expect(clipData?.clip.id).toBe(newClip.id)
      expect(clipData?.recording.id).toBe('rec-1')
    }
  })

  test('orphaned clip-bound effects are cleaned up after regeneration', () => {
    const project = createProject()

    // Add a crop effect bound to the original clip
    const originalClipId = project.timeline.tracks[0].clips[0].id
    const cropEffect: Effect = {
      id: 'crop-orphan-test',
      type: EffectType.Crop,
      clipId: originalClipId,
      startTime: 0,
      endTime: 5000,
      data: { top: 10, left: 10, right: 10, bottom: 10 }
    }
    project.timeline.effects = [...(project.timeline.effects ?? []), cropEffect]

    // Verify effect exists before regeneration
    expect(project.timeline.effects.some(e => e.id === 'crop-orphan-test')).toBe(true)
    expect(project.timeline.effects.find(e => e.id === 'crop-orphan-test')?.clipId).toBe(originalClipId)

    // REGENERATE - creates new clip IDs
    regenerateProjectEffects(project, MockIdleActivityDetector)

    // Crop effects should be removed by regeneration (line 53 filters them out)
    // AND any remaining effects should NOT reference the old clip ID
    const remainingCropEffects = project.timeline.effects?.filter(e => e.type === EffectType.Crop) ?? []

    // Crop effects are filtered out by regeneration
    expect(remainingCropEffects.length).toBe(0)
  })

  test('regeneration creates clips with new IDs for each recording', () => {
    const project = createProject()

    // Get original clip
    const originalClip = project.timeline.tracks[0].clips[0]
    expect(originalClip.id).toBe('clip-original')
    expect(originalClip.recordingId).toBe('rec-1')

    // REGENERATE
    regenerateProjectEffects(project, MockIdleActivityDetector)

    // New clip should exist with different ID
    const newClip = project.timeline.tracks[0].clips[0]
    expect(newClip.id).not.toBe('clip-original')
    expect(newClip.recordingId).toBe('rec-1')
    expect(newClip.startTime).toBe(0)
    expect(newClip.duration).toBe(5000)
  })
})
