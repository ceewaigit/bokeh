import { PROJECT_EXTENSION, PROJECT_PACKAGE_FILE } from '@/features/core/storage/recording-storage'
import type { Recording } from '@/types/project'

/**
 * Resolves the absolute file path for a recording.
 * Handles cases where recording has a separate folderPath and relative filePath,
 * or just an absolute filePath.
 */
export function resolveRecordingPath(recording: Recording | null | undefined): string | null {
  if (!recording?.filePath) return null

  // If filePath is absolute (starts with /) or a data URI, invoke no special logic
  if (recording.filePath.startsWith('/') || recording.filePath.startsWith('data:')) {
    return recording.filePath
  }

  // If we have a folderPath, join it with the basename of the filePath
  if (recording.folderPath) {
    const basename = recording.filePath.split('/').pop() || recording.filePath
    // Ensure folderPath doesn't have a trailing slash before joining
    return `${recording.folderPath.replace(/\/$/, '')}/${basename}`
  }

  // Fallback: return filePath as is (might be relative, might work if CWD is correct or logic elsewhere handles it)
  return recording.filePath
}

/**
 * Creates a video-stream:// URL for a given local file path.
 * This protocol is handled by the Electron main process to serve video files safely.
 */
export function createVideoStreamUrl(path: string | undefined | null): string | undefined {
  if (!path) return undefined

  // Pass through data URIs as is
  if (path.startsWith('data:')) return path

  // Pass through existing video-stream URLs
  if (path.startsWith('video-stream://')) return path

  // Handle local paths
  if (path.startsWith('/')) {
    return `video-stream://local/${encodeURIComponent(path)}`
  }

  // Determine what to do with relative paths or other protocols
  // For now, if it's not absolute and not data/video-stream, wrap it anyway assuming it's a relative path that might need resolution
  // But typically we expect absolute paths here.
  return `video-stream://local/${encodeURIComponent(path)}`
}

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
