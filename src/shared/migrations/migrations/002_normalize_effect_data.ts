/**
 * Migration 002: Normalize missing effect fields (background defaults, crop clipId, enabled flag)
 */

import type { Migration } from '../index'
import type { BackgroundEffectData, Effect, Project } from '@/types/project'
import { EffectType } from '@/types/project'
import { DEFAULT_BACKGROUND_DATA } from '@/features/background/config'

function mergeBackgroundData(data?: BackgroundEffectData): BackgroundEffectData {
  const base = DEFAULT_BACKGROUND_DATA
  const merged: BackgroundEffectData = {
    ...base,
    ...(data ?? {})
  }

  if (data?.gradient) {
    merged.gradient = {
      ...base.gradient,
      ...data.gradient,
      colors: data.gradient.colors ?? base.gradient?.colors ?? []
    }
  }

  if (data && data.parallaxLayers === undefined) {
    merged.parallaxLayers = base.parallaxLayers
  }

  if (data && data.parallaxIntensity === undefined) {
    merged.parallaxIntensity = base.parallaxIntensity
  }

  return merged
}

function parseCropClipId(effectId: string): string | undefined {
  if (!effectId.startsWith('crop-')) return undefined
  const lastDash = effectId.lastIndexOf('-')
  if (lastDash <= 5) return undefined
  return effectId.substring(5, lastDash)
}

function normalizeEffect(effect: Effect): Effect {
  let updated: Effect = { ...effect }

  if (updated.enabled == null) {
    updated = { ...updated, enabled: true }
  }

  if (updated.type === EffectType.Background) {
    const data = updated.data as BackgroundEffectData | undefined
    updated = {
      ...updated,
      data: mergeBackgroundData(data)
    }
  }

  if (updated.type === EffectType.Crop && !updated.clipId) {
    const clipId = parseCropClipId(updated.id)
    if (clipId) {
      updated = { ...updated, clipId }
    }
  }

  return updated
}

export const migration002: Migration = {
  version: 2,
  name: 'normalize_effect_data',
  description: 'Fill missing effect defaults (background data, crop clipId, enabled flag)',

  migrate: (project: Project): Project => {
    const newProject: Project = JSON.parse(JSON.stringify(project))

    if (!newProject.timeline.effects) {
      newProject.timeline.effects = []
    }

    newProject.timeline.effects = newProject.timeline.effects.map(normalizeEffect)

    if (newProject.recordings) {
      newProject.recordings = newProject.recordings.map(recording => {
        if (!recording.effects || recording.effects.length === 0) {
          return recording
        }
        return {
          ...recording,
          effects: recording.effects.map(normalizeEffect)
        }
      })
    }

    return newProject
  }
}
