export const PROJECT_EXTENSION = '.bokeh'
// Regex for removing extensions from filenames
export const PROJECT_EXTENSION_REGEX = /\.bokeh$/
export const PROJECT_PACKAGE_FILE = 'project.json'

export const SUPPORTED_PROJECT_EXTENSIONS: string[] = ['bokeh']

export const buildProjectFilePath = (projectRoot: string): string =>
  `${projectRoot}/${PROJECT_PACKAGE_FILE}`

/**
 * Given a user-selected project path, return the canonical "project root" folder.
 * - New format: `/path/to/project-xxx.bokeh/project.json` => `/path/to/project-xxx.bokeh`
 * - Old format: `/path/to/project-xxx.bokeh` => `/path/to`
 * - New format selected folder: `/path/to/project-xxx.bokeh` (folder) => `/path/to/project-xxx.bokeh`
 */
export const resolveProjectRoot = async (
  projectPath: string,
  fileExists?: (path: string) => Promise<boolean>
): Promise<string> => {
  if (!projectPath) return ''
  if (projectPath.endsWith(`/${PROJECT_PACKAGE_FILE}`)) {
    return projectPath.slice(0, -(`/${PROJECT_PACKAGE_FILE}`).length)
  }
  if (projectPath.endsWith(PROJECT_EXTENSION) && fileExists) {
    const packageFilePath = buildProjectFilePath(projectPath)
    if (await fileExists(packageFilePath)) {
      return projectPath
    }
  }
  const idx = projectPath.lastIndexOf('/')
  return idx >= 0 ? projectPath.substring(0, idx) : projectPath
}
