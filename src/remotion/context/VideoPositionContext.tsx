/**
 * Video Position Context - Shares actual video position and transforms
 *
 * This context ensures that overlays (cursor, annotations, etc.) use the EXACT same
 * video position and transforms as the SharedVideoController, preventing coordinate mismatches.
 */

import React, { createContext, useContext } from 'react';
import type { VideoPositionContextValue } from '@/types';

const VideoPositionContext = createContext<VideoPositionContextValue | null>(null);

export function VideoPositionProvider({
  value,
  children,
}: {
  value: VideoPositionContextValue;
  children: React.ReactNode;
}) {
  return <VideoPositionContext.Provider value={value}>{children}</VideoPositionContext.Provider>;
}

/**
 * Hook to access the actual video position and transforms from SharedVideoController
 *
 * This ensures overlays render at the correct position relative to the video,
 * using the same coordinate space and transforms.
 */
export function useVideoPosition(): VideoPositionContextValue {
  const context = useContext(VideoPositionContext);
  if (!context) {
    throw new Error('useVideoPosition must be used within VideoPositionProvider (inside SharedVideoController)');
  }
  return context;
}
