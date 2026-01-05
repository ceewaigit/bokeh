import { useEffect, useRef, useCallback } from 'react';
import { PlayerRef } from '@remotion/player';
import { useProjectStore } from '@/features/core/stores/project-store';
import { timeObserver } from '@/features/ui/timeline/time/time-observer';
import { useThrottledSeek } from '@/features/ui/timeline/hooks/use-throttled-seek';
import { msToFrame, frameToMs } from '@/features/rendering/renderer/compositions/utils/time/frame-time';
import { assertDefined } from '@/shared/errors';
import type { TimelineMetadata } from '@/features/ui/timeline/hooks/use-timeline-metadata';
import { TimelineDataService, type GlobalSkipRange } from '@/features/ui/timeline/timeline-data-service';

interface UsePlayerSyncProps {
    playerRef: React.RefObject<PlayerRef | null>;
    timelineMetadata: TimelineMetadata;
    isPlaying: boolean;
    isScrubbing: boolean;
    isExporting: boolean;
    volume: number;
    muted: boolean;
}

export function usePlayerSync({
    playerRef,
    timelineMetadata,
    isPlaying,
    isScrubbing,
    isExporting,
    volume,
    muted,
}: UsePlayerSyncProps) {
    const storeSeekFromPlayer = useProjectStore((s) => s.seekFromPlayer);
    const playbackSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastIsPlayingRef = useRef<boolean>(false);
    const wasPlayingBeforeScrubRef = useRef(false);

    const throttledSeek = useThrottledSeek(playerRef);

    const clampFrame = useCallback((frame: number) => {
        const maxFrame = timelineMetadata.durationInFrames - 1;
        return Math.max(0, Math.min(frame, maxFrame));
    }, [timelineMetadata.durationInFrames]);

    const timeToFrame = useCallback((timeMs: number) => {
        return msToFrame(timeMs, timelineMetadata.fps);
    }, [timelineMetadata.fps]);

    const safePlay = useCallback((player: PlayerRef | null) => {
        const resolvedPlayer = assertDefined(player, '[PreviewAreaRemotion] Player ref missing');
        try {
            const result = resolvedPlayer.play();
            if ((result as unknown) instanceof Promise) {
                (result as unknown as Promise<void>).catch((err: Error) => {
                    if (err?.name === 'AbortError') return;
                    console.warn('[PreviewAreaRemotion] Playback error:', err);
                });
            }
        } catch (err) {
            console.warn('[PreviewAreaRemotion] Failed to start playback:', err);
        }
    }, []);

    // Hover preview sync
    useEffect(() => {
        if (!playerRef.current) return;

        let prevHoverTime = useProjectStore.getState().hoverTime;
        const unsubscribe = useProjectStore.subscribe((state) => {
            if (state.isPlaying || state.isScrubbing || isExporting) return;

            const nextHoverTime = state.hoverTime;
            if (nextHoverTime === prevHoverTime) return;
            prevHoverTime = nextHoverTime;

            const targetTime = nextHoverTime ?? state.currentTime;
            const targetFrame = clampFrame(timeToFrame(targetTime));
            throttledSeek(targetFrame);
        });

        return () => unsubscribe();
    }, [timelineMetadata, throttledSeek, isExporting, clampFrame, timeToFrame, playerRef]);

    // Connect timeObserver to the player ref
    useEffect(() => {
        timeObserver.connect(playerRef, timelineMetadata.fps);
        return () => {
            timeObserver.stopPolling();
        };
    }, [timelineMetadata.fps, playerRef]);

    // Subscribe to project changes to update skip ranges
    const skipRangesRef = useRef<GlobalSkipRange[]>([]);
    useEffect(() => {
        const unsubscribe = useProjectStore.subscribe((state) => {
            if (!state.currentProject) {
                skipRangesRef.current = [];
                return;
            }
            skipRangesRef.current = TimelineDataService.getGlobalTimelineSkips(state.currentProject);
        });
        // Initialize
        const project = useProjectStore.getState().currentProject;
        if (project) {
            skipRangesRef.current = TimelineDataService.getGlobalTimelineSkips(project);
        }
        return () => unsubscribe();
    }, []);

    // Start/stop RAF polling
    useEffect(() => {
        if (isPlaying && !isScrubbing && !isExporting) {
            timeObserver.startPolling(storeSeekFromPlayer);
        } else {
            timeObserver.stopPolling();
        }
    }, [isPlaying, isScrubbing, isExporting, storeSeekFromPlayer]);

    // Skip range detection during playback
    // Polls at animation frame rate and skips past hidden regions
    useEffect(() => {
        if (!isPlaying || isScrubbing || isExporting) return;
        if (!playerRef.current) return;

        let rafId: number | null = null;
        let lastSkipTime = 0; // Debounce to prevent rapid re-seeking

        const checkAndSkip = () => {
            const player = playerRef.current;
            if (!player) return;

            const currentFrame = player.getCurrentFrame();
            const currentTimeMs = frameToMs(currentFrame, timelineMetadata.fps);
            const AUDIO_LOOKAHEAD_MS = 50;

            // Find if we're inside a skip range
            const skipRange = TimelineDataService.findSkipRangeAtTime(
                currentTimeMs,
                skipRangesRef.current
            );

            if (skipRange) {
                const now = Date.now();
                // Debounce: don't skip more than once per 100ms
                if (now - lastSkipTime > 100) {
                    lastSkipTime = now;

                    // Seek to the end of the skip range
                    const targetFrame = clampFrame(timeToFrame(skipRange.end));

                    console.debug('[usePlayerSync] Skipping hidden region', {
                        from: currentTimeMs.toFixed(0),
                        to: skipRange.end.toFixed(0),
                        clipId: skipRange.clipId
                    });

                    player.seekTo(targetFrame);
                    // Ensure playback continues after seek
                    safePlay(player);
                }
            } else {
                const nextSkip = TimelineDataService.findNextSkipRange(
                    currentTimeMs,
                    skipRangesRef.current
                );
                if (nextSkip && (nextSkip.start - currentTimeMs) < AUDIO_LOOKAHEAD_MS) {
                    const targetFrame = clampFrame(timeToFrame(nextSkip.end));
                    player.seekTo(targetFrame);
                    safePlay(player);
                }
            }

            rafId = requestAnimationFrame(checkAndSkip);
        };

        rafId = requestAnimationFrame(checkAndSkip);

        return () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        };
    }, [isPlaying, isScrubbing, isExporting, timelineMetadata.fps, clampFrame, timeToFrame, safePlay, playerRef]);

    // Scrub behavior
    useEffect(() => {
        if (!playerRef.current) return;
        const player = playerRef.current;

        if (isScrubbing) {
            wasPlayingBeforeScrubRef.current = isPlaying;
            player.pause();
            return;
        }

        if (wasPlayingBeforeScrubRef.current && isPlaying) {
            const time = useProjectStore.getState().currentTime;
            const targetFrame = clampFrame(timeToFrame(time));
            player.seekTo(targetFrame);
            safePlay(player);
        }

        wasPlayingBeforeScrubRef.current = false;
    }, [isScrubbing, isPlaying, timelineMetadata, safePlay, clampFrame, timeToFrame, playerRef]);

    // Allow intentional seeks during playback
    useEffect(() => {
        if (!playerRef.current || !isPlaying || isExporting || isScrubbing) return;

        let prevTime = useProjectStore.getState().currentTime;

        const unsubscribe = useProjectStore.subscribe((state) => {
            if (!state.isPlaying || isExporting || state.isScrubbing) return;

            const nextTime = state.currentTime;
            if (Math.abs(nextTime - prevTime) < 1) return;
            prevTime = nextTime;

            const player = playerRef.current;
            if (!player) return;

            const targetFrame = clampFrame(timeToFrame(nextTime));
            const playerFrame = player.getCurrentFrame();

            if (Math.abs(playerFrame - targetFrame) <= 2) return;

            player.seekTo(targetFrame);
            safePlay(player);
        });

        return () => unsubscribe();
    }, [isPlaying, isExporting, timelineMetadata, safePlay, clampFrame, timeToFrame, isScrubbing, playerRef]);

    // Main player sync effect
    useEffect(() => {
        if (!playerRef.current) return;

        if (isExporting) {
            if (playerRef.current) playerRef.current.pause();
            return;
        }

        if (isPlaying) {
            if (!lastIsPlayingRef.current) {
                const playerFrame = playerRef.current.getCurrentFrame();
                const currentStoreTime = useProjectStore.getState().currentTime;
                const storeFrame = clampFrame(timeToFrame(currentStoreTime));
                if (Math.abs(playerFrame - storeFrame) > 1) {
                    playerRef.current.seekTo(storeFrame);
                }
            }

            if (muted) {
                playerRef.current.mute();
            } else {
                playerRef.current.unmute();
            }
            playerRef.current.setVolume(Math.min(volume / 100, 1));

            if (!lastIsPlayingRef.current) {
                safePlay(playerRef.current);
            }

            lastIsPlayingRef.current = true;
            return;
        }

        if (playbackSyncIntervalRef.current) {
            clearInterval(playbackSyncIntervalRef.current);
            playbackSyncIntervalRef.current = null;
        }

        const justPaused = lastIsPlayingRef.current;
        lastIsPlayingRef.current = false;

        playerRef.current.pause();
        if (justPaused) {
            // When pausing, the Remotion Player is the source of truth.
            // Sync the store to the player's exact paused frame to avoid a visible jump/blink
            // caused by seeking back to a throttled store time.
            const pausedFrame = clampFrame(playerRef.current.getCurrentFrame());
            const pausedTimeMs = (pausedFrame / timelineMetadata.fps) * 1000;
            storeSeekFromPlayer(pausedTimeMs);
        }

        let prevTime = useProjectStore.getState().currentTime;
        const unsubscribe = useProjectStore.subscribe((state) => {
            if (Math.abs(state.currentTime - prevTime) < 1) return;
            prevTime = state.currentTime;

            if (!state.isPlaying && !isExporting) {
                const frame = clampFrame(timeToFrame(state.currentTime));
                throttledSeek(frame);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [isPlaying, timelineMetadata, throttledSeek, isExporting, clampFrame, timeToFrame, muted, safePlay, storeSeekFromPlayer, volume, playerRef]);

    // Sync volume/mute changes
    useEffect(() => {
        if (!playerRef.current) return;

        if (muted) {
            playerRef.current.mute();
        } else {
            playerRef.current.unmute();
        }
        playerRef.current.setVolume(Math.min(volume / 100, 1));
    }, [volume, muted, playerRef]);

    return {
        safePlay,
        clampFrame,
        timeToFrame,
        lastIsPlayingRef
    };
}
