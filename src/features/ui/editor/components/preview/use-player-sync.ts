import { useEffect, useRef, useCallback } from 'react';
import { PlayerRef } from '@remotion/player';
import { useProjectStore } from '@/features/core/stores/project-store';
import { usePreviewSettingsStore } from '@/features/core/stores/preview-settings-store';
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
    // Track active RAF to prevent accumulation during rapid state changes
    const activeRafRef = useRef<number | null>(null);

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

    // Hover preview sync - respects scrubOnHover setting
    useEffect(() => {
        if (!playerRef.current) return;

        let prevHoverTime = useProjectStore.getState().hoverTime;
        const unsubscribe = useProjectStore.subscribe((state) => {
            if (state.isPlaying || state.isScrubbing || isExporting) return;

            // Check scrubOnHover reactively on each hover change
            const scrubOnHover = usePreviewSettingsStore.getState().scrubOnHover;
            if (!scrubOnHover) return;

            const nextHoverTime = state.hoverTime;
            if (nextHoverTime === prevHoverTime) return;
            prevHoverTime = nextHoverTime;

            const targetTime = nextHoverTime ?? state.currentTime;
            const targetFrame = clampFrame(timeToFrame(targetTime));
            throttledSeek(targetFrame);
        });

        return () => unsubscribe();
    }, [timelineMetadata, throttledSeek, isExporting, clampFrame, timeToFrame, playerRef]);

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

    // CONSOLIDATED: Combined RAF loop for store sync + skip range detection during playback
    // OPTIMIZATION: Only runs RAF loop when skip ranges exist. Otherwise uses event-driven sync.
    useEffect(() => {
        if (!isPlaying || isScrubbing || isExporting) return;
        if (!playerRef.current) return;

        // Cancel any existing RAF to prevent accumulation during rapid state changes
        if (activeRafRef.current !== null) {
            cancelAnimationFrame(activeRafRef.current);
            activeRafRef.current = null;
        }

        const hasSkipRanges = skipRangesRef.current.length > 0;

        // BATTERY OPTIMIZATION: When no skip ranges, use event-driven store sync instead of RAF polling
        // This allows the CPU to sleep between frames instead of polling at 60fps
        if (!hasSkipRanges) {
            let lastStoreUpdate = 0;
            const handleFrameUpdate = (e: { detail: { frame: number } }) => {
                const now = performance.now();
                if (now - lastStoreUpdate >= 33) { // Throttle to 30fps
                    lastStoreUpdate = now;
                    const timeMs = frameToMs(e.detail.frame, timelineMetadata.fps);
                    storeSeekFromPlayer(timeMs);
                }
            };

            const player = playerRef.current;
            player.addEventListener('frameupdate', handleFrameUpdate as any);

            return () => {
                player.removeEventListener('frameupdate', handleFrameUpdate as any);
            };
        }

        // Only use RAF loop when skip ranges exist (need continuous monitoring)
        let lastFrame = -1;
        let lastStoreUpdate = 0;
        let lastSkipTime = 0;
        const AUDIO_LOOKAHEAD_MS = 50;

        const playbackLoop = () => {
            const player = playerRef.current;
            if (!player) {
                activeRafRef.current = requestAnimationFrame(playbackLoop);
                return;
            }

            const frame = player.getCurrentFrame();

            // OPTIMIZATION: Skip all work if frame hasn't changed
            if (frame === lastFrame) {
                activeRafRef.current = requestAnimationFrame(playbackLoop);
                return;
            }
            lastFrame = frame;

            const timeMs = frameToMs(frame, timelineMetadata.fps);

            // Throttle update to store (30fps) - single source of truth
            const now = performance.now();
            if (now - lastStoreUpdate >= 33) {
                lastStoreUpdate = now;
                storeSeekFromPlayer(timeMs);
            }

            // Skip range detection - check if we're in a hidden region
            const skipRange = TimelineDataService.findSkipRangeAtTime(timeMs, skipRangesRef.current);
            if (skipRange) {
                const skipNow = Date.now();
                if (skipNow - lastSkipTime > 100) { // Debounce
                    lastSkipTime = skipNow;
                    const targetFrame = clampFrame(timeToFrame(skipRange.end));
                    console.debug('[usePlayerSync] Skipping hidden region', {
                        from: timeMs.toFixed(0),
                        to: skipRange.end.toFixed(0),
                        clipId: skipRange.clipId
                    });
                    player.seekTo(targetFrame);
                    safePlay(player);
                }
            } else {
                // Audio lookahead - preemptively skip if approaching a hidden region
                const nextSkip = TimelineDataService.findNextSkipRange(timeMs, skipRangesRef.current);
                if (nextSkip && (nextSkip.start - timeMs) < AUDIO_LOOKAHEAD_MS) {
                    const targetFrame = clampFrame(timeToFrame(nextSkip.end));
                    player.seekTo(targetFrame);
                    safePlay(player);
                }
            }

            activeRafRef.current = requestAnimationFrame(playbackLoop);
        };

        activeRafRef.current = requestAnimationFrame(playbackLoop);
        return () => {
            if (activeRafRef.current !== null) {
                cancelAnimationFrame(activeRafRef.current);
                activeRafRef.current = null;
            }
        };
    }, [isPlaying, isScrubbing, isExporting, timelineMetadata.fps, storeSeekFromPlayer, clampFrame, timeToFrame, safePlay, playerRef]);

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
                // ALWAYS seek player to store position when starting playback
                // This ensures we don't play from a scrubOnHover preview position
                const currentStoreTime = useProjectStore.getState().currentTime;
                const storeFrame = clampFrame(timeToFrame(currentStoreTime));
                playerRef.current.seekTo(storeFrame);
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
                // During scrubbing, the timeline already RAF-throttles updates.
                // Use direct seek to avoid double-throttling and reduce latency.
                if (state.isScrubbing) {
                    playerRef.current?.seekTo(frame);
                } else {
                    throttledSeek(frame);
                }
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
