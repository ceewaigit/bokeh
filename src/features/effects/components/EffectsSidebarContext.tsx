import React, { createContext, useContext } from 'react'

import type { EffectType, Effect, ZoomBlock, CropEffectData } from '@/types/project'

export interface EffectsSidebarContextValue {
  onEffectChange: (type: EffectType, data: Partial<Effect['data']> & { enabled?: boolean; data?: Record<string, unknown> }) => void
  onZoomBlockUpdate?: (blockId: string, updates: Partial<ZoomBlock>) => void
  onBulkToggleKeystrokes?: (enabled: boolean) => void
  onAddCrop?: () => void
  onRemoveCrop?: (effectId: string) => void
  onUpdateCrop?: (effectId: string, updates: Partial<CropEffectData>) => void
  onStartEditCrop?: () => void
  onStopEditCrop?: () => void
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
