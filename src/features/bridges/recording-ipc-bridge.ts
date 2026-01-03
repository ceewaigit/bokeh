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
    nativeRecorderStartDisplay(displayId: number, bounds?: Rect, options?: { onlySelf?: boolean; lowMemory?: boolean; includeAppWindows?: boolean; useMacOSDefaults?: boolean; framerate?: number }): Promise<{ outputPath: string }>
    nativeRecorderStartWindow(windowId: number, options?: { lowMemory?: boolean; useMacOSDefaults?: boolean; framerate?: number }): Promise<{ outputPath: string }>
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

type MethodSpec<T> = {
    path: string[]
    fallback?: T
    fallbackOnError?: T
    errorMessage?: string
    transform?: (value: any) => T
}

const resolvePath = (root: any, path: string[]): any => {
    return path.reduce((value, key) => value?.[key], root)
}

const callElectronMethod = async <T>(spec: MethodSpec<T>, args: unknown[]): Promise<T> => {
    const api = (window as any).electronAPI
    const fn = resolvePath(api, spec.path)
    if (!fn) {
        if (spec.errorMessage) {
            throw new Error(spec.errorMessage)
        }
        return spec.fallback as T
    }

    try {
        const result = await fn(...args)
        return spec.transform ? spec.transform(result) : result
    } catch (error) {
        if (spec.fallbackOnError !== undefined) {
            return spec.fallbackOnError
        }
        throw error
    }
}

const recordingMethodSpecs: Record<string, MethodSpec<any>> = {
    nativeRecorderAvailable: {
        path: ['nativeRecorder', 'isAvailable'],
        fallback: false,
        fallbackOnError: false
    },
    nativeRecorderStartDisplay: {
        path: ['nativeRecorder', 'startDisplay'],
        errorMessage: 'Native recorder not available'
    },
    nativeRecorderStartWindow: {
        path: ['nativeRecorder', 'startWindow'],
        errorMessage: 'Native recorder not available'
    },
    nativeRecorderStop: {
        path: ['nativeRecorder', 'stop'],
        errorMessage: 'Native recorder not available'
    },
    nativeRecorderPause: {
        path: ['nativeRecorder', 'pause'],
        errorMessage: 'Native recorder pause not available'
    },
    nativeRecorderResume: {
        path: ['nativeRecorder', 'resume'],
        errorMessage: 'Native recorder resume not available'
    },
    checkScreenRecordingPermission: {
        path: ['checkScreenRecordingPermission'],
        fallback: { status: 'unknown', granted: false }
    },
    requestScreenRecordingPermission: {
        path: ['requestScreenRecordingPermission']
    },
    getDesktopSources: {
        path: ['getDesktopSources'],
        errorMessage: 'Desktop sources API not available'
    },
    getSourceBounds: {
        path: ['getSourceBounds'],
        fallback: null
    },
    startMouseTracking: {
        path: ['startMouseTracking'],
        fallback: { success: false, error: 'Mouse tracking not available' }
    },
    stopMouseTracking: {
        path: ['stopMouseTracking']
    },
    startKeyboardTracking: {
        path: ['startKeyboardTracking']
    },
    stopKeyboardTracking: {
        path: ['stopKeyboardTracking']
    },
    createMetadataFile: {
        path: ['createMetadataFile'],
        fallback: { success: false, error: 'Metadata file API not available' }
    },
    appendMetadataBatch: {
        path: ['appendMetadataBatch'],
        fallback: { success: false, error: 'Append metadata API not available' }
    },
    readMetadataFile: {
        path: ['readMetadataFile'],
        fallback: { success: false, error: 'Read metadata API not available' }
    },
    createTempRecordingFile: {
        path: ['createTempRecordingFile'],
        fallback: { success: false, error: 'Temp recording file API not available' }
    },
    appendToRecording: {
        path: ['appendToRecording'],
        fallback: { success: false, error: 'Append to recording API not available' }
    },
    finalizeRecording: {
        path: ['finalizeRecording'],
        fallback: { success: false, error: 'Finalize recording API not available' }
    }
}

const createRecordingBridgeProxy = (): RecordingIpcBridge => {
    const base: Partial<RecordingIpcBridge> = {
        async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
            if (!window.electronAPI?.ipc) {
                throw new Error('Electron IPC not available')
            }
            return window.electronAPI.ipc.invoke(channel, ...args) as Promise<T>
        },
        on(channel: string, listener: (...args: unknown[]) => void): void {
            window.electronAPI?.ipc?.on(channel, (_event: unknown, ...args: unknown[]) => {
                listener(...args)
            })
        },
        removeListener(channel: string, listener: (...args: unknown[]) => void): void {
            window.electronAPI?.ipc?.removeListener(channel, listener)
        },
        async getScreens(): Promise<DisplayInfo[]> {
            const screens = await window.electronAPI?.getScreens?.()
            if (!screens) return []

            return screens.map(s => ({
                id: s.id,
                isPrimary: false,
                isInternal: s.internal,
                bounds: s.bounds,
                workArea: s.workArea,
                scaleFactor: s.scaleFactor
            }))
        },
        onMouseMove(callback: (data: unknown) => void): () => void {
            if (!window.electronAPI?.onMouseMove) {
                return () => { }
            }
            return window.electronAPI.onMouseMove((_event: unknown, data: unknown) => callback(data))
        },
        onMouseClick(callback: (data: unknown) => void): () => void {
            if (!window.electronAPI?.onMouseClick) {
                return () => { }
            }
            return window.electronAPI.onMouseClick((_event: unknown, data: unknown) => callback(data))
        },
        onScroll(callback: (data: unknown) => void): () => void {
            if (!window.electronAPI?.onScroll) {
                return () => { }
            }
            return window.electronAPI.onScroll((_event: unknown, data: unknown) => callback(data))
        },
        onKeyboardEvent(callback: (data: unknown) => void): () => void {
            if (!window.electronAPI?.onKeyboardEvent) {
                return () => { }
            }
            return window.electronAPI.onKeyboardEvent((_event: unknown, data: unknown) => callback(data))
        }
    }

    return new Proxy(base as RecordingIpcBridge, {
        get(target, prop) {
            if (prop in target) {
                return (target as any)[prop]
            }
            const spec = recordingMethodSpecs[prop as string]
            if (!spec) return undefined
            return (...args: unknown[]) => callElectronMethod(spec, args)
        }
    })
}

// ============================================================================
// Singleton accessor
// ============================================================================

let recordingBridge: RecordingIpcBridge | null = null

/**
 * Get the recording IPC bridge singleton.
 * Creates a proxy-based recording bridge by default.
 */
export function getRecordingBridge(): RecordingIpcBridge {
    if (!recordingBridge) {
        recordingBridge = createRecordingBridgeProxy()
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
