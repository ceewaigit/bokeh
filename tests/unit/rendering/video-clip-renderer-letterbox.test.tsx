import React from 'react'
import { PlaybackSettingsProvider } from '@/features/rendering/renderer/context/playback/PlaybackSettingsContext'
import { VideoPositionProvider } from '@/features/rendering/renderer/context/layout/VideoPositionContext'
import { VideoClipRenderer } from '@/features/rendering/renderer/compositions/renderers/VideoClipRenderer'

// jest.setup.js replaces the DOM with a minimal stub; React's server renderer expects MessageChannel to exist.
if (!(global as any).MessageChannel) {
  ;(global as any).MessageChannel = class MessageChannel {
    port1 = {}
    port2 = {}
  }
}

if (!(global as any).TextEncoder || !(global as any).TextDecoder) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const util = require('util')
  ;(global as any).TextEncoder = util.TextEncoder
  ;(global as any).TextDecoder = util.TextDecoder
}

const { renderToStaticMarkup } = require('react-dom/server')

jest.mock('sonner', () => {
  return {
    toast: {
      success: jest.fn(),
      error: jest.fn(),
      message: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
    },
    Toaster: () => null,
  }
})

jest.mock('remotion', () => {
  return {
    Sequence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ width: 900, height: 828 }),
    getRemotionEnvironment: () => ({ isRendering: false }),
  }
})

jest.mock('@/features/rendering/renderer/context/CompositionContext', () => {
  return {
    useComposition: () => ({ fps: 30 }),
  }
})

jest.mock('@/features/rendering/renderer/hooks/media/useVideoUrl', () => {
  return {
    useVideoUrl: () => 'mock://video',
  }
})

jest.mock('@/features/rendering/renderer/hooks/media/useVTDecoderCleanup', () => {
  return {
    useVideoContainerCleanup: () => ({ current: null }),
  }
})

jest.mock('@/features/rendering/motion-blur/components/MotionBlurWrapper', () => {
  return {
    MotionBlurWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

jest.mock('@/features/rendering/renderer/components/video-helpers', () => {
  return {
    AudioEnhancerWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

function makeVideoRecording(id: string, width: number, height: number) {
  return {
    id,
    name: id,
    sourceType: 'video',
    filePath: `/tmp/${id}.mp4`,
    folderPath: '/tmp',
    createdAt: new Date().toISOString(),
    duration: 10_000,
    width,
    height,
    metadata: null,
    capabilities: {},
    hasAudio: false,
  } as any
}

function makeClip(id: string, recordingId: string, startTime: number, duration: number) {
  return {
    id,
    recordingId,
    startTime,
    duration,
    sourceIn: 0,
    sourceOut: duration,
  } as any
}

describe('VideoClipRenderer letterboxing', () => {
  it('uses `object-fit: contain` when aspect differs', () => {
    // Stable frame (canvas) ratio ~ 1.086 (screen recording)
    const frameDrawWidth = 660
    const frameDrawHeight = 607

    // Imported clip is 16:9, should be letterboxed within the frame.
    const recording = makeVideoRecording('imported', 1280, 720)
    const clip = makeClip('clip-imported', recording.id, 0, 1000)

    const VideoComponent = ({ style }: { style?: React.CSSProperties }) => (
      <video data-testid="video" style={style} />
    )

    const html = renderToStaticMarkup(
      <PlaybackSettingsProvider
        playback={{
          isPlaying: false,
          isScrubbing: false,
          isHighQualityPlaybackEnabled: false,
          previewMuted: true,
          previewVolume: 0,
        } as any}
        renderSettings={{
          isGlowMode: false,
          glowCrossfade: false,
          preferOffthreadVideo: false,
          enhanceAudio: false,
          isEditingCrop: false,
        } as any}
        resources={{ videoUrls: {}, videoFilePaths: {} } as any}
      >
        <VideoPositionProvider
          value={{
            offsetX: 0,
            offsetY: 0,
            drawWidth: frameDrawWidth,
            drawHeight: frameDrawHeight,
            zoomTransform: null,
            contentTransform: '',
            padding: 0,
            videoWidth: 3218,
            videoHeight: 2960,
            cornerRadius: 0,
            shadowIntensity: 0,
            maxZoomScale: 1,
            motionBlur: {
              enabled: false,
              velocity: { x: 0, y: 0 },
              intensity: 0,
              drawWidth: frameDrawWidth,
              drawHeight: frameDrawHeight,
            },
            boundaryState: undefined,
            activeLayoutItem: null,
            prevLayoutItem: null,
            nextLayoutItem: null,
          } as any}
        >
          <VideoClipRenderer
            clipForVideo={clip}
            recording={recording}
            startFrame={0}
            durationFrames={30}
            groupStartFrame={0}
            groupStartSourceIn={0}
            groupDuration={30}
            markRenderReady={() => undefined}
            handleVideoReady={() => undefined}
            VideoComponent={VideoComponent}
            premountFor={0}
            postmountFor={0}
            isScrubbing={false}
          />
        </VideoPositionProvider>
      </PlaybackSettingsProvider>
    )

    // Regression: When framing is stable (canvas aspect ratio), a clip with a different
    // aspect ratio must be shown without stretching/cropping.
    // We do this by using `object-fit: contain` for the video element.
    expect(html).toContain('object-fit:contain')
  })

  it('rounds corners on the visible content rect (not just frame corners)', () => {
    const frameDrawWidth = 800
    const frameDrawHeight = 800

    // Imported clip is 16:9, so it will be letterboxed in the square frame.
    const recording = makeVideoRecording('imported', 1920, 1080)
    const clip = makeClip('clip-imported', recording.id, 0, 1000)

    const VideoComponent = ({ style }: { style?: React.CSSProperties }) => (
      <video data-testid="video" style={style} />
    )

    const html = renderToStaticMarkup(
      <PlaybackSettingsProvider
        playback={{
          isPlaying: false,
          isScrubbing: false,
          isHighQualityPlaybackEnabled: false,
          previewMuted: true,
          previewVolume: 0,
        } as any}
        renderSettings={{
          isGlowMode: false,
          glowCrossfade: false,
          preferOffthreadVideo: false,
          enhanceAudio: false,
          isEditingCrop: false,
        } as any}
        resources={{ videoUrls: {}, videoFilePaths: {} } as any}
      >
        <VideoPositionProvider
          value={{
            offsetX: 0,
            offsetY: 0,
            drawWidth: frameDrawWidth,
            drawHeight: frameDrawHeight,
            zoomTransform: null,
            contentTransform: '',
            padding: 0,
            videoWidth: 3218,
            videoHeight: 2960,
            cornerRadius: 48,
            shadowIntensity: 0,
            maxZoomScale: 1,
            motionBlur: {
              enabled: false,
              velocity: { x: 0, y: 0 },
              intensity: 0,
              drawWidth: frameDrawWidth,
              drawHeight: frameDrawHeight,
            },
            boundaryState: undefined,
            activeLayoutItem: null,
            prevLayoutItem: null,
            nextLayoutItem: null,
          } as any}
        >
          <VideoClipRenderer
            clipForVideo={clip}
            recording={recording}
            startFrame={0}
            durationFrames={30}
            groupStartFrame={0}
            groupStartSourceIn={0}
            groupDuration={30}
            markRenderReady={() => undefined}
            handleVideoReady={() => undefined}
            VideoComponent={VideoComponent}
            premountFor={0}
            postmountFor={0}
            isScrubbing={false}
          />
        </VideoPositionProvider>
      </PlaybackSettingsProvider>
    )

    // Regression: for letterboxed clips, corner radius should round the *video pixels*
    // (the contained content rect), not only the stable framing corners.
    expect(html).toContain('clip-path:inset(')
    expect(html).toContain('round 48px')
  })
})
