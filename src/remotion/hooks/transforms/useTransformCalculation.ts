/**
 * useTransformCalculation Hook
 *
 * Calculates zoom, crop, and 3D screen transforms.
 * Takes layout as input and outputs CSS transform strings.
 *
 * KISS: Pure calculation based on layout + effects.
 */

import { useMemo } from 'react';

import {
    calculateCropTransform,
    getCropTransformString,
    combineCropAndZoomTransforms,
} from '../../compositions/utils/transforms/crop-transform';
import { calculateScreenTransform } from '../../compositions/utils/transforms/screen-transform';
import { getCropData, getActiveCropEffect } from '@/features/effects/effect-filters';
import type { Effect } from '@/types/project';
import type { ParsedZoomBlock } from '@/features/effects/utils/camera-calculator';
import type { MockupPositionResult } from '@/lib/mockups/mockup-transform';
import type { ZoomTransform, CropTransform } from '@/types';

// ============================================================================
// TYPES
// ============================================================================

export interface TransformResult {
    // Zoom
    zoomTransform: ZoomTransform | null;
    zoomTransformStr: string;

    // Crop
    cropTransform: CropTransform;
    cropTransformStr: string;
    cropClipPath: string | undefined;
    cropEffectId: string | undefined;

    // 3D Screen
    extra3DTransform: string;

    // Combined
    outerTransform: string;
}

interface UseTransformCalculationOptions {
    // Timing
    currentTimeMs: number;
    sourceTimeMs: number;

    // Effects
    clipEffects: Effect[];

    // Zoom configuration (from camera path - reduced to precomputed values)
    calculatedZoomBlock?: ParsedZoomBlock | undefined; // Optional, only needed if logic depends on block properties
    zoomTransform: ZoomTransform | null;
    zoomTransformStr: string;

    // Layout (from useLayoutCalculation)
    compositionWidth: number;
    compositionHeight: number;
    drawWidth: number;
    drawHeight: number;
    paddingScaled: number;
    cornerRadius: number;
    mockupEnabled: boolean;
    mockupPosition: MockupPositionResult | null;

    // Editing state
    isEditingCrop: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function useTransformCalculation({
    currentTimeMs,
    clipEffects,
    zoomTransform,
    zoomTransformStr,
    compositionWidth,
    compositionHeight,
    drawWidth,
    drawHeight,
    paddingScaled,
    cornerRadius,
    mockupEnabled,
    mockupPosition,
    isEditingCrop,
}: UseTransformCalculationOptions): TransformResult {
    return useMemo(() => {
        // ==========================================================================
        // ZOOM TRANSFORM (Precomputed SSOT)
        // ==========================================================================

        // We use the precomputed values directly. 
        // No more expensive calculation here!

        // ==========================================================================
        // CROP TRANSFORM
        // ==========================================================================

        // Use centralized effect lookup with consistent boundary semantics
        const cropEffect = getActiveCropEffect(clipEffects, currentTimeMs);

        // Disable crop during editing
        const resolvedCropData = isEditingCrop || !cropEffect
            ? null
            : getCropData(cropEffect);

        // Crop uses video dimensions (not mockup)
        const cropBaseWidth = mockupEnabled && mockupPosition
            ? mockupPosition.videoWidth
            : drawWidth;
        const cropBaseHeight = mockupEnabled && mockupPosition
            ? mockupPosition.videoHeight
            : drawHeight;

        const cropTransform = calculateCropTransform(
            resolvedCropData,
            cropBaseWidth,
            cropBaseHeight
        );
        const cropTransformStr = getCropTransformString(cropTransform);

        // Clip-path with corner radius
        const cropClipPath = cropTransform.isActive && cropTransform.clipPath && cornerRadius > 0
            ? `${cropTransform.clipPath.slice(0, -1)} round ${cornerRadius / cropTransform.scale}px)`
            : cropTransform.clipPath;

        // ==========================================================================
        // 3D SCREEN TRANSFORM
        // ==========================================================================

        const extra3DTransform = calculateScreenTransform(clipEffects, currentTimeMs);
        const combinedZoomCrop = combineCropAndZoomTransforms(cropTransformStr, zoomTransformStr);
        const combinedTransform = extra3DTransform
            ? `${extra3DTransform} ${combinedZoomCrop}`.trim()
            : combinedZoomCrop;

        // ==========================================================================
        // RETURN
        // ==========================================================================

        return {
            // Disable transforms during crop editing
            zoomTransform: isEditingCrop ? null : zoomTransform,
            zoomTransformStr,
            cropTransform,
            cropTransformStr,
            cropClipPath: cropClipPath || undefined,
            cropEffectId: cropEffect?.id,
            extra3DTransform: isEditingCrop ? '' : extra3DTransform,
            outerTransform: isEditingCrop ? '' : combinedTransform,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        currentTimeMs,
        clipEffects,
        zoomTransformStr, // Stable string reference
        // zoomTransform omitted intentionally - deep object equality effectively handled by string above
        compositionWidth,
        compositionHeight,
        drawWidth,
        drawHeight,
        paddingScaled,
        cornerRadius,
        mockupEnabled,
        mockupPosition,
        isEditingCrop,
    ]);
}
