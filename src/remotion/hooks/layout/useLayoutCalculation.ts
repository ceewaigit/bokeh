/**
 * useLayoutCalculation Hook
 *
 * Calculates video layout dimensions and positioning.
 * Handles frozen layout during crop editing to prevent drift.
 *
 * KISS: Pure calculation, no complex state management.
 */

import { useRef, useEffect, useMemo } from 'react';
import { calculateVideoPosition } from '../../compositions/utils/layout/video-position';
import { calculateMockupPosition, type MockupPositionResult } from '@/lib/mockups/mockup-transform';
import { getActiveBackgroundEffect } from '@/features/effects/effect-filters';
import { DEFAULT_BACKGROUND_DATA } from '@/lib/constants/default-effects';

import type { Effect, BackgroundEffect } from '@/types/project';

// ============================================================================
// TYPES
// ============================================================================

export interface LayoutResult {
    // Dimensions
    drawWidth: number;
    drawHeight: number;
    offsetX: number;
    offsetY: number;

    // Scaling
    padding: number;
    paddingScaled: number;
    scaleFactor: number;
    cornerRadius: number;
    shadowIntensity: number;

    // Source dimensions
    activeSourceWidth: number;
    activeSourceHeight: number;

    // Mockup
    mockupEnabled: boolean;
    mockupData: any;
    mockupPosition: MockupPositionResult | null;
}

interface UseLayoutCalculationOptions {
    // Composition dimensions
    compositionWidth: number;
    compositionHeight: number;

    // Fallback video dimensions
    videoWidth: number;
    videoHeight: number;
    sourceVideoWidth?: number;
    sourceVideoHeight?: number;

    // Recording dimensions (from effective clip)
    recordingWidth: number | undefined;
    recordingHeight: number | undefined;

    // Effects for this clip
    clipEffects: Effect[];
    currentTimeMs: number;

    // Crop editing state (triggers layout freeze)
    isEditingCrop: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

import { REFERENCE_WIDTH, REFERENCE_HEIGHT } from '@/lib/constants/layout';

// ============================================================================
// HOOK
// ============================================================================

export function useLayoutCalculation({
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
    isEditingCrop,
}: UseLayoutCalculationOptions): LayoutResult {
    // Frozen layout ref - persists layout during crop editing
    const frozenLayoutRef = useRef<LayoutResult | null>(null);

    // Clear frozen state when not editing
    useEffect(() => {
        if (!isEditingCrop) {
            frozenLayoutRef.current = null;
        }
    }, [isEditingCrop]);

    return useMemo(() => {
        // Use frozen layout if available during crop editing
        if (isEditingCrop && frozenLayoutRef.current) {
            return frozenLayoutRef.current;
        }

        // Get background effect data using centralized lookup (consistent boundary semantics)
        const backgroundEffect = getActiveBackgroundEffect(clipEffects, currentTimeMs) as BackgroundEffect | undefined;
        const backgroundData = backgroundEffect?.data || null;

        // Calculate scale factor
        const scaleFactor = Math.min(
            compositionWidth / REFERENCE_WIDTH,
            compositionHeight / REFERENCE_HEIGHT
        );

        // Extract background properties
        const padding = backgroundData?.padding ?? DEFAULT_BACKGROUND_DATA.padding;
        const paddingScaled = padding * scaleFactor;
        const cornerRadius = (backgroundData?.cornerRadius ?? DEFAULT_BACKGROUND_DATA.cornerRadius ?? 0) * scaleFactor;
        const shadowIntensity = backgroundData?.shadowIntensity ?? DEFAULT_BACKGROUND_DATA.shadowIntensity ?? 0;
        const mockupData = backgroundData?.mockup;
        const mockupEnabled = mockupData?.enabled ?? false;

        // Source dimensions
        const activeSourceWidth = recordingWidth || sourceVideoWidth || videoWidth;
        const activeSourceHeight = recordingHeight || sourceVideoHeight || videoHeight;

        // Calculate video position
        const vidPos = calculateVideoPosition(
            compositionWidth,
            compositionHeight,
            activeSourceWidth,
            activeSourceHeight,
            paddingScaled
        );

        // Calculate mockup position if enabled
        let mockupPosition: MockupPositionResult | null = null;
        if (mockupEnabled && mockupData) {
            mockupPosition = calculateMockupPosition(
                compositionWidth,
                compositionHeight,
                mockupData,
                activeSourceWidth,
                activeSourceHeight,
                paddingScaled
            );
        }

        const result: LayoutResult = {
            drawWidth: Math.round(vidPos.drawWidth),
            drawHeight: Math.round(vidPos.drawHeight),
            offsetX: Math.round(vidPos.offsetX),
            offsetY: Math.round(vidPos.offsetY),
            padding,
            paddingScaled,
            scaleFactor,
            cornerRadius,
            shadowIntensity,
            activeSourceWidth,
            activeSourceHeight,
            mockupEnabled,
            mockupData,
            mockupPosition,
        };

        // Freeze layout when first entering crop edit mode
        if (isEditingCrop && !frozenLayoutRef.current) {
            frozenLayoutRef.current = result;
        }

        return result;
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
        isEditingCrop,
    ]);
}
