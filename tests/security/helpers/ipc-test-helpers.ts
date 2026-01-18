/**
 * Test helpers for black box IPC handler attack simulations.
 * Provides mock IPC events, file verification utilities, and handler capture.
 */

import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron'
import * as fs from 'fs'
import { promises as fsPromises } from 'fs'
import * as path from 'path'

/**
 * Options for creating a mock IPC event
 */
export interface MockEventOptions {
  /** URL the sender claims to be from (default: 'app://./index.html') */
  senderUrl?: string
  /** Sender ID (default: 1) */
  senderId?: number
}

/**
 * Create a mock IpcMainInvokeEvent for testing handlers directly.
 * Simulates what Electron provides when a renderer calls ipcRenderer.invoke().
 */
export function createMockEvent(options: MockEventOptions = {}): IpcMainInvokeEvent {
  const senderUrl = options.senderUrl ?? 'app://./index.html'
  const senderId = options.senderId ?? 1

  const mockSender: Partial<WebContents> = {
    id: senderId,
    getURL: () => senderUrl,
    send: jest.fn(),
  }

  const mockSenderFrame: Partial<WebFrameMain> = {
    url: senderUrl,
  }

  return {
    sender: mockSender as WebContents,
    senderFrame: mockSenderFrame as WebFrameMain,
    // Additional properties that handlers might access
    frameId: 1,
    processId: 1,
    defaultPrevented: false,
    preventDefault: jest.fn(),
  } as unknown as IpcMainInvokeEvent
}

/**
 * Create a mock event from an untrusted/malicious origin
 */
export function createUntrustedMockEvent(origin: string = 'http://evil.com'): IpcMainInvokeEvent {
  return createMockEvent({ senderUrl: origin })
}

/**
 * Create a mock event from a trusted origin (app protocol)
 */
export function createTrustedMockEvent(): IpcMainInvokeEvent {
  return createMockEvent({ senderUrl: 'app://./index.html' })
}

/**
 * Create a mock event from localhost (trusted in dev mode)
 */
export function createLocalhostMockEvent(port: number = 3000): IpcMainInvokeEvent {
  return createMockEvent({ senderUrl: `http://localhost:${port}` })
}

/**
 * Check if a file exists at the given path
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Check if a file exists synchronously
 */
export function fileExistsSync(filePath: string): boolean {
  return fs.existsSync(filePath)
}

/**
 * Check if a file contains specific content
 */
export async function fileContains(filePath: string, content: string): Promise<boolean> {
  try {
    const fileContent = await fsPromises.readFile(filePath, 'utf8')
    return fileContent.includes(content)
  } catch {
    return false
  }
}

/**
 * Read file content safely (returns null if file doesn't exist)
 */
export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fsPromises.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

/**
 * Create a temporary directory for test artifacts
 */
export async function createTempTestDir(prefix: string = 'ipc-test-'): Promise<string> {
  const os = await import('os')
  const tempDir = path.join(os.tmpdir(), `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fsPromises.mkdir(tempDir, { recursive: true })
  return tempDir
}

/**
 * Clean up a directory and all its contents
 */
export async function cleanupDir(dirPath: string): Promise<void> {
  try {
    await fsPromises.rm(dirPath, { recursive: true, force: true })
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Create a symlink for testing symlink attacks
 * Returns the symlink path, or null if creation failed
 */
export async function createSymlink(target: string, linkPath: string): Promise<string | null> {
  try {
    await fsPromises.symlink(target, linkPath)
    return linkPath
  } catch {
    return null
  }
}

/**
 * Check if a path is a symlink
 */
export async function isSymlink(filePath: string): Promise<boolean> {
  try {
    const stats = await fsPromises.lstat(filePath)
    return stats.isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Get the real path of a file (resolving symlinks)
 */
export async function getRealPath(filePath: string): Promise<string | null> {
  try {
    return await fsPromises.realpath(filePath)
  } catch {
    return null
  }
}

/**
 * Create a test file with specified content
 */
export async function createTestFile(filePath: string, content: string | Buffer): Promise<void> {
  const dir = path.dirname(filePath)
  await fsPromises.mkdir(dir, { recursive: true })
  await fsPromises.writeFile(filePath, content)
}

/**
 * Create a large test file for DoS testing
 */
export async function createLargeFile(filePath: string, sizeInMB: number): Promise<void> {
  const dir = path.dirname(filePath)
  await fsPromises.mkdir(dir, { recursive: true })

  // Create file with random content
  const chunkSize = 1024 * 1024 // 1MB chunks
  const handle = await fsPromises.open(filePath, 'w')

  try {
    for (let i = 0; i < sizeInMB; i++) {
      const chunk = Buffer.alloc(chunkSize, 'x')
      await handle.write(chunk)
    }
  } finally {
    await handle.close()
  }
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const stats = await fsPromises.stat(filePath)
    return stats.size
  } catch {
    return null
  }
}

/**
 * Type for captured IPC handler functions
 */
export type IpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any>

/**
 * Map to store captured handlers from mocked ipcMain.handle calls
 */
export const capturedHandlers = new Map<string, IpcHandler>()

/**
 * Mock ipcMain for capturing handler registrations.
 * Use this in jest.mock('electron', ...) to capture handlers.
 */
export function createMockIpcMain() {
  return {
    handle: (channel: string, handler: IpcHandler) => {
      capturedHandlers.set(channel, handler)
    },
    removeHandler: (channel: string) => {
      capturedHandlers.delete(channel)
    },
  }
}

/**
 * Get a captured handler by channel name
 */
export function getHandler(channel: string): IpcHandler | undefined {
  return capturedHandlers.get(channel)
}

/**
 * Clear all captured handlers (call in beforeEach/afterEach)
 */
export function clearHandlers(): void {
  capturedHandlers.clear()
}

/**
 * Assert that a handler result indicates failure
 */
export function assertFailure(
  result: any,
  expectedErrorContains?: string
): void {
  expect(result).toBeDefined()

  // Handle different error response formats
  if (result && typeof result === 'object') {
    // Check for { success: false } pattern
    if ('success' in result) {
      expect(result.success).toBe(false)
      if (expectedErrorContains && result.error) {
        expect(result.error.toLowerCase()).toContain(expectedErrorContains.toLowerCase())
      }
      return
    }

    // Check for thrown error captured as result
    if (result instanceof Error) {
      if (expectedErrorContains) {
        expect(result.message.toLowerCase()).toContain(expectedErrorContains.toLowerCase())
      }
      return
    }
  }

  // If we got here and result looks like success, fail the test
  if (result && result.success === true) {
    throw new Error(`Expected failure but got success: ${JSON.stringify(result)}`)
  }
}

/**
 * Assert that a handler result indicates success
 */
export function assertSuccess(result: any): void {
  expect(result).toBeDefined()
  expect(result.success).toBe(true)
}

/**
 * Common attack payloads for testing
 */
export const attackPayloads = {
  // Sensitive file paths
  etcPasswd: '/etc/passwd',
  etcShadow: '/etc/shadow',
  sshPrivateKey: '~/.ssh/id_rsa',
  awsCredentials: '~/.aws/credentials',
  bashHistory: '~/.bash_history',

  // System write targets
  etcCron: '/etc/cron.d/malicious',
  usrBin: '/usr/local/bin/backdoor',
  systemDir: '/System/malware',

  // Path traversal attempts
  traversalEtc: '../../../etc/passwd',
  traversalRoot: '../../../../../../../../etc/passwd',
  traversalWithDot: './../../../etc/passwd',

  // Command injection attempts (for shell escaping tests)
  backtickInjection: '`touch /tmp/pwned`',
  dollarParenInjection: '$(touch /tmp/pwned)',
  semicolonInjection: '; touch /tmp/pwned',
  pipeInjection: '| touch /tmp/pwned',
  newlineInjection: '\nfile /etc/passwd',

  // FFmpeg concat injection
  ffmpegNewlineInjection: "video.mp4\nfile '/etc/passwd'",
  ffmpegQuoteInjection: "video.mp4'\nfile '/etc/passwd",
}

/**
 * Expand home directory in path (for testing)
 */
export function expandHomePath(inputPath: string): string {
  const os = require('os')
  if (inputPath.startsWith('~')) {
    return path.join(os.homedir(), inputPath.slice(1))
  }
  return inputPath
}
