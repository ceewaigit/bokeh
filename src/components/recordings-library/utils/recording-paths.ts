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

export const getProjectDir = (projectPath: string): string => {
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

  return flatPath
}
