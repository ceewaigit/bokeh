/**
 * Webcam Sync with Speed-Up Tests
 *
 * Verifies that webcam clips are correctly synchronized with main video clips
 * after speed-up operations, especially when clips have different timeline positions.
 */

import { SpeedUpApplicationService } from '@/features/ui/timeline/speed-up-application';
import type { Project, Clip } from '@/types/project';
import { TrackType } from '@/types/project';

function createTestProject(videoClips: Clip[], webcamClips: Clip[]): Project {
    const videoRecording = {
        id: 'video-rec-1',
        sourceType: 'video' as const,
        filePath: '/tmp/test-video.mp4',
        duration: 30000,
        width: 1920,
        height: 1080,
        frameRate: 60,
        effects: [],
        metadata: {
            keyboardEvents: [],
            mouseEvents: [],
            clickEvents: [],
            screenEvents: [],
        },
    };

    const webcamRecording = {
        id: 'webcam-rec-1',
        sourceType: 'video' as const,
        filePath: '/tmp/test-webcam.mp4',
        duration: 30000,
        width: 1280,
        height: 720,
        frameRate: 30,
        effects: [],
        metadata: {
            keyboardEvents: [],
            mouseEvents: [],
            clickEvents: [],
            screenEvents: [],
        },
    };

    return {
        id: 'project-1',
        version: '1.0.0',
        schemaVersion: 1,
        name: 'Test Project',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        recordings: [videoRecording, webcamRecording],
        timeline: {
            tracks: [
                {
                    id: 'video-track-1',
                    name: 'Video Track',
                    type: TrackType.Video,
                    clips: videoClips,
                    muted: false,
                    locked: false,
                },
                {
                    id: 'webcam-track-1',
                    name: 'Webcam Track',
                    type: TrackType.Webcam,
                    clips: webcamClips,
                    muted: false,
                    locked: false,
                },
            ],
            duration: Math.max(
                ...videoClips.map(c => c.startTime + c.duration),
                ...webcamClips.map(c => c.startTime + c.duration)
            ),
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

describe('webcam sync with speed-up - aligned clips', () => {
    it('syncs webcam segments correctly when both clips start at timeline 0', () => {
        // Both clips start at timeline 0 with sourceIn 0 - standard case
        const videoClips: Clip[] = [{
            id: 'video-clip-1',
            recordingId: 'video-rec-1',
            startTime: 0,
            duration: 30000,
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 1,
        }];

        const webcamClips: Clip[] = [{
            id: 'webcam-clip-1',
            recordingId: 'webcam-rec-1',
            startTime: 0,
            duration: 30000,
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 1,
        }];

        const project = createTestProject(videoClips, webcamClips);

        // Speed up source 10000-20000ms at 2x
        const periods = [{ startTime: 10000, endTime: 20000, suggestedSpeedMultiplier: 2 }];

        SpeedUpApplicationService.applySpeedUpToClip(
            project,
            'video-clip-1',
            periods,
            ['typing']
        );

        // Check video track was split correctly
        const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)!;
        expect(videoTrack.clips.length).toBe(3); // Before, during, after speed-up

        // Check webcam track was synced
        const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!;
        expect(webcamTrack.clips.length).toBe(3); // Should also be split into 3

        // Find the sped-up segments
        const videoSpeedUpSegment = videoTrack.clips.find(c => c.playbackRate === 2);
        const webcamSpeedUpSegment = webcamTrack.clips.find(c => c.playbackRate === 2);

        expect(videoSpeedUpSegment).toBeTruthy();
        expect(webcamSpeedUpSegment).toBeTruthy();

        // Both should have the same timeline position
        expect(webcamSpeedUpSegment!.startTime).toBe(videoSpeedUpSegment!.startTime);
        expect(webcamSpeedUpSegment!.duration).toBe(videoSpeedUpSegment!.duration);
        expect(webcamSpeedUpSegment!.sourceIn).toBe(videoSpeedUpSegment!.sourceIn);
        expect(webcamSpeedUpSegment!.sourceOut).toBe(videoSpeedUpSegment!.sourceOut);
    });
});

describe('webcam sync with speed-up - offset clips', () => {
    it('syncs webcam segments correctly when webcam starts at different timeline position', () => {
        // Video starts at timeline 0, webcam starts at timeline 5000
        // This simulates webcam being enabled 5 seconds after recording started
        const videoClips: Clip[] = [{
            id: 'video-clip-1',
            recordingId: 'video-rec-1',
            startTime: 0,
            duration: 30000,
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 1,
        }];

        const webcamClips: Clip[] = [{
            id: 'webcam-clip-1',
            recordingId: 'webcam-rec-1',
            startTime: 5000,  // Starts 5 seconds into the timeline
            duration: 25000,  // 25 seconds long
            sourceIn: 0,      // Webcam recording starts at its own source 0
            sourceOut: 25000,
            playbackRate: 1,
        }];

        const project = createTestProject(videoClips, webcamClips);

        // Speed up video source 10000-20000ms at 2x
        // This is timeline 10000-15000ms after speed-up for video
        // For webcam, this should affect its source 5000-15000ms (offset by 5000)
        const periods = [{ startTime: 10000, endTime: 20000, suggestedSpeedMultiplier: 2 }];

        SpeedUpApplicationService.applySpeedUpToClip(
            project,
            'video-clip-1',
            periods,
            ['typing']
        );

        // Get the tracks after speed-up
        const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)!;
        const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!;

        // Find the sped-up segments
        const videoSpeedUpSegment = videoTrack.clips.find(c => c.playbackRate === 2);
        const webcamSpeedUpSegment = webcamTrack.clips.find(c => c.playbackRate === 2);

        expect(videoSpeedUpSegment).toBeTruthy();
        expect(webcamSpeedUpSegment).toBeTruthy();

        // The webcam's sped-up segment should start at the same TIMELINE position as video's
        // Video: timeline 10000ms = source 10000ms (rate 1 before)
        // Webcam: timeline 10000ms = webcam source 5000ms (since webcam starts at timeline 5000)
        expect(webcamSpeedUpSegment!.startTime).toBe(videoSpeedUpSegment!.startTime);

        // Both segments should have the same timeline duration (5000ms at 2x)
        expect(webcamSpeedUpSegment!.duration).toBe(videoSpeedUpSegment!.duration);
    });

    it('correctly handles webcam with different sourceIn', () => {
        // Both at timeline 0, but webcam has different sourceIn
        // This simulates webcam being trimmed
        const videoClips: Clip[] = [{
            id: 'video-clip-1',
            recordingId: 'video-rec-1',
            startTime: 0,
            duration: 30000,
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 1,
        }];

        const webcamClips: Clip[] = [{
            id: 'webcam-clip-1',
            recordingId: 'webcam-rec-1',
            startTime: 0,
            duration: 25000,
            sourceIn: 5000,   // Webcam starts from source 5000 (trimmed beginning)
            sourceOut: 30000,
            playbackRate: 1,
        }];

        const project = createTestProject(videoClips, webcamClips);

        // Speed up video source 10000-20000ms at 2x
        const periods = [{ startTime: 10000, endTime: 20000, suggestedSpeedMultiplier: 2 }];

        SpeedUpApplicationService.applySpeedUpToClip(
            project,
            'video-clip-1',
            periods,
            ['typing']
        );

        const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)!;
        const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!;

        const videoSpeedUpSegment = videoTrack.clips.find(c => c.playbackRate === 2);
        const webcamSpeedUpSegment = webcamTrack.clips.find(c => c.playbackRate === 2);

        expect(videoSpeedUpSegment).toBeTruthy();
        expect(webcamSpeedUpSegment).toBeTruthy();

        // Webcam speed-up should be at same timeline position
        expect(webcamSpeedUpSegment!.startTime).toBe(videoSpeedUpSegment!.startTime);
    });
});

describe('webcam sync with speed-up - no overlap', () => {
    it('does not affect webcam clips that do not overlap the video clip', () => {
        const videoClips: Clip[] = [{
            id: 'video-clip-1',
            recordingId: 'video-rec-1',
            startTime: 0,
            duration: 10000,
            sourceIn: 0,
            sourceOut: 10000,
            playbackRate: 1,
        }];

        // Webcam clip starts after video clip ends
        const webcamClips: Clip[] = [{
            id: 'webcam-clip-1',
            recordingId: 'webcam-rec-1',
            startTime: 15000,  // Starts after video ends at 10000
            duration: 10000,
            sourceIn: 0,
            sourceOut: 10000,
            playbackRate: 1,
        }];

        const project = createTestProject(videoClips, webcamClips);

        const periods = [{ startTime: 2000, endTime: 8000, suggestedSpeedMultiplier: 2 }];

        SpeedUpApplicationService.applySpeedUpToClip(
            project,
            'video-clip-1',
            periods,
            ['typing']
        );

        const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!;

        // Webcam should not be split (no overlap)
        expect(webcamTrack.clips.length).toBe(1);

        // But it should be shifted because video duration changed
        const webcamClip = webcamTrack.clips[0];
        // Video duration changed from 10000 to 7000 (3000ms reduction), so webcam shifts
        expect(webcamClip.playbackRate).toBe(1); // Not sped up
    });
});
