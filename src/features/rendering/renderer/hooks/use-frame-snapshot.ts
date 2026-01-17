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

    // Reference stability: Reuse previous array if groupIds match, preventing React re-renders
    const prevRenderableItemsRef = useRef<FrameLayoutItem[]>([]);

    // Clear frozen state and accumulated refs when not editing
    // This prevents memory accumulation from long editing sessions
    useEffect(() => {
        if (!isEditingCrop) {
            frozenLayoutRef.current = null
            prevRenderableItemsRef.current = []
        }
    }, [isEditingCrop])

    // Track effects array changes to clear stale cached data after regeneration
    // When effects change (regeneration creates new clips with new IDs), we must clear
    // the cached data to force fresh calculations for ALL frames, not just visited ones
    const effectsArrayRef = useRef(clipEffects);
    useEffect(() => {
        if (effectsArrayRef.current !== clipEffects) {
            effectsArrayRef.current = clipEffects;
            prevRenderableItemsRef.current = [];
            frozenLayoutRef.current = null;
        }
    }, [clipEffects]);

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
            prevRenderableItems: prevRenderableItemsRef.current,
            isRendering,
            isEditingCrop,
        })

        // Dev-only assertion: Detect unexpected null clip data during preview
        // This helps catch edge cases where the fallback was previously masking issues
        if (process.env.NODE_ENV === 'development' && !isRendering && !isEditingCrop) {
            if (!snapshot.effectiveClipData && frameLayout.length > 0 && currentFrame >= 0) {
                console.warn(
                    `[FrameSnapshot] Missing clip data at frame ${currentFrame}. ` +
                    `Layout has ${frameLayout.length} items. This may cause visual gaps.`
                )
            }
        }

        // Use pre-computed velocity from camera path (deterministic - same frame = same velocity)
        // This is calculated in path-calculator.ts as position[frame] - position[frame-1]
        // IMPORTANT: Velocity is kept NORMALIZED (0-1) for resolution independence.
        // This follows industry standard (DaVinci Resolve, After Effects, Final Cut Pro).
        // MotionBlurCanvas converts to pixels using actual render dimensions, ensuring
        // preview at 1080p matches export at 4K exactly.
        // NOTE: Do NOT scale velocity by zoom - velocity represents camera movement in
        // normalized screen space, not source space. Zoom affects framing, not camera speed.
        const precomputedVelocity = cameraPathFrame?.velocity ?? { x: 0, y: 0 };
        snapshot.camera.velocity = precomputedVelocity;

        // Use pre-computed motion blur mix from camera path (deterministic per frame)
        snapshot.camera.motionBlurMix = cameraPathFrame?.motionBlurMix ?? 0;

        // Update stability ref for React optimization (same array reference when content matches)
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
 * Requires manual injection of time and display dimensions (CSS pixels).
 */
export function useEditorFrameSnapshot(
    currentTimeMs: number,
    displayWidth: number,
    displayHeight: number
): FrameSnapshot {
    const { fps } = useTimelineContext();
    const currentFrame = (currentTimeMs / 1000) * fps;
    const isRendering = false; // Editor is never "rendering" in headless sense

    return useCalculatedSnapshot(currentFrame, displayWidth, displayHeight, isRendering);
}
