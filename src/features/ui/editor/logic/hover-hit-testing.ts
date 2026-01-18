/**
 * Hover Hit Testing - Pure functions for determining which preview layer is hovered
 *
 * Extracts the hit testing logic from usePreviewHover into testable pure functions.
 */

import type { Clip, WebcamLayoutData } from '@/types/project'
import { AnnotationType } from '@/types/project'
import type { FrameSnapshot } from '@/features/rendering/renderer/engine/layout-engine'
import { hitTestAnnotationsFromPoint } from './dom-hit-testing'
import { getVideoRectFromSnapshot } from './preview-point-transforms'
import { getCameraTransformFromSnapshot } from './hit-testing'
import { getWebcamLayout } from '@/features/effects/utils/webcam-layout'
import { applyCameraTransformToPixelRect } from '@/features/rendering/canvas/math/coordinates'
import { DEFAULT_WEBCAM_DATA } from '@/features/media/webcam/config'
import type {
    CursorOverlayData,
    WebcamOverlayData,
    AnnotationOverlayData,
    VideoOverlayData,
    SubtitleOverlayData,
    KeystrokeOverlayData,
    PreviewHoverLayer
} from '../components/preview/layer-hover-overlays'

export interface HoverState {
    layer: PreviewHoverLayer
    cursor: CursorOverlayData | null
    webcam: WebcamOverlayData | null
    annotation: AnnotationOverlayData | null
    video: VideoOverlayData | null
    background: VideoOverlayData | null
    subtitle: SubtitleOverlayData | null
    keystroke: KeystrokeOverlayData | null
}

export const INITIAL_HOVER_STATE: HoverState = {
    layer: null,
    cursor: null,
    webcam: null,
    annotation: null,
    video: null,
    background: null,
    subtitle: null,
    keystroke: null,
}

export interface HitTestContext {
    containerRect: DOMRect
    clientX: number
    clientY: number
    canSelectBackground: boolean
    canSelectCursor: boolean
    canSelectWebcam: boolean
    canSelectVideo: boolean
    webcamClip: Clip | null | undefined
    snapshot: FrameSnapshot
    aspectContainer: HTMLElement
    playerContainer: HTMLElement | null
}

function intersectRects(a: DOMRect, b: DOMRect) {
    const left = Math.max(a.left, b.left)
    const top = Math.max(a.top, b.top)
    const right = Math.min(a.right, b.right)
    const bottom = Math.min(a.bottom, b.bottom)
    const width = Math.max(0, right - left)
    const height = Math.max(0, bottom - top)
    return { left, top, width, height }
}

function getWebcamBorderRadius(data: WebcamLayoutData): string {
    switch (data.shape) {
        case 'circle':
            return '50%'
        case 'rectangle':
            return '0px'
        case 'rounded-rect':
        case 'squircle':
        default:
            return `${data.cornerRadius ?? 0}px`
    }
}

function getOverlayFromElement(element: HTMLElement, containerRect: DOMRect) {
    const rect = element.getBoundingClientRect()
    const computed = window.getComputedStyle(element)
    const clipPath = computed.clipPath && computed.clipPath !== 'none' ? computed.clipPath : undefined
    return {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
        borderRadius: computed.borderRadius,
        clipPath
    }
}

/**
 * Pure function that performs hit testing and returns the new hover state.
 * This extracts the ~200 line logic from the hook into a testable function.
 */
export function getHoveredLayer(ctx: HitTestContext): HoverState {
    const {
        containerRect,
        clientX,
        clientY,
        canSelectBackground,
        canSelectCursor,
        canSelectWebcam,
        canSelectVideo,
        webcamClip,
        snapshot,
        aspectContainer,
        playerContainer,
    } = ctx

    // Container-relative mouse position
    const containerX = clientX - containerRect.left
    const containerY = clientY - containerRect.top

    // Basic bounds check
    if (
        containerX < 0 || containerX > containerRect.width ||
        containerY < 0 || containerY > containerRect.height
    ) {
        return INITIAL_HOVER_STATE
    }

    // Get video rect for hover (DOM or snapshot fallback)
    const videoEl = snapshot.mockup.enabled
        ? playerContainer?.querySelector<HTMLElement>('[data-video-content-container="true"]')
        : playerContainer?.querySelector<HTMLElement>('[data-video-transform-container="true"]')
    const domVideoRect = videoEl ? getOverlayFromElement(videoEl, containerRect) : null

    const cameraTransform = getCameraTransformFromSnapshot(snapshot)
    const videoRect = getVideoRectFromSnapshot(snapshot)
    const getTransformedRect = (rect: { x: number, y: number, width: number, height: number }) => {
        if (!cameraTransform) return rect
        return applyCameraTransformToPixelRect(rect, videoRect, cameraTransform)
    }
    const transformedVideoRect = getTransformedRect({
        x: videoRect.x,
        y: videoRect.y,
        width: videoRect.width,
        height: videoRect.height
    })
    const videoRectForHover = domVideoRect ?? transformedVideoRect

    // 1) Webcam
    if (canSelectWebcam && webcamClip) {
        const webcamData = webcamClip.layout ?? DEFAULT_WEBCAM_DATA
        const webcamEl = playerContainer?.querySelector<HTMLElement>('[data-webcam-overlay="true"]')

        if (webcamEl) {
            const webcamOverlay = getOverlayFromElement(webcamEl, containerRect)
            const isInsideWebcamEl = (
                containerX >= webcamOverlay.x &&
                containerX <= webcamOverlay.x + webcamOverlay.width &&
                containerY >= webcamOverlay.y &&
                containerY <= webcamOverlay.y + webcamOverlay.height
            )

            if (isInsideWebcamEl) {
                return { ...INITIAL_HOVER_STATE, layer: 'webcam', webcam: webcamOverlay }
            }
        } else {
            // Fallback: compute layout
            const playerRect = playerContainer?.getBoundingClientRect() ?? containerRect
            const layout = getWebcamLayout(webcamData, playerRect.width, playerRect.height)
            const webcamRect = {
                x: (playerRect.left - containerRect.left) + layout.x,
                y: (playerRect.top - containerRect.top) + layout.y,
                width: layout.size,
                height: layout.size
            }

            const isInsideWebcamFallback = (
                containerX >= webcamRect.x &&
                containerX <= webcamRect.x + webcamRect.width &&
                containerY >= webcamRect.y &&
                containerY <= webcamRect.y + webcamRect.height
            )

            if (isInsideWebcamFallback) {
                return {
                    ...INITIAL_HOVER_STATE,
                    layer: 'webcam',
                    webcam: {
                        x: webcamRect.x,
                        y: webcamRect.y,
                        width: webcamRect.width,
                        height: webcamRect.height,
                        borderRadius: getWebcamBorderRadius(webcamData)
                    }
                }
            }
        }
    }

    // 2) Subtitles
    const subtitleEl = playerContainer?.querySelector<HTMLElement>('[data-subtitle-layer="true"]')
    if (subtitleEl) {
        const overlay = getOverlayFromElement(subtitleEl, containerRect)
        const isInside = (
            containerX >= overlay.x &&
            containerX <= overlay.x + overlay.width &&
            containerY >= overlay.y &&
            containerY <= overlay.y + overlay.height
        )

        if (isInside) {
            return {
                ...INITIAL_HOVER_STATE,
                layer: 'subtitle',
                subtitle: {
                    id: subtitleEl.dataset.effectId ?? 'subtitle',
                    x: overlay.x,
                    y: overlay.y,
                    width: overlay.width,
                    height: overlay.height,
                    borderRadius: overlay.borderRadius
                }
            }
        }
    }

    // 3) Keystrokes
    const keystrokeEl = playerContainer?.querySelector<HTMLElement>('[data-keystroke-layer="true"]')
    if (keystrokeEl) {
        const overlay = getOverlayFromElement(keystrokeEl, containerRect)
        const isInside = (
            containerX >= overlay.x &&
            containerX <= overlay.x + overlay.width &&
            containerY >= overlay.y &&
            containerY <= overlay.y + overlay.height
        )

        if (isInside) {
            const isFullScreen = overlay.width > containerRect.width * 0.9 && overlay.height > containerRect.height * 0.9
            if (!isFullScreen) {
                return {
                    ...INITIAL_HOVER_STATE,
                    layer: 'keystroke',
                    keystroke: {
                        id: keystrokeEl.dataset.effectId ?? 'keystroke',
                        x: overlay.x,
                        y: overlay.y,
                        width: overlay.width,
                        height: overlay.height,
                        borderRadius: overlay.borderRadius
                    }
                }
            }
        }
    }

    // 4) Annotations
    const annotationHit = hitTestAnnotationsFromPoint(clientX, clientY)
    if (annotationHit) {
        const contentEl =
            annotationHit.annotationElement.querySelector<HTMLElement>('[data-annotation-content="true"]') ??
            annotationHit.annotationElement
        const annotationRect = contentEl.getBoundingClientRect()
        const visibleRect = intersectRects(annotationRect, containerRect)
        if (visibleRect.width > 0 && visibleRect.height > 0) {
            const annotationType = (annotationHit.annotationElement.dataset.annotationType as AnnotationType | undefined) ?? AnnotationType.Text
            return {
                ...INITIAL_HOVER_STATE,
                layer: 'annotation',
                annotation: {
                    id: annotationHit.annotationId,
                    type: annotationType,
                    x: visibleRect.left - containerRect.left,
                    y: visibleRect.top - containerRect.top,
                    width: visibleRect.width,
                    height: visibleRect.height
                }
            }
        }
    }

    // 5) Cursor
    if (canSelectCursor) {
        const cursorEl = aspectContainer.querySelector<HTMLElement>('[data-cursor-layer="true"]')
        if (cursorEl) {
            const cursorRect = cursorEl.getBoundingClientRect()
            const isInsideCursor = (
                clientX >= cursorRect.left &&
                clientX <= cursorRect.right &&
                clientY >= cursorRect.top &&
                clientY <= cursorRect.bottom
            )

            if (isInsideCursor) {
                return {
                    ...INITIAL_HOVER_STATE,
                    layer: 'cursor',
                    cursor: {
                        left: cursorRect.left - containerRect.left,
                        top: cursorRect.top - containerRect.top,
                        width: cursorRect.width,
                        height: cursorRect.height,
                        tipX: (cursorRect.left - containerRect.left) + cursorRect.width / 2,
                        tipY: (cursorRect.top - containerRect.top) + cursorRect.height / 2,
                        src: ''
                    }
                }
            }
        }
    }

    // 6) Video
    if (canSelectVideo) {
        if (
            containerX >= videoRectForHover.x &&
            containerX <= videoRectForHover.x + videoRectForHover.width &&
            containerY >= videoRectForHover.y &&
            containerY <= videoRectForHover.y + videoRectForHover.height
        ) {
            return {
                ...INITIAL_HOVER_STATE,
                layer: 'video',
                video: {
                    x: videoRectForHover.x,
                    y: videoRectForHover.y,
                    width: videoRectForHover.width,
                    height: videoRectForHover.height,
                    borderRadius: domVideoRect?.borderRadius,
                    clipPath: domVideoRect?.clipPath
                }
            }
        }
    }

    // 7) Background
    if (canSelectBackground) {
        const backgroundEl = playerContainer?.querySelector<HTMLElement>('[data-extended-background="true"]')
        const transformEl = playerContainer?.querySelector<HTMLElement>('[data-video-transform-container="true"]')
        const overlayEl = backgroundEl ?? transformEl
        const overlay = overlayEl ? getOverlayFromElement(overlayEl, containerRect) : null
        return { ...INITIAL_HOVER_STATE, layer: 'background', background: overlay }
    }

    return INITIAL_HOVER_STATE
}
