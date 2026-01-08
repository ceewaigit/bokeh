/**
 * Keystroke Sync with Speed-Up Tests
 * 
 * Verifies that keystroke effects are correctly positioned after timeline operations
 * that change clip boundaries or playback rates.
 */

import { syncKeystrokeEffects } from '@/features/effects/services/keystroke-sync-service';
import { sourceToTimeline } from '@/features/ui/timeline/time/time-space-converter';
import type { Project, Clip, RecordingMetadata, KeyboardEvent } from '@/types/project';
import { TrackType } from '@/types/project';

function createTestProject(clips: Clip[], keyboardEvents: KeyboardEvent[]): Project {
    const recording = {
        id: 'rec-1',
        sourceType: 'video' as const,
        filePath: '/tmp/test.mp4',
        duration: 10000,
        width: 1920,
        height: 1080,
        frameRate: 60,
        effects: [],
        metadata: {
            keyboardEvents,
            mouseEvents: [],
            clickEvents: [],
            screenEvents: [],
        } as RecordingMetadata,
    };

    return {
        id: 'project-1',
        version: '1.0.0',
        schemaVersion: 1,
        name: 'Test Project',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        recordings: [recording],
        timeline: {
            tracks: [{
                id: 'track-1',
                name: 'Video Track',
                type: TrackType.Video,
                clips,
                muted: false,
                locked: false,
            }],
            duration: clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0),
            effects: [],
        },
        settings: {
            frameRate: 60,
            resolution: { width: 1920, height: 1080 },
            backgroundColor: '#000000',
            audio: { volume: 1, muted: false, fadeInDuration: 0, fadeOutDuration: 0, enhanceAudio: false },
            canvas: { aspectRatio: 'original' as any },
        } as any,
        exportPresets: [],
    } as Project;
}

describe('sourceToTimeline with playbackRate', () => {
    it('correctly maps source time to timeline for 2x speed clip', () => {
        // Clip: 2x speed, covers source 0-2000ms, starts at timeline 0
        const clip: Clip = {
            id: 'clip-1',
            recordingId: 'rec-1',
            startTime: 0, // Timeline position
            duration: 1000, // 2000ms source at 2x = 1000ms timeline
            sourceIn: 0,
            sourceOut: 2000,
            playbackRate: 2,
        };

        // Source time 1000ms should map to timeline 500ms (halfway through the clip)
        const timelinePos = sourceToTimeline(1000, clip);
        expect(timelinePos).toBe(500);
    });

    it('handles split clips with different playback rates', () => {
        // After speed-up split, we have:
        // Clip 1: source 0-2000 at 1x speed -> timeline 0-2000
        // Clip 2: source 2000-4000 at 2x speed -> timeline 2000-3000
        // Clip 3: source 4000-10000 at 1x speed -> timeline 3000-9000

        const clip2: Clip = {
            id: 'clip-2',
            recordingId: 'rec-1',
            startTime: 2000,
            duration: 1000, // 2000ms source / 2x = 1000ms
            sourceIn: 2000,
            sourceOut: 4000,
            playbackRate: 2,
        };

        // Source time 3000ms (middle of clip 2's source range)
        // Should map to timeline 2500ms (halfway through clip 2)
        const timelinePos = sourceToTimeline(3000, clip2);
        expect(timelinePos).toBe(2500);
    });
});

describe('syncKeystrokeEffects after speed-up', () => {
    it('positions keystroke effects correctly after 2x speed-up split', () => {
        // Keyboard event at source time 3000ms
        const keyboardEvents: KeyboardEvent[] = [
            { timestamp: 3000, key: 'KeyA', modifiers: [] },
            { timestamp: 3200, key: 'KeyB', modifiers: [] },
        ];

        // After speed-up split:
        // Clip 1: source 0-2000 at 1x -> timeline 0-2000
        // Clip 2: source 2000-4000 at 2x -> timeline 2000-3000 (sped up section)
        // Clip 3: source 4000-10000 at 1x -> timeline 3000-9000

        const clips: Clip[] = [
            {
                id: 'clip-1-part-0',
                recordingId: 'rec-1',
                startTime: 0,
                duration: 2000,
                sourceIn: 0,
                sourceOut: 2000,
                playbackRate: 1,
            },
            {
                id: 'clip-1-part-1',
                recordingId: 'rec-1',
                startTime: 2000,
                duration: 1000, // 2000ms source / 2x
                sourceIn: 2000,
                sourceOut: 4000,
                playbackRate: 2,
            },
            {
                id: 'clip-1-part-2',
                recordingId: 'rec-1',
                startTime: 3000,
                duration: 6000,
                sourceIn: 4000,
                sourceOut: 10000,
                playbackRate: 1,
            },
        ];

        const project = createTestProject(clips, keyboardEvents);
        syncKeystrokeEffects(project);

        // Check that keystroke effects were created
        const keystrokeEffects = project.timeline.effects?.filter(e => e.type === 'keystroke') || [];
        expect(keystrokeEffects.length).toBeGreaterThan(0);

        // The keystroke cluster (3000-3200ms source) should be in clip-1-part-1 (2x speed section)
        // Source 3000ms -> timeline position = 2000 + (3000-2000)/2 = 2500ms
        // Source 3200ms -> timeline position = 2000 + (3200-2000)/2 = 2600ms
        // With padding, the effect should start around 2500-500=2000ms and end around 2600+500=3100ms

        const effect = keystrokeEffects[0];
        // Effect should be positioned in the 2000-3000 timeline range (clip-1-part-1)
        expect(effect.startTime).toBeGreaterThanOrEqual(2000);
        expect(effect.endTime).toBeLessThanOrEqual(4000); // With padding buffer
    });
});
