import { describe, it, expect } from '@jest/globals';

describe('Trim reflow contiguity', () => {
  it('executeTrimClipEnd reflows subsequent clips to prevent gaps', () => {
    const { executeTrimClipEnd } = require('../../src/lib/timeline/timeline-operations');

    const clip1 = {
      id: 'clip-1',
      recordingId: 'rec-1',
      startTime: 0,
      duration: 2000,
      sourceIn: 0,
      sourceOut: 4000,
      playbackRate: 2,
    };

    const clip2 = {
      id: 'clip-2',
      recordingId: 'rec-2',
      startTime: 2000,
      duration: 2000,
      sourceIn: 0,
      sourceOut: 2000,
      playbackRate: 1,
    };

    const project = {
      recordings: [],
      timeline: {
        duration: 4000,
        tracks: [
          {
            id: 'track-video',
            type: 'video',
            clips: [clip1, clip2],
          },
        ],
      },
      modifiedAt: '2020-01-01T00:00:00.000Z',
    };

    const ok = executeTrimClipEnd(project, 'clip-1', 1000);
    expect(ok).toBe(true);

    const [updated1, updated2] = project.timeline.tracks[0].clips;
    expect(updated1.duration).toBe(1000);
    // playbackRate=2 => sourceOut should move by 1000*2
    expect(updated1.sourceOut).toBe(2000);

    // Contiguous reflow: clip2 should start right after clip1 ends
    expect(updated2.startTime).toBe(1000);
    expect(project.timeline.duration).toBe(3000);
  });
});

