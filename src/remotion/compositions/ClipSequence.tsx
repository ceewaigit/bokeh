/**
 * Clip Sequence - Coordinator for a single clip within the timeline
 *
 * Wraps a clip in a Remotion <Sequence> and provides ClipContext to all layers.
 * Renders the appropriate layers based on configuration.
 *
 * Responsibilities:
 * - Wrap clip in Remotion Sequence with correct timing
 * - Provide ClipContext to child layers
 * - Render background and keystroke layers as configured
 */

import React from 'react';
import { Sequence } from 'remotion';
import type { ClipSequenceProps } from '@/types';
import { ClipProvider, useClipContext } from '../context/ClipContext';
import { BackgroundLayer } from './BackgroundLayer';
import { KeystrokeLayer } from './KeystrokeLayer';

/**
 * Inner component that renders layers - must be inside ClipProvider
 */
const ClipLayers: React.FC<{
  videoWidth: number;
  videoHeight: number;
  includeBackground?: boolean;
  includeKeystrokes?: boolean;
}> = ({ videoWidth, videoHeight, includeBackground = false, includeKeystrokes = true }) => {
  const { effects } = useClipContext();

  // Extract effect data for layers
  const backgroundEffect = React.useMemo(() => {
    return effects.find((e) => e.type === 'background');
  }, [effects]);

  // Get ALL keystroke effects (per-typing-period architecture)
  const keystrokeEffects = React.useMemo(() => {
    return effects.filter((e) => e.type === 'keystroke');
  }, [effects]);

  return (
    <>
      {includeBackground && (
        <BackgroundLayer
          backgroundEffect={backgroundEffect}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
        />
      )}

      {/* Video layer is rendered by SharedVideoController at TimelineComposition level */}

      {/* Keystrokes (above video) */}
      {includeKeystrokes && (
        <KeystrokeLayer keystrokeEffects={keystrokeEffects} videoWidth={videoWidth} videoHeight={videoHeight} />
      )}
    </>
  );
};

/**
 * Clip Sequence
 *
 * Clean pattern: Sequence wraps context and layers
 */
export const ClipSequence: React.FC<ClipSequenceProps> = ({
  clip,
  effects,
  videoWidth,
  videoHeight,
  startFrame,
  durationFrames,
  resources,
  renderSettings,

  includeBackground,
  includeKeystrokes,
}) => {
  const { preferOffthreadVideo } = renderSettings || {};

  return (
    <Sequence
      from={startFrame}
      durationInFrames={durationFrames}
      name={`Clip ${clip.id}`}
    >
      <ClipProvider
        clip={clip}
        effects={effects}
        resources={resources}
        preferOffthreadVideo={preferOffthreadVideo}
      >
        <ClipLayers
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          includeBackground={includeBackground}
          includeKeystrokes={includeKeystrokes}
        />
      </ClipProvider>
    </Sequence>
  );
};
