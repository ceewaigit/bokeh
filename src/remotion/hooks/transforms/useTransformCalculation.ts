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
    calculateZoomTransform,
    getZoomTransformString,
} from '../../compositions/utils/transforms/zoom-transform';
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

    // Zoom configuration (from camera path)
    calculatedZoomBlock: ParsedZoomBlock | undefined;
    calculatedZoomCenter: { x: number; y: number };

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
    calculatedZoomBlock,
    calculatedZoomCenter,
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
        // ZOOM TRANSFORM
        // ==========================================================================

        // Target dimensions (mockup container or video)
        const zoomDrawWidth = mockupEnabled && mockupPosition
            ? mockupPosition.mockupWidth
            : drawWidth;
        const zoomDrawHeight = mockupEnabled && mockupPosition
            ? mockupPosition.mockupHeight
            : drawHeight;

        // Adjust zoom center for mockup coordinate space
        const zoomCenter = mockupEnabled && mockupPosition
            ? {
                x: (mockupPosition.videoX + calculatedZoomCenter.x * mockupPosition.videoWidth - mockupPosition.mockupX) / mockupPosition.mockupWidth,
                y: (mockupPosition.videoY + calculatedZoomCenter.y * mockupPosition.videoHeight - mockupPosition.mockupY) / mockupPosition.mockupHeight,
            }
            : calculatedZoomCenter;

        // Calculate fill scale for auto-scale mode
        const fillScale = zoomDrawWidth > 0 && zoomDrawHeight > 0
            ? Math.max(compositionWidth / zoomDrawWidth, compositionHeight / zoomDrawHeight)
            : 1;
        const zoomOverrideScale = calculatedZoomBlock?.autoScale === 'fill'
            ? fillScale
            : undefined;

        const zoomTransform = calculateZoomTransform(
            calculatedZoomBlock,
            currentTimeMs,
            zoomDrawWidth,
            zoomDrawHeight,
            zoomCenter,
            zoomOverrideScale,
            paddingScaled,
            calculatedZoomBlock?.autoScale === 'fill',
            Boolean(mockupEnabled)
            // NOTE: currentScaleOverride removed - scale computed internally by calculateZoomTransform
        );
        const zoomTransformStr = getZoomTransformString(zoomTransform);

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
    }, [
        currentTimeMs,
        clipEffects,
        calculatedZoomBlock,
        calculatedZoomCenter,
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
