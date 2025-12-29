/**
 * @jest-environment node
 */
import * as path from 'path'
import * as fs from 'fs'
import { resolveRecordingFilePath, guessMimeType } from '../../electron/main/utils/file-resolution'

// Mock dependencies
jest.mock('fs')
jest.mock('../../electron/main/config', () => ({
  getRecordingsDirectory: jest.fn(() => '/mock/recordings')
}))
jest.mock('../../electron/main/utils/path-normalizer', () => ({
  normalizeCrossPlatform: jest.fn((p) => p)
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
    })

    it('resolves absolute path if it exists', () => {
      const absPath = '/abs/path/video.mp4'
      ;(fs.existsSync as jest.Mock).mockImplementation((p) => p === absPath)
      
      const result = resolveRecordingFilePath(absPath)
      expect(result).toBe(absPath)
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
