/**
 * CompositionConfigContext
 *
 * Provides composition-level configuration values to avoid prop drilling.
 * These values are static for the duration of a render/preview session.
 *
 * SSOT: All dimension and fps values come from here.
 * Components should use useCompositionConfig() instead of receiving these as props.
 */

import React, { createContext, useContext, useMemo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface CompositionConfig {
  // Composition dimensions (canvas size)
  compositionWidth: number;
  compositionHeight: number;

  // Target video dimensions (output size)
  videoWidth: number;
  videoHeight: number;

  // Source video dimensions (original recording size)
  sourceVideoWidth: number;
  sourceVideoHeight: number;

  // Frame rate
  fps: number;
}

// ============================================================================
// CONTEXT
// ============================================================================

const CompositionConfigContext = createContext<CompositionConfig | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface CompositionConfigProviderProps {
  compositionWidth: number;
  compositionHeight: number;
  videoWidth: number;
  videoHeight: number;
  sourceVideoWidth?: number;
  sourceVideoHeight?: number;
  fps: number;
  children: React.ReactNode;
}

export function CompositionConfigProvider({
  compositionWidth,
  compositionHeight,
  videoWidth,
  videoHeight,
  sourceVideoWidth,
  sourceVideoHeight,
  fps,
  children,
}: CompositionConfigProviderProps) {
  const config = useMemo<CompositionConfig>(
    () => ({
      compositionWidth,
      compositionHeight,
      videoWidth,
      videoHeight,
      sourceVideoWidth: sourceVideoWidth ?? videoWidth,
      sourceVideoHeight: sourceVideoHeight ?? videoHeight,
      fps,
    }),
    [compositionWidth, compositionHeight, videoWidth, videoHeight, sourceVideoWidth, sourceVideoHeight, fps]
  );

  return (
    <CompositionConfigContext.Provider value={config}>
      {children}
    </CompositionConfigContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Get composition configuration values.
 * Use this instead of receiving dimension/fps props.
 *
 * @throws Error if used outside CompositionConfigProvider
 */
export function useCompositionConfig(): CompositionConfig {
  const config = useContext(CompositionConfigContext);

  if (!config) {
    throw new Error(
      '[useCompositionConfig] Must be used within CompositionConfigProvider. ' +
      'Ensure TimelineComposition wraps this component.'
    );
  }

  return config;
}

/**
 * Optional version that returns null if context is not available.
 * Use for components that may render outside the composition.
 */
export function useCompositionConfigOptional(): CompositionConfig | null {
  return useContext(CompositionConfigContext);
}
