'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { TimelineComposition } from '@/remotion/compositions/TimelineComposition';
import { useTheme } from '@/contexts/theme-context';
import { useProjectStore } from '@/stores/project-store';
import { msToFrame } from '@/remotion/compositions/utils/frame-time';
import type { useTimelineMetadata } from '@/hooks/useTimelineMetadata';
import type { usePlayerConfiguration } from '@/hooks/usePlayerConfiguration';

type TimelineMetadata = ReturnType<typeof useTimelineMetadata>;
type PlayerConfig = ReturnType<typeof usePlayerConfiguration>;

// Ambient glow configuration
const GLOW_CONFIG = {
    // Ultra low-res player for memory efficiency
    width: 64,
    height: 36,
    // Glow extends beyond video for elegant spread
    spread: 50,
};

const GLOW_VISUALS = {
    dark: {
        // Softer blur for smooth edges
        blur: 50,
        // More visible but still subtle
        opacity: 0.35,
        // Gentle brightness
        brightness: 0.55,
        // Rich saturation for vibrant colors
        saturation: 1.4,
    },
    light: {
        // Slightly larger blur for airy glow on light surfaces
        blur: 70,
        // Lower opacity to avoid muddy halos
        opacity: 0.18,
        // Lift brightness so glow reads on white
        brightness: 1.1,
        // Gentle saturation to avoid neon on light mode
        saturation: 1.1,
    }
};

interface AmbientGlowPlayerProps {
    mainPlayerRef: React.RefObject<PlayerRef>;
    timelineMetadata: TimelineMetadata;
    playerConfig: PlayerConfig;
    isPlaying: boolean;
    isScrubbing: boolean;
    playerKey: string;
    initialFrame: number;
}

export function AmbientGlowPlayer({
    mainPlayerRef,
    timelineMetadata,
    playerConfig,
    isPlaying,
    isScrubbing,
    playerKey,
    initialFrame,
}: AmbientGlowPlayerProps) {
    const glowPlayerRef = useRef<PlayerRef>(null);
    const glowPlaybackSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastGlowIsPlayingRef = useRef<boolean>(false);
    const { resolvedTheme } = useTheme();

    const glowVisuals = resolvedTheme === 'light' ? GLOW_VISUALS.light : GLOW_VISUALS.dark;

    const clampFrame = useCallback((frame: number) => {
        if (!timelineMetadata) return Math.max(0, frame);
        const maxFrame = timelineMetadata.durationInFrames - 1;
        return Math.max(0, Math.min(frame, maxFrame));
    }, [timelineMetadata]);

    const timeToFrame = useCallback((timeMs: number) => {
        if (!timelineMetadata) return 0;
        return msToFrame(timeMs, timelineMetadata.fps);
    }, [timelineMetadata]);

    const safePlay = useCallback((player: PlayerRef | null, label: string) => {
        if (!player) return;

        try {
            const result: unknown = (player as PlayerRef & { play: () => unknown }).play();
            if (result && typeof (result as Promise<void>).catch === 'function') {
                (result as Promise<void>).catch((err) => {
                    if (err?.name === 'AbortError') return;
                    console.warn(`[AmbientGlowPlayer] Failed to play ${label}:`, err);
                });
            }
        } catch (err) {
            console.warn(`[AmbientGlowPlayer] Failed to play ${label}:`, err);
        }
    }, []);

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (glowPlaybackSyncIntervalRef.current) {
                clearInterval(glowPlaybackSyncIntervalRef.current);
                glowPlaybackSyncIntervalRef.current = null;
            }
        };
    }, []);

    // Glow player sync - follows main player but simpler (no audio)
    // OPTIMIZATION: Skip glow updates during active scrubbing to reduce decode pressure
    useEffect(() => {
        if (!glowPlayerRef.current || !timelineMetadata) return;

        // Skip glow player updates during active scrubbing to save memory
        if (isScrubbing && !isPlaying) {
            // Just pause the glow player during scrubbing
            try {
                if (glowPlaybackSyncIntervalRef.current) {
                    clearInterval(glowPlaybackSyncIntervalRef.current);
                    glowPlaybackSyncIntervalRef.current = null;
                }
                lastGlowIsPlayingRef.current = false;
                glowPlayerRef.current.pause();
            } catch {
                // Non-critical
            }
            return;
        }

        // Direct store access for syncing when not playing

        const currentTimeMs = useProjectStore.getState().currentTime;
        const targetFrame = clampFrame(timeToFrame(currentTimeMs));

        try {
            if (isPlaying) {
                if (!lastGlowIsPlayingRef.current) {
                    glowPlayerRef.current.seekTo(targetFrame);
                    safePlay(glowPlayerRef.current, 'glow');
                }

                if (!glowPlaybackSyncIntervalRef.current) {
                    glowPlaybackSyncIntervalRef.current = setInterval(() => {
                        const player = glowPlayerRef.current;
                        const mainPlayer = mainPlayerRef.current;
                        if (!player || !mainPlayer) return;

                        try {
                            // SSOT: Sync glow player FROM main player's frame
                            const mainFrame = mainPlayer.getCurrentFrame();
                            player.seekTo(mainFrame);
                        } catch {
                            // Best-effort sync only
                        }
                    }, 200); // Sync at lower rate for performance
                }
                lastGlowIsPlayingRef.current = true;
            } else {
                if (glowPlaybackSyncIntervalRef.current) {
                    clearInterval(glowPlaybackSyncIntervalRef.current);
                    glowPlaybackSyncIntervalRef.current = null;
                }
                lastGlowIsPlayingRef.current = false;
                glowPlayerRef.current.pause();
                glowPlayerRef.current.seekTo(targetFrame);

            }
        } catch {
            // Glow player errors are non-critical
        }
    }, [isPlaying, timelineMetadata, isScrubbing, clampFrame, timeToFrame, mainPlayerRef, safePlay]);

    // Subscribe to store updates for scrubbing sync (when not playing)
    useEffect(() => {
        const unsubscribe = useProjectStore.subscribe((state) => {


            if (!state.isPlaying) {

                const time = state.currentTime;
                const frame = clampFrame(timeToFrame(time));
                if (glowPlayerRef.current) {
                    try {
                        glowPlayerRef.current.seekTo(frame);
                    } catch { }
                }
            }
        });
        return unsubscribe;
    }, [clampFrame, timeToFrame]);


    // Prepare input props
    const glowPlayerInputProps = React.useMemo(() => ({
        ...playerConfig,
        playback: {
            isPlaying,
            isScrubbing,
            isHighQualityPlaybackEnabled: false,

            previewMuted: true,
            previewVolume: 0,
        },
        renderSettings: {
            isGlowMode: true,
            preferOffthreadVideo: false,
            enhanceAudio: false,
            isEditingCrop: false, // No crop overlay in glow
        },
        cropSettings: {
            // No crop interaction in glow
        },
        resources: {
            videoUrls: undefined,

            videoUrlsHighRes: undefined,
            videoFilePaths: undefined,
            metadataUrls: undefined,
        }
    }), [playerConfig, isPlaying, isScrubbing]);

    if (!timelineMetadata) return null;

    return (
        <div
            style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: `calc(100% + ${GLOW_CONFIG.spread * 2}px)`,
                height: `calc(100% + ${GLOW_CONFIG.spread * 2}px)`,
                transform: 'translate(-50%, -50%) translateZ(0)',
                filter: `blur(${glowVisuals.blur}px) brightness(${glowVisuals.brightness}) saturate(${glowVisuals.saturation})`,
                opacity: glowVisuals.opacity,
                zIndex: 0,
                borderRadius: 32,
                overflow: 'hidden',
                pointerEvents: 'none',
                mixBlendMode: resolvedTheme === 'light' ? 'screen' : 'normal',
            }}
        >
            <Player
                key={`glow-${playerKey}`}
                ref={glowPlayerRef}
                component={TimelineComposition as any}
                inputProps={glowPlayerInputProps as any}
                durationInFrames={timelineMetadata.durationInFrames}
                compositionWidth={GLOW_CONFIG.width}
                compositionHeight={GLOW_CONFIG.height}
                fps={timelineMetadata.fps}
                initialFrame={initialFrame}
                initiallyMuted={true}
                style={{
                    width: '100%',
                    height: '100%',
                }}
                controls={false}
                loop={false}
                clickToPlay={false}
                doubleClickToFullscreen={false}
                spaceKeyToPlayOrPause={false}
                alwaysShowControls={false}
                initiallyShowControls={false}
                showPosterWhenPaused={false}
                showPosterWhenUnplayed={false}
                showPosterWhenEnded={false}
                moveToBeginningWhenEnded={false}
                renderLoading={() => null}
                errorFallback={() => null}
            />
        </div>
    );
}
