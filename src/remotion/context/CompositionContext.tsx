/**
 * CompositionContext - COMPATIBILITY BRIDGE
 *
 * This file now delegates to TimelineContext.tsx.
 * It maintains the existing API (useComposition)
 * but consumes data from the unified TimelineContext.
 */

import { useTimelineContext } from './TimelineContext';
import type { TimelineContextValue } from './TimelineContext';

// Re-export the interface (it matches TimelineContextValue structural subset/superset)
// NOTE: We alias it to keep downstream imports working.
export type CompositionContextValue = TimelineContextValue;

/**
 * Get the full composition context.
 */
export function useComposition(): CompositionContextValue {
  return useTimelineContext();
}

/**
 * Optional version that returns null if context is not available.
 */
export function useCompositionOptional(): CompositionContextValue | null {
  try {
    return useTimelineContext();
  } catch {
    return null;
  }
}

/**
 * @deprecated CompositionProvider is deprecated. Use TimelineProvider instead.
 */
export function CompositionProvider({ children }: { children: React.ReactNode }) {
  console.warn('CompositionProvider is deprecated and does nothing. Use TimelineProvider.');
  return <>{children}</>;
}
