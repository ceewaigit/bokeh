import { useMemo } from 'react';
import { useProjectStore } from '@/features/stores/project-store';
import { getZoomTransformString } from '@/features/canvas/math/transforms/zoom-transform';
import type { ZoomTransform } from '@/types/remotion';
import type { ZoomSettings } from '@/types/remotion';
import type { TimelineMetadata } from '@/features/timeline/hooks/use-timeline-metadata';

interface UseEditorViewportProps {
    currentFrame: number;
    timelineMetadata: TimelineMetadata;
    zoomSettings?: ZoomSettings;
    isAnnotationEditing?: boolean;
}

interface EditorViewportState {
    zoomTransform: ZoomTransform;
    transformString: string;
    scale: number;
}

/**
 * Unified hook for calculating the current Editor Viewport state (Zoom/Pan).
 * Consolidates logic from PreviewInteractions and legacy hooks.
 *
 * Priorities:
 * 1. Manual Zoom Mode (User is panning/zooming)
 * 2. Playback Camera (From Camera Track)
 * 3. Default (Identity)
 *
 * Note: Annotation editing no longer forces 1x zoom. With contentEditable inline editing,
 * annotations inherit CSS transforms naturally and editing works at any zoom level.
 */
export function useEditorViewport({
    currentFrame,
    timelineMetadata,
    zoomSettings,
    isAnnotationEditing = false  // Kept for API compatibility but no longer used
}: UseEditorViewportProps): EditorViewportState {

    // Subscribe to camera cache (SSOT)
    const cameraPathCache = useProjectStore((s) => s.cameraPathCache);

    return useMemo(() => {
        // Note: We no longer force 1x zoom during annotation editing
        // ContentEditable works at any zoom level since it inherits CSS transforms

        // 1. Manual Zoom Editing (Override)
        if (zoomSettings?.isEditing && zoomSettings.zoomData) {
            const s = zoomSettings.zoomData.scale;
            // Simplified center-based zoom for editing preview
            const panX = (0.5 - 0.5) * timelineMetadata.width * (s - 1);
            const panY = (0.5 - 0.5) * timelineMetadata.height * (s - 1);

            const transform: ZoomTransform = {
                scale: s,
                panX: 0,
                panY: 0,
                scaleCompensationX: 0,
                scaleCompensationY: 0,
                refocusBlur: 0
            };
            return {
                zoomTransform: transform,
                transformString: getZoomTransformString(transform),
                scale: s
            };
        }

        // 2. Cached Camera Path (Primary SSOT)
        if (cameraPathCache) {
            // Safe lookup for current frame
            const safeFrame = Math.max(0, Math.floor(currentFrame));
            const frameData = safeFrame < cameraPathCache.length
                ? cameraPathCache[safeFrame]
                : cameraPathCache[cameraPathCache.length - 1];

            if (frameData) {
                return {
                    zoomTransform: frameData.zoomTransform,
                    transformString: frameData.zoomTransformStr,
                    scale: frameData.zoomTransform.scale
                };
            }
        }

        // 3. Fallback (Identity)
        return {
            zoomTransform: { scale: 1, panX: 0, panY: 0, scaleCompensationX: 0, scaleCompensationY: 0, refocusBlur: 0 },
            transformString: 'translate3d(0px, 0px, 0) scale3d(1, 1, 1)',
            scale: 1
        };
    }, [cameraPathCache, currentFrame, zoomSettings, timelineMetadata]);
}
