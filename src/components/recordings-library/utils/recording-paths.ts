import { PROJECT_EXTENSION, PROJECT_PACKAGE_FILE } from '@/lib/storage/recording-storage'

export const isValidRecordingId = (id: string | undefined): boolean => {
  if (!id || typeof id !== 'string') return false
  return /^recording-\d+$/.test(id) || (/^[a-zA-Z0-9_-]+$/.test(id) && !id.includes('='))
}

export const isValidFilePath = (path: string | undefined): boolean => {
  if (!path || typeof path !== 'string') return false
  if (path.includes('=')) return false
  if (path.length < 5) return false
  const basename = path.split('/').pop() || path
  return basename.includes('.') || path.startsWith('/')
}

export const getProjectFilePath = async (projectPath: string, fileExists?: (path: string) => Promise<boolean>): Promise<string> => {
  if (!projectPath.endsWith(PROJECT_EXTENSION) || !fileExists) return projectPath
  const packageFilePath = `${projectPath}/${PROJECT_PACKAGE_FILE}`
  return (await fileExists(packageFilePath)) ? packageFilePath : projectPath
}

export const getProjectDir = (projectPath: string, projectFilePath?: string): string => {
  if (projectFilePath && projectFilePath.endsWith(`/${PROJECT_PACKAGE_FILE}`)) {
    return projectPath
  }
  const idx = projectPath.lastIndexOf('/')
  return idx >= 0 ? projectPath.substring(0, idx) : ''
}

export const resolveRecordingMediaPath = async (options: {
  projectDir: string
  filePath: string
  recordingId?: string
  fileExists?: (path: string) => Promise<boolean>
}): Promise<string | null> => {
  const { projectDir, filePath, recordingId, fileExists } = options
  if (!isValidFilePath(filePath)) return null
  if (!fileExists) {
    const basename = filePath.split('/').pop() || filePath
    return projectDir ? `${projectDir}/${basename}` : filePath
  }

  if (filePath.startsWith('/')) {
    const exists = await fileExists(filePath)
    if (exists) return filePath
  }

  const basename = filePath.split('/').pop() || filePath
  const flatPath = `${projectDir}/${basename}`
  if (await fileExists(flatPath)) return flatPath

  if (recordingId && isValidRecordingId(recordingId)) {
    const nestedPath = `${projectDir}/${recordingId}/${basename}`
    if (await fileExists(nestedPath)) return nestedPath
  }

  const parentDir = projectDir.slice(0, projectDir.lastIndexOf('/'))
  if (parentDir && parentDir !== projectDir) {
    const parentFlatPath = `${parentDir}/${basename}`
    if (await fileExists(parentFlatPath)) return parentFlatPath
    if (recordingId && isValidRecordingId(recordingId)) {
      const parentNestedPath = `${parentDir}/${recordingId}/${basename}`
      if (await fileExists(parentNestedPath)) return parentNestedPath
    }
    const parentRelativePath = `${parentDir}/${filePath}`
    if (await fileExists(parentRelativePath)) return parentRelativePath
  }

  return flatPath
}
