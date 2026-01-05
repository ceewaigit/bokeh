import React, { createContext, useContext } from 'react'
import type { OverlayAnchor } from '@/types/overlays'

export interface OverlayContextValue {
  displacedEffectIds: Set<string>
  resolvedAnchors: Map<string, OverlayAnchor>
}

const OverlayContext = createContext<OverlayContextValue | null>(null)

export function OverlayProvider({
  value,
  children
}: {
  value: OverlayContextValue
  children: React.ReactNode
}) {
  return (
    <OverlayContext.Provider value={value}>
      {children}
    </OverlayContext.Provider>
  )
}

export function useOverlayContext(): OverlayContextValue {
  const ctx = useContext(OverlayContext)
  if (!ctx) {
    return { 
      displacedEffectIds: new Set(),
      resolvedAnchors: new Map()
    }
  }
  return ctx
}
