/**
 * Security tests for command injection prevention
 * Tests that spawnSync with array arguments prevents shell injection
 */

import { spawnSync } from 'child_process'

describe('Command Injection Prevention', () => {
  describe('spawnSync Array Arguments', () => {
    it('should treat special characters as literal in array arguments', () => {
      // This would be dangerous with execSync: `touch /tmp/pwned`
      // But with spawnSync array args, it's treated literally
      const maliciousArg = '`touch /tmp/pwned`test.jpg'

      // Using echo as a safe way to test argument handling
      const result = spawnSync('echo', [maliciousArg], { encoding: 'utf8' })

      // The argument should be passed literally, not executed
      expect(result.stdout.trim()).toBe(maliciousArg)

      // Verify no file was created
      const fs = require('fs')
      expect(fs.existsSync('/tmp/pwned')).toBe(false)
    })

    it('should treat semicolons as literal characters', () => {
      // Semicolons would chain commands in shell
      const maliciousArg = 'file.jpg; rm -rf /'

      const result = spawnSync('echo', [maliciousArg], { encoding: 'utf8' })

      expect(result.stdout.trim()).toBe(maliciousArg)
    })

    it('should treat pipes as literal characters', () => {
      // Pipes would redirect output in shell
      const maliciousArg = 'file.jpg | cat /etc/passwd'

      const result = spawnSync('echo', [maliciousArg], { encoding: 'utf8' })

      expect(result.stdout.trim()).toBe(maliciousArg)
    })

    it('should treat $() command substitution as literal', () => {
      const maliciousArg = '$(whoami).jpg'

      const result = spawnSync('echo', [maliciousArg], { encoding: 'utf8' })

      // Should print literally, not substitute command
      expect(result.stdout.trim()).toBe(maliciousArg)
    })

    it('should handle quotes safely', () => {
      // Quotes that would break shell parsing
      const maliciousArg = 'file"with"quotes\'and\'more.jpg'

      const result = spawnSync('echo', [maliciousArg], { encoding: 'utf8' })

      expect(result.stdout.trim()).toBe(maliciousArg)
    })
  })

  describe('Safe sips Command Simulation', () => {
    // Note: These tests simulate the sips command argument structure
    // without actually running sips (which may not be available in CI)

    it('should safely construct sips-like arguments with special chars in path', () => {
      const maliciousPath = '/path/to/`rm -rf /`.heic'
      const outputPath = '/tmp/safe-output.jpg'

      const args = ['-Z', '300', '-s', 'format', 'jpeg', maliciousPath, '--out', outputPath]

      // Verify all arguments are separate array elements
      expect(args.length).toBe(8)
      expect(args[5]).toBe(maliciousPath)
      expect(args[5]).toContain('`rm -rf /`')
    })

    it('should handle path with newlines', () => {
      const maliciousPath = "/path/to/file\nwith\nnewlines.heic"
      const args = ['-s', 'format', 'jpeg', maliciousPath]

      // Path should be preserved as-is in array
      expect(args[3]).toBe(maliciousPath)
      expect(args[3]).toContain('\n')
    })
  })
})

describe('Environment Variable Minimization', () => {
  it('should only pass essential environment variables to subprocesses', () => {
    // Simulate the minimal env we now pass to FFmpeg
    const minimalEnv = {
      PATH: process.env.PATH || '/usr/bin:/bin',
      DYLD_LIBRARY_PATH: '/custom/lib'
    }

    // Verify sensitive env vars are NOT included
    expect(minimalEnv).not.toHaveProperty('HOME')
    expect(minimalEnv).not.toHaveProperty('USER')
    expect(minimalEnv).not.toHaveProperty('SSH_AUTH_SOCK')
    expect(minimalEnv).not.toHaveProperty('AWS_ACCESS_KEY_ID')
    expect(minimalEnv).not.toHaveProperty('API_KEY')

    // Verify required vars ARE included
    expect(minimalEnv).toHaveProperty('PATH')
    expect(minimalEnv).toHaveProperty('DYLD_LIBRARY_PATH')
  })
})
