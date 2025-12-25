/**
 * Selection Slice
 *
 * Manages selection state and clipboard operations.
 * - Clip selection (single and multi-select)
 * - Effect layer selection
 * - Clipboard (copy clip/effect)
 */

import type { CreateSelectionSlice } from './types'

export const createSelectionSlice: CreateSelectionSlice = (set) => ({
  // State
  selectedClips: [],
  selectedEffectLayer: null,
  clipboard: {},

  // Actions
  selectClip: (clipId, multi = false) => {
    set((state) => {
      if (!clipId) {
        state.selectedClips = []
        state.selectedEffectLayer = null  // Clear effect selection when clearing clip
        return
      }

      if (multi) {
        const index = state.selectedClips.indexOf(clipId)
        if (index !== -1) {
          state.selectedClips.splice(index, 1)
        } else {
          state.selectedClips.push(clipId)
        }
      } else {
        state.selectedClips = [clipId]
        state.selectedEffectLayer = null  // Clear effect selection when selecting new clip
      }
    })
  },

  selectEffectLayer: (type, id) => {
    set((state) => {
      state.selectedClips = []
      state.selectedEffectLayer = { type, id }
    })
  },

  clearEffectSelection: () => {
    set((state) => {
      state.selectedEffectLayer = null
    })
  },

  clearSelection: () => {
    set((state) => {
      state.selectedClips = []
      state.selectedEffectLayer = null
    })
  },

  copyClip: (clip) => {
    set((state) => {
      state.clipboard = { clip }
    })
  },

  copyEffect: (type, data, sourceClipId) => {
    set((state) => {
      state.clipboard = { effect: { type, data, sourceClipId } }
    })
  },

  clearClipboard: () => {
    set((state) => {
      state.clipboard = {}
    })
  }
})
