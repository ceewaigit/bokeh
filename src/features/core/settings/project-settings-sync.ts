import type { Project } from '@/types/project'
import type { StoreSettings } from '@/features/core/stores/slices/types'

export function applyStoreSettingsToProject(project: Project, storeSettings: StoreSettings): Project {
  void storeSettings
  return project
}
