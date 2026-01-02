"use client"

import { useEffect } from 'react'
import { useWindowSurfaceStore } from '@/features/stores/window-surface-store'
import { useTheme } from '@/shared/contexts/theme-context'
import { resolveWindowSurfaceTokens } from '@/shared/appearance/window-surface'

export function WindowSurfaceProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme()
  const mode = useWindowSurfaceStore((s) => s.mode)
  const tintAlpha = useWindowSurfaceStore((s) => s.tintAlpha)
  const blurPx = useWindowSurfaceStore((s) => s.blurPx)

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
    const resolved = resolveWindowSurfaceTokens({ mode, tintAlpha, blurPx, resolvedTheme })

    root.style.setProperty('--window-surface-opacity', String(resolved.cssVars.tintAlpha))
    root.style.setProperty('--window-surface-blur', `${resolved.cssVars.blurPx}px`)
    root.dataset.windowSurface = resolved.datasetMode
  }, [mode, tintAlpha, blurPx, resolvedTheme])

  useEffect(() => {
    // Never change main-process window settings for overlays.
    if (typeof window === 'undefined') return
    if (window.location.hash === '#/record-button') return
    if (window.location.hash === '#/area-selection') return

    // On macOS, vibrancy enables background blurring behind a transparent window.
    // Use 'under-window' for a light, subtle blur - less aggressive than 'sidebar'
    // This allows the CSS backdrop-filter to be the primary blur control
    const resolved = resolveWindowSurfaceTokens({ mode, tintAlpha, blurPx, resolvedTheme })
    window.electronAPI?.setWindowVibrancy?.(resolved.electron.vibrancy).catch(() => { })
    window.electronAPI?.setWindowHasShadow?.(resolved.electron.hasShadow).catch(() => { })
  }, [mode, tintAlpha, blurPx, resolvedTheme])

  if (isRecordButton || isAreaSelection) return children

  return <div className="h-screen w-screen window-surface">{children}</div>
}
