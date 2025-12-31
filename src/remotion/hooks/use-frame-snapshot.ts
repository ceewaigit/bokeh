/**
 * useFrameSnapshot Hook
 * 
 * REPLACES: useLayoutCalculation + useTransformCalculation
 * 
 * Single hook that consolidates all layout and transform calculations,
 * eliminating the "hook tax" of calling multiple hooks.
 * 
 * Uses the pure layout-engine service for calculations.
 */

import { useRef, useEffect, useMemo } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { calculateFrameSnapshot, type FrameSnapshot } from '@/features/timeline/logic/layout-engine'
import type { Effect } from '@/types/project'

// Re-export FrameSnapshot type for consumers
export type { FrameSnapshot } from '@/features/timeline/logic/layout-engine'

export interface UseFrameSnapshotOptions {
    // Composition dimensions
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

    // Effects
    clipEffects: Effect[]
    currentTimeMs: number

    // Precomputed zoom (from camera path)
    zoomTransform?: Record<string, unknown> | null
    zoomTransformStr?: string

    // Editing state
    isEditingCrop: boolean
}

/**
 * Consolidated hook for layout + transform calculations.
 * Replaces useLayoutCalculation + useTransformCalculation.
 */
export function useFrameSnapshot(options: UseFrameSnapshotOptions): FrameSnapshot {
    const {
        compositionWidth,
        compositionHeight,
        videoWidth,
        videoHeight,
        sourceVideoWidth,
        sourceVideoHeight,
        recordingWidth,
        recordingHeight,
        clipEffects,
        currentTimeMs,
        zoomTransform = null,
        zoomTransformStr = '',
        isEditingCrop,
    } = options

    // Frozen layout ref - persists layout during crop editing
    const frozenLayoutRef = useRef<FrameSnapshot | null>(null)

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
            compositionWidth,
            compositionHeight,
            videoWidth,
            videoHeight,
            sourceVideoWidth,
            sourceVideoHeight,
            recordingWidth,
            recordingHeight,
            clipEffects,
            zoomTransform,
            zoomTransformStr,
            isEditingCrop,
        })

        // Freeze layout when first entering crop edit mode
        if (isEditingCrop && !frozenLayoutRef.current) {
            frozenLayoutRef.current = snapshot
        }

        return snapshot
    }, [
        compositionWidth,
        compositionHeight,
        videoWidth,
        videoHeight,
        sourceVideoWidth,
        sourceVideoHeight,
        recordingWidth,
        recordingHeight,
        clipEffects,
        currentTimeMs,
        zoomTransform,
        zoomTransformStr,
        isEditingCrop,
    ])
}
