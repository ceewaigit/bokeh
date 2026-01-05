
import { mapRecordingEffectsToTimeline } from '../../electron/main/export/utils/effect-mapper';

describe('Export Effect Mapping (Cursor Scaling Regression)', () => {
  it('correctly maps recording-scoped cursor effects to timeline-scoped effects', () => {
    // -------------------------------------------------------------------------
    // TEST DATA
    // -------------------------------------------------------------------------
    const CLIP_START_TIME = 10000;
    const CLIP_DURATION = 5000;
    const RECORDING_DURATION = 5000;

    const mockClips = [
      {
        id: 'clip-1',
        recordingId: 'rec-1',
        startTime: CLIP_START_TIME,
        duration: CLIP_DURATION,
        sourceIn: 0,
        sourceOut: RECORDING_DURATION,
      }
    ];

    const mockRecordings = [
      {
        id: 'rec-1',
        duration: RECORDING_DURATION,
        effects: [
          {
            id: 'cursor-effect-1',
            type: 'cursor',
            startTime: 0,
            endTime: RECORDING_DURATION,
            data: { size: 3.5 } // User set scale to 3.5x
          }
        ]
      }
    ];

    // -------------------------------------------------------------------------
    // EXECUTE
    // -------------------------------------------------------------------------
    const resultEffects = mapRecordingEffectsToTimeline(mockClips, mockRecordings);

    // -------------------------------------------------------------------------
    // ASSERT
    // -------------------------------------------------------------------------
    
    // We expect 1 effect
    expect(resultEffects).toHaveLength(1);

    const effect = resultEffects[0];
    
    // Check timing mapping
    // Original: 0-5000 (Source)
    // Clip: 10000 (Timeline)
    // Mapped: 10000-15000 (Timeline)
    expect(effect.startTime).toBe(10000);
    expect(effect.endTime).toBe(15000);
    
    // Check data integrity
    expect(effect.type).toBe('cursor');
    expect(effect.data.size).toBe(3.5);
    
    // Check ID uniqueness
    expect(effect.id).toContain('mapped-clip-1');
  });

  it('filters out effects that do not overlap the clip source range', () => {
    const mockClips = [
      {
        id: 'clip-2',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 2000,
        sourceIn: 0,
        sourceOut: 2000,
      }
    ];

    const mockRecordings = [
      {
        id: 'rec-1',
        effects: [
          {
            id: 'late-effect',
            startTime: 4000, // Starts after clip source out
            endTime: 5000,
            data: {}
          }
        ]
      }
    ];

    const result = mapRecordingEffectsToTimeline(mockClips, mockRecordings);
    expect(result).toHaveLength(0);
  });
});
