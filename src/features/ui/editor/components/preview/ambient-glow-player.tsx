'use client';

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { TimelineComposition } from '@/features/rendering/renderer/compositions/TimelineComposition';
import { useTheme } from '@/shared/contexts/theme-context';
import { useProjectStore } from '@/features/core/stores/project-store';
import { msToFrame } from '@/features/rendering/renderer/compositions/utils/time/frame-time';
import { buildTimelineCompositionInput } from '@/features/rendering/renderer/utils/composition-input';
import type { useTimelineMetadata } from '@/features/ui/timeline/hooks/use-timeline-metadata';
import type { usePlayerConfiguration } from '@/features/rendering/renderer/hooks/use-player-configuration';
import { useThrottledSeek } from '@/features/ui/timeline/hooks/use-throttled-seek';

type TimelineMetadata = ReturnType<typeof useTimelineMetadata>;
type PlayerConfig = ReturnType<typeof usePlayerConfiguration>;

// Ambient glow configuration
const GLOW_CONFIG = {
    // Ultra low-res player for memory efficiency
    maxSize: 96,
    minSize: 32,
    // Glow extends significantly beyond video for maximum presence
    spread: 36,
    maxSpreadBoost: 90,
};

const GLOW_VISUALS = {
    dark: {
        // Moderate blur for a tighter glow
        blur: 56,
        // Base opacity; scaled by intensity
        opacity: 0.5,
        // Base brightness; scaled by intensity
        brightness: 0.9,
        brightnessBoost: 0.6,
        // Subtle saturation lift
        saturation: 1.12,
    },
    light: {
        blur: 48,
        opacity: 0.18,
        brightness: 0.95,
        brightnessBoost: 0.45,
        saturation: 1.08,
    }
};

interface AmbientGlowPlayerProps {
    mainPlayerRef: React.RefObject<PlayerRef | null>;
    timelineMetadata: TimelineMetadata | null;
    playerConfig: PlayerConfig | null;
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
    const lastFrameSyncMsRef = useRef<number>(0);
    const { resolvedTheme } = useTheme();

    const throttledSeek = useThrottledSeek(glowPlayerRef);

    const glowVisuals = resolvedTheme === 'light' ? GLOW_VISUALS.light : GLOW_VISUALS.dark;
    const clampedIntensity = Math.max(0, Math.min(1, glowIntensity));
    const intensityStrength = Math.pow(clampedIntensity, 1.15);
    const glowOpacity = glowVisuals.opacity * intensityStrength;
    const glowBlur = glowVisuals.blur * (0.6 + 0.6 * intensityStrength);
    const glowSaturation = glowVisuals.saturation * (0.95 + 0.12 * intensityStrength);
    const glowBrightness = glowVisuals.brightness + glowVisuals.brightnessBoost * intensityStrength;
    const glowSpread = GLOW_CONFIG.spread + GLOW_CONFIG.maxSpreadBoost * intensityStrength;
    const glowFadeRadius = 0.62 + 0.25 * intensityStrength;

    const clampFrame = useCallback((frame: number) => {
        if (!timelineMetadata) return 0;
        const maxFrame = timelineMetadata.durationInFrames - 1;
        return Math.max(0, Math.min(frame, maxFrame));
    }, [timelineMetadata]);

    const timeToFrame = useCallback((timeMs: number) => {
        if (!timelineMetadata) return 0;
        return msToFrame(timeMs, timelineMetadata.fps);
    }, [timelineMetadata]);

    const safePlay = useCallback((player: PlayerRef | null) => {
        if (!player) return;
        return player.play();
    }, []);

    const glowSize = useMemo(() => {
        if (!timelineMetadata) return { width: 96, height: 96 };

        const aspectRatio = timelineMetadata.width / timelineMetadata.height;
        const maxDim = Math.max(timelineMetadata.width, timelineMetadata.height);

        // Scale to fit within maxSize
        const scale = Math.min(1, GLOW_CONFIG.maxSize / maxDim);

        let width = Math.round(timelineMetadata.width * scale);
        let height = Math.round(timelineMetadata.height * scale);

        // Ensure strictly minimum 4px to avoid rendering issues, but ignore GLOW_CONFIG.minSize
        // to prevent aspect ratio distortion on extreme aspect ratios
        width = Math.max(4, width);
        height = Math.max(4, height);

        // Correct aspect ratio if rounding/clamping skewed it
        if (Math.abs(width / height - aspectRatio) > 0.01) {
            const targetHeight = Math.round(width / aspectRatio);
            // If adjusting height keeps it above min, do it
            if (targetHeight >= 4) {
                height = targetHeight;
            } else {
                // Otherwise adjust width to match height
                width = Math.round(height * aspectRatio);
            }
        }

        return { width, height };
    }, [timelineMetadata]);

    // Glow player sync - follows main player but simpler (no audio)
    useEffect(() => {
        if (!timelineMetadata) return;
        const glowPlayer = glowPlayerRef.current;
        if (!glowPlayer) return;

        const getTargetFrame = () => {
            const mainPlayer = mainPlayerRef.current;
            if (mainPlayer) {
                return clampFrame(mainPlayer.getCurrentFrame());
            }
            const currentTimeMs = useProjectStore.getState().currentTime;
            return clampFrame(timeToFrame(currentTimeMs));
        };

        const maybeSeek = (targetFrame: number) => {
            const currentGlowFrame = glowPlayer.getCurrentFrame();
            if (Math.abs(currentGlowFrame - targetFrame) <= 2) return;
            glowPlayer.seekTo(targetFrame);
        };

        if (isPlaying) {
            if (!lastGlowIsPlayingRef.current) {
                maybeSeek(getTargetFrame());
                safePlay(glowPlayer);
            }
            lastGlowIsPlayingRef.current = true;
            return;
        }

        if (lastGlowIsPlayingRef.current) {
            glowPlayer.pause();
            maybeSeek(getTargetFrame());
        }
        lastGlowIsPlayingRef.current = false;
    }, [isPlaying, timelineMetadata, clampFrame, timeToFrame, mainPlayerRef, safePlay, playerKey]);

    // CONSOLIDATED: Single sync effect for initial frame and playerKey changes
    // Previously had redundant RAF + setTimeout patterns
    useEffect(() => {
        if (!timelineMetadata) return;
        const glowPlayer = glowPlayerRef.current;
        if (!glowPlayer) return;

        const targetFrame = clampFrame(initialFrame);
        glowPlayer.seekTo(targetFrame);
        if (!isPlaying) {
            glowPlayer.pause();
        }
    }, [playerKey, initialFrame, timelineMetadata, clampFrame, isPlaying]);

    // CONSOLIDATED: Single event-based sync for main player seeks
    // Removed redundant RAF+setTimeout - event listener is sufficient
    useEffect(() => {
        const glowPlayer = glowPlayerRef.current;
        const mainPlayer = mainPlayerRef.current;
        if (!glowPlayer || !mainPlayer || !timelineMetadata) return;

        const syncToMain = () => {
            const targetFrame = clampFrame(mainPlayer.getCurrentFrame());
            const currentGlowFrame = glowPlayer.getCurrentFrame();
            if (Math.abs(currentGlowFrame - targetFrame) > 1) {
                glowPlayer.seekTo(targetFrame);
            }
        };

        // Only need the event listener - no RAF/timeout needed
        mainPlayer.addEventListener('seeked', syncToMain);

        return () => {
            mainPlayer.removeEventListener('seeked', syncToMain);
        };
    }, [mainPlayerRef, timelineMetadata, clampFrame, playerKey]);

    // Paused state store sync - only active when not playing
    useEffect(() => {
        if (!timelineMetadata) return;
        if (isPlaying && !isScrubbing) return;

        let prevTime = useProjectStore.getState().currentTime;

        const unsubscribe = useProjectStore.subscribe((state) => {
            if (state.isPlaying && !state.isScrubbing) return;
            const nextTime = state.currentTime;
            if (Math.abs(nextTime - prevTime) < 1) return;
            prevTime = nextTime;
            const targetFrame = clampFrame(timeToFrame(nextTime));
            throttledSeek(targetFrame);
        });

        // Initial sync
        const initFrame = clampFrame(timeToFrame(prevTime));
        throttledSeek(initFrame);

        return () => unsubscribe();
    }, [timelineMetadata, isPlaying, isScrubbing, clampFrame, timeToFrame, throttledSeek, playerKey]);

    // Throttled frame sync during playback - prevents drift
    useEffect(() => {
        const glowPlayer = glowPlayerRef.current;
        const mainPlayer = mainPlayerRef.current;
        if (!glowPlayer || !mainPlayer || !timelineMetadata) return;
        if (!isPlaying || isScrubbing) return; // Only during playback

        const handleFrameUpdate = (e: { detail: { frame: number } }) => {
            const now = performance.now();
            // Throttle to 4Hz (250ms) - glow doesn't need precise sync
            if (now - lastFrameSyncMsRef.current < 250) return;
            lastFrameSyncMsRef.current = now;

            const targetFrame = clampFrame(e.detail.frame);
            const currentGlowFrame = glowPlayer.getCurrentFrame();

            if (Math.abs(currentGlowFrame - targetFrame) <= 2) return;

            glowPlayer.seekTo(targetFrame);
        };

        mainPlayer.addEventListener('frameupdate', handleFrameUpdate);
        return () => {
            mainPlayer.removeEventListener('frameupdate', handleFrameUpdate);
        };
    }, [clampFrame, mainPlayerRef, timelineMetadata, isPlaying, isScrubbing, playerKey]);
    // Handle loop synchronization
    useEffect(() => {
        const glowPlayer = glowPlayerRef.current;
        if (!glowPlayer) return;

        const handleEnded = () => {
            // Force sync when loop happens
            glowPlayer.seekTo(0);
            if (isPlaying) {
                safePlay(glowPlayer);
            }
        };

        glowPlayer.addEventListener('ended', handleEnded);
        return () => {
            glowPlayer.removeEventListener('ended', handleEnded);
        };
    }, [isPlaying, safePlay, playerKey]);

    // Prepare input props
    const glowPlayerInputProps = React.useMemo(() => {
        if (!playerConfig) return null;
        return buildTimelineCompositionInput(playerConfig, {
            playback: {
                isPlaying,
                isScrubbing,
                isHighQualityPlaybackEnabled: false,
                previewMuted: true,
                previewVolume: 0,
            },
            renderSettings: {
                isGlowMode: true,
                glowCrossfade: false,
                preferOffthreadVideo: false,
                isEditingCrop: false,
                enhanceAudio: false,
            },
        });
    }, [playerConfig, isPlaying, isScrubbing]);

    if (!timelineMetadata || !playerConfig || !glowPlayerInputProps) return null;
    if (clampedIntensity <= 0) return null;

    return (
        <div
            style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: `calc(100% + ${glowSpread * 2}px)`,
                height: `calc(100% + ${glowSpread * 2}px)`,
                transform: 'translate(-50%, -50%) translateZ(0)',
                filter: `blur(${glowBlur}px) brightness(${glowBrightness}) saturate(${glowSaturation})`,
                opacity: glowOpacity,
                zIndex: 0,
                // Removed clipping properties
                pointerEvents: 'none',
                mixBlendMode: 'normal',
                maskImage: `radial-gradient(${Math.round(glowFadeRadius * 100)}% ${Math.round(
                    glowFadeRadius * 100
                )}% at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
                WebkitMaskImage: `radial-gradient(${Math.round(glowFadeRadius * 100)}% ${Math.round(
                    glowFadeRadius * 100
                )}% at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
            }}
        >
            <Player
                key={`glow-${playerKey}`}
                ref={glowPlayerRef}
                component={TimelineComposition}
                inputProps={glowPlayerInputProps}
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
