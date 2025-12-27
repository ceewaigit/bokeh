import type { Project } from '@/types/project'
import type { StoreSettings } from '@/stores/slices/types'
import { normalizeProjectSettings } from './normalize-project-settings'

export function applyStoreSettingsToProject(project: Project, storeSettings: StoreSettings): Project {
  const normalized = normalizeProjectSettings(project.settings)

  const mergedSettings = {
    ...normalized,
    resolution: storeSettings.resolution,
    frameRate: storeSettings.framerate,
    audio: {
      ...normalized.audio,
      ...storeSettings.audio
    },
    camera: {
      ...normalized.camera,
      ...storeSettings.camera
    }
  }

  return {
    ...project,
    settings: mergedSettings
  }
}
