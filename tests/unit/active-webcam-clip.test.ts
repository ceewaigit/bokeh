import { describe, expect, it } from '@jest/globals';
import type { Clip } from '@/types/project';
import { orderWebcamClipsForSelection, selectActiveWebcamClipAtTime } from '@/features/media/webcam/utils/active-webcam-clip';

function clip(partial: Partial<Clip> & Pick<Clip, 'id' | 'startTime' | 'duration' | 'recordingId'>): Clip {
  return {
    sourceIn: 0,
    sourceOut: partial.duration,
    playbackRate: 1,
    ...partial,
  } as Clip;
}

describe('active webcam clip selection', () => {
  it('prefers the newest clip when overlaps occur', () => {
    const older = clip({ id: 'old', startTime: 0, duration: 10_000, recordingId: 'rec' });
    const newer = clip({ id: 'new', startTime: 2_000, duration: 3_000, recordingId: 'rec' });

    const ordered = orderWebcamClipsForSelection([older, newer]);
    expect(selectActiveWebcamClipAtTime(ordered, 2_500)?.id).toBe('new');
  });

  it('prefers the clip that starts exactly at the boundary', () => {
    const first = clip({ id: 'a', startTime: 0, duration: 1_000, recordingId: 'rec' });
    const second = clip({ id: 'b', startTime: 1_000, duration: 1_000, recordingId: 'rec' });

    const ordered = orderWebcamClipsForSelection([first, second]);
    expect(selectActiveWebcamClipAtTime(ordered, 1_000)?.id).toBe('b');
  });

  it('returns null when no clip is active', () => {
    const c1 = clip({ id: 'a', startTime: 0, duration: 1_000, recordingId: 'rec' });
    const ordered = orderWebcamClipsForSelection([c1]);
    expect(selectActiveWebcamClipAtTime(ordered, 5_000)).toBeNull();
  });
});

