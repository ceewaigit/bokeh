import type {
  CropSettings,
  PlaybackSettings,
  RenderSettings,
  TimelineCompositionProps,
  VideoResources,
  ZoomSettings
} from '@/types'

type CompositionBaseProps = Omit<
  TimelineCompositionProps,
  'playback' | 'renderSettings' | 'cropSettings' | 'zoomSettings' | 'resources'
> & { enhanceAudio?: boolean }

const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  isGlowMode: false,
  preferOffthreadVideo: false,
  enhanceAudio: false,
  isEditingCrop: false
}

const DEFAULT_CROP_SETTINGS: CropSettings = {
  cropData: null,
  onCropChange: undefined,
  onCropConfirm: undefined,
  onCropReset: undefined
}

const DEFAULT_ZOOM_SETTINGS: ZoomSettings = {
  isEditing: false,
  zoomData: null
}

const DEFAULT_RESOURCES: VideoResources = {
  videoUrls: undefined,
  videoUrlsHighRes: undefined,
  videoFilePaths: undefined,
  metadataUrls: undefined
}

export function buildTimelineCompositionInput(
  base: CompositionBaseProps,
  options: {
    playback: PlaybackSettings
    renderSettings?: Partial<RenderSettings>
    cropSettings?: CropSettings
    zoomSettings?: ZoomSettings
    resources?: VideoResources
  }
): TimelineCompositionProps {
  const renderSettings: RenderSettings = {
    ...DEFAULT_RENDER_SETTINGS,
    ...options.renderSettings,
    enhanceAudio:
      options.renderSettings?.enhanceAudio ??
      base.enhanceAudio ??
      DEFAULT_RENDER_SETTINGS.enhanceAudio
  }

  return {
    ...base,
    playback: options.playback,
    renderSettings,
    cropSettings: options.cropSettings ?? DEFAULT_CROP_SETTINGS,
    zoomSettings: options.zoomSettings ?? DEFAULT_ZOOM_SETTINGS,
    resources: {
      ...DEFAULT_RESOURCES,
      ...options.resources
    }
  } as TimelineCompositionProps
}
