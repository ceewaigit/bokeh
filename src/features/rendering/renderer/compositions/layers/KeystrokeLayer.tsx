import React, { useEffect, useRef, useMemo } from 'react';
import { AbsoluteFill, useVideoConfig, useCurrentFrame, getRemotionEnvironment } from 'remotion';
import { KeystrokeRenderer, type KeystrokeDrawRect } from '@/features/effects/keystroke/renderer';
import type { KeystrokeEffectData } from '@/types/project';

import { useClipContext } from '../../context/timeline/ClipContext';
import { useSourceTime } from '../../hooks/time/useTimeCoordinates';
import { useComposition } from '../../context/CompositionContext';
import { DEFAULT_KEYSTROKE_DATA } from '@/features/effects/keystroke/config';
import { useOverlayContext } from '@/features/rendering/overlays/overlay-context';
import { useVideoPosition } from '@/features/rendering/renderer/context/layout/VideoPositionContext';
import { KeystrokePreviewOverlay } from '@/features/effects/keystroke/components/keystroke-preview-overlay';

export const KeystrokeLayer: React.FC = () => {
  const sourceTimeMs = useSourceTime();
  const { keystrokeEvents, clip, effects } = useClipContext();
  const { width, height } = useVideoConfig();
  const { fps } = useComposition();
  const frame = useCurrentFrame();
  const { resolvedAnchors } = useOverlayContext();
  const videoPosition = useVideoPosition();
  const { isRendering } = getRemotionEnvironment();

  const keystrokeEffects = useMemo(() => {
    return effects.filter(e => e.type === 'keystroke');
  }, [effects]);

  const frameDurationMs = useMemo(() => 1000 / fps, [fps]);

  const timelineTimeMs = useMemo(() => {
    return clip.startTime + ((frame + 0.5) / fps) * 1000;
  }, [clip.startTime, frame, fps]);

  const sortedKeystrokeEffects = useMemo(() => {
    return [...keystrokeEffects].sort((a, b) => a.startTime - b.startTime);
  }, [keystrokeEffects]);

  const activeEffect = useMemo(() => {
    const tolerance = frameDurationMs;
    return sortedKeystrokeEffects.find(
      (e) =>
        e.enabled &&
        timelineTimeMs + tolerance >= e.startTime &&
        timelineTimeMs <= e.endTime + tolerance
    );
  }, [sortedKeystrokeEffects, timelineTimeMs, frameDurationMs]);

  // Merge effect data with defaults - pass ALL settings
  const settings = useMemo<KeystrokeEffectData>(() => {
    const data = activeEffect?.data as KeystrokeEffectData | undefined;
    const resolvedAnchor = activeEffect ? resolvedAnchors.get(activeEffect.id) : undefined;
    return {
      ...DEFAULT_KEYSTROKE_DATA,
      ...data,
      ...(resolvedAnchor ? { anchor: resolvedAnchor } : {})
    };
  }, [activeEffect, resolvedAnchors]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<KeystrokeRenderer | null>(null);
  const lastDrawRectRef = useRef<KeystrokeDrawRect | null>(null);
  // Track settings version to force re-render when they change
  const settingsVersionRef = useRef(0);
  const dpr = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1;

  const shouldRender = !!activeEffect &&
    keystrokeEvents.length > 0;

  // Create/update renderer when settings change
  useEffect(() => {
    if (!shouldRender) {
      rendererRef.current = null;
      return;
    }

    // Always create a fresh renderer when settings change to ensure they're applied
    rendererRef.current = new KeystrokeRenderer(settings);
    rendererRef.current.setDPR(dpr);
    settingsVersionRef.current++;

    if (canvasRef.current) {
      rendererRef.current.setCanvas(canvasRef.current);
    }

    rendererRef.current.setKeyboardEvents(keystrokeEvents);
  }, [shouldRender, settings, keystrokeEvents, dpr]);

  // Render keystrokes
  useEffect(() => {
    if (!shouldRender) return;
    if (!canvasRef.current || !rendererRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Clear only the region we drew last frame instead of the full canvas.
    const prev = lastDrawRectRef.current;
    if (prev) {
      ctx.clearRect(prev.x, prev.y, prev.width, prev.height);
      lastDrawRectRef.current = null;
    }

    const drawWidth = videoPosition.drawWidth || width;
    const drawHeight = videoPosition.drawHeight || height;
    const rect = rendererRef.current.render(sourceTimeMs, drawWidth, drawHeight);
    if (rect) {
      lastDrawRectRef.current = rect;
    }
  }, [shouldRender, sourceTimeMs, width, height, videoPosition.drawWidth, videoPosition.drawHeight, settings]);

  if (!shouldRender) {
    return null;
  }

  if (!isRendering) {
    return (
      <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 150 }}>
        <div
          data-keystroke-layer="true"
          data-effect-id={activeEffect.id}
          style={{
            position: 'absolute',
            left: videoPosition.offsetX || 0,
            top: videoPosition.offsetY || 0,
            width: videoPosition.drawWidth || '100%',
            height: videoPosition.drawHeight || '100%',
            pointerEvents: 'none',
          }}
        >
          <KeystrokePreviewOverlay
            currentTimeMs={sourceTimeMs}
            keystrokeEvents={keystrokeEvents}
            settings={settings}
            enabled
          />
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 150 }}>
      <canvas
        ref={canvasRef}
        data-keystroke-layer="true"
        data-effect-id={activeEffect.id}
        width={(videoPosition.drawWidth || width) * dpr}
        height={(videoPosition.drawHeight || height) * dpr}
        style={{
          position: 'absolute',
          left: videoPosition.offsetX || 0,
          top: videoPosition.offsetY || 0,
          width: videoPosition.drawWidth || '100%',
          height: videoPosition.drawHeight || '100%',
          pointerEvents: 'none',
          // Force GPU compositing for crisp rendering
          transform: 'translateZ(0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
        }}
      />
    </AbsoluteFill>
  );
};
