/**
 * Store Slice Types
 *
 * Type definitions for the decomposed project store slices.
 * Uses Zustand's StateCreator pattern for proper typing with immer middleware.
 */

import type { StateCreator } from 'zustand'
import type {
  Clip,
  Effect,
  Project,
  Recording,
  ZoomEffectData,
  CursorEffectData,
  BackgroundEffectData,
  MouseEvent as ProjectMouseEvent
} from '@/types/project'
import type { EffectType } from '@/types/project'
import type { SelectedEffectLayer, EffectLayerType } from '@/types/effects'
import type { CameraPathFrame } from '@/types/remotion'
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout'
import type { EffectGenerationConfig } from '@/lib/effects/effect-generation-service'

// Re-export ClipboardEffect from stores.ts for backward compatibility
export type { ClipboardEffect } from '@/types/stores'
import type { ClipboardEffect } from '@/types/stores'

// =============================================================================
// Settings Type (used by Core Slice)
// =============================================================================

export interface StoreSettings {
  showTypingSuggestions: boolean
  audio: {
    volume: number
    muted: boolean
    fadeInDuration: number
    fadeOutDuration: number
    enhanceAudio: boolean
    enhancementPreset?: 'off' | 'subtle' | 'balanced' | 'broadcast' | 'custom'
    customEnhancement?: {
      threshold: number
      ratio: number
      attack: number
      release: number
      knee: number
    }
  }
  preview: {
    showRuleOfThirds: boolean
    showCenterGuides: boolean
    showSafeZones: boolean
    guideColor: string
    guideOpacity: number
    safeZoneMargin: number
  }
  editing: {
    snapToGrid: boolean
    showWaveforms: boolean
    autoRipple: boolean
  }
  playback: {
    previewSpeed: number
  }
  camera: {
    motionBlurEnabled: boolean
    motionBlurIntensity: number
    motionBlurThreshold: number
    refocusBlurEnabled: boolean
    refocusBlurIntensity: number
  }
}

// =============================================================================
// Slice State Interfaces
// =============================================================================

export interface CoreSliceState {
  currentProject: Project | null
  settings: StoreSettings
}

export interface SelectionSliceState {
  selectedClips: string[]
  selectedEffectLayer: SelectedEffectLayer
  clipboard: {
    clip?: Clip
    effect?: ClipboardEffect
  }
}

export interface PlaybackSliceState {
  currentTime: number
  isPlaying: boolean
  zoom: number
  zoomManuallyAdjusted: boolean
}

export interface TimelineSliceState {
  // Timeline state is currently derived or hosted in Core/Project,
  // but this slice exists for future expansion of view-specific state.
  _placeholder?: never
}

export interface CacheSliceState {
  cameraPathCache: (CameraPathFrame & { path?: CameraPathFrame[] })[] | null
  frameLayoutCache: FrameLayoutItem[] | null
}

// =============================================================================
// Slice Action Interfaces
// =============================================================================

export interface CoreSliceActions {
  newProject: (name: string) => void
  openProject: (projectPath: string) => Promise<void>
  saveCurrentProject: () => Promise<void>
  setProject: (project: Project) => void
  updateProjectData: (updater: (project: Project) => Project) => void
  addRecording: (recording: Recording, videoBlob: Blob) => Promise<void>
  updateSettings: (updates: Partial<StoreSettings>) => void
  cleanupProject: () => void
}

export interface ClipSliceActions {
  addClip: (clip: Clip | string, startTime?: number) => void
  addGeneratedClip: (options: {
    pluginId: string
    params?: Record<string, unknown>
    durationMs?: number
    startTime?: number
  }) => void
  addImageClip: (options: {
    imagePath: string
    width: number
    height: number
    durationMs?: number
    startTime?: number
    syntheticMouseEvents?: ProjectMouseEvent[]
    effects?: Effect[]
  }) => void
  addCursorReturnClip: (options?: { sourceClipId?: string; durationMs?: number }) => Promise<void>
  resizeGeneratedClip: (clipId: string, durationMs: number) => void
  removeClip: (clipId: string) => void
  updateClip: (clipId: string, updates: Partial<Clip>, options?: { exact?: boolean }) => void
  restoreClip: (trackId: string, clip: Clip, index: number) => void
  splitClip: (clipId: string, splitTime: number) => void
  trimClipStart: (clipId: string, newStartTime: number) => void
  trimClipEnd: (clipId: string, newEndTime: number) => void
  duplicateClip: (clipId: string) => string | null
  reorderClip: (clipId: string, newIndex: number) => void
  // Speed-up actions
  applyTypingSpeedToClip: (clipId: string, periods: Array<{
    startTime: number
    endTime: number
    suggestedSpeedMultiplier: number
  }>) => { affectedClips: string[]; originalClips: Clip[] }
  applySpeedUpToClip: (clipId: string, periods: Array<{
    type: 'typing' | 'idle'
    startTime: number
    endTime: number
    suggestedSpeedMultiplier: number
  }>, speedUpTypes: Array<'typing' | 'idle'>) => { affectedClips: string[]; originalClips: Clip[] }
  cacheTypingPeriods: (recordingId: string, periods: Array<{
    startTime: number
    endTime: number
    keyCount: number
    averageWpm: number
    suggestedSpeedMultiplier: number
  }>) => void
  cacheIdlePeriods: (recordingId: string, periods: Array<{
    startTime: number
    endTime: number
    suggestedSpeedMultiplier: number
    confidence: number
  }>) => void
  restoreClipsFromUndo: (trackId: string, clipIdsToRemove: string[], clipsToRestore: Clip[]) => void
}

export interface SelectionSliceActions {
  selectClip: (clipId: string | null, multi?: boolean) => void
  selectEffectLayer: (type: EffectLayerType, id?: string) => void
  clearEffectSelection: () => void
  clearSelection: () => void
  copyClip: (clip: Clip) => void
  copyEffect: (type: typeof EffectType.Zoom | typeof EffectType.Cursor | typeof EffectType.Background, data: ZoomEffectData | CursorEffectData | BackgroundEffectData, sourceClipId: string) => void
  clearClipboard: () => void
}

export interface PlaybackSliceActions {
  play: () => void
  pause: () => void
  seek: (time: number) => void
  setZoom: (zoom: number, isManual?: boolean) => void
  setAutoZoom: (zoom: number) => void
}

export interface EffectsSliceActions {
  addEffect: (effect: Effect) => void
  removeEffect: (effectId: string) => void
  updateEffect: (effectId: string, updates: Partial<Effect>) => void
  getEffectsAtTimeRange: (clipId: string) => Effect[]
  regenerateAllEffects: (config?: EffectGenerationConfig) => Promise<void>
}

export interface TimelineSliceActions extends ClipSliceActions, EffectsSliceActions { }

export interface CacheSliceActions {
  setCameraPathCache: (cache: (CameraPathFrame & { path?: CameraPathFrame[] })[] | null) => void
  setFrameLayoutCache: (cache: FrameLayoutItem[] | null) => void
  invalidateAllCaches: () => void
}

// =============================================================================
// Combined Store State Type (Full State)
// =============================================================================

export type ProjectStoreState =
  CoreSliceState &
  SelectionSliceState &
  PlaybackSliceState &
  TimelineSliceState &
  CacheSliceState

export type ProjectStoreActions =
  CoreSliceActions &
  TimelineSliceActions &
  SelectionSliceActions &
  PlaybackSliceActions &
  CacheSliceActions

export type ProjectStore = ProjectStoreState & ProjectStoreActions

// =============================================================================
// Zustand StateCreator Types for Slices
// =============================================================================

// Middleware signature for immer
type ImmerMiddleware = [['zustand/immer', never]]

// StateCreator types for each slice
export type CoreSlice = CoreSliceState & CoreSliceActions
export type TimelineSlice = TimelineSliceState & TimelineSliceActions
export type SelectionSlice = SelectionSliceState & SelectionSliceActions
export type PlaybackSlice = PlaybackSliceState & PlaybackSliceActions
export type CacheSlice = CacheSliceState & CacheSliceActions

// StateCreator function types
export type CreateCoreSlice = StateCreator<ProjectStore, ImmerMiddleware, [], CoreSlice>
export type CreateTimelineSlice = StateCreator<ProjectStore, ImmerMiddleware, [], TimelineSlice>
export type CreateSelectionSlice = StateCreator<ProjectStore, ImmerMiddleware, [], SelectionSlice>
export type CreatePlaybackSlice = StateCreator<ProjectStore, ImmerMiddleware, [], PlaybackSlice>
export type CreateCacheSlice = StateCreator<ProjectStore, ImmerMiddleware, [], CacheSlice>
