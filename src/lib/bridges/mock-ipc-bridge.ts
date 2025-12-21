/**
 * Mock IPC bridge for testing
 * Allows tests to run without Electron
 */

import type { IpcBridge } from './ipc-bridge'

type Handler = (...args: unknown[]) => Promise<unknown> | unknown
type Listener = (...args: unknown[]) => void

/**
 * Mock IPC bridge for unit testing
 * Allows registering handlers and simulating events
 */
export class MockIpcBridge implements IpcBridge {
  private handlers = new Map<string, Handler>()
  private listeners = new Map<string, Set<Listener>>()

  /**
   * Register a handler for an IPC channel
   * Used to mock responses for invoke calls
   * @param channel - The channel name
   * @param handler - Handler function returning the response
   */
  registerHandler(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler)
  }

  /**
   * Unregister a handler for an IPC channel
   * @param channel - The channel name
   */
  unregisterHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  /**
   * Simulate receiving an event
   * @param channel - The channel name
   * @param args - Event arguments
   */
  simulateEvent(channel: string, ...args: unknown[]): void {
    const channelListeners = this.listeners.get(channel)
    if (channelListeners) {
      for (const listener of channelListeners) {
        listener(...args)
      }
    }
  }

  async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    const handler = this.handlers.get(channel)
    if (!handler) {
      throw new Error(`No handler registered for channel: ${channel}`)
    }
    return handler(...args) as T
  }

  on(channel: string, listener: Listener): void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set())
    }
    this.listeners.get(channel)!.add(listener)
  }

  removeListener(channel: string, listener: Listener): void {
    this.listeners.get(channel)?.delete(listener)
  }

  removeAllListeners(channel: string): void {
    this.listeners.delete(channel)
  }

  send(channel: string, ...args: unknown[]): void {
    // For one-way messages, we can optionally trigger handlers
    const handler = this.handlers.get(channel)
    if (handler) {
      handler(...args)
    }
  }

  /**
   * Reset all handlers and listeners
   */
  reset(): void {
    this.handlers.clear()
    this.listeners.clear()
  }

  /**
   * Get all registered channels
   */
  getRegisteredChannels(): string[] {
    return Array.from(this.handlers.keys())
  }

  /**
   * Check if a channel has a handler
   */
  hasHandler(channel: string): boolean {
    return this.handlers.has(channel)
  }
}

/**
 * Create a pre-configured mock bridge with common handlers
 * @returns MockIpcBridge with common handlers
 */
export function createMockIpcBridge(): MockIpcBridge {
  const bridge = new MockIpcBridge()

  // Register common handlers with default responses
  bridge.registerHandler('export-video', async () => ({
    success: true,
    data: '',
    isStream: false
  }))

  bridge.registerHandler('export-cancel', async () => ({
    success: true
  }))

  bridge.registerHandler('get-recordings-directory', async () => '/mock/recordings')

  bridge.registerHandler('read-local-file', async () => ({
    success: true,
    data: null
  }))

  return bridge
}
