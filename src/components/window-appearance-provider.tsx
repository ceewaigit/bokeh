"use client"

import { useEffect } from 'react'
import { useWindowAppearanceStore, type WindowSurfaceMode } from '@/stores/window-appearance-store'

function modeToVars(mode: WindowSurfaceMode, opacity: number, blurPx: number) {
  // Solid mode: handled by CSS [data-window-surface="solid"] selector
  if (mode === 'solid') {
    return { opacity: 1, blurPx: 0 }
  }
  // "clear" means high opacity dark tint with no blur
  if (mode === 'clear') return { opacity: Math.min(0.98, Math.max(0.70, opacity)), blurPx: 0 }
  // 'glass' and 'custom' - no forced minimums, allow fully transparent glass
  return { opacity: Math.min(0.90, Math.max(0, opacity)), blurPx: Math.max(0, blurPx) }
}

export function WindowAppearanceProvider({ children }: { children: React.ReactNode }) {
  const mode = useWindowAppearanceStore((s) => s.mode)
  const opacity = useWindowAppearanceStore((s) => s.opacity)
  const blurPx = useWindowAppearanceStore((s) => s.blurPx)

  const isRecordButton = typeof window !== 'undefined' && window.location.hash === '#/record-button'
  const isAreaSelection = typeof window !== 'undefined' && window.location.hash === '#/area-selection'

  useEffect(() => {
    // Force the renderer surface itself to be transparent; UI surfaces should be explicit.
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.margin = '0'
    document.body.style.padding = '0'
    const root = document.getElementById('root')
    if (root) root.style.background = 'transparent'
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const vars = modeToVars(mode, opacity, blurPx)

    root.style.setProperty('--window-surface-opacity', String(vars.opacity))
    // Apply blur directly - no scaling
    root.style.setProperty('--window-surface-blur', `${vars.blurPx}px`)
    root.dataset.windowSurface = mode
  }, [mode, opacity, blurPx])

  useEffect(() => {
    // Never change main-process window settings for overlays.
    if (typeof window === 'undefined') return
    if (window.location.hash === '#/record-button') return
    if (window.location.hash === '#/area-selection') return

    // On macOS, vibrancy enables background blurring behind a transparent window.
    // Use 'under-window' for a light, subtle blur - less aggressive than 'sidebar'
    // This allows the CSS backdrop-filter to be the primary blur control
    const desiredVibrancy = (mode === 'glass' || mode === 'custom') ? 'under-window' : null
    window.electronAPI?.setWindowVibrancy?.(desiredVibrancy).catch(() => { })
    window.electronAPI?.setWindowHasShadow?.(mode === 'solid').catch(() => { })
  }, [mode, opacity, blurPx])

  if (isRecordButton || isAreaSelection) return children

  return <div className="h-screen w-screen window-surface">{children}</div>
}
