/**
 * useFrameSnapshot Hook
 * 
 * REPLACES: useLayoutCalculation + useTransformCalculation + useEffectiveClipData + useRenderableItems
 * 
 * Single hook that consolidates all layout, transform, and clip resolution calculations,
 * eliminating the "hook tax" of calling multiple hooks.
 * 
 * Uses the pure layout-engine service for calculations.
 */

import { useRef, useEffect, useMemo } from 'react'
import { calculateFrameSnapshot, type FrameSnapshot } from '@/features/timeline/logic/layout-engine'
import type { Effect, Recording } from '@/types/project'
import type { ActiveClipDataAtFrame } from '@/types/remotion'
import type { FrameLayoutItem } from '@/features/timeline/utils/frame-layout'

// Re-export FrameSnapshot type for consumers
export type { FrameSnapshot } from '@/features/timeline/logic/layout-engine'

export interface UseFrameSnapshotOptions {
    // Time & Dimensions
    currentTimeMs: number
    currentFrame: number
    fps: number
    compositionWidth: number
    compositionHeight: number

    // Video dimensions (fallbacks)
    videoWidth: number
    videoHeight: number
    sourceVideoWidth?: number
    sourceVideoHeight?: number

    // Recording dimensions  
    recordingWidth?: number
    recordingHeight?: number

    // Data Sources
    frameLayout: FrameLayoutItem[]
    recordingsMap: Map<string, Recording>
    activeClipData: ActiveClipDataAtFrame | null
    clipEffects: Effect[]
    
    // Services
    getRecording: (id: string) => Recording | null | undefined

    // Precomputed zoom (from camera path)
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
    }

    // Editing state
    isEditingCrop: boolean
    isRendering: boolean
}

/**
 * Consolidated hook for layout + transform + clip calculations.
 * Replaces useLayoutCalculation + useTransformCalculation + useEffectiveClipData + useRenderableItems.
 */
export function useFrameSnapshot(options: UseFrameSnapshotOptions): FrameSnapshot {
    const {
        currentTimeMs,
        currentFrame,
        fps,
        compositionWidth,
        compositionHeight,
        videoWidth,
        videoHeight,
        sourceVideoWidth,
        sourceVideoHeight,
        recordingWidth,
        recordingHeight,
        frameLayout,
        recordingsMap,
        activeClipData,
        clipEffects,
        getRecording,
        zoomTransform = null,
        zoomTransformStr = '',
        boundaryState,
        isEditingCrop,
        isRendering
    } = options

    // Frozen layout ref - persists layout during crop editing
    const frozenLayoutRef = useRef<FrameSnapshot | null>(null)
    
    // Stability/Persistence refs (moved from individual hooks)
    const lastValidClipDataRef = useRef<ActiveClipDataAtFrame | null>(null);
    const prevRenderableItemsRef = useRef<FrameLayoutItem[]>([]);

    // Clear frozen state when not editing
    useEffect(() => {
        if (!isEditingCrop) {
            frozenLayoutRef.current = null
        }
    }, [isEditingCrop])

    return useMemo(() => {
        // Use frozen layout if available during crop editing
        if (isEditingCrop && frozenLayoutRef.current) {
            return frozenLayoutRef.current
        }

        const snapshot = calculateFrameSnapshot({
            currentTimeMs,
            currentFrame,
            fps,
            compositionWidth,
            compositionHeight,
            videoWidth,
            videoHeight,
            sourceVideoWidth,
            sourceVideoHeight,
            recordingWidth,
            recordingHeight,
            frameLayout,
            recordingsMap,
            activeClipData,
            clipEffects,
            getRecording,
            zoomTransform,
            zoomTransformStr,
            boundaryState,
            lastValidClipData: lastValidClipDataRef.current,
            prevRenderableItems: prevRenderableItemsRef.current,
            isRendering,
            isEditingCrop,
        })

        // Update stability refs
        if (snapshot.effectiveClipData) {
            lastValidClipDataRef.current = snapshot.effectiveClipData;
        }
        prevRenderableItemsRef.current = snapshot.renderableItems;

        // Freeze layout when first entering crop edit mode
        if (isEditingCrop && !frozenLayoutRef.current) {
            frozenLayoutRef.current = snapshot
        }

        return snapshot
    }, [
        currentTimeMs,
        currentFrame,
        fps,
        compositionWidth,
        compositionHeight,
        videoWidth,
        videoHeight,
        sourceVideoWidth,
        sourceVideoHeight,
        recordingWidth,
        recordingHeight,
        frameLayout,
        recordingsMap,
        activeClipData,
        clipEffects,
        getRecording,
        zoomTransform,
        zoomTransformStr,
        boundaryState,
        isEditingCrop,
        isRendering
    ])
}
