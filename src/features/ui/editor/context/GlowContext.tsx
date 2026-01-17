/**
 * GlowContext
 *
 * Provides ambient glow settings and portal state to the preview component tree.
 * This eliminates prop drilling of glow-related props through PlayerContainer
 * and related components.
 *
 * Usage:
 * - Wrap preview area with GlowProvider
 * - Use useGlowContext() in any component that needs glow settings
 */

import React, { createContext, useContext, useMemo } from 'react';

// ============================================================================
// CONTEXT TYPES
// ============================================================================

export interface GlowPortalStyle {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  scale: number;
}

export interface GlowContextValue {
  /** Whether ambient glow effect is enabled */
  isEnabled: boolean;
  /** Glow intensity (0-1) */
  intensity: number;
  /** Portal configuration for positioning glow layer */
  portal: {
    root: HTMLElement | null;
    style: GlowPortalStyle | null;
  };
}

// ============================================================================
// CONTEXT
// ============================================================================

const GlowContext = createContext<GlowContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface GlowProviderProps {
  isEnabled: boolean;
  intensity: number;
  portalRoot: HTMLElement | null;
  portalStyle: GlowPortalStyle | null;
  children: React.ReactNode;
}

/**
 * Provider for glow settings throughout the preview component tree.
 *
 * @example
 * ```tsx
 * <GlowProvider
 *   isEnabled={isGlowEnabled}
 *   intensity={glowIntensity}
 *   portalRoot={glowPortalRoot}
 *   portalStyle={glowPortalStyle}
 * >
 *   <PlayerContainer ... />
 * </GlowProvider>
 * ```
 */
export function GlowProvider({
  isEnabled,
  intensity,
  portalRoot,
  portalStyle,
  children,
}: GlowProviderProps) {
  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<GlowContextValue>(
    () => ({
      isEnabled,
      intensity,
      portal: {
        root: portalRoot,
        style: portalStyle,
      },
    }),
    [isEnabled, intensity, portalRoot, portalStyle]
  );

  return (
    <GlowContext.Provider value={value}>
      {children}
    </GlowContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to access glow context.
 * Throws if used outside GlowProvider.
 *
 * @returns Object containing isEnabled, intensity, and portal settings
 */
export function useGlowContext(): GlowContextValue {
  const context = useContext(GlowContext);
  if (!context) {
    throw new Error(
      'useGlowContext must be used within GlowProvider'
    );
  }
  return context;
}

/**
 * Hook to check if GlowContext is available.
 * Returns null if not within a provider (for optional usage).
 */
export function useGlowContextOptional(): GlowContextValue | null {
  return useContext(GlowContext);
}

// ============================================================================
// CONVENIENCE HOOKS
// ============================================================================

/**
 * Hook to check if glow should be rendered.
 * Returns true only when glow is enabled AND intensity > 0.
 */
export function useShouldRenderGlow(): boolean {
  const { isEnabled, intensity } = useGlowContext();
  return isEnabled && intensity > 0;
}

/**
 * Hook to access glow intensity.
 */
export function useGlowIntensity(): number {
  const { intensity } = useGlowContext();
  return intensity;
}

/**
 * Hook to access glow portal settings.
 */
export function useGlowPortal(): GlowContextValue['portal'] {
  const { portal } = useGlowContext();
  return portal;
}
