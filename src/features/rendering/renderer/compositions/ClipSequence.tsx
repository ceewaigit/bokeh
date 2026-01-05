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
import { ClipProvider } from '../context/timeline/ClipContext';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { KeystrokeLayer } from './layers/KeystrokeLayer';

/**
 * Inner component that renders layers - must be inside ClipProvider
 */
const ClipLayers: React.FC<{
  includeBackground?: boolean;
  includeKeystrokes?: boolean;
}> = ({ includeBackground = false, includeKeystrokes = true }) => {
  // Effects are now pulled directly from context in child layers

  return (
    <>
      {includeBackground && (
        <BackgroundLayer />
      )}

      {/* Video layer is rendered by SharedVideoController at TimelineComposition level */}

      {/* Keystrokes (above video) */}
      {includeKeystrokes && (
        <KeystrokeLayer />
      )}
    </>
  );
};

/**
 * Clip Sequence
 *
 * Clean pattern: Sequence wraps context and layers
 * Resources are now accessed via TimeContext (SSOT) instead of props
 */

export const ClipSequence = React.memo(({
  clip,
  startFrame,
  durationFrames,

  includeBackground,
  includeKeystrokes,
}: ClipSequenceProps) => {
  return (
    <Sequence
      from={startFrame}
      durationInFrames={durationFrames}
      name={`Clip ${clip.id}`}
    >
      <ClipProvider clip={clip}>
        <ClipLayers
          includeBackground={includeBackground}
          includeKeystrokes={includeKeystrokes}
        />
      </ClipProvider>
    </Sequence>
  );
}, (prev, next) => {
  return (
    prev.clip.id === next.clip.id &&
    prev.clip.startTime === next.clip.startTime &&
    prev.clip.duration === next.clip.duration &&
    prev.startFrame === next.startFrame &&
    prev.durationFrames === next.durationFrames &&
    prev.includeBackground === next.includeBackground &&
    prev.includeKeystrokes === next.includeKeystrokes
  );
});

ClipSequence.displayName = 'ClipSequence';
