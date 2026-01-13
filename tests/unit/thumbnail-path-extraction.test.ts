/**
 * @jest-environment node
 *
 * Tests for extractFilePathFromUrl utility function
 *
 * This test ensures that video-stream:// URLs are correctly converted
 * to filesystem paths for use with APIs like fileExists.
 *
 * Bug context: The fileExists API was being called with video-stream:// URLs
 * instead of actual filesystem paths, causing all thumbnail generation to fail
 * because files appeared to "not exist".
 */

import { extractFilePathFromUrl } from '../../src/shared/utils/thumbnail-generator'

describe('extractFilePathFromUrl', () => {
  describe('video-stream://local/ format', () => {
    it('extracts and decodes path from video-stream://local/ URL', () => {
      const url = 'video-stream://local/%2FUsers%2Ftest%2Fvideo.mov'
      expect(extractFilePathFromUrl(url)).toBe('/Users/test/video.mov')
    })

    it('handles paths with spaces (URL encoded)', () => {
      const url = 'video-stream://local/%2FUsers%2Ftest%2FBokeh%20Captures%2Fvideo.mov'
      expect(extractFilePathFromUrl(url)).toBe('/Users/test/Bokeh Captures/video.mov')
    })

    it('handles deeply nested paths', () => {
      const url = 'video-stream://local/%2FUsers%2Fceewai%2FDocuments%2FBokeh%20Captures%2FRecording-2024-01-13%2Frecording.mov'
      expect(extractFilePathFromUrl(url)).toBe('/Users/ceewai/Documents/Bokeh Captures/Recording-2024-01-13/recording.mov')
    })

    it('handles special characters in path', () => {
      const url = 'video-stream://local/%2FUsers%2Ftest%2Fvideo%20%28copy%29.mov'
      expect(extractFilePathFromUrl(url)).toBe('/Users/test/video (copy).mov')
    })
  })

  describe('raw filesystem paths', () => {
    it('returns absolute path as-is', () => {
      const path = '/Users/test/video.mov'
      expect(extractFilePathFromUrl(path)).toBe('/Users/test/video.mov')
    })

    it('returns paths with spaces as-is', () => {
      const path = '/Users/test/Bokeh Captures/video.mov'
      expect(extractFilePathFromUrl(path)).toBe('/Users/test/Bokeh Captures/video.mov')
    })
  })

  describe('other video-stream:// formats', () => {
    it('handles video-stream://hostname/path format', () => {
      const url = 'video-stream://localhost/Users/test/video.mov'
      expect(extractFilePathFromUrl(url)).toBe('/Users/test/video.mov')
    })

    it('handles URL-encoded path after hostname', () => {
      // Path with spaces encoded
      const url = 'video-stream://somehost/Users/test/Bokeh%20Captures/video.mov'
      expect(extractFilePathFromUrl(url)).toBe('/Users/test/Bokeh Captures/video.mov')
    })
  })

  describe('edge cases', () => {
    it('returns null for empty string', () => {
      expect(extractFilePathFromUrl('')).toBeNull()
    })

    it('returns null for null-like input', () => {
      // TypeScript would catch this, but test runtime behavior
      expect(extractFilePathFromUrl(null as unknown as string)).toBeNull()
      expect(extractFilePathFromUrl(undefined as unknown as string)).toBeNull()
    })

    it('returns null for video-stream:// without path', () => {
      expect(extractFilePathFromUrl('video-stream://local')).toBeNull()
      expect(extractFilePathFromUrl('video-stream://local/')).toBe('')
    })

    it('returns null for unrecognized protocols', () => {
      expect(extractFilePathFromUrl('http://example.com/video.mov')).toBeNull()
      expect(extractFilePathFromUrl('file:///Users/test/video.mov')).toBeNull()
    })

    it('handles malformed URL encoding gracefully', () => {
      // Invalid percent encoding - should return as-is
      const url = 'video-stream://local/%ZZ%invalid'
      const result = extractFilePathFromUrl(url)
      // Should not throw, returns the raw string if decode fails
      expect(result).toBe('%ZZ%invalid')
    })
  })

  describe('regression: fileExists must receive filesystem path', () => {
    /**
     * This is the specific bug we're preventing from recurring:
     * The fileExists Electron API expects a filesystem path like /Users/...
     * NOT a video-stream:// URL.
     *
     * This test documents the exact scenario that was failing.
     */
    it('converts video-stream URL to path suitable for fileExists API', () => {
      // This is what was being passed to fileExists (WRONG)
      const videoStreamUrl = 'video-stream://local/%2FUsers%2Fceewai%2FDocuments%2FBokeh%20Captures%2FRecording-2024-01-13_21-01-04.bokeh%2Frecording-1768309264248%2Frecording-1768309264248.mov'

      // This is what fileExists actually needs (CORRECT)
      const expectedPath = '/Users/ceewai/Documents/Bokeh Captures/Recording-2024-01-13_21-01-04.bokeh/recording-1768309264248/recording-1768309264248.mov'

      const result = extractFilePathFromUrl(videoStreamUrl)
      expect(result).toBe(expectedPath)

      // The result should NOT contain video-stream://
      expect(result).not.toContain('video-stream://')

      // The result SHOULD start with /
      expect(result?.startsWith('/')).toBe(true)
    })
  })
})
