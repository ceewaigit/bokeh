import React, { useMemo } from 'react';
import { AbsoluteFill, useVideoConfig, useCurrentFrame } from 'remotion';
import { EffectType, type KeystrokeEffectData, type Effect, type KeyboardEvent } from '@/types/project';

import { useClipContext } from '../../context/timeline/ClipContext';
import { useSourceTime } from '../../hooks/time/useTimeCoordinates';
import { useComposition } from '../../context/CompositionContext';
import { useTimelineContext } from '../../context/RenderingTimelineContext';
import { DEFAULT_KEYSTROKE_DATA } from '@/features/effects/keystroke/config';
import { KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config';
import { useOverlayContext } from '@/features/rendering/overlays/overlay-context';
import { useVideoPosition } from '@/features/rendering/renderer/context/layout/VideoPositionContext';
import { KeystrokePreviewOverlay } from '@/features/effects/keystroke/components/keystroke-preview-overlay';
import { calculateVideoPosition } from '@/features/rendering/renderer/engine/layout-engine';
import { OverlayAnchor } from '@/types/overlays';

export const KeystrokeLayer: React.FC = () => {
  const sourceTimeMs = useSourceTime();
  const { keystrokeEvents, clip, effects } = useClipContext();
  const { width, height } = useVideoConfig();
  const { fps } = useComposition();
  const frame = useCurrentFrame();
  const { resolvedAnchors } = useOverlayContext();
  const videoPosition = useVideoPosition();
  const { getRecording } = useTimelineContext();
  const overlayScale = useMemo(() => {
    const scaleFactor = videoPosition.scaleFactor;
    if (typeof scaleFactor === 'number' && Number.isFinite(scaleFactor) && scaleFactor > 0) {
      return scaleFactor;
    }
    return 1;
  }, [videoPosition.scaleFactor]);

  // Calculate dimensions for THIS clip's recording (architectural fix)
  // Previously used global VideoPositionContext which could have dimensions for a different clip
  const clipLayout = useMemo(() => {
    const recording = getRecording(clip.recordingId);
    if (!recording) {
      return { drawWidth: width, drawHeight: height, offsetX: 0, offsetY: 0 };
    }
    const padding = videoPosition.paddingScaled ?? 0;
    return calculateVideoPosition(width, height, recording.width, recording.height, padding);
  }, [clip.recordingId, getRecording, width, height, videoPosition.paddingScaled]);


  const keystrokeStyleEffect = useMemo(() => {
    return effects.find(e => e.type === EffectType.Keystroke && e.id === KEYSTROKE_STYLE_EFFECT_ID);
  }, [effects]);

  const activeKeystrokeEffects = useMemo(() => {
    const frameDurationMs = 1000 / fps;
    const timelineTimeMs = clip.startTime + ((frame + 0.5) / fps) * 1000;
    const tolerance = frameDurationMs;

    return effects.filter(e =>
      e.type === EffectType.Keystroke &&
      e.id !== KEYSTROKE_STYLE_EFFECT_ID &&
      e.enabled &&
      timelineTimeMs + tolerance >= e.startTime &&
      timelineTimeMs <= e.endTime + tolerance
    );
  }, [effects, clip.startTime, frame, fps]);

  if (activeKeystrokeEffects.length === 0) {
    return null;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 150 }}>
      {activeKeystrokeEffects.map(effect => (
        <KeystrokeEffectRenderer
          key={effect.id}
          effect={effect}
          sourceTimeMs={sourceTimeMs}
          keystrokeEvents={keystrokeEvents}
          clipLayout={clipLayout}
          overlayScale={overlayScale}
          resolvedAnchor={resolvedAnchors.get(effect.id)}
          styleEffect={keystrokeStyleEffect}
        />
      ))}
    </AbsoluteFill>
  );
};

interface KeystrokeEffectRendererProps {
  effect: Effect;
  sourceTimeMs: number;
  keystrokeEvents: KeyboardEvent[];
  clipLayout: {
    drawWidth: number;
    drawHeight: number;
    offsetX: number;
    offsetY: number;
  };
  overlayScale: number;
  resolvedAnchor?: OverlayAnchor;
  styleEffect?: Effect;
}

const KeystrokeEffectRenderer: React.FC<KeystrokeEffectRendererProps> = ({
  effect,
  sourceTimeMs,
  keystrokeEvents,
  clipLayout,
  overlayScale,
  resolvedAnchor,
  styleEffect,
}) => {
  // Merge effect data with defaults - pass ALL settings
  const settings = useMemo<KeystrokeEffectData>(() => {
    const data = effect.data as KeystrokeEffectData | undefined;
    const styleData = (styleEffect?.data as KeystrokeEffectData | undefined) ?? {};
    return {
      ...DEFAULT_KEYSTROKE_DATA,
      ...styleData,
      ...data,
      ...(resolvedAnchor ? { anchor: resolvedAnchor } : {})
    };
  }, [effect.data, resolvedAnchor, styleEffect?.data]);

  const scaledSettings = useMemo<KeystrokeEffectData>(() => {
    const baseScale = settings.scale ?? 1;
    return {
      ...settings,
      scale: baseScale * overlayScale,
      offsetX: typeof settings.offsetX === 'number' ? settings.offsetX * overlayScale : settings.offsetX,
      offsetY: typeof settings.offsetY === 'number' ? settings.offsetY * overlayScale : settings.offsetY,
    };
  }, [settings, overlayScale]);

  if (keystrokeEvents.length === 0) {
    return null;
  }

  // Use clip-specific dimensions (architectural fix: dimensions from this clip's recording)
  const effectiveWidth = clipLayout.drawWidth;
  const effectiveHeight = clipLayout.drawHeight;
  const effectiveOffsetX = clipLayout.offsetX;
  const effectiveOffsetY = clipLayout.offsetY;

  return (
    <div
      style={{
        position: 'absolute',
        left: effectiveOffsetX,
        top: effectiveOffsetY,
        width: effectiveWidth,
        height: effectiveHeight,
        pointerEvents: 'none',
      }}
    >
      <KeystrokePreviewOverlay
        data-keystroke-layer="true"
        data-effect-id={effect.id}
        currentTimeMs={sourceTimeMs}
        keystrokeEvents={keystrokeEvents}
        settings={scaledSettings}
        enabled
      />
    </div>
  );
};
