import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { getRecordingsDirectory } from '../config'
import { normalizeCrossPlatform } from './path-normalizer'
import { isPathWithin, isPathWithinAny } from './path-validation'

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

// Helper to safely resolve symlinks (e.g., /var -> /private/var on macOS)
const safeRealpath = (p: string): string => {
  try {
    return fs.realpathSync(path.resolve(p))
  } catch {
    return path.resolve(p)
  }
}

export const resolveRecordingFilePath = (filePath: string, folderPath?: string): string | null => {
  if (!filePath) return null

  const recordingsDir = getRecordingsDirectory()
  const recordingsDirResolved = safeRealpath(recordingsDir)
  const allowedAbsRoots = [
    recordingsDirResolved,
    safeRealpath(app.getPath('userData')),
    safeRealpath(app.getPath('temp')),
    safeRealpath(app.getPath('downloads')),
  ]
  const normalizedFile = normalizeCrossPlatform(filePath)
  const candidates = new Set<string>()

  if (path.isAbsolute(normalizedFile)) {
    const abs = path.resolve(normalizedFile)
    // Security: only allow absolute paths within app-managed directories.
    if (isPathWithinAny(abs, allowedAbsRoots)) {
      candidates.add(abs)
    }
  }

  if (folderPath) {
    const normalizedFolder = normalizeCrossPlatform(folderPath)
    const resolvedFolder = path.isAbsolute(normalizedFolder)
      ? path.resolve(normalizedFolder)
      : path.resolve(recordingsDir, normalizedFolder)
    if (!isPathWithin(resolvedFolder, recordingsDirResolved)) {
      return null
    }
    const fileName = path.basename(normalizedFile)

    // File path may already include a subfolder (e.g., recording-123/recording-123.mov)
    candidates.add(path.join(resolvedFolder, normalizedFile))
    candidates.add(path.join(resolvedFolder, fileName))
  }

  candidates.add(path.join(recordingsDirResolved, normalizedFile))
  candidates.add(path.join(recordingsDirResolved, path.basename(normalizedFile)))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  // Fallback: search within immediate subfolders under recordingsDir.
  if (!path.isAbsolute(normalizedFile)) {
    try {
      const entries = fs.readdirSync(recordingsDirResolved, { withFileTypes: true })
      const parentDirs = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)

      for (const parentDir of parentDirs) {
        const parentRoot = path.join(recordingsDirResolved, parentDir)
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
