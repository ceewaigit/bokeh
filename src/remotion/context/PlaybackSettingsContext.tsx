/**
 * PlaybackSettingsContext
 *
 * Provides playback, render settings, and video resources to the composition tree.
 * This eliminates prop drilling of config objects through SharedVideoController
 * and renderers.
 *
 * Usage:
 * - Wrap TimelineComposition children with PlaybackSettingsProvider
 * - Use usePlaybackSettings() in any component that needs these settings
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { PlaybackSettings, RenderSettings, VideoResources } from '@/types';

// ============================================================================
// CONTEXT TYPES
// ============================================================================

interface PlaybackSettingsContextValue {
  playback: PlaybackSettings;
  renderSettings: RenderSettings;
  resources: VideoResources;
}

// ============================================================================
// CONTEXT
// ============================================================================

const PlaybackSettingsContext = createContext<PlaybackSettingsContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface PlaybackSettingsProviderProps {
  playback: PlaybackSettings;
  renderSettings: RenderSettings;
  resources: VideoResources;
  children: React.ReactNode;
}

/**
 * Provider for playback settings throughout the composition tree.
 *
 * @example
 * ```tsx
 * <PlaybackSettingsProvider
 *   playback={playbackSettings}
 *   renderSettings={renderSettings}
 *   resources={resources}
 * >
 *   <SharedVideoController ... />
 * </PlaybackSettingsProvider>
 * ```
 */
export function PlaybackSettingsProvider({
  playback,
  renderSettings,
  resources,
  children,
}: PlaybackSettingsProviderProps) {
  // Memoize context value to prevent unnecessary re-renders
  // Decompose to primitive checks for better memoization
  const value = useMemo<PlaybackSettingsContextValue>(
    () => ({
      playback,
      renderSettings,
      resources,
    }),
    [
      // Playback primitives
      playback.isPlaying,
      playback.isScrubbing,
      playback.isHighQualityPlaybackEnabled,
      playback.previewMuted,
      playback.previewVolume,
      // RenderSettings primitives
      renderSettings.isGlowMode,
      renderSettings.preferOffthreadVideo,
      renderSettings.enhanceAudio,
      renderSettings.isEditingCrop,
      // Resources - compare by reference (should be stable from parent)
      resources,
    ]
  );

  return (
    <PlaybackSettingsContext.Provider value={value}>
      {children}
    </PlaybackSettingsContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to access playback settings context.
 * Throws if used outside PlaybackSettingsProvider.
 *
 * @returns Object containing playback, renderSettings, and resources
 */
export function usePlaybackSettings(): PlaybackSettingsContextValue {
  const context = useContext(PlaybackSettingsContext);
  if (!context) {
    throw new Error(
      'usePlaybackSettings must be used within PlaybackSettingsProvider'
    );
  }
  return context;
}

/**
 * Hook to check if PlaybackSettingsContext is available.
 * Returns null if not within a provider (for optional usage).
 */
export function usePlaybackSettingsOptional(): PlaybackSettingsContextValue | null {
  return useContext(PlaybackSettingsContext);
}

// ============================================================================
// CONVENIENCE HOOKS
// ============================================================================

/**
 * Hook to access only playback state.
 */
export function usePlayback(): PlaybackSettings {
  const { playback } = usePlaybackSettings();
  return playback;
}

/**
 * Hook to access only render settings.
 */
export function useRenderSettings(): RenderSettings {
  const { renderSettings } = usePlaybackSettings();
  return renderSettings;
}

/**
 * Hook to access only video resources.
 */
export function useVideoResources(): VideoResources {
  const { resources } = usePlaybackSettings();
  return resources;
}
