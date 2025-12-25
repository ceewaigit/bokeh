/**
 * Effects Slice
 *
 * Manages timeline effects and camera path cache.
 * - Add/remove/update effects
 * - Effect regeneration
 * - Camera path cache management
 */

import { EffectsFactory } from '@/lib/effects/effects-factory'
import type { CreateEffectsSlice } from './types'
import { invalidateCaches } from './utils'

export const createEffectsSlice: CreateEffectsSlice = (set, get) => ({
  // State
  cameraPathCache: null,

  // Actions
  addEffect: (effect) => {
    set((state) => {
      if (!state.currentProject) return

      if (!state.currentProject.timeline.effects) {
        state.currentProject.timeline.effects = []
      }
      state.currentProject.timeline.effects.push(effect)
      state.currentProject.modifiedAt = new Date().toISOString()

      // Invalidate cache
      invalidateCaches(state)

      // playhead state computed via hook
    })
  },

  removeEffect: (effectId) => {
    set((state) => {
      if (!state.currentProject?.timeline.effects) return

      const index = state.currentProject.timeline.effects.findIndex(e => e.id === effectId)
      if (index !== -1) {
        state.currentProject.timeline.effects.splice(index, 1)
        state.currentProject.modifiedAt = new Date().toISOString()

        // Invalidate cache
        invalidateCaches(state)
      }
      // playhead state computed via hook
    })
  },

  updateEffect: (effectId, updates) => {
    set((state) => {
      if (!state.currentProject?.timeline.effects) return

      const effect = state.currentProject.timeline.effects.find(e => e.id === effectId)
      if (effect) {
        Object.assign(effect, updates)
        state.currentProject.modifiedAt = new Date().toISOString()

        // Invalidate cache
        invalidateCaches(state)
      }

      // playhead state computed via hook
    })
  },

  // Gets all effects that overlap with a clip's time range
  // Note: Effects are timeline-global, not clip-owned
  getEffectsAtTimeRange: (clipId) => {
    const { currentProject } = get()
    if (!currentProject) return []
    return EffectsFactory.getEffectsForClip(currentProject, clipId)
  },

  // Regenerate all auto-detected effects (zoom, screen, keystroke) from recording data
  regenerateAllEffects: async (config) => {
    const projectSnapshot = get().currentProject
    if (!projectSnapshot) return

    const [{ EffectGenerationService }, { metadataLoader }] = await Promise.all([
      import('@/lib/effects/effect-generation-service'),
      import('@/lib/export/metadata-loader'),
    ])

    let metadataByRecordingId: Map<string, import('@/types/project').RecordingMetadata> | undefined
    try {
      metadataByRecordingId = await metadataLoader.loadAllMetadata(projectSnapshot.recordings || [])
    } catch (error) {
      console.warn('[EffectsSlice] Failed to load metadata for effect regeneration:', error)
    }

    set((state) => {
      if (state.currentProject) {
        EffectGenerationService.regenerateAllEffects(state.currentProject, config, metadataByRecordingId)
        // playhead state computed via hook

        // Invalidate cache
        invalidateCaches(state)
      }
    })
  },

  setCameraPathCache: (cache) => {
    set((state) => {
      state.cameraPathCache = cache
    })
  },

  invalidateCameraPathCache: () => {
    set((state) => {
      invalidateCaches(state)
    })
  }
})
