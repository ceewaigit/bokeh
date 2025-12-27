import React, { createContext, useContext } from 'react'

import type { EffectType } from '@/types/project'

export interface EffectsSidebarContextValue {
  onEffectChange: (type: EffectType, data: any) => void
  onZoomBlockUpdate?: (blockId: string, updates: any) => void
  onBulkToggleKeystrokes?: (enabled: boolean) => void
  onAddCrop?: () => void
  onRemoveCrop?: (effectId: string) => void
  onUpdateCrop?: (effectId: string, updates: any) => void
  onStartEditCrop?: () => void
}

const EffectsSidebarContext = createContext<EffectsSidebarContextValue | null>(null)

export function useEffectsSidebarContext(): EffectsSidebarContextValue {
  const ctx = useContext(EffectsSidebarContext)
  if (!ctx) {
    throw new Error('[useEffectsSidebarContext] Must be used within EffectsSidebarProvider')
  }
  return ctx
}

export function EffectsSidebarProvider({
  value,
  children
}: {
  value: EffectsSidebarContextValue
  children: React.ReactNode
}) {
  return (
    <EffectsSidebarContext.Provider value={value}>
      {children}
    </EffectsSidebarContext.Provider>
  )
}
