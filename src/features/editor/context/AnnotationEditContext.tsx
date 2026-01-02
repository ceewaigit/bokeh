/**
 * AnnotationEditContext - Isolated SSOT for annotation editing state
 *
 * ARCHITECTURAL RULE: Video rendering components MUST NOT subscribe to this.
 * This separation guarantees annotation edits never trigger video re-renders.
 *
 * Only used in preview mode. Export mode has no transient editing state.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'

interface TransientAnnotationState {
    id: string
    data: Record<string, unknown>
}

interface AnnotationEditContextValue {
    /** Transient state during drag/resize operations */
    transientState: TransientAnnotationState | null
    /** Set transient state (pass null to clear) */
    setTransientState: (id: string | null, data?: Record<string, unknown>) => void
    /** Get merged effect data (base + transient overlay) */
    getMergedEffectData: <T extends Record<string, unknown>>(effectId: string, baseData: T) => T
    /** True when inline text editor is open - triggers camera override to 1x */
    isInlineEditing: boolean
    /** Set inline editing state */
    setIsInlineEditing: (editing: boolean) => void
}

const AnnotationEditContext = createContext<AnnotationEditContextValue | null>(null)

interface AnnotationEditProviderProps {
    children: React.ReactNode
    /** Callback when inline editing state changes - for camera override */
    onInlineEditingChange?: (isEditing: boolean) => void
}

export function AnnotationEditProvider({ children, onInlineEditingChange }: AnnotationEditProviderProps) {
    const [transientState, setTransientStateInternal] = useState<TransientAnnotationState | null>(null)
    const [isInlineEditing, setIsInlineEditingInternal] = useState(false)

    const setIsInlineEditing = useCallback((editing: boolean) => {
        setIsInlineEditingInternal(editing)
        onInlineEditingChange?.(editing)
    }, [onInlineEditingChange])

    const setTransientState = useCallback((id: string | null, data?: Record<string, unknown>) => {
        if (!id || !data) {
            setTransientStateInternal(null)
        } else {
            setTransientStateInternal({ id, data })
        }
    }, [])

    const getMergedEffectData = useCallback(<T extends Record<string, unknown>>(effectId: string, baseData: T): T => {
        if (transientState && transientState.id === effectId) {
            return { ...baseData, ...transientState.data } as T
        }
        return baseData
    }, [transientState])

    const value = useMemo(() => ({
        transientState,
        setTransientState,
        getMergedEffectData,
        isInlineEditing,
        setIsInlineEditing
    }), [transientState, setTransientState, getMergedEffectData, isInlineEditing])

    return (
        <AnnotationEditContext.Provider value={value}>
            {children}
        </AnnotationEditContext.Provider>
    )
}

/**
 * Hook to access annotation editing context. Throws if not within provider.
 */
export function useAnnotationEditContext(): AnnotationEditContextValue {
    const ctx = useContext(AnnotationEditContext)
    if (!ctx) {
        throw new Error('useAnnotationEditContext must be used within AnnotationEditProvider')
    }
    return ctx
}

/**
 * Optional hook that returns null if outside provider (for components that need to work in both modes)
 */
export function useAnnotationEditContextOptional(): AnnotationEditContextValue | null {
    return useContext(AnnotationEditContext)
}
