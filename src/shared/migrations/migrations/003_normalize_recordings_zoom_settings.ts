/**
 * Migration 003: Normalize recording source types, zoom effect data, and settings defaults
 */

import type { Migration } from '../index'
import type { Effect, Project, Recording, ZoomEffectData } from '@/types/project'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import { normalizeProjectSettings } from '@/features/settings/normalize-project-settings'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif'])

type LegacyRecording = Partial<Recording> & { sourceType?: Recording['sourceType'] }

function inferRecordingSourceType(recording: LegacyRecording): Recording['sourceType'] {
  if (recording.sourceType) return recording.sourceType
  if ('generatedSource' in recording && recording.generatedSource) return 'generated'
  if ('imageSource' in recording && recording.imageSource) return 'image'
  const filePath = 'filePath' in recording ? recording.filePath : undefined
  if (filePath) {
    const lower = filePath.toLowerCase()
    for (const ext of IMAGE_EXTENSIONS) {
      if (lower.endsWith(ext)) return 'image'
    }
  }
  return 'video'
}

function normalizeRecording(recording: LegacyRecording): Recording {
  const updated: any = { ...recording }
  const sourceType = inferRecordingSourceType(updated as Recording)
  updated.sourceType = sourceType

  if (sourceType === 'generated') {
    updated.filePath = updated.filePath ?? ''
  }

  if (sourceType === 'image') {
    if (!updated.imageSource && updated.filePath) {
      updated.imageSource = { imagePath: updated.filePath }
    }
  }

  if (sourceType === 'video') {
    updated.filePath = updated.filePath ?? ''
  }

  return updated as Recording
}

function normalizeZoomEffect(effect: Effect): Effect {
  if (effect.type !== EffectType.Zoom) return effect

  const data = (effect.data ?? {}) as Partial<ZoomEffectData>
  const normalizedData: ZoomEffectData = {
    origin: data.origin ?? 'manual',
    scale: data.scale ?? 2,
    targetX: data.targetX,
    targetY: data.targetY,
    screenWidth: data.screenWidth,
    screenHeight: data.screenHeight,
    introMs: data.introMs ?? 300,
    outroMs: data.outroMs ?? 300,
    smoothing: data.smoothing ?? 50,
    followStrategy: data.followStrategy ?? ZoomFollowStrategy.Mouse,
    autoScale: data.autoScale,
    mouseIdlePx: data.mouseIdlePx
  }

  return {
    ...effect,
    data: normalizedData
  }
}

export const migration003: Migration = {
  version: 3,
  name: 'normalize_recordings_zoom_settings',
  description: 'Normalize recording source types, zoom effect data, and project settings defaults',

  migrate: (project: Project): Project => {
    const newProject: Project = JSON.parse(JSON.stringify(project))

    newProject.settings = normalizeProjectSettings(newProject.settings)

    newProject.recordings = (newProject.recordings ?? []).map((recording) => normalizeRecording(recording))

    if (newProject.timeline?.effects) {
      newProject.timeline.effects = newProject.timeline.effects.map(normalizeZoomEffect)
    }

    return newProject
  }
}
