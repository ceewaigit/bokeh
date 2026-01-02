/**
 * Migration 004: Normalize project filePath for package layout
 */

import type { Migration } from '../index'
import type { Project } from '@/types/project'
import { PROJECT_PACKAGE_FILE } from '@/features/storage/recording-storage'

export const migration004: Migration = {
  version: 4,
  name: 'project_package_paths',
  description: 'Normalize project filePath for .bokeh package directories',

  migrate: (project: Project): Project => {
    const newProject: Project = JSON.parse(JSON.stringify(project))

    if (newProject.filePath && newProject.filePath.endsWith(`/${PROJECT_PACKAGE_FILE}`)) {
      newProject.filePath = newProject.filePath.slice(0, -(`/${PROJECT_PACKAGE_FILE}`).length)
    }

    return newProject
  }
}
