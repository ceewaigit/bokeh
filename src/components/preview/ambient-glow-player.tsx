'use client';

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { TimelineComposition } from '@/remotion/compositions/TimelineComposition';
import { useTheme } from '@/contexts/theme-context';
import { useProjectStore } from '@/stores/project-store';
import { msToFrame } from '@/remotion/compositions/utils/time/frame-time';
import type { useTimelineMetadata } from '@/hooks/useTimelineMetadata';
import type { usePlayerConfiguration } from '@/hooks/usePlayerConfiguration';

type TimelineMetadata = ReturnType<typeof useTimelineMetadata>;
type PlayerConfig = ReturnType<typeof usePlayerConfiguration>;

// Ambient glow configuration
const GLOW_CONFIG = {
    // Ultra low-res player for memory efficiency
    maxSize: 96,
    minSize: 32,
    // Glow extends beyond video for elegant spread
    spread: 36,
};

const GLOW_VISUALS = {
    dark: {
        // Softer blur for smooth edges
        blur: 52,
        // Subtle lift for dark UI
        opacity: 0.21,
        // Gentle brightness
        brightness: 0.54,
        // Modest saturation for clean glow
        saturation: 1.22,
    },
    light: {
        // Slightly larger blur for airy glow on light surfaces
        blur: 88,
        // Lower opacity to avoid muddy halos
        opacity: 0.22,
        // Gentle brightness so glow stays subtle on white
        brightness: 1.12,
        // Soft saturation for a cleaner, more neutral glow
        saturation: 1.08,
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
    glowIntensity: number;
}

export function AmbientGlowPlayer({
    mainPlayerRef,
    timelineMetadata,
    playerConfig,
    isPlaying,
    isScrubbing,
    playerKey,
    initialFrame,
    glowIntensity,
}: AmbientGlowPlayerProps) {
    const glowPlayerRef = useRef<PlayerRef>(null);
    const lastGlowIsPlayingRef = useRef<boolean>(false);
    const lastSyncedFrameRef = useRef<number | null>(null);
    const { resolvedTheme } = useTheme();

    const glowVisuals = resolvedTheme === 'light' ? GLOW_VISUALS.light : GLOW_VISUALS.dark;
    const clampedIntensity = Math.max(0, Math.min(1, glowIntensity));
    const intensityCurve = 0.55 + 1.05 * Math.pow(clampedIntensity, 1.15);
    const glowOpacity = glowVisuals.opacity * intensityCurve;
    const glowBlur = glowVisuals.blur * (0.9 + 0.45 * Math.pow(clampedIntensity, 1.1));
    const glowSaturation = glowVisuals.saturation * (0.95 + 0.2 * Math.pow(clampedIntensity, 1.1));

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

    const glowSize = useMemo(() => {
        if (!timelineMetadata) {
            return { width: GLOW_CONFIG.minSize, height: GLOW_CONFIG.minSize };
        }
        const maxDim = Math.max(timelineMetadata.width, timelineMetadata.height);
        const scale = Math.min(1, GLOW_CONFIG.maxSize / maxDim);
        const width = Math.max(GLOW_CONFIG.minSize, Math.round(timelineMetadata.width * scale));
        const height = Math.max(GLOW_CONFIG.minSize, Math.round(timelineMetadata.height * scale));
        return { width, height };
    }, [timelineMetadata]);

    // Glow player sync - follows main player but simpler (no audio)
    useEffect(() => {
        if (!glowPlayerRef.current || !timelineMetadata) return;

        // Direct store access for syncing when not playing

        const currentTimeMs = useProjectStore.getState().currentTime;
        const targetFrame = clampFrame(timeToFrame(currentTimeMs));

        try {
            if (isPlaying) {
                if (!lastGlowIsPlayingRef.current) {
                    glowPlayerRef.current.seekTo(targetFrame);
                    safePlay(glowPlayerRef.current, 'glow');
                }

                lastGlowIsPlayingRef.current = true;
            } else {
                lastGlowIsPlayingRef.current = false;
                glowPlayerRef.current.pause();
                glowPlayerRef.current.seekTo(targetFrame);

            }
        } catch {
            // Glow player errors are non-critical
        }
    }, [isPlaying, timelineMetadata, clampFrame, timeToFrame, mainPlayerRef, safePlay]);

    useEffect(() => {
        const glowPlayer = glowPlayerRef.current;
        const mainPlayer = mainPlayerRef.current;
        if (!glowPlayer || !mainPlayer || !timelineMetadata) return;

        const handleFrameUpdate = (e: { detail: { frame: number } }) => {
            const frame = clampFrame(e.detail.frame);
            if (lastSyncedFrameRef.current === frame) return;
            lastSyncedFrameRef.current = frame;
            try {
                glowPlayer.seekTo(frame);
            } catch {
                // Best-effort sync only
            }
        };

        mainPlayer.addEventListener('frameupdate', handleFrameUpdate as any);
        return () => {
            mainPlayer.removeEventListener('frameupdate', handleFrameUpdate as any);
        };
    }, [clampFrame, mainPlayerRef, timelineMetadata]);


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
                filter: `blur(${glowBlur}px) brightness(${glowVisuals.brightness}) saturate(${glowSaturation}) contrast(1.01)`,
                opacity: glowOpacity,
                zIndex: 0,
                borderRadius: 32,
                overflow: 'hidden',
                pointerEvents: 'none',
                mixBlendMode: resolvedTheme === 'light' ? 'soft-light' : 'normal',
                backgroundImage: resolvedTheme === 'light'
                    ? 'radial-gradient(64% 64% at 50% 50%, rgba(255,255,255,0.35), rgba(255,255,255,0) 72%)'
                    : 'radial-gradient(70% 70% at 50% 50%, rgba(255,255,255,0.2), rgba(255,255,255,0) 78%)',
            }}
        >
            <Player
                key={`glow-${playerKey}`}
                ref={glowPlayerRef}
                component={TimelineComposition as any}
                inputProps={glowPlayerInputProps as any}
                durationInFrames={timelineMetadata.durationInFrames}
                compositionWidth={glowSize.width}
                compositionHeight={glowSize.height}
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
