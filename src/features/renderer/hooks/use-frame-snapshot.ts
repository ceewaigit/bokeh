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
import { calculateFrameSnapshot, type FrameSnapshot } from '@/features/renderer/engine/layout-engine'
import type { ActiveClipDataAtFrame } from '@/types/remotion'
import type { FrameLayoutItem } from '@/features/timeline/utils/frame-layout'
import { getBoundaryOverlapState, findActiveFrameLayoutItems } from '@/features/timeline/utils/frame-layout'
import { useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion'
import { useTimelineContext } from '@/features/renderer/context/TimelineContext'
import { useProjectStore } from '@/features/stores/project-store'
import { usePlaybackSettings } from '@/features/renderer/context/playback/PlaybackSettingsContext'
import { useCameraPath } from '@/features/editor/logic/viewport/hooks/useCameraPath'
import { calculateFullCameraPath, getCameraOutputContext } from '@/features/editor/logic/viewport/logic/path-calculator'
import { frameToMs } from '@/features/renderer/compositions/utils/time/frame-time'
import { useLayoutNavigation } from '@/features/renderer/hooks/use-layout-navigation'

import { calculateVideoPosition } from '@/features/renderer/engine/layout-engine'

// Re-export FrameSnapshot type for consumers
export type { FrameSnapshot } from '@/features/renderer/engine/layout-engine'

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
    } = useTimelineContext();

    const currentTimeMs = frameToMs(currentFrame, fps);

    // 3. Settings & Store
    const cameraPathCache = useProjectStore((s) => s.cameraPathCache);
    const cameraSettings = useProjectStore((s) => s.currentProject?.settings.camera);

    // Playback Settings (Render Settings)
    const { renderSettings } = usePlaybackSettings();
    const isEditingCrop = renderSettings.isEditingCrop;

    // 4. Derived Data (Active Clip)
    // Note: useActiveClipData is just a wrapper around getActiveClipData(currentFrame)
    const activeClipData = useMemo(() => getActiveClipData(currentFrame), [getActiveClipData, currentFrame]);

    // 5. Layout Navigation & Boundary State
    // We use the helper hook from video-data-context for standard navigation
    const layoutNav = useLayoutNavigation(currentFrame);
    const { activeItem: activeLayoutItem, prevItem: prevLayoutItem, nextItem: nextLayoutItem } = layoutNav;

    // Visual Layout Navigation (logic moved from SharedVideoController)
    // Prefers visual items (video/image) for boundary calculations
    const visualLayoutNav = useMemo(() => {
        const isVisualItem = (item: FrameLayoutItem | null) => {
            if (!item) return false;
            const recording = recordingsMap.get(item.clip.recordingId);
            return recording?.sourceType === 'video' || recording?.sourceType === 'image';
        };

        const activeItems = findActiveFrameLayoutItems(frameLayout, currentFrame);
        let activeVisualItem: FrameLayoutItem | null = null;
        for (const item of activeItems) {
            if (isVisualItem(item) && (!activeVisualItem || item.startFrame > activeVisualItem.startFrame)) {
                activeVisualItem = item;
            }
        }

        const activeVisualIndex = activeVisualItem
            ? frameLayout.findIndex((item) => item.clip.id === activeVisualItem?.clip.id)
            : -1;

        let prevVisualItem: FrameLayoutItem | null = null;
        for (let i = activeVisualIndex - 1; i >= 0; i -= 1) {
            const candidate = frameLayout[i];
            if (isVisualItem(candidate)) {
                prevVisualItem = candidate;
                break;
            }
        }

        let nextVisualItem: FrameLayoutItem | null = null;
        for (let i = activeVisualIndex + 1; i < frameLayout.length; i += 1) {
            const candidate = frameLayout[i];
            if (isVisualItem(candidate)) {
                nextVisualItem = candidate;
                break;
            }
        }

        return {
            activeVisualItem,
            prevVisualItem,
            nextVisualItem,
        };
    }, [frameLayout, recordingsMap, currentFrame]);

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

    const zoomTransform = cameraPathFrame?.zoomTransform ?? null;
    const zoomTransformStr = cameraPathFrame?.zoomTransformStr ?? '';

    // 7. Calculate Snapshot
    // Frozen layout ref - persists layout during crop editing
    const frozenLayoutRef = useRef<FrameSnapshot | null>(null)

    // Stability/Persistence refs
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

        // Populate camera velocity (scaled to pixels)
        if (cameraPathFrame?.velocity) {
            const scale = (zoomTransform as any)?.scale ?? 1;
            snapshot.camera.velocity = {
                x: cameraPathFrame.velocity.x * snapshot.layout.drawWidth * scale,
                y: cameraPathFrame.velocity.y * snapshot.layout.drawHeight * scale
            };
        }

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
