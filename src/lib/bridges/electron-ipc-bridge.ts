/**
 * Electron IPC bridge implementation
 * Wraps window.electronAPI for IPC communication
 */

import type { IpcBridge } from './ipc-bridge'

/**
 * IPC bridge implementation using Electron's IPC
 */
export class ElectronIpcBridge implements IpcBridge {
  private get ipc() {
    if (typeof window === 'undefined') {
      throw new Error('ElectronIpcBridge can only be used in browser context')
    }
    if (!window.electronAPI?.ipcRenderer) {
      throw new Error('Electron IPC not available. Make sure preload script is loaded.')
    }
    return window.electronAPI.ipcRenderer
  }

  async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    return this.ipc.invoke(channel, ...args) as Promise<T>
  }

  on(channel: string, listener: (...args: unknown[]) => void): void {
    this.ipc.on(channel, (_event: unknown, ...args: unknown[]) => {
      listener(...args)
    })
  }

  removeListener(channel: string, listener: (...args: unknown[]) => void): void {
    this.ipc.removeListener(channel, listener)
  }

  removeAllListeners(channel: string): void {
    // removeAllListeners may not be exposed in the preload, so we skip it
    // This is a no-op if not available
    const ipc = this.ipc as any
    if (typeof ipc.removeAllListeners === 'function') {
      ipc.removeAllListeners(channel)
    }
  }

  send(channel: string, ...args: unknown[]): void {
    // send may not be exposed in the preload, so we check first
    const ipc = this.ipc as any
    if (typeof ipc.send === 'function') {
      ipc.send(channel, ...args)
    }
  }
}
