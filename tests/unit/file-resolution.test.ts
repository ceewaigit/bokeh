/**
 * @jest-environment node
 */
import * as fs from 'fs'

// Mock electron before importing file-resolution
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name: string) => {
      switch (name) {
        case 'userData': return '/mock/userData'
        case 'temp': return '/mock/temp'
        default: return `/mock/${name}`
      }
    })
  }
}))

import { resolveRecordingFilePath, guessMimeType } from '../../electron/main/utils/file-resolution'

// Mock dependencies
jest.mock('fs')
jest.mock('../../electron/main/config', () => ({
  getRecordingsDirectory: jest.fn(() => '/mock/recordings')
}))
jest.mock('../../electron/main/utils/path-normalizer', () => ({
  normalizeCrossPlatform: jest.fn((p) => p)
}))
// Mock path-validation to avoid realpath calls in tests
jest.mock('../../electron/main/utils/path-validation', () => ({
  isPathWithin: jest.fn((candidate: string, base: string) => {
    // Simple string-based check for test purposes
    const path = require('path')
    const rel = path.relative(base, candidate)
    return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel)
  }),
  isPathWithinAny: jest.fn((candidate: string, bases: string[]) => {
    // Check if candidate is within any of the base directories
    const path = require('path')
    return bases.some((base: string) => {
      const rel = path.relative(base, candidate)
      return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel)
    })
  })
}))

describe('File Resolution Utils', () => {
  describe('guessMimeType', () => {
    it('identifies common video formats', () => {
      expect(guessMimeType('video.mp4')).toBe('video/mp4')
      expect(guessMimeType('video.webm')).toBe('video/webm')
      expect(guessMimeType('video.mov')).toBe('video/quicktime')
    })

    it('returns default for unknown types', () => {
      expect(guessMimeType('unknown.xyz')).toBe('application/octet-stream')
    })
  })

  describe('resolveRecordingFilePath', () => {
    beforeEach(() => {
      jest.clearAllMocks()
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      // Mock realpathSync to return the path as-is (no symlink resolution in tests)
      ;(fs.realpathSync as unknown as jest.Mock).mockImplementation((p: string) => p)
    })

    it('resolves absolute path within recordings directory if it exists', () => {
      // Security: only absolute paths within recordings directory are allowed
      const absPath = '/mock/recordings/project/video.mp4'
      ;(fs.existsSync as jest.Mock).mockImplementation((p) => p === absPath)

      const result = resolveRecordingFilePath(absPath)
      expect(result).toBe(absPath)
    })

    it('rejects absolute path outside recordings directory', () => {
      // Security: paths outside recordings directory are rejected
      const absPath = '/abs/path/video.mp4'
      ;(fs.existsSync as jest.Mock).mockImplementation((p) => p === absPath)

      const result = resolveRecordingFilePath(absPath)
      expect(result).toBeNull()
    })

    it('resolves relative path in recordings directory', () => {
      const relPath = 'video.mp4'
      const expected = '/mock/recordings/video.mp4'
      ;(fs.existsSync as jest.Mock).mockImplementation((p) => p === expected)

      const result = resolveRecordingFilePath(relPath)
      expect(result).toBe(expected)
    })

    it('returns null if file not found', () => {
      const result = resolveRecordingFilePath('nonexistent.mp4')
      expect(result).toBeNull()
    })
  })
})
