/**
 * Video helper components for Remotion compositions.
 * SafeVideo: Manual time sync wrapper with proper seek waiting.
 * AudioEnhancerWrapper: Attaches audio enhancement to video elements.
 */

import React, { useRef, useState, useEffect } from 'react';
import { useCurrentFrame, useVideoConfig, delayRender, continueRender, getRemotionEnvironment } from 'remotion';
import { useAudioEnhancement } from '@/hooks/use-audio-enhancement';
import type { AudioEnhancerWrapperProps, SafeVideoProps } from '@/types';

/**
 * SafeVideo: A wrapper around native <video> that properly syncs time.
 * Uses delayRender/continueRender during export to wait for seek completion.
 * This fixes jitter caused by Remotion screenshotting before video seeks.
 */
export const SafeVideo = React.forwardRef<HTMLVideoElement, SafeVideoProps>((props, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { isRendering } = getRemotionEnvironment();

  // Track the current delay handle
  const delayHandleRef = useRef<number | null>(null);
  const lastSeekTimeRef = useRef<number>(-1);

  // Sync ref
  React.useImperativeHandle(ref, () => videoRef.current!);

  // Seek and wait for completion
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const { startFrom = 0, playbackRate = 1 } = props;
    const frameInSource = startFrom + (frame * playbackRate);
    const timeInSeconds = frameInSource / fps;

    if (!Number.isFinite(timeInSeconds)) return;

    // Skip if already at this time (avoid unnecessary seeks)
    if (Math.abs(video.currentTime - timeInSeconds) < 0.001) return;
    if (lastSeekTimeRef.current === timeInSeconds) return;
    lastSeekTimeRef.current = timeInSeconds;

    // During export: use delayRender to wait for seek
    if (isRendering) {
      // Clear any pending delay
      if (delayHandleRef.current !== null) {
        continueRender(delayHandleRef.current);
        delayHandleRef.current = null;
      }

      // Create new delay
      const handle = delayRender(`SafeVideo seeking to ${timeInSeconds.toFixed(3)}s`);
      delayHandleRef.current = handle;

      const onSeeked = () => {
        if (delayHandleRef.current === handle) {
          continueRender(handle);
          delayHandleRef.current = null;
        }
      };

      const onError = () => {
        // Continue anyway on error to prevent hanging
        if (delayHandleRef.current === handle) {
          continueRender(handle);
          delayHandleRef.current = null;
        }
      };

      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.currentTime = timeInSeconds;

      return () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
      };
    } else {
      // Preview: just set time directly (no waiting needed)
      video.currentTime = timeInSeconds;
    }
  }, [frame, fps, props.startFrom, props.playbackRate, isRendering]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (delayHandleRef.current !== null) {
        continueRender(delayHandleRef.current);
        delayHandleRef.current = null;
      }
    };
  }, []);

  // Filter out Remotion-specific props that <video> doesn't understand
  const { startFrom, endAt, playbackRate, volume, ...nativeProps } = props;

  return (
    <video
      {...nativeProps}
      ref={(node) => {
        // Update internal ref
        (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;

        // Forward external ref
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLVideoElement | null>).current = node;
        }

        // Apply volume
        if (node && typeof volume === 'number') {
          node.volume = volume;
        }
      }}
    />
  );
});
SafeVideo.displayName = 'SafeVideo';

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
