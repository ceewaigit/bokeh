import React, { useMemo } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { TimelineComposition } from '@/remotion/compositions/TimelineComposition';
import { AmbientGlowPlayer } from './ambient-glow-player';
import { buildTimelineCompositionInput } from '@/remotion/utils/composition-input';
import { PREVIEW_DISPLAY_WIDTH, PREVIEW_DISPLAY_HEIGHT, RETINA_MULTIPLIER } from '@/lib/utils/resolution-utils';
import type { TimelineMetadata } from '@/hooks/useTimelineMetadata';
import type { PlayerConfiguration, CropEffectData } from '@/types/project';
import type { ZoomSettings } from '@/types/remotion';

interface PlayerContainerProps {
    playerRef: React.RefObject<PlayerRef>;
    playerContainerRef: React.RefObject<HTMLDivElement>;
    timelineMetadata: TimelineMetadata;
    playerConfig: PlayerConfiguration;
    playerKey: string;
    initialFrame: number;
    isHighQualityPlaybackEnabled: boolean;
    muted: boolean;
    volume: number;
    isGlowEnabled: boolean;
    glowIntensity: number;
    isPlaying: boolean;
    isScrubbing: boolean;
    isEditingCrop: boolean;
    cropData: CropEffectData | null;
    onCropChange?: (cropData: CropEffectData) => void;
    onCropConfirm?: () => void;
    onCropReset?: () => void;
    zoomSettings?: ZoomSettings;
}

export const PlayerContainer: React.FC<PlayerContainerProps> = ({
    playerRef,
    playerContainerRef,
    timelineMetadata,
    playerConfig,
    playerKey,
    initialFrame,
    isHighQualityPlaybackEnabled,
    muted,
    volume,
    isGlowEnabled,
    glowIntensity,
    isPlaying,
    isScrubbing,
    isEditingCrop,
    cropData,
    onCropChange,
    onCropConfirm,
    onCropReset,
    zoomSettings,
}) => {
    // Calculate composition size for preview
    const compositionSize = useMemo(() => {
        const videoWidth = timelineMetadata.width;
        const videoHeight = timelineMetadata.height;
        const videoAspectRatio = videoWidth / videoHeight;

        const maxWidth = isHighQualityPlaybackEnabled
            ? videoWidth
            : PREVIEW_DISPLAY_WIDTH * RETINA_MULTIPLIER;
        const maxHeight = isHighQualityPlaybackEnabled
            ? videoHeight
            : PREVIEW_DISPLAY_HEIGHT * RETINA_MULTIPLIER;

        const scaleByWidth = maxWidth / videoWidth;
        const scaleByHeight = maxHeight / videoHeight;
        const scale = Math.min(scaleByWidth, scaleByHeight, 1);

        const width = Math.max(320, Math.round(videoWidth * scale));
        let height = Math.max(180, Math.round(videoHeight * scale));

        if (Math.abs(width / height - videoAspectRatio) > 0.001) {
            height = Math.round(width / videoAspectRatio);
        }

        return { width, height };
    }, [timelineMetadata, isHighQualityPlaybackEnabled]);

    const mainPlayerInputProps = useMemo(() => {
        return buildTimelineCompositionInput(playerConfig, {
            playback: {
                isPlaying: false,
                isScrubbing: false,
                isHighQualityPlaybackEnabled,
                previewMuted: muted,
                previewVolume: Math.min(volume / 100, 1),
            },
            renderSettings: {
                isGlowMode: false,
                preferOffthreadVideo: false,
                isEditingCrop: Boolean(isEditingCrop),
            },
            cropSettings: {
                cropData: cropData ?? null,
                onCropChange,
                onCropConfirm,
                onCropReset,
            },
            zoomSettings,
        });
    }, [
        playerConfig,
        isEditingCrop,
        cropData,
        onCropChange,
        onCropConfirm,
        onCropReset,
        zoomSettings,
        isHighQualityPlaybackEnabled,
        muted,
        volume,
    ]);

    return (
        <>
            {isGlowEnabled && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[105%] h-[105%] -z-10 blur-2xl opacity-50 pointer-events-none">
                    <AmbientGlowPlayer
                        mainPlayerRef={playerRef}
                        timelineMetadata={timelineMetadata}
                        playerConfig={playerConfig}
                        isPlaying={isPlaying}
                        isScrubbing={isScrubbing}
                        playerKey={playerKey}
                        initialFrame={initialFrame}
                        glowIntensity={glowIntensity}
                    />
                </div>
            )}

            <div ref={playerContainerRef} className="w-full h-full rounded-lg overflow-hidden relative z-0">
                <Player
                    ref={playerRef}
                    key={playerKey}
                    component={TimelineComposition}
                    inputProps={mainPlayerInputProps}
                    durationInFrames={timelineMetadata.durationInFrames}
                    fps={timelineMetadata.fps}
                    compositionWidth={compositionSize.width}
                    compositionHeight={compositionSize.height}
                    className="w-full h-full"
                    style={{
                        width: '100%',
                        height: '100%',
                    }}
                    initialFrame={initialFrame}
                    clickToPlay={false}
                    doubleClickToFullscreen={false}
                    loop
                />
            </div>
        </>
    );
};
