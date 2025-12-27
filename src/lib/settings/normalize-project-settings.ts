import type { ProjectSettings } from '@/types/project'
import { DEFAULT_PROJECT_SETTINGS } from './defaults'

export function normalizeProjectSettings(settings?: ProjectSettings): ProjectSettings {
  const normalizedAudio = settings?.audio
    ? { ...DEFAULT_PROJECT_SETTINGS.audio, ...settings.audio }
    : DEFAULT_PROJECT_SETTINGS.audio
  const normalizedCanvas = settings?.canvas
    ? { ...DEFAULT_PROJECT_SETTINGS.canvas, ...settings.canvas }
    : DEFAULT_PROJECT_SETTINGS.canvas

  const normalized: ProjectSettings = {
    ...DEFAULT_PROJECT_SETTINGS,
    ...settings,
    audio: {
      ...normalizedAudio
    },
    camera: {
      ...DEFAULT_PROJECT_SETTINGS.camera,
      ...settings?.camera
    },
    canvas: {
      ...normalizedCanvas
    }
  }

  return normalized
}
