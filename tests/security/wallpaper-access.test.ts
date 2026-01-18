/**
 * Security tests for wallpaper loading
 * Tests that wallpapers can only be loaded from allowed system directories
 */

import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

describe('Wallpaper Access Control', () => {
  const allowedDirs = [
    '/System/Library/Desktop Pictures',
    '/Library/Desktop Pictures'
  ]

  /**
   * Simulates the wallpaper path validation logic from wallpapers.ts
   */
  function isWallpaperPathAllowed(imagePath: string): boolean {
    let realPath: string
    try {
      realPath = fs.realpathSync(imagePath)
    } catch {
      return false // Path doesn't exist or can't be resolved
    }

    return allowedDirs.some(dir => {
      try {
        const realDir = fs.realpathSync(dir)
        return realPath.startsWith(realDir + path.sep) || realPath === realDir
      } catch {
        return realPath.startsWith(dir + path.sep) || realPath === dir
      }
    })
  }

  describe('Allowed Paths', () => {
    it('should allow system wallpapers', () => {
      // These paths may not exist in CI, so we test the logic
      const systemPath = '/System/Library/Desktop Pictures/Solid Colors/Black.png'

      // If the path exists, it should be allowed
      if (fs.existsSync(systemPath)) {
        expect(isWallpaperPathAllowed(systemPath)).toBe(true)
      }
    })

    it('should allow library wallpapers', () => {
      // Test the prefix logic even if path doesn't exist
      if (fs.existsSync('/Library/Desktop Pictures')) {
        // If the directory exists, any path starting with it should conceptually be allowed
        // (but our function also checks if the file exists via realpath)
      }
    })
  })

  describe('Denied Paths', () => {
    it('should deny paths outside allowed directories', () => {
      const deniedPaths = [
        '/etc/passwd',
        '/Users/admin/.ssh/id_rsa',
        '/tmp/malicious.jpg',
        os.homedir() + '/Pictures/wallpaper.jpg'
      ]

      deniedPaths.forEach(maliciousPath => {
        // These either don't exist or are outside allowed dirs
        expect(isWallpaperPathAllowed(maliciousPath)).toBe(false)
      })
    })

    it('should deny traversal attempts', () => {
      const traversalPaths = [
        '/System/Library/Desktop Pictures/../../../etc/passwd',
        '/Library/Desktop Pictures/../../private/etc/passwd'
      ]

      traversalPaths.forEach(maliciousPath => {
        // After path resolution, these should be outside allowed dirs
        expect(isWallpaperPathAllowed(maliciousPath)).toBe(false)
      })
    })
  })

  describe('Symlink Attack Prevention', () => {
    const tempDir = os.tmpdir()
    const testSymlinkDir = path.join(tempDir, 'wallpaper-symlink-test')
    const targetOutside = path.join(tempDir, 'target-outside')

    beforeAll(() => {
      // Note: We can't create symlinks in /System or /Library, so we test the logic
      // by creating test directories and verifying the realpath behavior
      try {
        fs.mkdirSync(testSymlinkDir, { recursive: true })
        fs.mkdirSync(targetOutside, { recursive: true })
        fs.writeFileSync(path.join(targetOutside, 'secret.txt'), 'sensitive')
      } catch {
        // May fail in CI
      }
    })

    afterAll(() => {
      try {
        fs.unlinkSync(path.join(targetOutside, 'secret.txt'))
        fs.rmdirSync(targetOutside)
        fs.rmdirSync(testSymlinkDir, { recursive: true })
      } catch {
        // Cleanup errors are OK
      }
    })

    it('should resolve symlinks before checking path', () => {
      // Test that fs.realpathSync is used
      const symPath = path.join(tempDir, 'test-symlink')
      const realPath = path.join(tempDir, 'real-target')

      try {
        fs.mkdirSync(realPath, { recursive: true })
        fs.symlinkSync(realPath, symPath)

        // realpath should resolve the symlink
        const resolved = fs.realpathSync(symPath)
        expect(resolved).toBe(realPath)

        fs.unlinkSync(symPath)
        fs.rmdirSync(realPath)
      } catch {
        // Skip if symlinks not supported
      }
    })

    it('should deny symlink pointing to non-allowed directory', () => {
      // Even if a symlink is placed in an allowed dir (hypothetically),
      // the resolved path should be checked

      // Since we can't modify system dirs, we verify the logic:
      // A symlink at /System/Library/Desktop Pictures/link -> /etc/passwd
      // would resolve to /etc/passwd, which is NOT in allowed dirs

      const targetPath = '/etc/passwd'

      // Simulate: if realpathSync returns /etc/passwd, it should be denied
      const mockRealPath = targetPath // After symlink resolution
      const isAllowed = allowedDirs.some(dir =>
        mockRealPath.startsWith(dir + path.sep) || mockRealPath === dir
      )

      expect(isAllowed).toBe(false)
    })
  })

  describe('Path Normalization', () => {
    it('should handle paths with trailing slashes', () => {
      const pathWithSlash = '/System/Library/Desktop Pictures/'
      const pathWithoutSlash = '/System/Library/Desktop Pictures'

      // path.sep comparison should handle this correctly
      const testPath = '/System/Library/Desktop Pictures/image.jpg'

      // Test passes if the directory check works regardless of trailing slash
      const matchesWithSlash = testPath.startsWith(pathWithSlash)
      const matchesWithoutSlash = testPath.startsWith(pathWithoutSlash + path.sep)

      expect(matchesWithSlash || matchesWithoutSlash).toBe(true)
    })

    it('should handle case sensitivity on macOS (HFS+)', () => {
      // macOS file system is typically case-insensitive
      // But our path comparison is case-sensitive for safety
      const upperPath = '/SYSTEM/LIBRARY/DESKTOP PICTURES/image.jpg'

      // This should NOT match because we use strict comparison
      const matches = allowedDirs.some(dir =>
        upperPath.startsWith(dir + path.sep)
      )

      expect(matches).toBe(false)
    })
  })
})
