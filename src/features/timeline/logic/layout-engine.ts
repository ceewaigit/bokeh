/**
 * Layout Engine - Single-Pass Calculation Service
 * 
 * Centralizes all "where is this pixel" math into a single, pure JavaScript service.
 * This eliminates the "Calculation Tax" by consolidating:
 * - Video position calculation (from video-position.ts)
 * - Mockup position calculation (from mockup-transform.ts)
 * - Zoom, crop, and 3D transforms (from transform hooks)
 * 
 * PIVOT STANDARDIZATION: All coordinates use Top-Left (0,0) as origin.
 */

import type { Effect, BackgroundEffect } from '@/types/project'
import type { MockupPositionResult } from '@/lib/mockups/mockup-transform'

import { calculateVideoPosition as calcVideoPos } from '@/remotion/compositions/utils/layout/video-position'
import { calculateMockupPosition } from '@/lib/mockups/mockup-transform'
import { getActiveBackgroundEffect, getActiveCropEffect, getCropData } from '@/features/effects/effect-filters'
import { calculateCropTransform, getCropTransformString, combineCropAndZoomTransforms } from '@/remotion/compositions/utils/transforms/crop-transform'
import { calculateScreenTransform } from '@/remotion/compositions/utils/transforms/screen-transform'
import { DEFAULT_BACKGROUND_DATA } from '@/lib/constants/default-effects'
import { REFERENCE_WIDTH, REFERENCE_HEIGHT } from '@/lib/constants/layout'

// =============================================================================
// TYPES
// =============================================================================

/**
 * FrameSnapshot - Complete render state for a single frame.
 * 
 * This is the Single Source of Truth for rendering any frame.
 * CursorLayer, VideoClipRenderer, and MotionBlurCanvas all pull from this.
 */
export interface FrameSnapshot {
    // Layout dimensions (in composition coordinates)
    layout: {
        drawWidth: number
        drawHeight: number
        offsetX: number
        offsetY: number
        padding: number
        paddingScaled: number
        scaleFactor: number
        cornerRadius: number
        shadowIntensity: number
        activeSourceWidth: number
        activeSourceHeight: number
    }

    // Mockup state
    mockup: {
        enabled: boolean
        data: any
        position: MockupPositionResult | null
    }

    // Transform strings (ready for CSS)
    transforms: {
        crop: string
        zoom: string
        screen3D: string
        combined: string
        clipPath: string | undefined
    }

    // High-res scale for source media fitting
    highResScale: { x: number; y: number }

    // Camera/Zoom state
    camera: {
        zoomTransform: Record<string, unknown> | null
        velocity: { x: number; y: number }
    }
}

/**
 * Options for calculating a frame snapshot.
 */
export interface FrameSnapshotOptions {
    // Time in milliseconds
    currentTimeMs: number

    // Composition dimensions
    compositionWidth: number
    compositionHeight: number

    // Source dimensions (fallbacks)
    videoWidth: number
    videoHeight: number
    sourceVideoWidth?: number
    sourceVideoHeight?: number
    recordingWidth?: number
    recordingHeight?: number

    // Effects for the active clip
    clipEffects: Effect[]

    // Camera/Zoom state (precomputed from camera-calculator)
    zoomTransform?: Record<string, unknown> | null
    zoomTransformStr?: string

    // Editing states
    isEditingCrop?: boolean
}

// =============================================================================
// MAIN CALCULATION FUNCTION
// =============================================================================

/**
 * Calculate the complete render state for a frame.
 * 
 * This performs a "Single Pass" through all layout calculations:
 * 1. Video/Mockup positioning
 * 2. Crop transform
 * 3. Zoom transform (from camera path)
 * 4. 3D screen transform
 * 5. High-res scale calculation
 * 
 * @param options - Frame calculation options
 * @returns Complete FrameSnapshot for rendering
 */
export function calculateFrameSnapshot(options: FrameSnapshotOptions): FrameSnapshot {
    const {
        currentTimeMs,
        compositionWidth,
        compositionHeight,
        videoWidth,
        videoHeight,
        sourceVideoWidth,
        sourceVideoHeight,
        recordingWidth,
        recordingHeight,
        clipEffects,
        zoomTransform = null,
        zoomTransformStr = '',
        isEditingCrop = false,
    } = options

    // ==========================================================================
    // STEP 1: Layout Calculation
    // ==========================================================================

    // Get background effect data
    const backgroundEffect = getActiveBackgroundEffect(clipEffects, currentTimeMs) as BackgroundEffect | undefined
    const backgroundData = backgroundEffect?.data || null

    // Calculate scale factor
    const scaleFactor = Math.min(
        compositionWidth / REFERENCE_WIDTH,
        compositionHeight / REFERENCE_HEIGHT
    )

    // Extract background properties
    const padding = backgroundData?.padding ?? DEFAULT_BACKGROUND_DATA.padding
    const paddingScaled = padding * scaleFactor
    const cornerRadius = (backgroundData?.cornerRadius ?? DEFAULT_BACKGROUND_DATA.cornerRadius ?? 0) * scaleFactor
    const shadowIntensity = backgroundData?.shadowIntensity ?? DEFAULT_BACKGROUND_DATA.shadowIntensity ?? 0
    const mockupData = backgroundData?.mockup
    const mockupEnabled = mockupData?.enabled ?? false

    // Source dimensions
    const activeSourceWidth = recordingWidth || sourceVideoWidth || videoWidth
    const activeSourceHeight = recordingHeight || sourceVideoHeight || videoHeight

    // Calculate video position
    const vidPos = calcVideoPos(
        compositionWidth,
        compositionHeight,
        activeSourceWidth,
        activeSourceHeight,
        paddingScaled
    )

    // Calculate mockup position if enabled
    let mockupPosition: MockupPositionResult | null = null
    if (mockupEnabled && mockupData) {
        mockupPosition = calculateMockupPosition(
            compositionWidth,
            compositionHeight,
            mockupData,
            activeSourceWidth,
            activeSourceHeight,
            paddingScaled
        )
    }

    // ==========================================================================
    // STEP 2: Transform Calculation
    // ==========================================================================

    // Crop transform
    const cropEffect = getActiveCropEffect(clipEffects, currentTimeMs)
    const resolvedCropData = isEditingCrop || !cropEffect
        ? null
        : getCropData(cropEffect)

    const cropBaseWidth = mockupEnabled && mockupPosition
        ? mockupPosition.videoWidth
        : Math.round(vidPos.drawWidth)
    const cropBaseHeight = mockupEnabled && mockupPosition
        ? mockupPosition.videoHeight
        : Math.round(vidPos.drawHeight)

    const cropTransform = calculateCropTransform(
        resolvedCropData,
        cropBaseWidth,
        cropBaseHeight
    )
    const cropTransformStr = getCropTransformString(cropTransform)

    // Clip-path with corner radius
    const cropClipPath = cropTransform.isActive && cropTransform.clipPath && cornerRadius > 0
        ? `${cropTransform.clipPath.slice(0, -1)} round ${cornerRadius / cropTransform.scale}px)`
        : cropTransform.clipPath

    // 3D Screen transform
    const extra3DTransform = calculateScreenTransform(clipEffects, currentTimeMs)
    const combinedZoomCrop = combineCropAndZoomTransforms(cropTransformStr, zoomTransformStr)
    const combinedTransform = extra3DTransform
        ? `${extra3DTransform} ${combinedZoomCrop}`.trim()
        : combinedZoomCrop

    // ==========================================================================
    // STEP 3: High-Res Scale Calculation
    // ==========================================================================

    // Calculate the scale needed to fit source media into the composition
    // This prevents the "Zoom to Top-Left" bug by using explicit scaling
    const drawWidth = Math.round(vidPos.drawWidth)
    const drawHeight = Math.round(vidPos.drawHeight)

    const highResScaleX = activeSourceWidth > 0 ? drawWidth / activeSourceWidth : 1
    const highResScaleY = activeSourceHeight > 0 ? drawHeight / activeSourceHeight : 1

    // ==========================================================================
    // RETURN FRAME SNAPSHOT
    // ==========================================================================

    return {
        layout: {
            drawWidth,
            drawHeight,
            offsetX: Math.round(vidPos.offsetX),
            offsetY: Math.round(vidPos.offsetY),
            padding,
            paddingScaled,
            scaleFactor,
            cornerRadius,
            shadowIntensity,
            activeSourceWidth,
            activeSourceHeight,
        },

        mockup: {
            enabled: mockupEnabled,
            data: mockupData,
            position: mockupPosition,
        },

        transforms: {
            crop: isEditingCrop ? '' : cropTransformStr,
            zoom: isEditingCrop ? '' : zoomTransformStr,
            screen3D: isEditingCrop ? '' : extra3DTransform,
            combined: isEditingCrop ? '' : combinedTransform,
            clipPath: cropClipPath || undefined,
        },

        highResScale: {
            x: highResScaleX,
            y: highResScaleY,
        },

        camera: {
            zoomTransform: isEditingCrop ? null : zoomTransform,
            velocity: { x: 0, y: 0 }, // Caller should update from camera path
        },
    }
}

// =============================================================================
// HELPER: Convert video coordinates to composition coordinates
// =============================================================================

/**
 * Convert a position from video space to composition space.
 * Useful for cursor positioning that needs to stay pinned during zooms.
 */
export function videoToCompositionCoords(
    videoX: number,
    videoY: number,
    snapshot: FrameSnapshot
): { x: number; y: number } {
    const { layout, mockup } = snapshot

    // Normalize to 0-1 range
    const normalizedX = layout.activeSourceWidth > 0
        ? videoX / layout.activeSourceWidth
        : 0
    const normalizedY = layout.activeSourceHeight > 0
        ? videoY / layout.activeSourceHeight
        : 0

    // If mockup is enabled, account for mockup positioning
    if (mockup.enabled && mockup.position) {
        const mp = mockup.position
        return {
            x: mp.videoX + normalizedX * mp.videoWidth,
            y: mp.videoY + normalizedY * mp.videoHeight,
        }
    }

    // Standard video positioning
    return {
        x: layout.offsetX + normalizedX * layout.drawWidth,
        y: layout.offsetY + normalizedY * layout.drawHeight,
    }
}
