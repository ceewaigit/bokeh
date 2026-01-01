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

  // Crop Editing State
  isEditingCrop: false,
  editingCropId: null,

  // Overlay Editing State
  isEditingOverlay: false,
  editingOverlayId: null,

  // Inline Text Editing State (contentEditable for annotations)
  inlineEditingId: null,

  // Note: transientEffectState has been moved to isolated AnnotationEditContext
  // to prevent video re-renders during annotation drag/resize operations

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
      // Deep clone to avoid frozen object issues when pasting.
      const clone = typeof structuredClone === 'function'
        ? structuredClone(clip)
        : JSON.parse(JSON.stringify(clip))
      state.clipboard = { clip: clone }
    })
  },

  copyEffect: (type, data, sourceClipId, timing) => {
    set((state) => {
      // Deep clone to avoid frozen object issues when pasting.
      const clone = typeof structuredClone === 'function'
        ? structuredClone(data)
        : JSON.parse(JSON.stringify(data))
      state.clipboard = {
        effect: {
          type,
          data: clone,
          sourceClipId,
          startTime: timing?.startTime,
          endTime: timing?.endTime
        }
      }
    })
  },

  clearClipboard: () => {
    set((state) => {
      state.clipboard = {}
    })
  },

  // Crop Editing Actions
  startEditingCrop: (effectId) => {
    set((state) => {
      state.isEditingCrop = true
      state.editingCropId = effectId
    })
  },

  stopEditingCrop: () => {
    set((state) => {
      state.isEditingCrop = false
      state.editingCropId = null
    })
  },

  // Overlay Editing Actions
  startEditingOverlay: (effectId) => {
    set((state) => {
      state.isEditingOverlay = true
      state.editingOverlayId = effectId
    })
  },

  stopEditingOverlay: () => {
    set((state) => {
      state.isEditingOverlay = false
      state.editingOverlayId = null
    })
  },

  // Note: setTransientEffectState removed - now in AnnotationEditContext

  startInlineEditing: (effectId) => {
    set((state) => {
      state.inlineEditingId = effectId
    })
  },

  stopInlineEditing: () => {
    set((state) => {
      state.inlineEditingId = null
    })
  }
})
