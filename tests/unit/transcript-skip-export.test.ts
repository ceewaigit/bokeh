/**
 * Black Box Tests: Transcript Skip Export
 *
 * Tests the observable I/O behavior of transcript skip functionality during export.
 *
 * INPUT: Project with transcript edits (hidden regions)
 * OUTPUT: Transformed project with:
 *   - Clips segmented at skip boundaries
 *   - Timeline times remapped to close gaps
 *   - Correct total duration (shorter than original)
 *   - Effects adjusted for new timing
 */

import { describe, it, expect } from '@jest/globals'
import type { Project, Clip, Effect, Recording, SourceTimeRange } from '@/types/project'
import { TrackType, EffectType } from '@/types/project'
import { buildExportProject } from '@/features/core/export/export-engine'

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestRecording(id: string, duration: number): Recording {
  return {
    id,
    name: `Recording ${id}`,
    filePath: `/test/${id}.mp4`,
    duration,
    width: 1920,
    height: 1080,
    createdAt: '2024-01-01T00:00:00.000Z',
    sourceType: 'video',
    frameRate: 30,
    effects: [],
  } as Recording
}

function createTestClip(
  id: string,
  recordingId: string,
  startTime: number,
  duration: number
): Clip {
  return {
    id,
    recordingId,
    startTime,
    duration,
    sourceIn: 0,
    sourceOut: duration,
    playbackRate: 1,
  }
}

function createTestProject(
  clips: Clip[],
  recordings: Recording[],
  transcriptEdits: Record<string, { hiddenRegions: SourceTimeRange[] }> = {},
  effects: Effect[] = []
): Project {
  const duration = clips.length > 0
    ? Math.max(...clips.map(c => c.startTime + c.duration))
    : 0

  return {
    version: '1',
    schemaVersion: 1,
    id: 'test-project',
    name: 'Test Project',
    createdAt: '2024-01-01T00:00:00.000Z',
    modifiedAt: '2024-01-01T00:00:00.000Z',
    recordings,
    effects: [],
    settings: { frameRate: 30 } as any,
    exportPresets: [],
    timeline: {
      duration,
      tracks: [
        {
          id: 'track-video',
          name: 'Video',
          type: TrackType.Video,
          clips,
          muted: false,
          locked: false,
        },
      ],
      transcriptEdits,
      effects,
    },
  } as Project
}

function getVideoClips(project: Project): Clip[] {
  return project.timeline.tracks
    .filter(t => t.type === TrackType.Video)
    .flatMap(t => t.clips)
}

// ============================================================================
// Black Box Tests
// ============================================================================

describe('Transcript Skip Export - Black Box', () => {

  describe('Basic Skip Region', () => {
    it('splits clip at skip boundaries and closes gap', () => {
      // INPUT: 1 clip (10s), hidden region 3s-5s (2s skip)
      const recording = createTestRecording('rec-1', 10000)
      const clip = createTestClip('clip-1', 'rec-1', 0, 10000)

      const project = createTestProject(
        [clip],
        [recording],
        {
          'rec-1': {
            hiddenRegions: [{ startTime: 3000, endTime: 5000 }]
          }
        }
      )

      // WHEN: Export transform runs
      const { project: result } = buildExportProject(project)

      // THEN: Verify output
      const outputClips = getVideoClips(result)

      // Should produce 2 clips (split at skip boundaries)
      expect(outputClips).toHaveLength(2)

      // Total duration should be 8s (10s - 2s skip)
      expect(result.timeline.duration).toBe(8000)

      // First segment: 0-3s source → timeline 0-3s
      expect(outputClips[0].startTime).toBe(0)
      expect(outputClips[0].duration).toBe(3000)
      expect(outputClips[0].sourceIn).toBe(0)
      expect(outputClips[0].sourceOut).toBe(3000)

      // Second segment: 5s-10s source → timeline 3s-8s (gap closed)
      expect(outputClips[1].startTime).toBe(3000)
      expect(outputClips[1].duration).toBe(5000)
      expect(outputClips[1].sourceIn).toBe(5000)
      expect(outputClips[1].sourceOut).toBe(10000)
    })
  })

  describe('Multiple Skip Regions', () => {
    it('creates multiple segments and closes all gaps', () => {
      // INPUT: 1 clip (15s), hidden regions 2s-4s and 8s-10s (4s total skip)
      const recording = createTestRecording('rec-1', 15000)
      const clip = createTestClip('clip-1', 'rec-1', 0, 15000)

      const project = createTestProject(
        [clip],
        [recording],
        {
          'rec-1': {
            hiddenRegions: [
              { startTime: 2000, endTime: 4000 },
              { startTime: 8000, endTime: 10000 }
            ]
          }
        }
      )

      // WHEN
      const { project: result } = buildExportProject(project)

      // THEN
      const outputClips = getVideoClips(result)

      // Should produce 3 clips
      expect(outputClips).toHaveLength(3)

      // Total duration should be 11s (15s - 4s skips)
      expect(result.timeline.duration).toBe(11000)

      // Segment 1: 0-2s
      expect(outputClips[0].startTime).toBe(0)
      expect(outputClips[0].duration).toBe(2000)

      // Segment 2: 4s-8s source → timeline 2s-6s
      expect(outputClips[1].startTime).toBe(2000)
      expect(outputClips[1].duration).toBe(4000)

      // Segment 3: 10s-15s source → timeline 6s-11s
      expect(outputClips[2].startTime).toBe(6000)
      expect(outputClips[2].duration).toBe(5000)
    })
  })

  describe('Skip Region at Start', () => {
    it('adjusts sourceIn when skip is at the beginning', () => {
      // INPUT: 1 clip (10s), hidden region 0s-2s
      const recording = createTestRecording('rec-1', 10000)
      const clip = createTestClip('clip-1', 'rec-1', 0, 10000)

      const project = createTestProject(
        [clip],
        [recording],
        {
          'rec-1': {
            hiddenRegions: [{ startTime: 0, endTime: 2000 }]
          }
        }
      )

      // WHEN
      const { project: result } = buildExportProject(project)

      // THEN
      const outputClips = getVideoClips(result)

      // Should produce 1 clip (only kept portion)
      expect(outputClips).toHaveLength(1)

      // Duration should be 8s
      expect(result.timeline.duration).toBe(8000)

      // Clip should start at timeline 0, sourceIn at 2s
      expect(outputClips[0].startTime).toBe(0)
      expect(outputClips[0].duration).toBe(8000)
      expect(outputClips[0].sourceIn).toBe(2000)
      expect(outputClips[0].sourceOut).toBe(10000)
    })
  })

  describe('Skip Region at End', () => {
    it('adjusts sourceOut when skip is at the end', () => {
      // INPUT: 1 clip (10s), hidden region 8s-10s
      const recording = createTestRecording('rec-1', 10000)
      const clip = createTestClip('clip-1', 'rec-1', 0, 10000)

      const project = createTestProject(
        [clip],
        [recording],
        {
          'rec-1': {
            hiddenRegions: [{ startTime: 8000, endTime: 10000 }]
          }
        }
      )

      // WHEN
      const { project: result } = buildExportProject(project)

      // THEN
      const outputClips = getVideoClips(result)

      // Should produce 1 clip
      expect(outputClips).toHaveLength(1)

      // Duration should be 8s
      expect(result.timeline.duration).toBe(8000)

      // sourceOut should be adjusted to 8s
      expect(outputClips[0].startTime).toBe(0)
      expect(outputClips[0].duration).toBe(8000)
      expect(outputClips[0].sourceIn).toBe(0)
      expect(outputClips[0].sourceOut).toBe(8000)
    })
  })

  describe('Multiple Clips with Skips', () => {
    it('repositions subsequent clips when earlier clip has skip', () => {
      // INPUT: Clip 1 (0-5s), Clip 2 (5s-10s), hidden region in clip 1: 2s-3s
      const recording1 = createTestRecording('rec-1', 5000)
      const recording2 = createTestRecording('rec-2', 5000)
      const clip1 = createTestClip('clip-1', 'rec-1', 0, 5000)
      const clip2 = createTestClip('clip-2', 'rec-2', 5000, 5000)

      const project = createTestProject(
        [clip1, clip2],
        [recording1, recording2],
        {
          'rec-1': {
            hiddenRegions: [{ startTime: 2000, endTime: 3000 }]
          }
        }
      )

      // WHEN
      const { project: result } = buildExportProject(project)

      // THEN
      const outputClips = getVideoClips(result)

      // Clip 1 splits into 2 segments, clip 2 repositioned
      expect(outputClips).toHaveLength(3)

      // Total duration: 9s (10s - 1s skip)
      expect(result.timeline.duration).toBe(9000)

      // Clip 1 segment 1: 0-2s
      expect(outputClips[0].startTime).toBe(0)
      expect(outputClips[0].duration).toBe(2000)

      // Clip 1 segment 2: 3s-5s source → timeline 2s-4s
      expect(outputClips[1].startTime).toBe(2000)
      expect(outputClips[1].duration).toBe(2000)

      // Clip 2: repositioned from 5s to 4s
      expect(outputClips[2].startTime).toBe(4000)
      expect(outputClips[2].duration).toBe(5000)
    })
  })

  describe('No Skip Regions (Baseline)', () => {
    it('returns unchanged project when no hidden regions', () => {
      // INPUT: 1 clip (10s), no hidden regions
      const recording = createTestRecording('rec-1', 10000)
      const clip = createTestClip('clip-1', 'rec-1', 0, 10000)

      const project = createTestProject([clip], [recording], {})

      // WHEN
      const { project: result, skipRanges } = buildExportProject(project)

      // THEN
      // Should return original project reference when no skips
      expect(result).toBe(project)
      expect(skipRanges).toHaveLength(0)

      const outputClips = getVideoClips(result)
      expect(outputClips).toHaveLength(1)
      expect(result.timeline.duration).toBe(10000)
    })
  })

  describe('Effects Adjusted with Skips', () => {
    it('shifts effect timing based on skip duration', () => {
      // INPUT: 1 clip (10s), zoom effect 4s-6s, hidden region 2s-3s
      const recording = createTestRecording('rec-1', 10000)
      const clip = createTestClip('clip-1', 'rec-1', 0, 10000)

      const zoomEffect: Effect = {
        id: 'effect-zoom-1',
        type: EffectType.Zoom,
        enabled: true,
        startTime: 4000,
        endTime: 6000,
        data: { scale: 2 }
      } as Effect

      const project = createTestProject(
        [clip],
        [recording],
        {
          'rec-1': {
            hiddenRegions: [{ startTime: 2000, endTime: 3000 }]
          }
        },
        [zoomEffect]
      )

      // WHEN
      const { project: result } = buildExportProject(project)

      // THEN
      const outputEffects = result.timeline.effects || []

      // Effect should be adjusted
      expect(outputEffects.length).toBeGreaterThanOrEqual(1)

      // Find the zoom effect (may have new ID with -skip suffix)
      const adjustedEffect = outputEffects.find(e => e.type === EffectType.Zoom)
      expect(adjustedEffect).toBeDefined()

      // Effect timing shifted by 1s (skip duration before it)
      // Original: 4s-6s → After 1s skip removed: 3s-5s
      expect(adjustedEffect!.startTime).toBe(3000)
      expect(adjustedEffect!.endTime).toBe(5000)
    })
  })

  describe('Entire Clip Skipped', () => {
    it('produces no clips when entire clip is hidden', () => {
      // INPUT: 1 clip (5s), hidden region 0s-5s (entire clip)
      const recording = createTestRecording('rec-1', 5000)
      const clip = createTestClip('clip-1', 'rec-1', 0, 5000)

      const project = createTestProject(
        [clip],
        [recording],
        {
          'rec-1': {
            hiddenRegions: [{ startTime: 0, endTime: 5000 }]
          }
        }
      )

      // WHEN
      const { project: result } = buildExportProject(project)

      // THEN
      const outputClips = getVideoClips(result)

      // No clips should remain
      expect(outputClips).toHaveLength(0)

      // Duration should be 0
      expect(result.timeline.duration).toBe(0)
    })
  })

  describe('Clip with Non-Zero SourceIn', () => {
    it('correctly handles clips that start mid-recording', () => {
      // INPUT: Clip uses recording from 2s-8s (sourceIn=2000, sourceOut=8000)
      // Hidden region in source: 4s-5s
      const recording = createTestRecording('rec-1', 10000)
      const clip: Clip = {
        id: 'clip-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 6000,
        sourceIn: 2000,
        sourceOut: 8000,
        playbackRate: 1,
      }

      const project = createTestProject(
        [clip],
        [recording],
        {
          'rec-1': {
            hiddenRegions: [{ startTime: 4000, endTime: 5000 }]
          }
        }
      )

      // WHEN
      const { project: result } = buildExportProject(project)

      // THEN
      const outputClips = getVideoClips(result)

      // Should split into 2 clips
      expect(outputClips).toHaveLength(2)

      // Total duration: 5s (6s - 1s skip)
      expect(result.timeline.duration).toBe(5000)

      // First segment: source 2s-4s
      expect(outputClips[0].sourceIn).toBe(2000)
      expect(outputClips[0].sourceOut).toBe(4000)
      expect(outputClips[0].duration).toBe(2000)

      // Second segment: source 5s-8s → timeline 2s-5s
      expect(outputClips[1].sourceIn).toBe(5000)
      expect(outputClips[1].sourceOut).toBe(8000)
      expect(outputClips[1].duration).toBe(3000)
      expect(outputClips[1].startTime).toBe(2000)
    })
  })

  describe('Adjacent Skip Regions', () => {
    it('merges adjacent skip regions correctly', () => {
      // INPUT: 1 clip (10s), adjacent hidden regions 2s-3s and 3s-4s
      const recording = createTestRecording('rec-1', 10000)
      const clip = createTestClip('clip-1', 'rec-1', 0, 10000)

      const project = createTestProject(
        [clip],
        [recording],
        {
          'rec-1': {
            hiddenRegions: [
              { startTime: 2000, endTime: 3000 },
              { startTime: 3000, endTime: 4000 }
            ]
          }
        }
      )

      // WHEN
      const { project: result } = buildExportProject(project)

      // THEN
      const outputClips = getVideoClips(result)

      // Should produce 2 clips (merged skip = 2s-4s)
      expect(outputClips).toHaveLength(2)

      // Total duration: 8s (10s - 2s merged skip)
      expect(result.timeline.duration).toBe(8000)
    })
  })
})
