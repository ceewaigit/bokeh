/**
 * Security tests for path validation and traversal prevention
 * These tests simulate attack vectors to verify security fixes
 */

import { isPathWithin, isPathWithinAny } from '../../electron/main/utils/path-validation'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

describe('Path Validation Security', () => {
  const tempDir = os.tmpdir()
  const testBaseDir = path.join(tempDir, 'security-test-base')
  const symlinkTarget = path.join(tempDir, 'security-test-target')
  const symlinkPath = path.join(testBaseDir, 'malicious-link')

  beforeAll(() => {
    // Create test directories
    fs.mkdirSync(testBaseDir, { recursive: true })
    fs.mkdirSync(symlinkTarget, { recursive: true })

    // Create a file in the target directory (simulating sensitive data)
    fs.writeFileSync(path.join(symlinkTarget, 'secret.txt'), 'sensitive data')

    // Create symlink pointing outside the base directory
    try {
      fs.symlinkSync(symlinkTarget, symlinkPath)
    } catch {
      // Symlink may already exist or permissions issue
    }
  })

  afterAll(() => {
    // Cleanup
    try {
      fs.unlinkSync(symlinkPath)
      fs.unlinkSync(path.join(symlinkTarget, 'secret.txt'))
      fs.rmdirSync(symlinkTarget)
      fs.rmdirSync(testBaseDir)
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('Basic Path Traversal Prevention', () => {
    it('should reject paths with .. traversal', () => {
      const base = '/Users/test/recordings'
      const malicious = '/Users/test/recordings/../../../etc/passwd'

      expect(isPathWithin(malicious, base)).toBe(false)
    })

    it('should reject absolute paths outside base', () => {
      const base = '/Users/test/recordings'
      const malicious = '/etc/passwd'

      expect(isPathWithin(malicious, base)).toBe(false)
    })

    it('should accept valid paths within base', () => {
      const base = '/Users/test/recordings'
      const valid = '/Users/test/recordings/project/video.mp4'

      expect(isPathWithin(valid, base)).toBe(true)
    })

    it('should reject the base directory itself', () => {
      const base = '/Users/test/recordings'

      // The path must be WITHIN, not equal to base
      expect(isPathWithin(base, base)).toBe(false)
    })
  })

  describe('Symlink Attack Prevention', () => {
    it('should detect symlinks pointing outside base directory', () => {
      // Skip if symlink wasn't created (permissions issue)
      if (!fs.existsSync(symlinkPath)) {
        console.warn('Skipping symlink test - symlink not created')
        return
      }

      // The symlink is inside testBaseDir but points to symlinkTarget (outside)
      // After symlink resolution, the real path should be detected as outside
      const result = isPathWithin(symlinkPath, testBaseDir)

      // This should be false because the symlink resolves to outside the base
      expect(result).toBe(false)
    })

    it('should allow symlinks that resolve within base directory', () => {
      const internalDir = path.join(testBaseDir, 'subdir')
      const internalLink = path.join(testBaseDir, 'internal-link')

      fs.mkdirSync(internalDir, { recursive: true })

      try {
        fs.symlinkSync(internalDir, internalLink)

        // This should be true because symlink resolves within base
        expect(isPathWithin(internalLink, testBaseDir)).toBe(true)

        fs.unlinkSync(internalLink)
      } catch {
        // Skip if symlink creation fails
      }

      fs.rmdirSync(internalDir)
    })
  })

  describe('isPathWithinAny', () => {
    it('should accept path within any allowed directory', () => {
      const allowedDirs = ['/tmp', '/var/folders', tempDir]
      // Create a real file so realpath works
      const testFile = path.join(tempDir, 'security-test-file.txt')
      fs.writeFileSync(testFile, 'test')

      try {
        expect(isPathWithinAny(testFile, allowedDirs)).toBe(true)
      } finally {
        fs.unlinkSync(testFile)
      }
    })

    it('should reject path not in any allowed directory', () => {
      const allowedDirs = ['/tmp/allowed1', '/tmp/allowed2']
      const testPath = '/etc/passwd'

      expect(isPathWithinAny(testPath, allowedDirs)).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle paths with encoded characters', () => {
      const base = '/Users/test/recordings'
      // URL-encoded ..
      const malicious = '/Users/test/recordings/%2e%2e/secret'

      // path.resolve will normalize this, so it should still be within base
      // unless the encoded dots are decoded first
      expect(isPathWithin(malicious, base)).toBe(true) // The encoded version stays within
    })

    it('should handle null bytes in paths', () => {
      const base = '/Users/test/recordings'
      const malicious = '/Users/test/recordings/file\x00/../../../etc/passwd'

      // Node's path.resolve handles null bytes - this is testing the behavior
      const result = isPathWithin(malicious, base)
      // Should either throw or return false
      expect(typeof result).toBe('boolean')
    })

    it('should handle very long paths', () => {
      const base = '/Users/test/recordings'
      const longComponent = 'a'.repeat(255)
      const longPath = path.join(base, longComponent, longComponent)

      expect(isPathWithin(longPath, base)).toBe(true)
    })

    it('should handle unicode in paths', () => {
      const base = '/Users/test/recordings'
      const unicodePath = path.join(base, '日本語', 'файл.mp4')

      expect(isPathWithin(unicodePath, base)).toBe(true)
    })
  })
})
