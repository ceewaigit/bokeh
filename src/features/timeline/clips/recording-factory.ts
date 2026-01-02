/**
 * Recording Factory
 * 
 * Single source of truth for creating recording objects.
 * All recording creation flows should use this factory to ensure:
 * 1. Consistent ID generation
 * 2. Proper capability detection
 * 3. Appropriate defaults for external vs app-recorded content
 */

import type {
    Recording,
    VideoRecording,
    ImageRecording,
    RecordingMetadata,
    RecordingCapabilities
} from '@/types/project'

// ============================================================================
// Types
// ============================================================================

/** Source of the recording - determines default capabilities */
export type RecordingSource = 'app' | 'external' | 'library'

/** Type of recording content */
export type RecordingType = 'video' | 'image'

/** Options for creating a recording */
export interface CreateRecordingOptions {
    /** Type of content */
    type: RecordingType
    /** Source of the recording */
    source: RecordingSource
    /** Path to the media file */
    filePath: string
    /** Duration in milliseconds */
    duration: number
    /** Width in pixels */
    width: number
    /** Height in pixels */
    height: number
    /** Frame rate (default: 30) */
    frameRate?: number
    /** Whether the media has audio */
    hasAudio?: boolean
    /** Pre-loaded metadata (if available) */
    metadata?: RecordingMetadata
    /** Folder path for metadata chunks (app recordings) */
    folderPath?: string
    /** Metadata chunk file manifest (app recordings) */
    metadataChunks?: {
        mouse?: string[]
        keyboard?: string[]
        click?: string[]
        scroll?: string[]
        screen?: string[]
    }
    /** For image recordings: image source data */
    imageSource?: {
        imagePath: string
        sourceWidth?: number
        sourceHeight?: number
    }
    /** Override capabilities (normally auto-detected) */
    capabilitiesOverride?: RecordingCapabilities
}

// ============================================================================
// ID Generation
// ============================================================================

function generateRecordingId(source: RecordingSource): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 9)

    switch (source) {
        case 'app':
            return `recording-${timestamp}-${random}`
        case 'external':
            return `imported-${timestamp}-${random}`
        case 'library':
            return `lib-${timestamp}-${random}`
    }
}

// ============================================================================
// Capability Detection
// ============================================================================

/**
 * Determine recording capabilities based on source and available data.
 * 
 * - app recordings: check if metadata or chunk files exist
 * - external recordings: no metadata capabilities
 * - library recordings: check if metadata was successfully loaded
 */
function detectCapabilities(options: CreateRecordingOptions): RecordingCapabilities {
    // Allow explicit override
    if (options.capabilitiesOverride) {
        return options.capabilitiesOverride
    }

    // External recordings have no cursor/keyboard data
    if (options.source === 'external') {
        return {
            hasCursorData: false,
            hasKeystrokeData: false,
            hasScrollData: false,
            hasScreenData: false,
        }
    }

    // Check inline metadata first
    const meta = options.metadata
    if (meta) {
        return {
            hasCursorData: (meta.mouseEvents?.length ?? 0) > 0 || (meta.clickEvents?.length ?? 0) > 0,
            hasKeystrokeData: (meta.keyboardEvents?.length ?? 0) > 0,
            hasScrollData: (meta.scrollEvents?.length ?? 0) > 0,
            hasScreenData: (meta.screenEvents?.length ?? 0) > 0,
        }
    }

    // Check if chunk files are available (will be loaded lazily)
    const chunks = options.metadataChunks
    if (chunks) {
        return {
            hasCursorData: (chunks.mouse?.length ?? 0) > 0 || (chunks.click?.length ?? 0) > 0,
            hasKeystrokeData: (chunks.keyboard?.length ?? 0) > 0,
            hasScrollData: (chunks.scroll?.length ?? 0) > 0,
            hasScreenData: (chunks.screen?.length ?? 0) > 0,
        }
    }

    // No metadata information available - assume no capabilities
    return {
        hasCursorData: false,
        hasKeystrokeData: false,
        hasScrollData: false,
        hasScreenData: false,
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a recording object with proper defaults and capabilities.
 * 
 * This is the single entry point for creating all recording objects.
 * It ensures consistent structure and explicit capabilities.
 * 
 * @example
 * // External video import
 * const recording = createRecording({
 *   type: 'video',
 *   source: 'external',
 *   filePath: '/path/to/video.mp4',
 *   duration: 5000,
 *   width: 1920,
 *   height: 1080,
 * })
 * 
 * @example
 * // App recording with metadata
 * const recording = createRecording({
 *   type: 'video',
 *   source: 'app',
 *   filePath: '/path/to/recording.mp4',
 *   duration: 10000,
 *   width: 1920,
 *   height: 1080,
 *   folderPath: '/path/to/recording-folder',
 *   metadataChunks: { mouse: ['mouse-0.json'], keyboard: ['keyboard-0.json'] },
 * })
 */
export function createRecording(options: CreateRecordingOptions): Recording {
    const id = generateRecordingId(options.source)
    const capabilities = detectCapabilities(options)

    // Build base properties
    const base = {
        id,
        duration: options.duration,
        width: options.width,
        height: options.height,
        frameRate: options.frameRate ?? 30,
        hasAudio: options.hasAudio ?? false,
        effects: [],
        filePath: options.filePath,
        isExternal: options.source === 'external',
        capabilities,
        // Only include optional fields if they have values
        ...(options.metadata && { metadata: options.metadata }),
        ...(options.folderPath && { folderPath: options.folderPath }),
        ...(options.metadataChunks && { metadataChunks: options.metadataChunks }),
    }

    // Build type-specific recording
    if (options.type === 'image') {
        const imageRecording: ImageRecording = {
            ...base,
            sourceType: 'image',
            imageSource: options.imageSource ?? {
                imagePath: options.filePath,
                sourceWidth: options.width,
                sourceHeight: options.height,
            },
        }
        return imageRecording
    }

    // Default: video recording
    const videoRecording: VideoRecording = {
        ...base,
        sourceType: 'video',
    }
    return videoRecording
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a recording has cursor data available.
 * Uses capabilities if set, falls back to checking fields.
 */
export function hasCursorData(recording: Recording): boolean {
    // Check explicit capabilities first
    if (recording.capabilities?.hasCursorData !== undefined) {
        return recording.capabilities.hasCursorData
    }

    // Fallback: infer from fields (backward compatibility)
    if (recording.isExternal) {
        return false
    }

    // Check inline metadata
    if (recording.metadata) {
        return (recording.metadata.mouseEvents?.length ?? 0) > 0 ||
            (recording.metadata.clickEvents?.length ?? 0) > 0
    }

    // Check if chunk files exist
    if (recording.metadataChunks) {
        return (recording.metadataChunks.mouse?.length ?? 0) > 0 ||
            (recording.metadataChunks.click?.length ?? 0) > 0
    }

    return false
}

/**
 * Check if a recording has keystroke data available.
 */
export function hasKeystrokeData(recording: Recording): boolean {
    if (recording.capabilities?.hasKeystrokeData !== undefined) {
        return recording.capabilities.hasKeystrokeData
    }

    if (recording.isExternal) {
        return false
    }

    if (recording.metadata) {
        return (recording.metadata.keyboardEvents?.length ?? 0) > 0
    }

    if (recording.metadataChunks) {
        return (recording.metadataChunks.keyboard?.length ?? 0) > 0
    }

    return false
}

/**
 * Check if metadata loading should be skipped for this recording.
 * Returns true if the recording definitively has no metadata to load.
 */
export function shouldSkipMetadataLoading(recording: Recording): boolean {
    // External recordings never have loadable metadata
    if (recording.isExternal) {
        return true
    }

    // Explicit capabilities: skip if no cursor data
    if (recording.capabilities?.hasCursorData === false) {
        return true
    }

    // No paths to load from
    if (!recording.folderPath && !recording.metadataChunks && !recording.metadata) {
        return true
    }

    return false
}
