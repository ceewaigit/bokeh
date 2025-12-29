import React, { useEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { AnnotationEffectStrategy } from '@/lib/effects/strategies/annotation-strategy';
import { useVideoPosition } from '../../context/layout/VideoPositionContext';
import type { Effect } from '@/types/project';
import { EffectType } from '@/types/project';

interface AnnotationLayerProps {
  effects: Effect[];
}

export const AnnotationLayer: React.FC<AnnotationLayerProps> = ({ effects }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const videoPosition = useVideoPosition();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strategyRef = useRef(new AnnotationEffectStrategy());

  const currentTimeMs = useMemo(() => (frame / fps) * 1000, [frame, fps]);
  const activeAnnotations = useMemo(() => {
    return effects.filter((effect) => {
      if (effect.type !== EffectType.Annotation) return false;
      if (!effect.enabled) return false;
      return currentTimeMs >= effect.startTime && currentTimeMs <= effect.endTime;
    });
  }, [effects, currentTimeMs]);

  // During rendering/export, use dpr of 1 for consistent output
  // In preview, use device pixel ratio for sharp display (max 2)
  const dpr = useMemo(() => {
    // In server-side rendering or export, use 1
    if (typeof window === 'undefined') return 1
    // Fixed DPR for reliable canvas rendering
    return Math.min(2, window.devicePixelRatio || 1)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, Math.floor(videoPosition.drawWidth * dpr));
    canvas.height = Math.max(1, Math.floor(videoPosition.drawHeight * dpr));
  }, [videoPosition.drawWidth, videoPosition.drawHeight, dpr]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, videoPosition.drawWidth, videoPosition.drawHeight);

    if (activeAnnotations.length === 0) return;

    const context = {
      canvas,
      ctx,
      timestamp: currentTimeMs,
      width: videoPosition.drawWidth,
      height: videoPosition.drawHeight,
      videoWidth: videoPosition.drawWidth,
      videoHeight: videoPosition.drawHeight,
      effects: activeAnnotations,
    };

    for (const effect of activeAnnotations) {
      strategyRef.current.render(context, effect);
    }
  }, [activeAnnotations, currentTimeMs, dpr, videoPosition.drawWidth, videoPosition.drawHeight]);

  if (activeAnnotations.length === 0) {
    return null;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: videoPosition.offsetX,
          top: videoPosition.offsetY,
          width: videoPosition.drawWidth,
          height: videoPosition.drawHeight,
          pointerEvents: 'none',
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
      />
    </AbsoluteFill>
  );
};
