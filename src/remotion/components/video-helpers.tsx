/**
 * Video helper components for Remotion compositions.
 * AudioEnhancerWrapper: Attaches audio enhancement to video elements.
 */

import React, { useState } from 'react';
import { useAudioEnhancement } from '@/hooks/audio/use-audio-enhancement';
import type { AudioEnhancerWrapperProps } from '@/types';

/**
 * AudioEnhancerWrapper: Wraps video elements to attach audio enhancement hooks.
 */
export const AudioEnhancerWrapper: React.FC<AudioEnhancerWrapperProps> = ({
  children,
  enabled = false,
}) => {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

  useAudioEnhancement(videoElement, enabled);

  return React.cloneElement(children, {
    ref: (node: HTMLVideoElement) => {
      if (node !== videoElement) {
        setVideoElement(node);
      }
      const { ref } = children as any;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
  });
};
