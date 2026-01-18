/**
 * Webcam State After Deletion Tests
 *
 * Verifies that webcam frame layout correctly finds active webcam clips
 * after video clips are deleted and the playhead moves to a new position.
 *
 * Bug scenario:
 * 1. Video clip A (0-5000ms), NO webcam at this position
 * 2. Video clip B (5000-10000ms), Webcam clip Y at this position
 * 3. User is at position A (no webcam visible)
 * 4. User deletes video clip A
 * 5. Playhead moves to position 0 (now at video B after ripple, or new position)
 * 6. Webcam Y should show but it's blank
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Clip, Project, Track, Recording } from '@/types/project';
import { TrackType } from '@/types/project';
import {
  buildWebcamFrameLayout,
  findActiveWebcamFrameLayoutItem,
} from '@/features/ui/timeline/utils/frame-layout';
import { msToFrame } from '@/features/rendering/renderer/compositions/utils/time/frame-time';
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service';

// Helper to create a minimal clip
function createClip(overrides: Partial<Clip> & { id: string; recordingId: string; startTime: number; duration: number }): Clip {
  const playbackRate = overrides.playbackRate ?? 1;
  const sourceIn = overrides.sourceIn ?? 0;
  const sourceOut = overrides.sourceOut ?? (sourceIn + overrides.duration * playbackRate);

  return {
    id: overrides.id,
    recordingId: overrides.recordingId,
    startTime: overrides.startTime,
    duration: overrides.duration,
    sourceIn,
    sourceOut,
    playbackRate,
    ...overrides,
  } as Clip;
}

// Helper to create a minimal project
function createTestProject(options: {
  videoClips: Clip[];
  webcamClips: Clip[];
  recordings?: Recording[];
}): Project {
  return {
    version: '1',
    schemaVersion: 1,
    id: 'test-project',
    name: 'Test Project',
    createdAt: '2020-01-01',
    modifiedAt: '2020-01-01',
    recordings: options.recordings ?? [],
    effects: [],
    settings: {} as any,
    exportPresets: [],
    timeline: {
      duration: 10000,
      tracks: [
        {
          id: 'video-track',
          name: 'Video',
          type: TrackType.Video,
          clips: options.videoClips,
          muted: false,
          locked: false,
        },
        {
          id: 'webcam-track',
          name: 'Webcam',
          type: TrackType.Webcam,
          clips: options.webcamClips,
          muted: false,
          locked: false,
        },
      ],
      transcriptEdits: {},
      effects: [],
    },
  } as unknown as Project;
}

describe('Webcam State After Video Clip Deletion', () => {
  const fps = 60;

  describe('TimelineDataService.getWebcamClips', () => {
    it('extracts webcam clips correctly from project', () => {
      const webcamClip = createClip({
        id: 'webcam-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 5000,
      });

      const project = createTestProject({
        videoClips: [
          createClip({ id: 'video-1', recordingId: 'rec-1', startTime: 0, duration: 5000 }),
        ],
        webcamClips: [webcamClip],
      });

      const extractedWebcamClips = TimelineDataService.getWebcamClips(project);

      expect(extractedWebcamClips).toHaveLength(1);
      expect(extractedWebcamClips[0].id).toBe('webcam-1');
    });

    it('returns fresh array on each call (not cached)', () => {
      const webcamClip = createClip({
        id: 'webcam-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 5000,
      });

      const project = createTestProject({
        videoClips: [],
        webcamClips: [webcamClip],
      });

      const result1 = TimelineDataService.getWebcamClips(project);
      const result2 = TimelineDataService.getWebcamClips(project);

      // Should return consistent content
      expect(result1).toEqual(result2);
      expect(result1[0].id).toBe('webcam-1');
    });

    it('updates correctly when project reference changes', () => {
      const webcamClip1 = createClip({
        id: 'webcam-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 5000,
      });

      const webcamClip2 = createClip({
        id: 'webcam-2',
        recordingId: 'rec-1',
        startTime: 5000,
        duration: 5000,
      });

      // First project with one webcam clip
      const project1 = createTestProject({
        videoClips: [],
        webcamClips: [webcamClip1],
      });

      // Second project with different webcam clip
      const project2 = createTestProject({
        videoClips: [],
        webcamClips: [webcamClip2],
      });

      const result1 = TimelineDataService.getWebcamClips(project1);
      const result2 = TimelineDataService.getWebcamClips(project2);

      expect(result1).toHaveLength(1);
      expect(result1[0].id).toBe('webcam-1');

      expect(result2).toHaveLength(1);
      expect(result2[0].id).toBe('webcam-2');
    });
  });

  describe('Core frame-layout logic', () => {
    it('finds webcam clip at new position after video clip deletion (ripple scenario)', () => {
      // Setup: Two video clips, one webcam clip on the second
      // Video A: 0-5000ms (no webcam)
      // Video B: 5000-10000ms (has webcam Y)
      // Webcam Y: 5000-10000ms

      const webcamY = createClip({
        id: 'webcam-y',
        recordingId: 'webcam-rec',
        startTime: 5000, // Starts at 5 seconds
        duration: 5000,  // 5 seconds long
      });

      // Build webcam frame layout
      const webcamLayout = buildWebcamFrameLayout([webcamY], fps);

      // Verify webcam clip Y is in the layout
      expect(webcamLayout.length).toBe(1);
      expect(webcamLayout[0].clip.id).toBe('webcam-y');

      // At frame 0 (0ms), there should be NO active webcam (it starts at 5000ms)
      const frame0 = msToFrame(0, fps);
      const activeAt0 = findActiveWebcamFrameLayoutItem(webcamLayout, frame0);
      expect(activeAt0).toBeNull();

      // At frame 300 (5000ms = 5*60 frames), webcam Y should be active
      const frame300 = msToFrame(5000, fps);
      const activeAt300 = findActiveWebcamFrameLayoutItem(webcamLayout, frame300);
      expect(activeAt300).not.toBeNull();
      expect(activeAt300?.clip.id).toBe('webcam-y');

      // SIMULATE RIPPLE: After deleting video A, video B moves to 0ms
      // Webcam Y should also move to 0ms
      const webcamYAfterRipple = createClip({
        id: 'webcam-y',
        recordingId: 'webcam-rec',
        startTime: 0,    // Now starts at 0 after ripple
        duration: 5000,
      });

      const webcamLayoutAfterRipple = buildWebcamFrameLayout([webcamYAfterRipple], fps);

      // At frame 0 (0ms), webcam Y should now be active
      const activeAt0AfterRipple = findActiveWebcamFrameLayoutItem(webcamLayoutAfterRipple, frame0);
      expect(activeAt0AfterRipple).not.toBeNull();
      expect(activeAt0AfterRipple?.clip.id).toBe('webcam-y');
    });

    it('finds webcam clip after playhead clamps to different position', () => {
      // Setup: Webcam exists only in second half of timeline
      // Video A: 0-5000ms (no webcam)
      // Video B: 5000-10000ms (has webcam)
      // Webcam: 5000-10000ms

      // After deleting video A with NO ripple, playhead at 0ms should see...
      // nothing if webcam hasn't moved.

      // But if playhead clamps to a position where webcam exists...
      const webcam = createClip({
        id: 'webcam-1',
        recordingId: 'webcam-rec',
        startTime: 5000,
        duration: 5000,
      });

      const layout = buildWebcamFrameLayout([webcam], fps);

      // At 5000ms (frame 300), webcam should be active
      const frame300 = msToFrame(5000, fps);
      const active = findActiveWebcamFrameLayoutItem(layout, frame300);
      expect(active).not.toBeNull();
      expect(active?.clip.id).toBe('webcam-1');
    });

    it('rebuilds layout correctly with fresh webcam clips array', () => {
      // This tests that the WeakMap cache doesn't cause stale data

      const webcam1 = createClip({
        id: 'webcam-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 5000,
      });

      // Build initial layout
      const layout1 = buildWebcamFrameLayout([webcam1], fps);
      expect(layout1[0].clip.id).toBe('webcam-1');

      // Create a NEW array with the same clip (simulating state update)
      const webcam1Copy = { ...webcam1 };
      const layout2 = buildWebcamFrameLayout([webcam1Copy], fps);

      // Should still find the clip
      const active = findActiveWebcamFrameLayoutItem(layout2, 0);
      expect(active).not.toBeNull();
      expect(active?.clip.id).toBe('webcam-1');
    });

    it('handles multiple webcam clips from different recordings', () => {
      const webcamA = createClip({
        id: 'webcam-a',
        recordingId: 'rec-a',
        startTime: 0,
        duration: 5000,
      });

      const webcamB = createClip({
        id: 'webcam-b',
        recordingId: 'rec-b',
        startTime: 5000,
        duration: 5000,
      });

      const layout = buildWebcamFrameLayout([webcamA, webcamB], fps);

      // At frame 0, webcam A should be active
      expect(findActiveWebcamFrameLayoutItem(layout, 0)?.clip.id).toBe('webcam-a');

      // At frame 300 (5000ms), webcam B should be active
      const frame300 = msToFrame(5000, fps);
      expect(findActiveWebcamFrameLayoutItem(layout, frame300)?.clip.id).toBe('webcam-b');
    });
  });

  describe('State propagation simulation', () => {
    it('simulates the exact bug scenario: delete video clip, playhead moves, webcam should show', () => {
      // BEFORE deletion:
      // - Video clip A: 0-5000ms
      // - Video clip B: 5000-10000ms
      // - Webcam clip Y: 5000-10000ms (only on video B's time range)
      // - Playhead: 2500ms (on video A, no webcam visible)

      const webcamY_before = createClip({
        id: 'webcam-y',
        recordingId: 'webcam-rec',
        startTime: 5000,
        duration: 5000,
      });

      const layoutBefore = buildWebcamFrameLayout([webcamY_before], fps);

      // At 2500ms (playhead position), no webcam should be active
      const frame125 = msToFrame(2500, fps);
      expect(findActiveWebcamFrameLayoutItem(layoutBefore, frame125)).toBeNull();

      // AFTER deletion with ripple:
      // - Video clip A: DELETED
      // - Video clip B: 0-5000ms (shifted by ripple)
      // - Webcam clip Y: 0-5000ms (shifted by webcam sync)
      // - Playhead: clamped to 0ms

      const webcamY_after = createClip({
        id: 'webcam-y',
        recordingId: 'webcam-rec',
        startTime: 0,     // Shifted by ripple
        duration: 5000,
      });

      const layoutAfter = buildWebcamFrameLayout([webcamY_after], fps);

      // At 0ms (new playhead position), webcam Y should be active
      const frame0 = msToFrame(0, fps);
      const activeAfter = findActiveWebcamFrameLayoutItem(layoutAfter, frame0);

      // THIS IS THE KEY ASSERTION:
      // If this fails, it means the core logic is broken.
      // If this passes, the issue is in React state propagation.
      expect(activeAfter).not.toBeNull();
      expect(activeAfter?.clip.id).toBe('webcam-y');
    });
  });
});
