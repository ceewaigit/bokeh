import type { ReactElement, ReactNode, SyntheticEvent, ComponentType } from 'react';
import type { Clip, Recording, Effect, MouseEvent, ClickEvent, KeyboardEvent, ScrollEvent, CameraSettings, DeviceMockupData, ParallaxLayer } from '@/types/project';
import type { MockupPositionResult } from '@/features/rendering/renderer/engine/layout-engine';
import type { FrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout';
import type { ParsedZoomBlock } from '@/features/ui/editor/logic/viewport/logic/orchestrator';
import type { VideoResources } from '@/features/media/recording/types/resources';
import type { CropSettings } from '@/features/effects/crop/types';
import type { GlobalSkipRange } from '@/types/skip-ranges';

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

export interface RenderSettings {
    /** Whether we are in "glow" mode (ambient background blur) */
    isGlowMode: boolean;
    /** Whether glow mode uses crossfades at clip boundaries */
    glowCrossfade: boolean;
    /** Whether to use offthread video rendering (safer but more memory intensive) */
    preferOffthreadVideo: boolean;
    /** Whether to enhance audio (normalize/compress) */
    enhanceAudio: boolean;
    /** Whether we are currently editing the crop */
    isEditingCrop: boolean;
}

export interface ZoomTransform {
    scale: number;
    scaleCompensationX: number;
    scaleCompensationY: number;
    panX: number;
    panY: number;
    /** Refocus blur amount (0-1) - peaks mid-transition like a camera pulling focus */
    refocusBlur: number;
}

export type CameraPathFrame = {
    activeZoomBlock: ParsedZoomBlock | undefined;
    zoomCenter: { x: number; y: number };
    /** Precomputed velocity for motion blur (normalized 0-1 delta per frame) */
    velocity?: { x: number; y: number };
    /** Precomputed motion blur mix factor (0-1), deterministic per frame */
    motionBlurMix?: number;
    /** Precomputed zoom transform (SSOT - no render-time calculation needed) */
    zoomTransform: ZoomTransform;
    /** Precomputed CSS transform string for GPU-accelerated rendering */
    zoomTransformStr: string;
};

export type ActiveClipDataAtFrame = {
    clip: Clip;
    recording: Recording;
    sourceTimeMs: number;
    effects: Effect[];
};

export interface VideoPositionContextValue {
    // Core layout dimensions
    offsetX: number;
    offsetY: number;
    drawWidth: number;
    drawHeight: number;
    zoomTransform: ZoomTransform | null;
    contentTransform: string;
    padding: number;
    videoWidth: number;
    videoHeight: number;

    // Extended layout properties (from useLayoutCalculation)
    paddingScaled?: number;
    scaleFactor?: number;
    cornerRadius?: number;
    shadowIntensity?: number;
    activeSourceWidth?: number;
    activeSourceHeight?: number;

    // Effects
    /** Whether the screen has an active 3D CSS transform (e.g. depth block) */
    has3DTransform?: boolean;

    /** Refocus blur strength in pixels for zoom transitions */
    refocusBlurPx?: number;

    /** Motion blur state (IoC pattern - data flows down, not discovered via DOM) */
    motionBlur?: {
        /** Whether motion blur is enabled globally */
        enabled: boolean;
        /** Camera velocity normalized (0-1) - resolution independent, converted to pixels by MotionBlurCanvas */
        velocity: { x: number; y: number };
        /** Intensity multiplier 0-1 (from camera settings) */
        intensity: number;
        /** Draw dimensions for the blur effect */
        drawWidth: number;
        drawHeight: number;
        /** Output color space for the motion blur layer */
        colorSpace?: PredefinedColorSpace;
        /** Gamma correction factor */
        gamma?: number;
        /** Manual black level adjustment */
        blackLevel?: number;
        /** Saturation adjustment */
        saturation?: number;
        /** Render base video through WebGL for consistent pipeline */
        useWebglVideo?: boolean;
        /** Samples count (optional override) */
        samples?: number;
        /** Whether to premultiply alpha on upload */
        unpackPremultiplyAlpha?: boolean;
        /** Velocity threshold in pixels/frame - blur only activates above this speed */
        velocityThreshold?: number;
        /** Soft knee ramp range (0-1) - controls transition smoothness */
        rampRange?: number;
        /** Maximum blur radius clamp */
        clampRadius?: number;
        /** Smoothing window in frames - higher = longer blur fade */
        smoothWindow?: number;
    };

    // Mockup
    /** Whether a device mockup is enabled */
    mockupEnabled?: boolean;
    /** Device mockup position and dimensions (when enabled) */
    mockupPosition?: MockupPositionResult | null;
    mockupData?: DeviceMockupData | null;

    // Frame layout and clip data (SSOT from SharedVideoController)
    /** Active clip data for current frame */
    activeClipData?: ActiveClipDataAtFrame | null;
    /** Effective clip data with inheritance applied */
    effectiveClipData?: ActiveClipDataAtFrame | null;
    /** Clip data for previous frame (frame-1) - used for cursor smoothing */
    prevFrameClipData?: ActiveClipDataAtFrame | null;
    /** Pre-computed frame layout */
    frameLayout?: FrameLayoutItem[];
    /** Current active layout item */
    activeLayoutItem?: FrameLayoutItem | null;
    /** Previous layout item (for boundary logic) */
    prevLayoutItem?: FrameLayoutItem | null;
    /** Next layout item (for boundary logic) */
    nextLayoutItem?: FrameLayoutItem | null;

    // Rendering State (for VideoClipRenderer)
    maxZoomScale?: number;
    // NOTE: clipFadeOpacity and useParentFade were removed.
    // Each renderer now calculates its own opacity via useClipRenderState.
    // This fixes the bug where clip-specific opacity was shared globally,
    // causing random transparency when multiple clips render simultaneously.
    boundaryState?: {
        shouldHoldPrevFrame: boolean;
        isNearBoundaryEnd: boolean;
        overlapFrames: number;
        isNearBoundaryStart: boolean;
    };
}

export interface ClipContextValue {
    clip: Clip;
    recording: Recording;
    videoUrl: string;
    cursorEvents: MouseEvent[];
    clickEvents: ClickEvent[];
    keystrokeEvents: KeyboardEvent[];
    scrollEvents: ScrollEvent[];
    effects: Effect[];
}

export interface TimeContextValue {
    totalDurationMs: number;
    fps: number;
    clips: Clip[];
    recordingsMap: Map<string, Recording>;
    resources: VideoResources;
    getClipAtTimelinePosition: (timelineMs: number) => Clip | null;
    getRecording: (recordingId: string) => Recording | null;
    getVideoUrl: (recordingId: string) => string | undefined;
}

export interface SharedVideoControllerProps {
    videoWidth: number;
    videoHeight: number;
    sourceVideoWidth?: number;
    sourceVideoHeight?: number;
    children?: ReactNode;
    cameraSettings?: CameraSettings;
    /** Explicit camera path (SSOT) - passed from parent to avoid implicit store dependency during export */
    cameraPath?: (CameraPathFrame & { path?: CameraPathFrame[] })[] | null;

    // New Config Objects
    playback: PlaybackSettings;
    renderSettings: RenderSettings;
    cropSettings: CropSettings;
}

export interface TimelineCompositionProps {
    clips: Clip[];
    audioClips?: Clip[];
    webcamClips?: Clip[];
    recordings: Recording[];
    effects: Effect[];
    /** Global skip ranges for transcript-based hidden regions (Timeline-Centric architecture) */
    globalSkipRanges?: GlobalSkipRange[];
    videoWidth: number;
    videoHeight: number;
    fps: number;
    sourceVideoWidth?: number;
    sourceVideoHeight?: number;
    cameraSettings?: CameraSettings;
    backgroundColor?: string;

    // New Config Objects
    resources: VideoResources;
    playback: PlaybackSettings;
    renderSettings: RenderSettings;
    cropSettings: CropSettings;
    zoomSettings: any; // Using any to avoid circular dependency if possible, or import ZoomSettings (but ZoomSettings was in remotion.ts too)
    // ZoomSettings was { isEditing: boolean; zoomData?: ZoomEffectData | null }
    // I should move ZoomSettings to features/editor/types or similar.
    // For now let's reuse imports or define it if small.
    [key: string]: unknown;
}

export interface UseRenderDelayResult {
    /** Call to release the render delay (marks component as ready) */
    markRenderReady: (source?: string) => void;
    /** Attach to video events (onLoadedData, onCanPlay, onSeeked) */
    handleVideoReady: (event: SyntheticEvent<HTMLVideoElement>) => void;
}

export interface VideoClipRendererProps {
    clipForVideo: Clip;
    recording: Recording | undefined;
    startFrame: number;
    durationFrames: number;
    groupStartFrame: number;
    groupStartSourceIn: number;
    groupDuration: number;

    markRenderReady: (source?: string) => void;
    handleVideoReady: (e: SyntheticEvent<HTMLVideoElement>) => void;
    VideoComponent: ComponentType<any>;
    premountFor: number;
    postmountFor: number;
    onVideoRef?: (video: HTMLVideoElement | null) => void;
    isScrubbing?: boolean;
}

export interface PreviewVideoRendererProps {
    recording: Recording | null | undefined;
    clipForVideo?: Clip | null;
    startFrame: number;
    durationFrames: number;
    sourceTimeMs: number;
    currentFrame: number;
    fps: number;
    cornerRadius: number;
    drawWidth: number;
    drawHeight: number;
    compositionWidth: number;
    compositionHeight: number;
    maxZoomScale: number;
    currentZoomScale: number;
    mockupEnabled?: boolean;
    visible: boolean;

    // New Config Objects
    resources: VideoResources;
    playback: PlaybackSettings;
    renderSettings: RenderSettings;
}

export interface GeneratedClipRendererProps {
    clipForVideo: Clip;
    recording: Recording;
    startFrame: number;
    durationFrames: number;
    groupStartFrame: number;
    groupDuration: number;
    currentFrame: number;
    fps: number;
    isRendering: boolean;
    drawWidth: number;
    drawHeight: number;
    compositionWidth: number;
    compositionHeight: number;

    activeLayoutItem: FrameLayoutItem | null;
    prevLayoutItem: FrameLayoutItem | null;
    nextLayoutItem: FrameLayoutItem | null;
    shouldHoldPrevFrame: boolean;
    isNearBoundaryEnd: boolean;
    overlapFrames: number;

    // New Config Objects
    renderSettings: RenderSettings;
}

export interface ImageClipRendererProps {
    clipForVideo: Clip;
    recording: Recording;
    startFrame: number;
    durationFrames: number;
    groupStartFrame: number;
    groupDuration: number;
    currentFrame: number;
    fps: number;
    isRendering: boolean;
    cornerRadius: number;
    drawWidth: number;
    drawHeight: number;
    compositionWidth: number;
    compositionHeight: number;

    activeLayoutItem: FrameLayoutItem | null;
    prevLayoutItem: FrameLayoutItem | null;
    nextLayoutItem: FrameLayoutItem | null;
    shouldHoldPrevFrame: boolean;
    isNearBoundaryEnd: boolean;
    overlapFrames: number;

    // New Config Objects
    resources: VideoResources;
    renderSettings: RenderSettings;
}

export interface GlowCrossfadeOptions {
    isGlowMode: boolean;
    clipId: string;
    currentFrame: number;
    fps: number;
    shouldHoldPrevFrame: boolean;
    isNearBoundaryEnd: boolean;
    prevLayoutItem: FrameLayoutItem | null;
    activeLayoutItem: FrameLayoutItem | null;
    nextLayoutItem: FrameLayoutItem | null;
}

export interface ParallaxBackgroundLayerProps {
    layers: ParallaxLayer[];
    mouseX: number;
    mouseY: number;
    intensity: number;
    blur?: number;
}

export interface ClipSequenceProps {
    clip: Clip;
    startFrame: number;
    durationFrames: number;

    includeBackground?: boolean;
    includeKeystrokes?: boolean;
}

export interface AudioEnhancerWrapperProps {
    children: ReactElement;
    /** @deprecated Use RenderSettings.enhanceAudio instead */
    enabled?: boolean;
}
