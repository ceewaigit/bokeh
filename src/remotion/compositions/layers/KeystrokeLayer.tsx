import React, { useEffect, useRef, useMemo } from 'react';
import { AbsoluteFill, useVideoConfig, useCurrentFrame } from 'remotion';
import { KeystrokeRenderer, type KeystrokeDrawRect } from '@/lib/effects/keystroke-renderer';
import type { KeystrokeEffectData } from '@/types/project';
import type { KeystrokeLayerProps } from '@/types';
import { useClipContext } from '../../context/timeline/ClipContext';
import { useSourceTime } from '../../hooks/time/useTimeCoordinates';
import { useTimeContext } from '../../context/timeline/TimeContext';
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects';

export const KeystrokeLayer: React.FC<KeystrokeLayerProps> = ({
  keystrokeEffects,
  videoWidth: _videoWidth,
  videoHeight: _videoHeight
}) => {
  const sourceTimeMs = useSourceTime();
  const { keystrokeEvents, clip } = useClipContext();
  const { width, height } = useVideoConfig();
  const { fps } = useTimeContext();
  const frame = useCurrentFrame();

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
    return {
      ...DEFAULT_KEYSTROKE_DATA,
      ...data
    };
  }, [activeEffect?.data]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<KeystrokeRenderer | null>(null);
  const lastDrawRectRef = useRef<KeystrokeDrawRect | null>(null);
  // Track settings version to force re-render when they change
  const settingsVersionRef = useRef(0);
  // Use fixed DPR of 2 for crisp rendering regardless of source
  const dpr = 2;

  const shouldRender = !!activeEffect && keystrokeEvents.length > 0;

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

    const rect = rendererRef.current.render(sourceTimeMs, width, height);
    if (rect) {
      lastDrawRectRef.current = rect;
    }
  }, [shouldRender, sourceTimeMs, width, height, settingsVersionRef.current]);

  if (!shouldRender) {
    return null;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <canvas
        ref={canvasRef}
        width={width * dpr}
        height={height * dpr}
        style={{
          width: '100%',
          height: '100%',
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
