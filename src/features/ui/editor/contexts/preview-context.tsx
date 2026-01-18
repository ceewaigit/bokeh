/**
 * PreviewContext - Provides refs for preview components
 *
 * Reduces prop drilling of player and container refs through the preview component tree.
 * Refs are created in PreviewAreaRemotion and consumed by PreviewInteractions and hooks.
 */
import { createContext, useContext, RefObject } from 'react';
import { PlayerRef } from '@remotion/player';

interface PreviewContextValue {
    /** Ref to the Remotion Player instance */
    playerRef: RefObject<PlayerRef | null>;
    /** Ref to the player container div */
    playerContainerRef: RefObject<HTMLDivElement | null>;
    /** Ref to the aspect ratio container div */
    aspectContainerRef: RefObject<HTMLDivElement | null>;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

/**
 * Hook to access preview refs from context.
 * Throws if used outside PreviewProvider.
 */
export function usePreviewRefs(): PreviewContextValue {
    const context = useContext(PreviewContext);
    if (!context) {
        throw new Error('usePreviewRefs must be used within a PreviewProvider');
    }
    return context;
}

/**
 * Hook to safely access preview refs, returning null if outside provider.
 * Useful for optional context access.
 */
export function usePreviewRefsSafe(): PreviewContextValue | null {
    return useContext(PreviewContext);
}

export const PreviewProvider = PreviewContext.Provider;
export { PreviewContext };
