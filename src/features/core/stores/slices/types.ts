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
  MouseEvent as ProjectMouseEvent,
  QualityLevel,
  ExportFormat
} from '@/types/project'
import type { EffectType, TrackType } from '@/types/project'
import type { SelectedEffectLayer, EffectLayerType } from '@/features/effects/types'
import type { CameraPathFrame } from '@/features/rendering/renderer/types'
import type { FrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout'
import type { EffectGenerationConfig } from '@/features/effects/logic/effect-detector'
import type { Patch } from 'immer'
import type { WritableDraft } from 'immer'

// Re-export ClipboardEffect from stores.ts for backward compatibility
import type { ClipboardEffect } from '@/types/stores'
export type { ClipboardEffect }

// =============================================================================
// Settings Type (used by Core Slice)
// =============================================================================

/**
 * StoreSettings - App-level preferences (persisted separately from projects)
 *
 * NOTE: Camera settings are NOT here - they live on project.settings.camera
 * This is intentional: camera settings are project-specific and should be
 * saved/loaded with each project file.
 */
export interface StoreSettings {
  quality: QualityLevel
  format: ExportFormat

  showTypingSuggestions: boolean
  editing: {
    snapToGrid: boolean
    showWaveforms: boolean
    autoRipple: boolean
  }
  playback: {
    previewSpeed: number
  }
  recording: {
    lowMemoryEncoder: boolean
    useMacOSDefaults: boolean
    includeAppWindows: boolean
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
    clipTrackType?: EffectType | TrackType // Allow storing track type
    effect?: ClipboardEffect
  }
  // Crop Editing State
  isEditingCrop: boolean
  editingCropId: string | null
  // Overlay Editing State (for positioned elements like plugins, annotations, webcam)
  isEditingOverlay: boolean
  editingOverlayId: string | null
  // Inline Text Editing State (for contentEditable annotations)
  // Distinct from overlay editing - triggered by double-click
  inlineEditingId: string | null

  // Note: transientEffectState has been moved to isolated AnnotationEditContext
  // to prevent video re-renders during annotation drag/resize operations
}

export interface PlaybackSliceState {
  currentTime: number
  isPlaying: boolean
  isScrubbing: boolean
  hoverTime: number | null
  zoom: number
  zoomManuallyAdjusted: boolean
}

export interface TimelineSliceState {
  _placeholder?: never
  // NOTE: _pendingClipChange removed - sync now happens inline within TimelineCommand.mutate()
}

export interface CacheSliceState {
  cameraPathCache: (CameraPathFrame & { path?: CameraPathFrame[] })[] | null
  /**
   * Dimensions used when computing `cameraPathCache`.
   * Needed to scale cached pixel translations when preview composition is downscaled.
   */
  cameraPathCacheDimensions: { width: number; height: number } | null
  frameLayoutCache: FrameLayoutItem[] | null
  /**
   * Counter incremented on STRUCTURAL timeline changes (clips added/removed/reordered).
   * Used by PreviewAreaRemotion to force player remount when clip IDs change.
   *
   * IMPORTANT: This counter is NOT incremented for property-only changes like:
   * - Clip layout updates (crop, styling, position)
   * - Clip timing updates (trim, duration) on existing clips
   * - Effect property changes
   *
   * The cache invalidation middleware in project-store.ts uses isTrackStructureSame()
   * to distinguish structural changes from property changes.
   */
  timelineMutationCounter: number
  previewReady: boolean
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
  cleanupProject: () => void
  /**
   * Execute a state modification transaction and return Immer patches.
   * Used by PatchedCommand for efficient undo/redo.
   */
  transaction: (recipe: (draft: WritableDraft<ProjectStore>) => void) => { patches: Patch[]; inversePatches: Patch[] }
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
  }) => { clip: Clip; recording: Recording } | null
  addCursorReturnClip: (options?: { sourceClipId?: string; durationMs?: number }) => Promise<void>
  resizeGeneratedClip: (clipId: string, durationMs: number) => void
  removeClip: (clipId: string) => void
  updateClip: (clipId: string, updates: Partial<Clip>, options?: { exact?: boolean; maintainContiguous?: boolean }) => void
  restoreClip: (trackId: string, clip: Clip, index: number) => void
  // NOTE: splitClip, trimClipStart, trimClipEnd, duplicateClip, reorderClip removed.
  // Use corresponding commands (SplitClipCommand, TrimCommand, DuplicateClipCommand, ReorderClipCommand) instead.
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
  // Clear detection periods from recordings (for speed-up bar removal after applying)
  clearDetectionPeriods: (recordingIds?: string[]) => void
  // Restore detection periods (for undo of speed-up apply)
  restoreDetectionPeriods: (periods: Map<string, { detectedTypingPeriods?: any[]; detectedIdlePeriods?: any[] }>) => void
}

export interface SelectionSliceActions {
  selectClip: (clipId: string | null, multi?: boolean) => void
  selectEffectLayer: (type: EffectLayerType, id?: string) => void
  clearEffectSelection: () => void
  clearSelection: () => void
  copyClip: (clip: Clip, trackType?: EffectType | TrackType) => void
  copyEffect: (
    type: EffectType,
    data: Effect['data'],
    sourceClipId: string,
    timing?: { startTime?: number; endTime?: number }
  ) => void
  clearClipboard: () => void

  // Crop Editing Actions
  startEditingCrop: (effectId: string) => void
  stopEditingCrop: () => void

  // Overlay Editing Actions (for positioned elements like plugins, annotations, webcam)
  startEditingOverlay: (effectId: string) => void
  stopEditingOverlay: () => void
  // Note: setTransientEffectState removed - now in AnnotationEditContext
  // Inline Text Editing Actions (for contentEditable annotations)
  startInlineEditing: (effectId: string) => void
  stopInlineEditing: () => void
}

export interface PlaybackSliceActions {
  play: () => void
  pause: () => void
  seek: (time: number) => void
  seekFromPlayer: (time: number) => void
  setScrubbing: (isScrubbing: boolean) => void
  setHoverTime: (time: number | null) => void
  setZoom: (zoom: number, isManual?: boolean) => void
  setAutoZoom: (zoom: number) => void
}

export interface EffectsSliceActions {
  addEffect: (effect: Effect) => void
  removeEffect: (effectId: string) => void
  updateEffect: (effectId: string, updates: Partial<Effect>) => void
  restoreEffect: (effect: Effect) => void
  getEffectsAtTimeRange: (clipId: string) => Effect[]
  regenerateAllEffects: (config?: EffectGenerationConfig) => Promise<{
    trimSuggestions: Array<{
      recordingId: string
      startSavedMs: number
      endSavedMs: number
      totalSavedMs: number
    }>
  }>
}

export interface TimelineSliceActions extends ClipSliceActions, EffectsSliceActions { }

export interface CacheSliceActions {
  setCameraPathCache: (
    cache: (CameraPathFrame & { path?: CameraPathFrame[] })[] | null,
    dimensions?: { width: number; height: number } | null
  ) => void
  setFrameLayoutCache: (cache: FrameLayoutItem[] | null) => void
  setPreviewReady: (ready: boolean) => void
  /**
   * Clears caches without incrementing timelineMutationCounter.
   * Use for property-only changes that don't require player remount.
   * Called automatically by middleware for non-structural track changes.
   */
  invalidateCachesOnly: () => void
  /**
   * Clears all caches AND increments timelineMutationCounter.
   * Use for structural track changes (clip add/remove/reorder) that require player remount.
   * Called automatically by middleware when clip IDs change.
   */
  invalidateAllCaches: () => void
  // NOTE: Proxy URL actions have been moved to src/features/proxy/store/proxy-store.ts
}

export interface SettingsSliceActions {
  setQuality: (quality: QualityLevel) => void
  setResolution: (width: number, height: number) => void
  setFramerate: (fps: number) => void
  setFormat: (format: ExportFormat) => void
  updateSettings: (updates: Partial<StoreSettings>) => void
  // Helpers for common updates
  setEditingSettings: (updates: Partial<StoreSettings['editing']>) => void
  setRecordingSettings: (updates: Partial<StoreSettings['recording']>) => void
  setAudioSettings: (updates: Partial<Project['settings']['audio']>) => void
  setCameraSettings: (updates: Partial<Project['settings']['camera']>) => void
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
  CacheSliceActions &
  SettingsSliceActions

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
export type SettingsSlice = SettingsSliceActions

// StateCreator function types
export type CreateCoreSlice = StateCreator<ProjectStore, ImmerMiddleware, [], CoreSlice>
export type CreateTimelineSlice = StateCreator<ProjectStore, ImmerMiddleware, [], TimelineSlice>
export type CreateSelectionSlice = StateCreator<ProjectStore, ImmerMiddleware, [], SelectionSlice>
export type CreatePlaybackSlice = StateCreator<ProjectStore, ImmerMiddleware, [], PlaybackSlice>
export type CreateCacheSlice = StateCreator<ProjectStore, ImmerMiddleware, [], CacheSlice>
export type CreateSettingsSlice = StateCreator<ProjectStore, ImmerMiddleware, [], SettingsSlice>
