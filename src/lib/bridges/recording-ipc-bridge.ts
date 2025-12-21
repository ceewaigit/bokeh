/**
 * Recording-specific IPC Bridge
 * Extends the base IPC bridge with typed methods for recording operations.
 * This provides a clean abstraction over window.electronAPI for better testability.
 */

import type { IpcBridge } from './ipc-bridge'

// ============================================================================
// Types
// ============================================================================

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

export interface DesktopSource {
    id: string
    name: string
    display_id?: number
    thumbnail?: string
    displayInfo?: DisplayInfo
}

export interface DisplayInfo {
    id: number
    isPrimary: boolean
    isInternal: boolean
    bounds: Rect
    workArea: Rect
    scaleFactor: number
}

export interface MouseTrackingOptions {
    intervalMs?: number
    sourceId?: string
    sourceType?: 'screen' | 'window' | 'area'
}

export interface MouseTrackingResult {
    success: boolean
    fps?: number
    error?: string
}

export interface PermissionResult {
    status: string
    granted: boolean
}

export interface MetadataResult {
    success: boolean
    data?: string
    error?: string
}

export interface MetadataReadResult {
    success: boolean
    data?: unknown[]
    error?: string
}

// ============================================================================
// Recording IPC Bridge Interface
// ============================================================================

/**
 * Extended IPC bridge interface for recording-specific operations.
 * Provides typed methods for native recorder, permissions, sources, and tracking.
 */
export interface RecordingIpcBridge extends IpcBridge {
    // Native recorder operations
    nativeRecorderAvailable(): Promise<boolean>
    nativeRecorderStartDisplay(displayId: number, bounds?: Rect, options?: { onlySelf?: boolean; lowMemory?: boolean; includeAppWindows?: boolean }): Promise<{ outputPath: string }>
    nativeRecorderStartWindow(windowId: number, options?: { lowMemory?: boolean }): Promise<{ outputPath: string }>
    nativeRecorderStop(): Promise<{ outputPath: string | null }>
    nativeRecorderPause(): Promise<void>
    nativeRecorderResume(): Promise<void>

    // Permission operations
    checkScreenRecordingPermission(): Promise<PermissionResult>
    requestScreenRecordingPermission(): Promise<void>

    // Source operations
    getDesktopSources(options?: { types?: string[]; thumbnailSize?: { width: number; height: number } }): Promise<DesktopSource[]>
    getSourceBounds(sourceId: string): Promise<Rect | null>
    getScreens(): Promise<DisplayInfo[]>

    // Mouse tracking
    startMouseTracking(options: MouseTrackingOptions): Promise<MouseTrackingResult>
    stopMouseTracking(): Promise<void>
    onMouseMove(callback: (data: unknown) => void): () => void
    onMouseClick(callback: (data: unknown) => void): () => void
    onScroll(callback: (data: unknown) => void): () => void

    // Keyboard tracking
    startKeyboardTracking(): Promise<void>
    stopKeyboardTracking(): Promise<void>
    onKeyboardEvent(callback: (data: unknown) => void): () => void

    // Metadata persistence
    createMetadataFile(): Promise<MetadataResult>
    appendMetadataBatch(filePath: string, batch: unknown[], isLast?: boolean): Promise<{ success: boolean; error?: string }>
    readMetadataFile(filePath: string): Promise<MetadataReadResult>

    // Streaming recording
    createTempRecordingFile(extension?: string): Promise<{ success: boolean; data?: string; error?: string }>
    appendToRecording(filePath: string, chunk: ArrayBuffer | Blob): Promise<{ success: boolean; error?: string }>
    finalizeRecording(filePath: string): Promise<{ success: boolean; error?: string }>
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Concrete implementation of RecordingIpcBridge using window.electronAPI.
 */
export class ElectronRecordingBridge implements RecordingIpcBridge {
    // -------------------------------------------------------------------------
    // Base IpcBridge implementation
    // -------------------------------------------------------------------------

    async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
        if (!window.electronAPI?.ipcRenderer) {
            throw new Error('Electron IPC not available')
        }
        return window.electronAPI.ipcRenderer.invoke(channel, ...args) as Promise<T>
    }

    on(channel: string, listener: (...args: unknown[]) => void): void {
        window.electronAPI?.ipcRenderer?.on(channel, (_event: unknown, ...args: unknown[]) => {
            listener(...args)
        })
    }

    removeListener(channel: string, listener: (...args: unknown[]) => void): void {
        window.electronAPI?.ipcRenderer?.removeListener(channel, listener)
    }

    // -------------------------------------------------------------------------
    // Native Recorder
    // -------------------------------------------------------------------------

    async nativeRecorderAvailable(): Promise<boolean> {
        try {
            return await window.electronAPI?.nativeRecorder?.isAvailable() ?? false
        } catch {
            return false
        }
    }

    async nativeRecorderStartDisplay(displayId: number, bounds?: Rect, options?: { onlySelf?: boolean; lowMemory?: boolean; includeAppWindows?: boolean }): Promise<{ outputPath: string }> {
        if (!window.electronAPI?.nativeRecorder?.startDisplay) {
            throw new Error('Native recorder not available')
        }
        return window.electronAPI.nativeRecorder.startDisplay(displayId, bounds, options)
    }

    async nativeRecorderStartWindow(windowId: number, options?: { lowMemory?: boolean }): Promise<{ outputPath: string }> {
        if (!window.electronAPI?.nativeRecorder?.startWindow) {
            throw new Error('Native recorder not available')
        }
        return window.electronAPI.nativeRecorder.startWindow(windowId, options)
    }

    async nativeRecorderStop(): Promise<{ outputPath: string | null }> {
        if (!window.electronAPI?.nativeRecorder?.stop) {
            throw new Error('Native recorder not available')
        }
        return window.electronAPI.nativeRecorder.stop()
    }

    async nativeRecorderPause(): Promise<void> {
        if (!window.electronAPI?.nativeRecorder?.pause) {
            throw new Error('Native recorder pause not available')
        }
        await window.electronAPI.nativeRecorder.pause()
    }

    async nativeRecorderResume(): Promise<void> {
        if (!window.electronAPI?.nativeRecorder?.resume) {
            throw new Error('Native recorder resume not available')
        }
        await window.electronAPI.nativeRecorder.resume()
    }

    // -------------------------------------------------------------------------
    // Permissions
    // -------------------------------------------------------------------------

    async checkScreenRecordingPermission(): Promise<PermissionResult> {
        if (!window.electronAPI?.checkScreenRecordingPermission) {
            return { status: 'unknown', granted: false }
        }
        return window.electronAPI.checkScreenRecordingPermission()
    }

    async requestScreenRecordingPermission(): Promise<void> {
        await window.electronAPI?.requestScreenRecordingPermission?.()
    }

    // -------------------------------------------------------------------------
    // Sources
    // -------------------------------------------------------------------------

    async getDesktopSources(options?: { types?: string[]; thumbnailSize?: { width: number; height: number } }): Promise<DesktopSource[]> {
        if (!window.electronAPI?.getDesktopSources) {
            throw new Error('Desktop sources API not available')
        }
        return window.electronAPI.getDesktopSources(options)
    }

    async getSourceBounds(sourceId: string): Promise<Rect | null> {
        return window.electronAPI?.getSourceBounds?.(sourceId) ?? null
    }

    async getScreens(): Promise<DisplayInfo[]> {
        const screens = await window.electronAPI?.getScreens?.()
        if (!screens) return []

        return screens.map(s => ({
            id: s.id,
            isPrimary: false, // Not available in this API
            isInternal: s.internal,
            bounds: s.bounds,
            workArea: s.workArea,
            scaleFactor: s.scaleFactor
        }))
    }

    // -------------------------------------------------------------------------
    // Mouse Tracking
    // -------------------------------------------------------------------------

    async startMouseTracking(options: MouseTrackingOptions): Promise<MouseTrackingResult> {
        if (!window.electronAPI?.startMouseTracking) {
            return { success: false, error: 'Mouse tracking not available' }
        }
        return window.electronAPI.startMouseTracking(options)
    }

    async stopMouseTracking(): Promise<void> {
        await window.electronAPI?.stopMouseTracking?.()
    }

    onMouseMove(callback: (data: unknown) => void): () => void {
        if (!window.electronAPI?.onMouseMove) {
            return () => { }
        }
        return window.electronAPI.onMouseMove((_event: unknown, data: unknown) => callback(data))
    }

    onMouseClick(callback: (data: unknown) => void): () => void {
        if (!window.electronAPI?.onMouseClick) {
            return () => { }
        }
        return window.electronAPI.onMouseClick((_event: unknown, data: unknown) => callback(data))
    }

    onScroll(callback: (data: unknown) => void): () => void {
        if (!window.electronAPI?.onScroll) {
            return () => { }
        }
        return window.electronAPI.onScroll((_event: unknown, data: unknown) => callback(data))
    }

    // -------------------------------------------------------------------------
    // Keyboard Tracking
    // -------------------------------------------------------------------------

    async startKeyboardTracking(): Promise<void> {
        await window.electronAPI?.startKeyboardTracking?.()
    }

    async stopKeyboardTracking(): Promise<void> {
        await window.electronAPI?.stopKeyboardTracking?.()
    }

    onKeyboardEvent(callback: (data: unknown) => void): () => void {
        if (!window.electronAPI?.onKeyboardEvent) {
            return () => { }
        }
        return window.electronAPI.onKeyboardEvent((_event: unknown, data: unknown) => callback(data))
    }

    // -------------------------------------------------------------------------
    // Metadata Persistence
    // -------------------------------------------------------------------------

    async createMetadataFile(): Promise<MetadataResult> {
        if (!window.electronAPI?.createMetadataFile) {
            return { success: false, error: 'Metadata file API not available' }
        }
        return window.electronAPI.createMetadataFile()
    }

    async appendMetadataBatch(filePath: string, batch: unknown[], isLast?: boolean): Promise<{ success: boolean; error?: string }> {
        if (!window.electronAPI?.appendMetadataBatch) {
            return { success: false, error: 'Append metadata API not available' }
        }
        return window.electronAPI.appendMetadataBatch(filePath, batch, isLast)
    }

    async readMetadataFile(filePath: string): Promise<MetadataReadResult> {
        if (!window.electronAPI?.readMetadataFile) {
            return { success: false, error: 'Read metadata API not available' }
        }
        return window.electronAPI.readMetadataFile(filePath)
    }

    // -------------------------------------------------------------------------
    // Streaming Recording
    // -------------------------------------------------------------------------

    async createTempRecordingFile(extension?: string): Promise<{ success: boolean; data?: string; error?: string }> {
        if (!window.electronAPI?.createTempRecordingFile) {
            return { success: false, error: 'Temp recording file API not available' }
        }
        return window.electronAPI.createTempRecordingFile(extension)
    }

    async appendToRecording(filePath: string, chunk: ArrayBuffer | Blob): Promise<{ success: boolean; error?: string }> {
        if (!window.electronAPI?.appendToRecording) {
            return { success: false, error: 'Append to recording API not available' }
        }
        return window.electronAPI.appendToRecording(filePath, chunk)
    }

    async finalizeRecording(filePath: string): Promise<{ success: boolean; error?: string }> {
        if (!window.electronAPI?.finalizeRecording) {
            return { success: false, error: 'Finalize recording API not available' }
        }
        return window.electronAPI.finalizeRecording(filePath)
    }
}

// ============================================================================
// Singleton accessor
// ============================================================================

let recordingBridge: RecordingIpcBridge | null = null

/**
 * Get the recording IPC bridge singleton.
 * Creates ElectronRecordingBridge by default.
 */
export function getRecordingBridge(): RecordingIpcBridge {
    if (!recordingBridge) {
        recordingBridge = new ElectronRecordingBridge()
    }
    return recordingBridge
}

/**
 * Set a custom recording bridge (useful for testing).
 */
export function setRecordingBridge(bridge: RecordingIpcBridge): void {
    recordingBridge = bridge
}

/**
 * Reset the recording bridge to default.
 */
export function resetRecordingBridge(): void {
    recordingBridge = null
}
