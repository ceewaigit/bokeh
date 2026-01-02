
export interface PlaybackSettings {
    isPlaying: boolean;
    isScrubbing: boolean;
    isHighQualityPlaybackEnabled: boolean;
    previewMuted: boolean;
    previewVolume: number;
}

export interface FadeOpacityOptions {
    localFrame: number;
    durationFrames: number;
    introFadeDuration: number;
    outroFadeDuration: number;
    minOpacity?: number;
}

export interface ClipFadeDurations {
    introFadeDuration: number;
    outroFadeDuration: number;
}
