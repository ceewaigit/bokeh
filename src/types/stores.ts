/**
 * Store interface types - centralized to avoid circular dependencies
 */

import type {
  Project,
  Clip,
  Effect
} from './project'
import type { SelectedEffectLayer } from '@/features/effects/types'
import { EffectType } from '@/features/effects/types'

// Clipboard effect type with proper union typing for data
export interface ClipboardEffect {
  type: EffectType
  data: Effect['data']
  sourceClipId: string
  startTime?: number
  endTime?: number
  clipId?: string // Source clip ID for clip-bound effects (e.g., webcam)
}

// ProjectStore interface extracted from CommandContext to avoid circular dependency
export interface ProjectStore {
  currentProject: Project | null
  currentTime: number
  selectedClips: string[]
  selectedEffectLayer: SelectedEffectLayer
  clipboard: {
    clip?: Clip
    effect?: ClipboardEffect
  }

  // Store methods used by commands
  addClip: (clip: Clip | string, startTime?: number) => void
  removeClip: (clipId: string) => void
  updateClip: (clipId: string, updates: Partial<Clip>, options?: { exact?: boolean; maintainContiguous?: boolean }) => void
  // New restore API to reinsert a clip at a specific track/index
  restoreClip: (trackId: string, clip: Clip, index: number) => void
  selectClip: (clipId: string | null, multi?: boolean) => void
  // NOTE: splitClip, trimClipStart, trimClipEnd, duplicateClip, reorderClip removed.
  // Use commands (SplitClipCommand, TrimCommand, DuplicateClipCommand, ReorderClipCommand) for undo/redo support.
  copyClip: (clip: Clip) => void
  copyEffect: (
    type: EffectType,
    data: Effect['data'],
    sourceClipId: string,
    timing?: { startTime?: number; endTime?: number }
  ) => void
  clearClipboard: () => void

  // Effects Management (timeline-global)
  addEffect: (effect: Effect) => void
  removeEffect: (effectId: string) => void
  updateEffect: (effectId: string, updates: Partial<Effect>) => void
  getEffectsAtTimeRange: (clipId: string) => Effect[]
  regenerateAllEffects: () => void  // Regenerate zoom, screen, and keystroke effects from recording data

  // Speed-Up (supports typing, idle, etc.)
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

  settings: {
    showTypingSuggestions: boolean
    audio: {
      volume: number
      muted: boolean
      fadeInDuration: number
      fadeOutDuration: number
    }
    editing: {
      snapToGrid: boolean
      showWaveforms: boolean
      autoRipple: boolean
    }
    playback: {
      previewSpeed: number
    }
  }

  // Atomic undo for speed-up - removes affected clips and restores originals in ONE update
  restoreClipsFromUndo: (trackId: string, clipIdsToRemove: string[], clipsToRestore: Clip[]) => void
}
