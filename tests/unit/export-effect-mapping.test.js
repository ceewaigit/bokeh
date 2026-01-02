describe('Export Effect Mapping', () => {

// Mock data
const clips = [
  {
    id: 'clip-1',
    recordingId: 'rec-1',
    startTime: 1000, // Starts at 1s on timeline
    duration: 5000,  // 5s duration
    sourceIn: 2000,  // Starts at 2s in recording
    sourceOut: 7000, // Ends at 7s in recording
  },
  {
    id: 'clip-2',
    recordingId: 'rec-1', // Same recording
    startTime: 10000, // Starts at 10s on timeline
    duration: 3000,   // 3s duration
    sourceIn: 0,      // Starts at 0s in recording
    sourceOut: 3000,  // Ends at 3s in recording
  }
];

const recordings = [
  {
    id: 'rec-1',
    duration: 10000,
    effects: [
      {
        id: 'cursor-effect',
        type: 'cursor',
        startTime: 0,
        endTime: 10000, // Covers entire recording
        data: { size: 2 }
      },
      {
        id: 'short-effect',
        type: 'other',
        startTime: 5000, // 5s to 6s in recording
        endTime: 6000
      }
    ]
  }
];

// logic from export/index.ts
function mapEffects(allClips, downsampledRecordings) {
      const recordingEffectsMapped = allClips.flatMap((clip) => {
        const recording = downsampledRecordings.find((r) => r.id === clip.recordingId)
        if (!recording || !recording.effects) return []

        const clipSourceIn = clip.sourceIn ?? 0
        const clipSourceOut = clip.sourceOut ?? (clipSourceIn + clip.duration)

        return recording.effects
          .filter((effect) => {
            // Check if effect overlaps with the used part of the recording
            return effect.startTime < clipSourceOut && effect.endTime > clipSourceIn
          })
          .map((effect) => {
            // Project source-relative effect to timeline-relative
            // Calculate overlap duration to clamp correctly
            const overlapStart = Math.max(effect.startTime, clipSourceIn)
            const overlapEnd = Math.min(effect.endTime, clipSourceOut)

            // Map to timeline
            const timelineStartTime = clip.startTime + (overlapStart - clipSourceIn)
            const timelineEndTime = clip.startTime + (overlapEnd - clipSourceIn)

            return {
              ...effect,
              id: `${effect.id}-mapped-${clip.id}`, // Unique ID for this clip instance
              startTime: timelineStartTime,
              endTime: timelineEndTime,
              clipId: clip.id // Explicitly bind to clip for safety
            }
          })
      })
      return recordingEffectsMapped;
}

const mapped = mapEffects(clips, recordings);

test('cursor-effect should be mapped for clip-1 with correct times', () => {
  const cursorClip1 = mapped.find(e => e.id === 'cursor-effect-mapped-clip-1');
  expect(cursorClip1).toBeDefined();
  // Clip 1 uses 2s-7s of recording. Cursor covers 0-10s. Overlap: 2s-7s.
  // Timeline placement: 1000 + (2000 - 2000) = 1000.
  // Timeline end: 1000 + (7000 - 2000) = 6000.
  expect(cursorClip1.startTime).toBe(1000);
  expect(cursorClip1.endTime).toBe(6000);
});

test('short-effect should be mapped for clip-1 with correct times', () => {
  const shortClip1 = mapped.find(e => e.id === 'short-effect-mapped-clip-1');
  expect(shortClip1).toBeDefined();
  // Clip 1 uses 2s-7s. Short effect is 5s-6s. It is FULLY contained.
  // Overlap start: 5000. Overlap end: 6000.
  // Timeline start: 1000 + (5000 - 2000) = 4000.
  // Timeline end: 1000 + (6000 - 2000) = 5000.
  expect(shortClip1.startTime).toBe(4000);
  expect(shortClip1.endTime).toBe(5000);
});

test('cursor-effect should be mapped for clip-2 with correct times', () => {
  const cursorClip2 = mapped.find(e => e.id === 'cursor-effect-mapped-clip-2');
  expect(cursorClip2).toBeDefined();
  // Clip 2 uses 0s-3s. Cursor covers 0-10s. Overlap: 0s-3s.
  // Timeline start: 10000 + (0 - 0) = 10000.
  // Timeline end: 10000 + (3000 - 0) = 13000.
  expect(cursorClip2.startTime).toBe(10000);
  expect(cursorClip2.endTime).toBe(13000);
});

test('short-effect should NOT be mapped for clip-2 (no overlap)', () => {
  const shortClip2 = mapped.find(e => e.id === 'short-effect-mapped-clip-2');
  // Clip 2 uses 0s-3s. Short effect is 5s-6s. No overlap.
  expect(shortClip2).toBeUndefined();
});

}); // End describe
