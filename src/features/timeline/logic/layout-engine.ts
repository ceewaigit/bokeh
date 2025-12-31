/**
 * Layout Engine - Single-Pass Calculation Service
 * 
 * Centralizes all "where is this pixel" math into a single, pure JavaScript service.
 * This eliminates the "Calculation Tax" by consolidating:
 * - Video position calculation (from video-position.ts)
 * - Mockup position calculation (from mockup-transform.ts)
 * - Zoom, crop, and 3D transforms (from transform hooks)
 * - Clip data resolution and renderable item calculation (moved from hooks)
 * 
 * PIVOT STANDARDIZATION: All coordinates use Top-Left (0,0) as origin.
 */

import type { Effect, BackgroundEffect, DeviceMockupData, Recording } from '@/types/project'
import { DeviceModel } from '@/types/project'
import { resolveMockupMetadata } from '@/lib/mockups/mockup-metadata'
import { DEVICE_MOCKUPS } from '@/lib/constants/device-mockups'

import { getActiveBackgroundEffect, getActiveCropEffect, getCropData } from '@/features/effects/effect-filters'
import { calculateCropTransform, getCropTransformString, combineCropAndZoomTransforms } from '@/remotion/compositions/utils/transforms/crop-transform'
import { calculateScreenTransform } from '@/remotion/compositions/utils/transforms/screen-transform'
import { DEFAULT_BACKGROUND_DATA } from '@/lib/constants/default-effects'
import { REFERENCE_WIDTH, REFERENCE_HEIGHT } from '@/lib/constants/layout'

// Logic imports
import type { ActiveClipDataAtFrame } from '@/types/remotion'
import type { FrameLayoutItem, PersistedVideoState, BoundaryOverlapState } from '@/features/timeline/utils/frame-layout'
import { getVisibleFrameLayout } from '@/features/timeline/utils/frame-layout'
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame'
import { applyInheritance } from '@/features/effects/effect-inheritance'

import { getMaxZoomScale } from '@/remotion/hooks/media/useVideoUrl'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of mockup position calculations.
 * All positions are in canvas coordinate space.
 */
export interface MockupPositionResult {
    // Mockup frame position and size (relative to canvas)
    mockupX: number
    mockupY: number
    mockupWidth: number
    mockupHeight: number

    // Screen region within the mockup (where video is placed)
    screenX: number
    screenY: number
    screenWidth: number
    screenHeight: number
    screenCornerRadius: number

    // Video position within the screen region
    videoX: number
    videoY: number
    videoWidth: number
    videoHeight: number

    // Scale factor applied to the mockup
    mockupScale: number
}

// Extended type to include calculated source time for consumers
export interface ResolvedVideoState extends PersistedVideoState {
    sourceTimeMs: number;
}

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
    
    // Zoom limits
    maxZoomScale: number

    // Clip Data & Renderable Items (New)
    effectiveClipData: ActiveClipDataAtFrame | null
    persistedVideoState: ResolvedVideoState | null
    renderableItems: FrameLayoutItem[]
    
    // Boundary State (Pass-through for renderers)
    boundaryState: BoundaryOverlapState | undefined
    
    // Layout Items (Resolved visual items)
    layoutItems: {
        active: FrameLayoutItem | null
        prev: FrameLayoutItem | null
        next: FrameLayoutItem | null
    }
}

/**
 * Options for calculating a frame snapshot.
 */
export interface FrameSnapshotOptions {
    // Time & Dimensions
    currentTimeMs: number
    currentFrame: number
    fps: number
    compositionWidth: number
    compositionHeight: number

    // Source dimensions (fallbacks)
    videoWidth: number
    videoHeight: number
    sourceVideoWidth?: number
    sourceVideoHeight?: number
    recordingWidth?: number
    recordingHeight?: number

    // Data Sources
    frameLayout: FrameLayoutItem[]
    recordingsMap: Map<string, Recording>
    activeClipData: ActiveClipDataAtFrame | null
    clipEffects: Effect[]
    
    // Services
    getRecording: (id: string) => Recording | null | undefined
    
    // Camera/Zoom state
    zoomTransform?: Record<string, unknown> | null
    zoomTransformStr?: string
    
    // Boundary/Stability State
    boundaryState?: {
        isNearBoundaryStart: boolean;
        isNearBoundaryEnd: boolean;
        activeLayoutItem: FrameLayoutItem | null;
        prevLayoutItem: FrameLayoutItem | null;
        nextLayoutItem: FrameLayoutItem | null;
        shouldHoldPrevFrame: boolean;
        overlapFrames?: number;
    }
    
    // Persistence/Fallback (for stability across frames)
    lastValidClipData?: ActiveClipDataAtFrame | null
    prevRenderableItems?: FrameLayoutItem[]
    
    // Flags
    isRendering: boolean
    isEditingCrop?: boolean
}

// =============================================================================
// LAYOUT CALCULATION LOGIC (Consolidated)
// =============================================================================

/**
 * Shared utility for calculating video position with padding.
 * Standardized on Top-Left (0,0) origin.
 */
export function calculateVideoPosition(
    containerWidth: number,
    containerHeight: number,
    videoWidth: number,
    videoHeight: number,
    padding: number
) {
    // Calculate the available area after padding
    const availableWidth = containerWidth - (padding * 2);
    const availableHeight = containerHeight - (padding * 2);

    // Calculate the scale to fit the video within the available area while maintaining aspect ratio
    const videoAspectRatio = videoWidth / videoHeight;
    const containerAspectRatio = availableWidth / availableHeight;

    let drawWidth: number;
    let drawHeight: number;

    if (videoAspectRatio > containerAspectRatio) {
        // Video is wider than container - fit by width
        drawWidth = availableWidth;
        drawHeight = availableWidth / videoAspectRatio;
    } else {
        // Video is taller than container - fit by height
        drawHeight = availableHeight;
        drawWidth = availableHeight * videoAspectRatio;
    }

    // Center the video within the available area
    const offsetX = padding + (availableWidth - drawWidth) / 2;
    const offsetY = padding + (availableHeight - drawHeight) / 2;

    return { drawWidth, drawHeight, offsetX, offsetY };
}

/**
 * Calculate how the video fits within the screen region.
 * Helper for Mockup Positioning.
 */
function calculateVideoFit(
    screenWidth: number,
    screenHeight: number,
    videoWidth: number,
    videoHeight: number,
): { x: number; y: number; width: number; height: number } {
    const screenAspect = screenWidth / screenHeight
    const videoAspect = videoWidth / videoHeight

    // Default to fill to avoid letterbox/pillarbox inside mockups.
    let width: number
    let height: number
    if (videoAspect > screenAspect) {
        // Video is wider - fit to height, crop width
        height = screenHeight
        width = screenHeight * videoAspect
    } else {
        // Video is taller - fit to width, crop height
        width = screenWidth
        height = screenWidth / videoAspect
    }
    return {
        x: (screenWidth - width) / 2,
        y: (screenHeight - height) / 2,
        width,
        height
    }
}

/**
 * Calculate the position of a device mockup and video within the canvas.
 *
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param mockupData - Device mockup configuration
 * @param sourceVideoWidth - Original video width
 * @param sourceVideoHeight - Original video height
 * @param padding - Padding around the mockup
 * @returns Position calculations for mockup and video
 */
export function calculateMockupPosition(
    canvasWidth: number,
    canvasHeight: number,
    mockupData: DeviceMockupData,
    sourceVideoWidth: number,
    sourceVideoHeight: number,
    padding: number = 60
): MockupPositionResult | null {
    // Get mockup metadata
    const metadata = resolveMockupMetadata(mockupData)
    if (!metadata) {
        return null
    }

    // Available space after padding
    const availableWidth = canvasWidth - padding * 2
    const availableHeight = canvasHeight - padding * 2

    // Calculate scale to fit mockup within available space
    const mockupAspect = metadata.dimensions.width / metadata.dimensions.height
    const availableAspect = availableWidth / availableHeight

    let mockupScale: number
    if (mockupAspect > availableAspect) {
        // Mockup is wider than available space - fit to width
        mockupScale = availableWidth / metadata.dimensions.width
    } else {
        // Mockup is taller than available space - fit to height
        mockupScale = availableHeight / metadata.dimensions.height
    }

    // Calculate scaled mockup dimensions
    const rawMockupWidth = metadata.dimensions.width * mockupScale
    const rawMockupHeight = metadata.dimensions.height * mockupScale

    // Center mockup in canvas
    const rawMockupX = (canvasWidth - rawMockupWidth) / 2
    const rawMockupY = (canvasHeight - rawMockupHeight) / 2

    const mockupWidth = Math.round(rawMockupWidth)
    const mockupHeight = Math.round(rawMockupHeight)
    const mockupX = Math.round(rawMockupX)
    const mockupY = Math.round(rawMockupY)

    // Calculate screen region (scaled) with consistent edge rounding.
    const screenLeft = mockupX + Math.round(metadata.screenRegion.x * mockupScale)
    const screenTop = mockupY + Math.round(metadata.screenRegion.y * mockupScale)
    const screenRight = mockupX + Math.round((metadata.screenRegion.x + metadata.screenRegion.width) * mockupScale)
    const screenBottom = mockupY + Math.round((metadata.screenRegion.y + metadata.screenRegion.height) * mockupScale)
    const screenX = screenLeft
    const screenY = screenTop
    const screenWidth = Math.max(0, screenRight - screenLeft)
    const screenHeight = Math.max(0, screenBottom - screenTop)
    const screenCornerRadius = Math.round(metadata.screenRegion.cornerRadius * mockupScale)

    // Calculate video position within screen based on fit mode
    const videoPosition = calculateVideoFit(
        screenWidth,
        screenHeight,
        sourceVideoWidth,
        sourceVideoHeight
    )

    return {
        mockupX,
        mockupY,
        mockupWidth,
        mockupHeight,
        screenX,
        screenY,
        screenWidth,
        screenHeight,
        screenCornerRadius,
        videoX: screenX + Math.round(videoPosition.x),
        videoY: screenY + Math.round(videoPosition.y),
        videoWidth: Math.round(videoPosition.width),
        videoHeight: Math.round(videoPosition.height),
        mockupScale
    }
}

/**
 * Get the mockup SVG path for a device model.
 */
export function getMockupSvgPath(model: DeviceModel): string | undefined {
    return DEVICE_MOCKUPS[model]?.svgPath
}

/**
 * Check if a point is within the mockup screen region.
 */
export function isPointInScreen(
    x: number,
    y: number,
    mockupPosition: MockupPositionResult
): boolean {
    return (
        x >= mockupPosition.screenX &&
        x <= mockupPosition.screenX + mockupPosition.screenWidth &&
        y >= mockupPosition.screenY &&
        y <= mockupPosition.screenY + mockupPosition.screenHeight
    )
}

/**
 * Convert a position from video coordinates to canvas coordinates.
 * Used for positioning cursor and other overlays correctly when mockup is enabled.
 */
export function videoToCanvasCoordinates(
    videoX: number,
    videoY: number,
    mockupPosition: MockupPositionResult,
    videoWidth: number,
    videoHeight: number
): { x: number; y: number } {
    // Normalize to 0-1 range
    const normalizedX = videoX / videoWidth
    const normalizedY = videoY / videoHeight

    // Map to canvas coordinates within the video area
    const canvasX = mockupPosition.videoX + normalizedX * mockupPosition.videoWidth
    const canvasY = mockupPosition.videoY + normalizedY * mockupPosition.videoHeight

    return { x: canvasX, y: canvasY }
}

/**
 * Convert canvas coordinates back to video coordinates.
 */
export function canvasToVideoCoordinates(
    canvasX: number,
    canvasY: number,
    mockupPosition: MockupPositionResult,
    videoWidth: number,
    videoHeight: number
): { x: number; y: number } {
    // Normalize to 0-1 within the video area
    const normalizedX = (canvasX - mockupPosition.videoX) / mockupPosition.videoWidth
    const normalizedY = (canvasY - mockupPosition.videoY) / mockupPosition.videoHeight

    // Map to video coordinates
    const videoX = normalizedX * videoWidth
    const videoY = normalizedY * videoHeight

    return { x: videoX, y: videoY }
}


// =============================================================================
// MAIN CALCULATION FUNCTION
// =============================================================================

/**
 * Calculate the complete render state for a frame.
 * 
 * This performs a "Single Pass" through all layout calculations:
 * 1. Clip Data Resolution
 * 2. Renderable Items Calculation
 * 3. Video/Mockup positioning
 * 4. Crop transform
 * 5. Zoom transform (from camera path)
 * 6. 3D screen transform
 * 7. High-res scale calculation
 * 
 * @param options - Frame calculation options
 * @returns Complete FrameSnapshot for rendering
 */
export function calculateFrameSnapshot(options: FrameSnapshotOptions): FrameSnapshot {
    const {
        // Time & Dimensions
        currentTimeMs,
        currentFrame,
        fps,
        compositionWidth,
        compositionHeight,
        videoWidth,
        videoHeight,
        sourceVideoWidth,
        sourceVideoHeight,
        
        // Data Sources
        frameLayout,
        activeClipData,
        clipEffects,
        getRecording,
        
        // Transforms
        zoomTransform = null,
        zoomTransformStr = '',
        
        // State
        boundaryState,
        lastValidClipData,
        isRendering,
        isEditingCrop = false,
    } = options

    // ==========================================================================
    // STEP 1: Clip Data Resolution (Effective Clip)
    // ==========================================================================
    
    // Calculate effective clip data (handling inheritance and boundaries)
    const { effectiveClipData, persistedVideoState } = calculateEffectiveClipData({
        activeClipData,
        currentFrame,
        frameLayout,
        fps,
        effects: clipEffects,
        getRecording,
        isRendering,
        boundaryState,
        lastValidClipData
    });

    // Use resolved dimensions if available, otherwise fallbacks
    const activeSourceWidth = effectiveClipData?.recording.width || options.recordingWidth || sourceVideoWidth || videoWidth
    const activeSourceHeight = effectiveClipData?.recording.height || options.recordingHeight || sourceVideoHeight || videoHeight
    
    // Resolve effects from effective clip (if different from passed effects)
    const resolvedEffects = effectiveClipData?.effects ?? clipEffects;

    // ==========================================================================
    // STEP 2: Renderable Items
    // ==========================================================================

    const renderableItems = calculateRenderableItems(options);

    // ==========================================================================
    // STEP 3: Layout Calculation
    // ==========================================================================

    // Get background effect data
    const backgroundEffect = getActiveBackgroundEffect(resolvedEffects, currentTimeMs) as BackgroundEffect | undefined
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

    // Calculate video position
    const vidPos = calculateVideoPosition(
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
    // STEP 4: Transform Calculation
    // ==========================================================================

    // Crop transform
    const cropEffect = getActiveCropEffect(resolvedEffects, currentTimeMs)
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
    const extra3DTransform = calculateScreenTransform(resolvedEffects, currentTimeMs)
    const combinedZoomCrop = combineCropAndZoomTransforms(cropTransformStr, zoomTransformStr)
    const combinedTransform = extra3DTransform
        ? `${extra3DTransform} ${combinedZoomCrop}`.trim()
        : combinedZoomCrop

    // ==========================================================================
    // STEP 5: High-Res Scale Calculation
    // ==========================================================================

    // Calculate the scale needed to fit source media into the composition
    const drawWidth = Math.round(vidPos.drawWidth)
    const drawHeight = Math.round(vidPos.drawHeight)

    const highResScaleX = activeSourceWidth > 0 ? drawWidth / activeSourceWidth : 1
    const highResScaleY = activeSourceHeight > 0 ? drawHeight / activeSourceHeight : 1
    
    // Calculate max zoom scale from effects
    const maxZoomScale = getMaxZoomScale(clipEffects);

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
        
        maxZoomScale,

        effectiveClipData,
        persistedVideoState,
        renderableItems,
        boundaryState: boundaryState ? {
            isNearBoundaryStart: boundaryState.isNearBoundaryStart,
            isNearBoundaryEnd: boundaryState.isNearBoundaryEnd,
            shouldHoldPrevFrame: boundaryState.shouldHoldPrevFrame,
            overlapFrames: boundaryState.overlapFrames || 0
        } : undefined,
        
        layoutItems: {
            active: boundaryState?.activeLayoutItem ?? null,
            prev: boundaryState?.prevLayoutItem ?? null,
            next: boundaryState?.nextLayoutItem ?? null
        }
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

// =============================================================================
// INTERNAL HELPERS (Moved from Hooks)
// =============================================================================

function calculateEffectiveClipData(options: {
    activeClipData: ActiveClipDataAtFrame | null
    currentFrame: number
    frameLayout: FrameLayoutItem[]
    fps: number
    effects: Effect[]
    getRecording: (id: string) => Recording | null | undefined
    isRendering: boolean
    boundaryState?: FrameSnapshotOptions['boundaryState']
    lastValidClipData?: ActiveClipDataAtFrame | null
}): { effectiveClipData: ActiveClipDataAtFrame | null, persistedVideoState: ResolvedVideoState | null } {
    const {
        activeClipData,
        currentFrame,
        frameLayout,
        fps,
        effects,
        getRecording,
        isRendering,
        boundaryState,
        lastValidClipData
    } = options

    let clipData = activeClipData;

    // 1. BOUNDARY FALLBACK
    if (!clipData && !isRendering && boundaryState) {
        const { isNearBoundaryStart, isNearBoundaryEnd, prevLayoutItem, nextLayoutItem, activeLayoutItem } = boundaryState;
        
        if (isNearBoundaryStart && prevLayoutItem && activeLayoutItem) {
            clipData = getActiveClipDataAtFrame({
                frame: activeLayoutItem.startFrame - 1,
                frameLayout,
                fps,
                effects,
                getRecording,
            });
        } else if (isNearBoundaryEnd && nextLayoutItem) {
            clipData = getActiveClipDataAtFrame({
                frame: nextLayoutItem.startFrame,
                frameLayout,
                fps,
                effects,
                getRecording,
            });
        }
    }

    if (!clipData && lastValidClipData && !isRendering) {
        clipData = lastValidClipData;
    }

    // 2. RESOLVE PERSISTED/INHERITED VIDEO STATE
    const isVisualSource = (rec: Recording | null | undefined) =>
        rec && (rec.sourceType === 'video' || rec.sourceType === 'image');

    let persistedVideoState: ResolvedVideoState | null = null;
    const activeLayoutItem = boundaryState?.activeLayoutItem ?? null;

    if (activeLayoutItem?.persistedVideoState) {
        // Strategy 1: Explicit constraint from layout (Pre-computed)
        const state = activeLayoutItem.persistedVideoState;

        // Calculate current source time on the background video
        let currentSourceTimeMs: number;

        if (state.isFrozen) {
            // If frozen, do NOT advance time. Stick to the clamped base time.
            currentSourceTimeMs = state.baseSourceTimeMs;
        } else {
            // Normal playback: advance time based on how far we are into the overlay
            const framesIntoOverlay = currentFrame - activeLayoutItem.startFrame;
            const msIntoOverlay = (framesIntoOverlay / fps) * 1000;
            currentSourceTimeMs = state.baseSourceTimeMs + (msIntoOverlay * (state.clip.playbackRate || 1));
        }

        persistedVideoState = {
            ...state,
            sourceTimeMs: currentSourceTimeMs
        };
    }
    else if (isVisualSource(clipData?.recording) && activeLayoutItem && clipData) {
        // Strategy 2: Self is visual
        persistedVideoState = {
            recording: clipData.recording,
            clip: clipData.clip,
            layoutItem: activeLayoutItem,
            baseSourceTimeMs: clipData.sourceTimeMs,
            sourceTimeMs: clipData.sourceTimeMs,
            isFrozen: false,
        };
    }

    // 3. APPLY INHERITANCE
    if (
        clipData &&
        clipData.recording.sourceType === 'generated' &&
        persistedVideoState &&
        isVisualSource(persistedVideoState.recording)
    ) {
        clipData = applyInheritance({
            clipData,
            persistedState: persistedVideoState,
            currentFrame,
            frameLayout,
            fps,
            effects,
            getRecording,
        });
    }

    return {
        effectiveClipData: clipData,
        persistedVideoState,
    };
}

function calculateRenderableItems(options: FrameSnapshotOptions): FrameLayoutItem[] {
    const {
        frameLayout,
        currentFrame,
        fps,
        isRendering,
        recordingsMap,
        boundaryState,
        prevRenderableItems = []
    } = options
    
    // Default to safe values if boundary state is missing
    const isNearBoundaryEnd = boundaryState?.isNearBoundaryEnd ?? false
    const shouldHoldPrevFrame = boundaryState?.shouldHoldPrevFrame ?? false
    const prevLayoutItem = boundaryState?.prevLayoutItem ?? null
    const nextLayoutItem = boundaryState?.nextLayoutItem ?? null

    const items = getVisibleFrameLayout({
        frameLayout,
        currentFrame,
        fps,
        isRendering,
        prevLayoutItem,
        nextLayoutItem,
        shouldHoldPrevFrame,
        isNearBoundaryEnd,
    });

    // Deduplicate by groupId (O(N) with Map vs O(N²) with filter)
    const uniqueItems = new Map<string, FrameLayoutItem>();
    for (const item of items) {
        if (!uniqueItems.has(item.groupId)) {
            uniqueItems.set(item.groupId, item);
        }
    }

    let sortedItems = Array.from(uniqueItems.values()).sort(
        (a, b) => a.startFrame - b.startFrame
    );

    // MEMORY CAP: Maximum 3 video clips mounted at once to prevent VTDecoder exhaustion
    const MAX_VIDEO_CLIPS = 3;
    const videoItems = sortedItems.filter(
        (item) => recordingsMap.get(item.clip.recordingId)?.sourceType === 'video'
    );
    if (videoItems.length > MAX_VIDEO_CLIPS) {
        // Keep closest to currentFrame
        const byDistance = videoItems
            .map((item) => ({ item, dist: Math.abs(item.startFrame - currentFrame) }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, MAX_VIDEO_CLIPS)
            .map(({ item }) => item);

        const nonVideoItems = sortedItems.filter(
            (item) => recordingsMap.get(item.clip.recordingId)?.sourceType !== 'video'
        );
        sortedItems = [...nonVideoItems, ...byDistance].sort(
            (a, b) => a.startFrame - b.startFrame
        );
    }

    // STABILITY FIX: Return previous array reference if groupIds haven't changed
    const currentIds = sortedItems.map((i) => i.groupId).join(',');
    
    // We can't check ref equality here easily without passing the ID string from outside.
    // Instead, we check if the content matches. 
    // Optimization: If the caller provided prevRenderableItems, check if IDs match.
    if (prevRenderableItems.length > 0) {
        const prevIds = prevRenderableItems.map(i => i.groupId).join(',');
        if (currentIds === prevIds) {
            return prevRenderableItems;
        }
    }

    return sortedItems;
}
