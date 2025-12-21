import type { CameraPathFrame } from '@/types';
import type { CameraMotionBlurState, MotionBlurConfig } from '@/types';
import {
  calculateCameraMotionBlurFromDelta,
  calculateCameraMotionBlurFromCenters,
  calculateZoomTransform,
} from './zoom-transform';

type ZoomTransformLike = {
  scale: number;
  panX: number;
  panY: number;
};

type RenderDataLike = {
  zoomTransform: ZoomTransformLike | null;
  drawWidth: number;
  drawHeight: number;
  padding?: number;
  scaleFactor?: number;
};

export function calculateCameraMotionBlur(params: {
  blurConfig: MotionBlurConfig;
  renderData: RenderDataLike | null | undefined;
  currentFrame: number;
  fps: number;
  outputWidth: number;
  outputHeight: number;
  isRendering: boolean;
  isNearBoundaryStart: boolean;
  isNearBoundaryEnd: boolean;
  shouldHoldPrevFrame: boolean;
  precomputedPath?: CameraPathFrame[];
  calculatedZoomCenter: { x: number; y: number };
  calculatedZoomBlock: { autoScale?: 'fill' } | undefined;
  prevPanRef?: { panX: number; panY: number } | null;
}): CameraMotionBlurState {
  const {
    blurConfig,
    renderData,
    currentFrame,
    fps,
    outputWidth,
    outputHeight,
    isRendering,
    isNearBoundaryStart,
    isNearBoundaryEnd,
    shouldHoldPrevFrame,
    precomputedPath,
    calculatedZoomCenter,
    calculatedZoomBlock,
    prevPanRef,
  } = params;

  if (!blurConfig.enabled) return { blurRadius: 0, angle: 0, velocity: 0 };
  // FEATURE FIX: Disable motion blur for "Fill Screen" zoom blocks (user request)
  if (calculatedZoomBlock?.autoScale === 'fill') return { blurRadius: 0, angle: 0, velocity: 0 };
  if (!renderData?.zoomTransform) return { blurRadius: 0, angle: 0, velocity: 0 };
  if (currentFrame <= 0) return { blurRadius: 0, angle: 0, velocity: 0 };

  // Preview: use previous pan delta (cheap, sequential).
  if (!isRendering) {
    const prev = prevPanRef;
    if (!prev) return { blurRadius: 0, angle: 0, velocity: 0 };
    const rawBlur = calculateCameraMotionBlurFromDelta(
      renderData.zoomTransform.panX - prev.panX,
      renderData.zoomTransform.panY - prev.panY,
      blurConfig
    );
    const zoomStrength = Math.max(0, Math.min(1, (renderData.zoomTransform.scale - 1) / 0.5));
    return { ...rawBlur, blurRadius: rawBlur.blurRadius * zoomStrength };
  }

  // Avoid cross-clip delta artifacts near cut boundaries.
  if (isNearBoundaryStart || isNearBoundaryEnd || shouldHoldPrevFrame) {
    return { blurRadius: 0, angle: 0, velocity: 0 };
  }

  const path = precomputedPath;
  if (!path) return { blurRadius: 0, angle: 0, velocity: 0 };

  const prev = path[currentFrame - 1];
  if (!prev) return { blurRadius: 0, angle: 0, velocity: 0 };

  const prevPrev = currentFrame >= 2 ? path[currentFrame - 2] : undefined;

  const paddingScaled = (renderData.padding || 0) * (renderData.scaleFactor || 1);
  const fillScale = (renderData.drawWidth > 0 && renderData.drawHeight > 0)
    ? Math.max(outputWidth / renderData.drawWidth, outputHeight / renderData.drawHeight)
    : 1;
  const getScaleOverride = (block: typeof prev.activeZoomBlock) =>
    block?.autoScale === 'fill' ? fillScale : undefined;

  const tPrev = ((currentFrame - 1) / fps) * 1000;
  const prevTransform = calculateZoomTransform(
    prev.activeZoomBlock,
    tPrev,
    renderData.drawWidth,
    renderData.drawHeight,
    prev.zoomCenter,
    getScaleOverride(prev.activeZoomBlock),
    paddingScaled,
    prev.activeZoomBlock?.autoScale === 'fill'
  );

  const getBlurFromCenters = (
    a: typeof prev,
    aTransform: { scale: number },
    b: typeof prev,
    bTransform: { scale: number }
  ) => {
    return calculateCameraMotionBlurFromCenters(
      a.zoomCenter,
      aTransform.scale,
      b.zoomCenter,
      bTransform.scale,
      renderData.drawWidth,
      renderData.drawHeight,
      blurConfig
    );
  };

  const blurCurrent = getBlurFromCenters(
    prev,
    prevTransform,
    { ...prev, zoomCenter: calculatedZoomCenter },
    renderData.zoomTransform
  );

  const blurPrev = (prevPrev)
    ? (() => {
      const tPrevPrev = ((currentFrame - 2) / fps) * 1000;
      const prevPrevTransform = calculateZoomTransform(
        prevPrev.activeZoomBlock,
        tPrevPrev,
        renderData.drawWidth,
        renderData.drawHeight,
        prevPrev.zoomCenter,
        getScaleOverride(prevPrev.activeZoomBlock),
        paddingScaled,
        prevPrev.activeZoomBlock?.autoScale === 'fill'
      );
      return getBlurFromCenters(prevPrev, prevPrevTransform, prev, prevTransform);
    })()
    : null;

  const rawBlur = blurPrev
    ? {
      blurRadius: blurPrev.blurRadius * 0.35 + blurCurrent.blurRadius * 0.65,
      angle: blurPrev.angle * 0.35 + blurCurrent.angle * 0.65,
      velocity: blurPrev.velocity * 0.35 + blurCurrent.velocity * 0.65,
    }
    : blurCurrent;

  const zoomStrength = Math.max(0, Math.min(1, (renderData.zoomTransform.scale - 1) / 0.5));
  return { ...rawBlur, blurRadius: rawBlur.blurRadius * zoomStrength };
}
