/**
 * IPC Bridge interface and accessor
 * Provides abstraction over Electron IPC for better testability and DIP compliance
 */

/**
 * Interface for IPC communication bridge
 * Abstracts the underlying IPC mechanism (Electron, mock, etc.)
 */
export interface IpcBridge {
  /**
   * Invoke an IPC handler and wait for response
   * @param channel - The IPC channel name
   * @param args - Arguments to pass to the handler
   * @returns Promise resolving to the handler's response
   */
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>

  /**
   * Register a listener for IPC events
   * @param channel - The IPC channel name
   * @param listener - Callback for received messages
   */
  on(channel: string, listener: (...args: unknown[]) => void): void

  /**
   * Remove a listener for IPC events
   * @param channel - The IPC channel name
   * @param listener - The listener to remove
   */
  removeListener(channel: string, listener: (...args: unknown[]) => void): void

  /**
   * Remove all listeners for a channel
   * @param channel - The IPC channel name
   */
  removeAllListeners?(channel: string): void

  /**
   * Send a one-way message (no response expected)
   * @param channel - The IPC channel name
   * @param args - Arguments to send
   */
  send?(channel: string, ...args: unknown[]): void
}

// Singleton instance storage
let currentBridge: IpcBridge | null = null

/**
 * Get the current IPC bridge instance
 * Falls back to ElectronIpcBridge if not explicitly set
 * @returns The IPC bridge instance
 */
export function getIpcBridge(): IpcBridge {
  if (!currentBridge) {
    // Lazy import to avoid issues in non-Electron environments
    const { ElectronIpcBridge } = require('./electron-ipc-bridge')
    currentBridge = new ElectronIpcBridge()
  }
  return currentBridge as IpcBridge
}

/**
 * Set a custom IPC bridge instance
 * Useful for testing or alternative IPC implementations
 * @param bridge - The bridge instance to use
 */
export function setIpcBridge(bridge: IpcBridge): void {
  currentBridge = bridge
}

/**
 * Reset the IPC bridge to default
 * Useful for cleanup in tests
 */
export function resetIpcBridge(): void {
  currentBridge = null
}

/**
 * Check if the IPC bridge is available
 * @returns true if IPC communication is possible
 */
export function isIpcAvailable(): boolean {
  try {
    // Check if we're in an Electron renderer context
    return !!(typeof window !== 'undefined' && window.electronAPI?.ipcRenderer)
  } catch {
    return false
  }
}
