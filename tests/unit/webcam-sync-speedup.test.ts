/**
 * Webcam Sync with Speed-Up Tests
 *
 * Verifies that webcam clips are correctly synchronized with main video clips
 * after speed-up operations, especially when clips have different timeline positions.
 */

import { SpeedUpApplicationService } from '@/features/ui/timeline/speed-up-application';
import { TimelineSyncOrchestrator } from '@/features/effects/sync';
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

/**
 * Helper to apply speed-up and sync webcam clips via TimelineSyncOrchestrator.
 * This mirrors what ApplySpeedUpCommand does.
 */
function applySpeedUpWithSync(
    project: Project,
    clipId: string,
    periods: Array<{ startTime: number; endTime: number; suggestedSpeedMultiplier: number }>,
    originalClip: Clip
) {
    const result = SpeedUpApplicationService.applySpeedUpToClip(
        project,
        clipId,
        periods,
        ['typing']
    );

    // Build ClipChange and call TimelineSyncOrchestrator for webcam sync
    if (result.segmentMapping) {
        TimelineSyncOrchestrator.commit(project, {
            type: 'speed-up',
            clipId,
            recordingId: originalClip.recordingId,
            sourceTrackType: TrackType.Video,
            before: {
                startTime: originalClip.startTime,
                endTime: originalClip.startTime + originalClip.duration,
                playbackRate: originalClip.playbackRate || 1,
                sourceIn: originalClip.sourceIn || 0,
                sourceOut: originalClip.sourceOut || (originalClip.sourceIn || 0) + originalClip.duration,
            },
            after: null,
            timelineDelta: result.segmentMapping.timelineDelta,
            segmentMapping: result.segmentMapping,
        });
    }

    return result;
}

describe('webcam sync with speed-up - aligned clips', () => {
    it('syncs webcam segments correctly when both clips start at timeline 0', () => {
        // Both clips start at timeline 0 with sourceIn 0 - standard case
        const videoClip: Clip = {
            id: 'video-clip-1',
            recordingId: 'video-rec-1',
            startTime: 0,
            duration: 30000,
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 1,
        };

        const webcamClips: Clip[] = [{
            id: 'webcam-clip-1',
            recordingId: 'webcam-rec-1',
            startTime: 0,
            duration: 30000,
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 1,
        }];

        const project = createTestProject([videoClip], webcamClips);

        // Speed up source 10000-20000ms at 2x
        const periods = [{ startTime: 10000, endTime: 20000, suggestedSpeedMultiplier: 2 }];

        // Use helper that calls TimelineSyncOrchestrator for webcam sync
        applySpeedUpWithSync(project, 'video-clip-1', periods, videoClip);

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
        const videoClip: Clip = {
            id: 'video-clip-1',
            recordingId: 'video-rec-1',
            startTime: 0,
            duration: 30000,
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 1,
        };

        const webcamClips: Clip[] = [{
            id: 'webcam-clip-1',
            recordingId: 'webcam-rec-1',
            startTime: 5000,  // Starts 5 seconds into the timeline
            duration: 25000,  // 25 seconds long
            sourceIn: 0,      // Webcam recording starts at its own source 0
            sourceOut: 25000,
            playbackRate: 1,
        }];

        const project = createTestProject([videoClip], webcamClips);

        // Speed up video source 10000-20000ms at 2x
        // This is timeline 10000-15000ms after speed-up for video
        // For webcam, this should affect its source 5000-15000ms (offset by 5000)
        const periods = [{ startTime: 10000, endTime: 20000, suggestedSpeedMultiplier: 2 }];

        // Use helper that calls TimelineSyncOrchestrator for webcam sync
        applySpeedUpWithSync(project, 'video-clip-1', periods, videoClip);

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

        // CRITICAL: Verify webcam sourceIn is correctly calculated
        // Video speed-up region: source 10000-20000ms
        // At timeline 10000ms, video shows source 10000ms
        // At timeline 10000ms, webcam (starts at timeline 5000ms with sourceIn=0) shows:
        //   webcam_source = 0 + (10000 - 5000) * 1 = 5000
        // So webcam's sped-up segment should have sourceIn=5000, NOT 10000
        expect(webcamSpeedUpSegment!.sourceIn).toBe(5000);
        expect(webcamSpeedUpSegment!.sourceOut).toBe(15000); // 5000 + 10000 source duration
    });

    it('correctly handles webcam with different sourceIn (trimmed webcam)', () => {
        // Both at timeline 0, but webcam has different sourceIn
        // This simulates webcam being trimmed
        const videoClip: Clip = {
            id: 'video-clip-1',
            recordingId: 'video-rec-1',
            startTime: 0,
            duration: 30000,
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 1,
        };

        const webcamClips: Clip[] = [{
            id: 'webcam-clip-1',
            recordingId: 'webcam-rec-1',
            startTime: 0,
            duration: 25000,
            sourceIn: 5000,   // Webcam starts from source 5000 (trimmed beginning)
            sourceOut: 30000,
            playbackRate: 1,
        }];

        const project = createTestProject([videoClip], webcamClips);

        // Speed up video source 10000-20000ms at 2x
        const periods = [{ startTime: 10000, endTime: 20000, suggestedSpeedMultiplier: 2 }];

        // Use helper that calls TimelineSyncOrchestrator for webcam sync
        applySpeedUpWithSync(project, 'video-clip-1', periods, videoClip);

        const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)!;
        const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!;

        const videoSpeedUpSegment = videoTrack.clips.find(c => c.playbackRate === 2);
        const webcamSpeedUpSegment = webcamTrack.clips.find(c => c.playbackRate === 2);

        expect(videoSpeedUpSegment).toBeTruthy();
        expect(webcamSpeedUpSegment).toBeTruthy();

        // Webcam speed-up should be at same timeline position
        expect(webcamSpeedUpSegment!.startTime).toBe(videoSpeedUpSegment!.startTime);

        // CRITICAL: Verify webcam sourceIn is correctly calculated
        // Video speed-up region: source 10000-20000ms maps to timeline 10000-15000ms
        // At timeline 10000ms, webcam (starts at timeline 0 with sourceIn=5000) shows:
        //   webcam_source = 5000 + (10000 - 0) * 1 = 15000
        // So webcam's sped-up segment should have sourceIn=15000, NOT 10000
        expect(webcamSpeedUpSegment!.sourceIn).toBe(15000);
        expect(webcamSpeedUpSegment!.sourceOut).toBe(25000); // 15000 + 10000 source duration
    });
});

describe('webcam sync with MULTIPLE speed-ups', () => {
    it('correctly syncs webcam when second speed-up is applied to aligned clips', () => {
        // Setup: aligned video and webcam clips (same sourceIn, sourceOut, startTime, playbackRate)
        const videoClip: Clip = {
            id: 'video-clip-1',
            recordingId: 'video-rec-1',
            startTime: 0,
            duration: 30000,
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 1,
        };
        const webcamClips: Clip[] = [{
            id: 'webcam-clip-1',
            recordingId: 'webcam-rec-1',
            startTime: 0,
            duration: 30000,
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 1,
        }];
        const project = createTestProject([videoClip], webcamClips);

        // First speed-up: source 10000-15000 at 2x
        applySpeedUpWithSync(project, 'video-clip-1',
            [{ startTime: 10000, endTime: 15000, suggestedSpeedMultiplier: 2 }],
            videoClip
        );

        // Both should be split into 3 parts
        let videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)!;
        let webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!;
        expect(videoTrack.clips.length).toBe(3);
        expect(webcamTrack.clips.length).toBe(3);

        // Get part-2 for second speed-up (source 15000-30000)
        // After first speed-up, video clips are: [0-10000], [10000-15000 @2x], [15000-30000]
        const videoPart2 = videoTrack.clips.find(c => c.sourceIn === 15000)!;
        expect(videoPart2).toBeTruthy();
        expect(videoPart2.sourceOut).toBe(30000);

        // Find corresponding webcam clip (should also be aligned after sync)
        const webcamPart2 = webcamTrack.clips.find(c => c.sourceIn === 15000)!;
        expect(webcamPart2).toBeTruthy();
        expect(webcamPart2.sourceIn).toBe(videoPart2.sourceIn);
        expect(webcamPart2.sourceOut).toBe(videoPart2.sourceOut);

        // Second speed-up: source 20000-25000 at 3x (within part-2)
        applySpeedUpWithSync(project, videoPart2.id,
            [{ startTime: 20000, endTime: 25000, suggestedSpeedMultiplier: 3 }],
            videoPart2
        );

        // Verify second speed-up worked
        videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)!;
        webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!;

        // Should now have 5 clips: [0-10000], [10000-15000 @2x], [15000-20000], [20000-25000 @3x], [25000-30000]
        expect(videoTrack.clips.length).toBe(5);
        expect(webcamTrack.clips.length).toBe(5);

        const video3xSegment = videoTrack.clips.find(c => c.playbackRate === 3);
        const webcam3xSegment = webcamTrack.clips.find(c => c.playbackRate === 3);

        expect(video3xSegment).toBeTruthy();
        expect(webcam3xSegment).toBeTruthy();

        // CRITICAL: Webcam should have correct sourceIn (same as video since aligned)
        expect(webcam3xSegment!.sourceIn).toBe(video3xSegment!.sourceIn);
        expect(webcam3xSegment!.sourceOut).toBe(video3xSegment!.sourceOut);
        expect(webcam3xSegment!.startTime).toBe(video3xSegment!.startTime);
        expect(webcam3xSegment!.playbackRate).toBe(video3xSegment!.playbackRate);
    });

    it.skip('maintains correct source content after multiple speed-ups', () => {
        // This test verifies the actual source content isn't corrupted
        const videoClip: Clip = {
            id: 'video-clip-1',
            recordingId: 'video-rec-1',
            startTime: 0,
            duration: 60000,
            sourceIn: 0,
            sourceOut: 60000,
            playbackRate: 1,
        };
        const webcamClips: Clip[] = [{
            id: 'webcam-clip-1',
            recordingId: 'webcam-rec-1',
            startTime: 0,
            duration: 60000,
            sourceIn: 0,
            sourceOut: 60000,
            playbackRate: 1,
        }];
        const project = createTestProject([videoClip], webcamClips);

        // Apply three consecutive speed-ups to different regions
        // 1. Speed up source 10000-20000 at 2x
        applySpeedUpWithSync(project, 'video-clip-1',
            [{ startTime: 10000, endTime: 20000, suggestedSpeedMultiplier: 2 }],
            videoClip
        );

        let videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)!;
        let webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!;

        // 2. Speed up source 30000-40000 at 2x (in the third clip)
        const videoClip3 = videoTrack.clips.find(c => c.sourceIn === 20000)!;
        const webcamClip3 = webcamTrack.clips.find(c => c.sourceIn === 20000)!;
        expect(videoClip3).toBeTruthy();
        expect(webcamClip3).toBeTruthy();
        expect(webcamClip3.sourceIn).toBe(videoClip3.sourceIn); // Should be aligned

        applySpeedUpWithSync(project, videoClip3.id,
            [{ startTime: 30000, endTime: 40000, suggestedSpeedMultiplier: 2 }],
            videoClip3
        );

        videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)!;
        webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!;

        // 3. Speed up source 50000-55000 at 4x (in the last clip)
        const videoLastClip = videoTrack.clips.find(c => c.sourceIn === 40000)!;
        const webcamLastClip = webcamTrack.clips.find(c => c.sourceIn === 40000)!;
        expect(videoLastClip).toBeTruthy();
        expect(webcamLastClip).toBeTruthy();
        expect(webcamLastClip.sourceIn).toBe(videoLastClip.sourceIn); // Should be aligned

        applySpeedUpWithSync(project, videoLastClip.id,
            [{ startTime: 50000, endTime: 55000, suggestedSpeedMultiplier: 4 }],
            videoLastClip
        );

        // Final verification
        videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)!;
        webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!;

        // Every video clip should have a corresponding webcam clip with matching source range
        for (const vClip of videoTrack.clips) {
            const matchingWebcam = webcamTrack.clips.find(
                w => w.sourceIn === vClip.sourceIn && w.sourceOut === vClip.sourceOut
            );
            expect(matchingWebcam).toBeTruthy();
            expect(matchingWebcam!.startTime).toBe(vClip.startTime);
            expect(matchingWebcam!.playbackRate).toBe(vClip.playbackRate);
        }
    });
});

describe('webcam sync with speed-up - base playbackRate != 1', () => {
    it('stacks webcam playbackRate when speed-up is applied to an already-sped-up video clip', () => {
        // Base clip is already 2x (e.g. previous speed-up). Applying another 3x segment should produce 6x.
        const videoClip: Clip = {
            id: 'video-clip-1',
            recordingId: 'video-rec-1',
            startTime: 0,
            duration: 15000, // 30000ms source / 2x
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 2,
        };

        const webcamClips: Clip[] = [{
            id: 'webcam-clip-1',
            recordingId: 'webcam-rec-1',
            startTime: 0,
            duration: 15000,
            sourceIn: 0,
            sourceOut: 30000,
            playbackRate: 2,
        }];

        const project = createTestProject([videoClip], webcamClips);

        // Speed up source 10000-20000ms at 3x (effective: 6x)
        const periods = [{ startTime: 10000, endTime: 20000, suggestedSpeedMultiplier: 3 }];
        applySpeedUpWithSync(project, 'video-clip-1', periods, videoClip);

        const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)!;
        const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)!;

        const video6x = videoTrack.clips.find(c => c.playbackRate === 6);
        const webcam6x = webcamTrack.clips.find(c => c.playbackRate === 6);

        expect(video6x).toBeTruthy();
        expect(webcam6x).toBeTruthy();

        // The sped-up segment should cover the same source span and timeline position.
        expect(webcam6x!.sourceIn).toBe(video6x!.sourceIn);
        expect(webcam6x!.sourceOut).toBe(video6x!.sourceOut);
        expect(webcam6x!.startTime).toBe(video6x!.startTime);
        expect(webcam6x!.duration).toBe(video6x!.duration);
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
