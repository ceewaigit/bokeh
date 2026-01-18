/**
 * Security tests for FFmpeg concat list escaping
 * Tests prevention of injection attacks via malicious filenames
 */

import { escapeForConcat } from '../../electron/main/export/ffmpeg-combiner'

describe('FFmpeg Concat Escaping Security', () => {
  describe('Quote Injection Prevention', () => {
    it('should escape single quotes in filenames', () => {
      const malicious = "video'with'quotes.mp4"
      const escaped = escapeForConcat(malicious)

      // Should escape single quotes using the shell-safe pattern '\''
      // Each ' becomes '\'' (end quote, escaped quote, start quote)
      expect(escaped).toContain("'\\''")

      // The original unescaped single quote pattern should not appear
      // Check that there's no unescaped quote by verifying the escaping pattern
      expect(escaped).toBe("video'\\''with'\\''quotes.mp4")
    })

    it('should handle backtick command substitution attempts', () => {
      // Backticks could be used for command substitution in some shells
      const malicious = 'video`touch /tmp/pwned`.mp4'
      const escaped = escapeForConcat(malicious)

      // Backticks should pass through (they're safe in FFmpeg concat list context)
      // but if used in a shell context, they'd be dangerous
      expect(escaped).toBe(malicious)
    })
  })

  describe('Newline Injection Prevention', () => {
    it('should strip newline characters from filenames', () => {
      // Newlines could inject additional file entries in concat list
      const malicious = "video.mp4\nfile '/etc/passwd'"
      const escaped = escapeForConcat(malicious)

      expect(escaped).not.toContain('\n')
      expect(escaped).not.toContain("file '/etc/passwd'")
    })

    it('should strip carriage return characters', () => {
      const malicious = "video.mp4\r\nfile '/etc/passwd'"
      const escaped = escapeForConcat(malicious)

      expect(escaped).not.toContain('\r')
      expect(escaped).not.toContain('\n')
    })

    it('should handle mixed injection attempts', () => {
      // Combine multiple attack vectors
      const malicious = "video'\nfile '/etc/passwd'\r\n# comment"
      const escaped = escapeForConcat(malicious)

      expect(escaped).not.toContain('\n')
      expect(escaped).not.toContain('\r')
      expect(escaped).toContain("'\\''") // Quotes should still be escaped
    })
  })

  describe('Safe Filenames', () => {
    it('should not modify safe filenames', () => {
      const safe = 'my-video-2024-01-15.mp4'
      expect(escapeForConcat(safe)).toBe(safe)
    })

    it('should preserve spaces in filenames', () => {
      const withSpaces = 'my video file.mp4'
      expect(escapeForConcat(withSpaces)).toBe(withSpaces)
    })

    it('should preserve unicode characters', () => {
      const unicode = '日本語ビデオ.mp4'
      expect(escapeForConcat(unicode)).toBe(unicode)
    })

    it('should preserve common special characters', () => {
      const special = 'video-file_2024.01.15 (1).mp4'
      expect(escapeForConcat(special)).toBe(special)
    })
  })

  describe('Concat List Format', () => {
    it('should produce valid concat list entries', () => {
      const paths = [
        '/path/to/video1.mp4',
        "/path/with space/video2.mp4",
        "/path/with'quote/video3.mp4"
      ]

      const entries = paths.map(p => `file '${escapeForConcat(p)}'`)

      // All entries should be single-line
      entries.forEach(entry => {
        expect(entry.split('\n').length).toBe(1)
      })

      // The concat list should have 3 entries when joined
      const concatList = entries.join('\n')
      expect(concatList.split('\n').length).toBe(3)
    })
  })
})
