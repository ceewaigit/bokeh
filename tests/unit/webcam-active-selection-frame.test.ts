import { describe, expect, it } from '@jest/globals';
import type { Clip } from '@/types/project';
import { buildWebcamFrameLayout, findActiveWebcamFrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout';

function clip(partial: Partial<Clip> & Pick<Clip, 'id' | 'startTime' | 'duration' | 'recordingId'>): Clip {
  return {
    sourceIn: 0,
    sourceOut: partial.duration,
    playbackRate: 1,
    ...partial,
  } as Clip;
}

describe('webcam active selection uses frame space', () => {
  it('switches immediately at frame boundary even with fractional ms', () => {
    const fps = 30;
    const frameMs = 1000 / fps;

    // Make start/duration values fractional to simulate accumulated float drift.
    const a = clip({ id: 'a', recordingId: 'rec', startTime: 0, duration: frameMs * 10 + 0.37 });
    const b = clip({ id: 'b', recordingId: 'rec', startTime: a.startTime + a.duration, duration: frameMs * 10 + 0.19 });

    const layout = buildWebcamFrameLayout([a, b], fps);

    const aItem = layout.find(i => i.clip.id === 'a')!;
    const bItem = layout.find(i => i.clip.id === 'b')!;

    // Frame right before B starts should still be A (if A covers it).
    const frameBeforeB = bItem.startFrame - 1;
    if (frameBeforeB >= aItem.startFrame) {
      expect(findActiveWebcamFrameLayoutItem(layout, frameBeforeB)?.clip.id).toBe('a');
    }

    // Frame where B starts should be B (boundary preference).
    expect(findActiveWebcamFrameLayoutItem(layout, bItem.startFrame)?.clip.id).toBe('b');
  });
});
