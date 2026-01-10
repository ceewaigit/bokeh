import React, { useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Player, PlayerRef } from '@remotion/player';
import { TimelineComposition } from '@/features/rendering/renderer/compositions/TimelineComposition';
import { AmbientGlowPlayer } from './ambient-glow-player';
import { buildTimelineCompositionInput } from '@/features/rendering/renderer/utils/composition-input';
import type { TimelineMetadata } from '@/features/ui/timeline/hooks/use-timeline-metadata';
import type { PlayerConfiguration } from '@/types/project';
import type { ZoomSettings } from '@/types/remotion';

interface PlayerContainerProps {
    playerRef: React.RefObject<PlayerRef | null>;
    playerContainerRef: React.RefObject<HTMLDivElement | null>;
    timelineMetadata: TimelineMetadata;
    playerConfig: PlayerConfiguration;
    playerKey: string;
    initialFrame: number;
    isHighQualityPlaybackEnabled: boolean;
    compositionWidth: number;
    compositionHeight: number;
    muted: boolean;
    volume: number;
    isGlowEnabled: boolean;
    glowIntensity: number;
    isPlaying: boolean;
    isScrubbing: boolean;
    isEditingCrop: boolean;
    zoomSettings?: ZoomSettings;
    glowPortalRoot?: HTMLElement | null;
    glowPortalStyle?: {
        centerX: number;
        centerY: number;
        width: number;
        height: number;
        scale: number;
    } | null;
}

const PlayerContainerComp: React.FC<PlayerContainerProps> = ({
    playerRef,
    playerContainerRef,
    timelineMetadata,
    playerConfig,
    playerKey,
    initialFrame,
    isHighQualityPlaybackEnabled,
    compositionWidth,
    compositionHeight,
    muted,
    volume,
    isGlowEnabled,
    glowIntensity,
    isPlaying,
    isScrubbing,
    isEditingCrop,
    zoomSettings,
    glowPortalRoot,
    glowPortalStyle,
}) => {
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
            zoomSettings,
        });
    }, [
        playerConfig,
        isEditingCrop,
        zoomSettings,
        isHighQualityPlaybackEnabled,
        muted,
        volume,
    ]);

    const glowNode = isGlowEnabled ? (
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
    ) : null;

    const shouldPortalGlow = Boolean(glowPortalRoot && glowPortalStyle);

    return (
        <>
            {glowNode && shouldPortalGlow && glowPortalRoot && glowPortalStyle
                ? ReactDOM.createPortal(
                    <div
                        style={{
                            position: 'absolute',
                            top: glowPortalStyle.centerY,
                            left: glowPortalStyle.centerX,
                            width: glowPortalStyle.width,
                            height: glowPortalStyle.height,
                            transform: `translate(-50%, -50%) scale(${glowPortalStyle.scale})`,
                            transformOrigin: 'center',
                            pointerEvents: 'none',
                        }}
                    >
                        {glowNode}
                    </div>,
                    glowPortalRoot
                )
                : glowNode && (
                    <div className="absolute inset-0 -z-10 pointer-events-none">
                        {glowNode}
                    </div>
                )}

            <div ref={playerContainerRef} className="w-full h-full rounded-2xl overflow-hidden relative z-0">
                <Player
                    ref={playerRef}
                    key={playerKey}
                    component={TimelineComposition}
                    inputProps={mainPlayerInputProps}
                    durationInFrames={timelineMetadata.durationInFrames}
                    fps={timelineMetadata.fps}
                    compositionWidth={compositionWidth}
                    compositionHeight={compositionHeight}
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

export const PlayerContainer = React.memo(PlayerContainerComp);
