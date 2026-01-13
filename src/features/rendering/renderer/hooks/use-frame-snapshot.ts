/**
 * useFrameSnapshot Hook
 * 
 * Single hook that consolidates all layout, transform, and clip resolution calculations,
 * eliminating the "hook tax" of calling multiple hooks.
 * 
 * Uses the pure layout-engine service for calculations.
 * 
 * ZERO-PROP PATTERN:
 * This hook is self-contained and pulls all necessary data from stores/contexts.
 * This allows components (renderers, cursors) to subscribe only to the
 * derived frame snapshot, avoiding prop drilling and unnecessary re-renders.
 */

import { useRef, useEffect, useMemo } from 'react'
import { calculateFrameSnapshot, type FrameSnapshot } from '@/features/rendering/renderer/engine/layout-engine'
import type { ActiveClipDataAtFrame } from '@/types/remotion'
import type { FrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout'
import { getBoundaryOverlapState } from '@/features/ui/timeline/utils/frame-layout'
import { useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion'
import { useTimelineContext } from '@/features/rendering/renderer/context/RenderingTimelineContext'
import { useProjectStore } from '@/features/core/stores/project-store'
import { usePlaybackSettings } from '@/features/rendering/renderer/context/playback/PlaybackSettingsContext'
import { useCameraPath } from '@/features/ui/editor/logic/viewport/hooks/useCameraPath'
import { calculateFullCameraPath } from '@/features/ui/editor/logic/viewport/logic/path-calculator'
import { frameToMs } from '@/features/rendering/renderer/compositions/utils/time/frame-time'
import { useVisualLayoutNavigation } from '@/features/rendering/renderer/hooks/use-visual-layout-navigation'
import { getZoomTransformString } from '@/features/rendering/canvas/math/transforms/zoom-transform'
import type { ZoomTransform } from '@/types'

// Re-export FrameSnapshot type for consumers
export type { FrameSnapshot } from '@/features/rendering/renderer/engine/layout-engine'

/**
 * Internal hook containing the unified logic
 */
function useCalculatedSnapshot(
    currentFrame: number,
    compositionWidth: number,
    compositionHeight: number,
    isRendering: boolean
): FrameSnapshot {
    // 2. Timeline Context (SSOT)
    const {
        fps,
        videoWidth,
        videoHeight,
        sourceVideoWidth,
        sourceVideoHeight,
        frameLayout,
        recordingsMap,
        effects: clipEffects,
        getActiveClipData,
        getRecording,
        getActiveLayoutIndex,
        getLayoutItem,
        getPrevLayoutItem,
        getNextLayoutItem,
    } = useTimelineContext();

    const currentTimeMs = frameToMs(currentFrame, fps);

    // 3. Settings & Store
    const cameraPathCache = useProjectStore((s) => s.cameraPathCache);
    const cameraPathCacheDimensions = useProjectStore((s) => s.cameraPathCacheDimensions);
    const cameraSettings = useProjectStore((s) => s.currentProject?.settings.camera);

    // Playback Settings (Render Settings)
    const { renderSettings } = usePlaybackSettings();
    const isEditingCrop = renderSettings.isEditingCrop;

    // 4. Derived Data (Active Clip)
    // Note: useActiveClipData is just a wrapper around getActiveClipData(currentFrame)
    const activeClipData = useMemo(() => getActiveClipData(currentFrame), [getActiveClipData, currentFrame]);

    // 5. Layout Navigation & Boundary State (inlined from useLayoutNavigation)
    const activeLayoutIndex = getActiveLayoutIndex(currentFrame);
    const activeLayoutItem = getLayoutItem(activeLayoutIndex);
    const prevLayoutItem = getPrevLayoutItem(activeLayoutIndex);
    const nextLayoutItem = getNextLayoutItem(activeLayoutIndex);

    // Visual Layout Navigation - prefers visual items (video/image) for boundary calculations
    const visualLayoutNav = useVisualLayoutNavigation(frameLayout, recordingsMap, currentFrame);

    const renderActiveLayoutItem = visualLayoutNav.activeVisualItem ?? activeLayoutItem;
    const renderPrevLayoutItem = visualLayoutNav.prevVisualItem ?? prevLayoutItem;
    const renderNextLayoutItem = visualLayoutNav.nextVisualItem ?? nextLayoutItem;

    // Calculate Boundary State
    const boundaryState = useMemo(() => {
        return getBoundaryOverlapState({
            currentFrame,
            fps,
            isRendering,
            activeLayoutItem: renderActiveLayoutItem,
            prevLayoutItem: renderPrevLayoutItem,
            nextLayoutItem: renderNextLayoutItem,
            sourceWidth: sourceVideoWidth,
            sourceHeight: sourceVideoHeight,
        });
    }, [
        currentFrame,
        fps,
        isRendering,
        renderActiveLayoutItem,
        renderPrevLayoutItem,
        renderNextLayoutItem,
        sourceVideoWidth,
        sourceVideoHeight,
    ]);

    // 6. Camera Path & Zoom
    // Logic from TimelineComposition/SharedVideoController
    const cameraPath = useMemo(() => {
        if (cameraPathCache) return cameraPathCache;

        // Fallback to calculation (e.g. for export if cache missing)
        return calculateFullCameraPath({
            frameLayout,
            fps,
            videoWidth,
            videoHeight,
            sourceVideoWidth,
            sourceVideoHeight,
            effects: clipEffects,
            getRecording,
            loadedMetadata: undefined,
            cameraSettings
        });
    }, [cameraPathCache, frameLayout, fps, videoWidth, videoHeight, sourceVideoWidth, sourceVideoHeight, clipEffects, getRecording, cameraSettings]);

    const cameraPathFrame = useCameraPath({
        enabled: true,
        currentFrame,
        cachedPath: cameraPath
    });

    // Camera path cache is computed in "project video" coordinates (`videoWidth`/`videoHeight`).
    // The Remotion composition can be downscaled for preview, so we must scale translations
    // into composition space to keep zoom/cursor behavior resolution-agnostic.
    const cameraBaseWidth = cameraPathCacheDimensions?.width ?? videoWidth;
    const cameraBaseHeight = cameraPathCacheDimensions?.height ?? videoHeight;
    const cameraScaleX = cameraBaseWidth > 0 ? (compositionWidth / cameraBaseWidth) : 1;
    const cameraScaleY = cameraBaseHeight > 0 ? (compositionHeight / cameraBaseHeight) : 1;

    const zoomTransform = useMemo<ZoomTransform | null>(() => {
        const baseTransform = cameraPathFrame?.zoomTransform as ZoomTransform | undefined;
        if (!baseTransform) return null;
        if (cameraScaleX === 1 && cameraScaleY === 1) return baseTransform;
        return {
            ...baseTransform,
            panX: baseTransform.panX * cameraScaleX,
            panY: baseTransform.panY * cameraScaleY,
            scaleCompensationX: baseTransform.scaleCompensationX * cameraScaleX,
            scaleCompensationY: baseTransform.scaleCompensationY * cameraScaleY,
        };
    }, [cameraPathFrame?.zoomTransform, cameraScaleX, cameraScaleY]);

    const zoomTransformStr = useMemo(() => {
        return zoomTransform ? getZoomTransformString(zoomTransform) : '';
    }, [zoomTransform]);

    // 7. Calculate Snapshot
    // Frozen layout ref - persists layout during crop editing
    const frozenLayoutRef = useRef<FrameSnapshot | null>(null)

    // Stability/Persistence refs
    const lastValidClipDataRef = useRef<ActiveClipDataAtFrame | null>(null);
    const prevRenderableItemsRef = useRef<FrameLayoutItem[]>([]);

    // Clear frozen state and accumulated refs when not editing
    // This prevents memory accumulation from long editing sessions
    useEffect(() => {
        if (!isEditingCrop) {
            frozenLayoutRef.current = null
            // Clear accumulated layout data to free memory
            prevRenderableItemsRef.current = []
            lastValidClipDataRef.current = null
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
            // Recording dimensions (optional, fallbacks)
            recordingWidth: undefined,
            recordingHeight: undefined,

            frameLayout,
            recordingsMap,
            activeClipData,
            clipEffects,
            getRecording,
            zoomTransform: zoomTransform as any,
            zoomTransformStr,
            boundaryState: {
                ...boundaryState,
                activeLayoutItem: renderActiveLayoutItem,
                prevLayoutItem: renderPrevLayoutItem,
                nextLayoutItem: renderNextLayoutItem,
            },
            lastValidClipData: lastValidClipDataRef.current,
            prevRenderableItems: prevRenderableItemsRef.current,
            isRendering,
            isEditingCrop,
        })

        // Use pre-computed velocity from camera path (deterministic - same frame = same velocity)
        // This is calculated in path-calculator.ts as position[frame] - position[frame-1]
        const precomputedVelocity = cameraPathFrame?.velocity ?? { x: 0, y: 0 };
        const scale = (zoomTransform as any)?.scale ?? 1;
        snapshot.camera.velocity = {
            x: precomputedVelocity.x * snapshot.layout.drawWidth * scale,
            y: precomputedVelocity.y * snapshot.layout.drawHeight * scale
        };

        // Use pre-computed motion blur mix from camera path (deterministic per frame)
        snapshot.camera.motionBlurMix = cameraPathFrame?.motionBlurMix ?? 0;

        // LEGACY SAFETY NET: These fallbacks should no longer trigger after fixes to:
        // - findActiveFrameLayoutItems (frame-layout.ts) - never returns empty
        // - calculateEffectiveClipData (layout-engine.ts) - uses lastValidClipData internally
        // Dev logging helps verify these are truly redundant before removal.
        if (snapshot.renderableItems.length === 0 && prevRenderableItemsRef.current.length > 0) {
            if (process.env.NODE_ENV === 'development') {
                console.warn('[useFrameSnapshot] SAFETY NET triggered: empty renderableItems at frame', currentFrame);
            }
            snapshot.renderableItems = prevRenderableItemsRef.current;
        }

        if (!snapshot.effectiveClipData && lastValidClipDataRef.current && !isRendering) {
            if (process.env.NODE_ENV === 'development') {
                console.warn('[useFrameSnapshot] SAFETY NET triggered: null effectiveClipData at frame', currentFrame);
            }
            snapshot.effectiveClipData = lastValidClipDataRef.current;
        }

        // Update stability refs
        if (snapshot.effectiveClipData) {
            lastValidClipDataRef.current = snapshot.effectiveClipData;
        }
        // Only update prevRenderableItems if we have valid items
        if (snapshot.renderableItems.length > 0) {
            prevRenderableItemsRef.current = snapshot.renderableItems;
        }

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
        frameLayout,
        recordingsMap,
        activeClipData,
        clipEffects,
        getRecording,
        zoomTransform,
        zoomTransformStr,
        boundaryState,
        renderActiveLayoutItem,
        renderPrevLayoutItem,
        renderNextLayoutItem,
        isEditingCrop,
        isRendering,
        cameraPathFrame // Add dependency
    ])
}

/**
 * Consolidated hook for layout + transform + clip calculations.
 * Pulls all dependencies internally (Zero-Prop).
 * 
 * STRICTLY FOR USE INSIDE <Player> OR <Composition>
 */
export function useFrameSnapshot(): FrameSnapshot {
    // 1. Remotion & Environment
    const currentFrame = useCurrentFrame();
    const { width: compositionWidth, height: compositionHeight } = useVideoConfig();
    const { isRendering } = getRemotionEnvironment();

    return useCalculatedSnapshot(currentFrame, compositionWidth, compositionHeight, isRendering);
}

/**
 * Editor-safe version of FrameSnapshot hook.
 * Does NOT use Remotion hooks (useCurrentFrame, useVideoConfig).
 * Requires manual injection of time and dimensions.
 */
export function useEditorFrameSnapshot(
    currentTimeMs: number,
    width: number,
    height: number
): FrameSnapshot {
    const { fps } = useTimelineContext();
    const currentFrame = (currentTimeMs / 1000) * fps;
    const isRendering = false; // Editor is never "rendering" in headless sense

    return useCalculatedSnapshot(currentFrame, width, height, isRendering);
}
