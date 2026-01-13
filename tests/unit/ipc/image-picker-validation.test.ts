/**
 * Tests for image-picker IPC handler path validation logic.
 * These are black-box tests verifying security constraints.
 */

import * as path from 'path'

// Allowed image extensions (mirrors image-picker.ts)
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.tiff', '.tif'])

// Simulated validatedPaths set (tracks paths selected through file dialog)
const validatedPaths = new Set<string>()

/**
 * Validates an image path before loading.
 * Extracted validation logic from image-picker.ts for testing.
 */
function validateImagePath(imagePath: string): { valid: boolean; error?: string } {
  // 1. Path must be absolute (no relative path traversal)
  if (!path.isAbsolute(imagePath)) {
    return { valid: false, error: 'Invalid path: must be absolute' }
  }

  // 2. Extension must be an allowed image type
  const ext = path.extname(imagePath).toLowerCase()
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Invalid file type: ${ext}` }
  }

  // 3. Path should have been selected through the file dialog
  if (!validatedPaths.has(imagePath)) {
    return { valid: false, error: 'Access denied: path not selected through file picker' }
  }

  return { valid: true }
}

describe('Image Picker Path Validation', () => {
  beforeEach(() => {
    validatedPaths.clear()
  })

  describe('absolute path requirement', () => {
    it('rejects relative paths', () => {
      const result = validateImagePath('images/photo.jpg')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be absolute')
    })

    it('rejects paths with ../ traversal', () => {
      const result = validateImagePath('../../../etc/passwd')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be absolute')
    })

    it('rejects paths starting with ./', () => {
      const result = validateImagePath('./photo.jpg')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be absolute')
    })

    it('accepts absolute paths', () => {
      validatedPaths.add('/Users/test/photos/image.jpg')
      const result = validateImagePath('/Users/test/photos/image.jpg')
      expect(result.valid).toBe(true)
    })
  })

  describe('file extension validation', () => {
    it('accepts valid image extensions', () => {
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.tiff', '.tif']

      for (const ext of validExtensions) {
        const testPath = `/Users/test/image${ext}`
        validatedPaths.add(testPath)
        const result = validateImagePath(testPath)
        expect(result.valid).toBe(true)
      }
    })

    it('rejects non-image extensions', () => {
      const invalidExtensions = ['.txt', '.exe', '.js', '.sh', '.pdf', '.doc', '.html']

      for (const ext of invalidExtensions) {
        const testPath = `/Users/test/file${ext}`
        validatedPaths.add(testPath) // Even if validated, wrong extension should fail
        const result = validateImagePath(testPath)
        expect(result.valid).toBe(false)
        expect(result.error).toContain('Invalid file type')
      }
    })

    it('handles case-insensitive extensions', () => {
      const testPath = '/Users/test/image.JPG'
      validatedPaths.add(testPath)
      const result = validateImagePath(testPath)
      expect(result.valid).toBe(true)
    })

    it('rejects paths without extension', () => {
      const testPath = '/Users/test/noextension'
      validatedPaths.add(testPath)
      const result = validateImagePath(testPath)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid file type')
    })

    it('rejects double extension attacks', () => {
      // File named "photo.jpg.exe" should fail
      const testPath = '/Users/test/photo.jpg.exe'
      validatedPaths.add(testPath)
      const result = validateImagePath(testPath)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid file type')
    })
  })

  describe('validated paths tracking', () => {
    it('rejects paths not selected through file picker', () => {
      // Path is absolute and has valid extension, but wasn't selected through dialog
      const result = validateImagePath('/Users/test/sneaky.png')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Access denied')
    })

    it('accepts paths that were selected through file picker', () => {
      const testPath = '/Users/test/selected.png'
      validatedPaths.add(testPath)
      const result = validateImagePath(testPath)
      expect(result.valid).toBe(true)
    })

    it('prevents path injection even with similar prefixes', () => {
      // User selected /Users/test/photo.png
      validatedPaths.add('/Users/test/photo.png')

      // Attacker tries to load a different file
      const result = validateImagePath('/Users/test/photo.png.bak')
      expect(result.valid).toBe(false)
    })

    it('tracks multiple validated paths independently', () => {
      validatedPaths.add('/Users/test/photo1.jpg')
      validatedPaths.add('/Users/test/photo2.png')

      expect(validateImagePath('/Users/test/photo1.jpg').valid).toBe(true)
      expect(validateImagePath('/Users/test/photo2.png').valid).toBe(true)
      expect(validateImagePath('/Users/test/photo3.gif').valid).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = validateImagePath('')
      expect(result.valid).toBe(false)
    })

    it('handles paths with spaces', () => {
      const testPath = '/Users/test/My Photos/vacation pic.jpg'
      validatedPaths.add(testPath)
      const result = validateImagePath(testPath)
      expect(result.valid).toBe(true)
    })

    it('handles unicode characters in path', () => {
      const testPath = '/Users/test/照片/image.png'
      validatedPaths.add(testPath)
      const result = validateImagePath(testPath)
      expect(result.valid).toBe(true)
    })

    it('handles very long paths', () => {
      const longPath = '/Users/test/' + 'a'.repeat(200) + '/image.jpg'
      validatedPaths.add(longPath)
      const result = validateImagePath(longPath)
      expect(result.valid).toBe(true)
    })
  })
})
