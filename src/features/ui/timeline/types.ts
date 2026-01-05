// Enum for timeline track types (Video vs Audio vs Layout-only tracks)
export enum TrackType {
  Video = 'video',
  Audio = 'audio',
  Webcam = 'webcam',
  Annotation = 'annotation'
}

// Timeline display track types (includes effect lanes in the UI)
export enum TimelineTrackType {
  Video = 'video',
  Audio = 'audio',
  Webcam = 'webcam',
  Zoom = 'zoom',
  Screen = 'screen',
  Keystroke = 'keystroke',
  Plugin = 'plugin',
  Annotation = 'annotation'
}

export enum TimelineItemType {
  Clip = 'clip',
  Effect = 'effect',
  Recording = 'recording',
  Transition = 'transition'
}

export enum TransitionType {
  Fade = 'fade',
  Dissolve = 'dissolve',
  Wipe = 'wipe',
  Slide = 'slide'
}

// Track group for collapsible sections
export interface TrackGroup {
  id: string
  name: string
  collapsed: boolean
  trackTypes: TimelineTrackType[]
}

export interface Transition {
  type: TransitionType
  duration: number
  easing: string
}
