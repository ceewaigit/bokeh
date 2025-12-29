import * as path from 'path'
import * as fs from 'fs'
import { getRecordingsDirectory } from '../config'
import { normalizeCrossPlatform } from './path-normalizer'

export const guessMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.mp4': return 'video/mp4'
    case '.webm': return 'video/webm'
    case '.mov': return 'video/quicktime'
    case '.mkv': return 'video/x-matroska'
    case '.m4v': return 'video/x-m4v'
    case '.avi': return 'video/x-msvideo'
    case '.ogv': return 'video/ogg'
    default: return 'application/octet-stream'
  }
}

export const resolveRecordingFilePath = (filePath: string, folderPath?: string): string | null => {
  if (!filePath) return null

  const recordingsDir = getRecordingsDirectory()
  const normalizedFile = normalizeCrossPlatform(filePath)
  const candidates = new Set<string>()

  if (path.isAbsolute(normalizedFile)) {
    candidates.add(normalizedFile)
  }

  if (folderPath) {
    const normalizedFolder = normalizeCrossPlatform(folderPath)
    const resolvedFolder = path.isAbsolute(normalizedFolder)
      ? normalizedFolder
      : path.join(recordingsDir, normalizedFolder)
    const fileName = path.basename(normalizedFile)

    // File path may already include a subfolder (e.g., recording-123/recording-123.mov)
    candidates.add(path.join(resolvedFolder, normalizedFile))
    candidates.add(path.join(resolvedFolder, fileName))
  }

  candidates.add(path.join(recordingsDir, normalizedFile))
  candidates.add(path.join(recordingsDir, path.basename(normalizedFile)))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  // Fallback: search within immediate subfolders under recordingsDir.
  if (!path.isAbsolute(normalizedFile)) {
    try {
      const entries = fs.readdirSync(recordingsDir, { withFileTypes: true })
      const parentDirs = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)

      for (const parentDir of parentDirs) {
        const parentRoot = path.join(recordingsDir, parentDir)
        const nestedPath = path.join(parentRoot, normalizedFile)
        if (fs.existsSync(nestedPath)) {
          return nestedPath
        }

        if (folderPath) {
          const normalizedFolder = normalizeCrossPlatform(folderPath)
          const fileName = path.basename(normalizedFile)
          const folderCandidate = path.join(parentRoot, normalizedFolder, fileName)
          if (fs.existsSync(folderCandidate)) {
            return folderCandidate
          }
        }
      }
    } catch (error) {
      console.warn('[PathResolver] Failed to scan project directories:', error)
    }
  }

  return null
}
