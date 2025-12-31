
import React, { useEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { AnnotationEffectStrategy } from '@/features/effects/strategies/annotation-strategy';
import { useVideoPosition } from '@/remotion/context/layout/VideoPositionContext';
import { useProjectStore } from '@/stores/project-store';
import type { Effect } from '@/types/project';
import { EffectType } from '@/types/project';

import { useTimelineContext } from '@/remotion/context/TimelineContext';

export const AnnotationLayer: React.FC = () => {
  const { effects } = useTimelineContext();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const videoPosition = useVideoPosition();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strategyRef = useRef(new AnnotationEffectStrategy());

  const currentTimeMs = useMemo(() => (frame / fps) * 1000, [frame, fps]);
  const transientState = useProjectStore((s) => s.transientEffectState)

  const activeAnnotations = useMemo(() => {
    return effects
      .filter((effect) => {
        if (effect.type !== EffectType.Annotation) return false;
        // Default to true if enabled is undefined
        if (effect.enabled === false) return false;
        return currentTimeMs >= effect.startTime && currentTimeMs <= effect.endTime;
      })
      .map((effect) => {
        // If this effect is being dragged/edited transiently, use the transient data
        if (transientState && transientState.id === effect.id) {
          // Shallow merge data. For nested objects like 'style', deep merge might be needed if we edit that transiently.
          // For drag (position), top-level merge is sufficient.
          return {
            ...effect,
            data: { ...effect.data, ...(transientState.data as any) },
          }
        }
        return effect
      });
  }, [effects, currentTimeMs, transientState]);

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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset transform before clearing
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear entire canvas

    if (activeAnnotations.length === 0) return;

    // Apply scaling
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
      ctx.save();
      strategyRef.current.render(context, effect);
      ctx.restore();
    }
  }, [activeAnnotations, currentTimeMs, dpr, videoPosition.drawWidth, videoPosition.drawHeight]);

  if (activeAnnotations.length === 0) {
    return null;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 100 }}>
      <canvas
        ref={canvasRef}
        width={Math.floor(videoPosition.drawWidth * dpr)}
        height={Math.floor(videoPosition.drawHeight * dpr)}
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
