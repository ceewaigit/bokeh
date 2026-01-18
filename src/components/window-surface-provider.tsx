"use client"

import { useEffect, useLayoutEffect, useRef } from 'react'
import { useWindowSurfaceStore } from '@/features/core/stores/window-surface-store'
import { useTheme } from '@/shared/contexts/theme-context'
import { resolveWindowSurfaceTokens } from '@/shared/appearance/window-surface'

// Use useLayoutEffect on client, useEffect on server (SSR safety)
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export function WindowSurfaceProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme()
  const mode = useWindowSurfaceStore((s) => s.mode)
  const tintAlpha = useWindowSurfaceStore((s) => s.tintAlpha)
  const blurPx = useWindowSurfaceStore((s) => s.blurPx)
  const hasSignaledReady = useRef(false)

  const isRecordButton = typeof window !== 'undefined' && window.location.hash === '#/record-button'
  const isAreaSelection = typeof window !== 'undefined' && window.location.hash === '#/area-selection'

  useIsomorphicLayoutEffect(() => {
    // Force the renderer surface itself to be transparent; UI surfaces should be explicit.
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.margin = '0'
    document.body.style.padding = '0'
    const root = document.getElementById('root')
    if (root) root.style.background = 'transparent'
  }, [])

  // Use layoutEffect to set CSS vars and vibrancy BEFORE browser paint
  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement
    const resolved = resolveWindowSurfaceTokens({ mode, tintAlpha, blurPx, resolvedTheme })

    root.style.setProperty('--window-surface-opacity', String(resolved.cssVars.tintAlpha))
    root.style.setProperty('--window-surface-blur', `${resolved.cssVars.blurPx}px`)
    root.dataset.windowSurface = resolved.datasetMode

    // Also set vibrancy immediately (IPC is async but start it ASAP)
    if (typeof window !== 'undefined') {
      const isOverlay = window.location.hash === '#/record-button' || window.location.hash === '#/area-selection'
      if (!isOverlay) {
        // Set vibrancy, then signal we're ready to show the window (only once)
        Promise.all([
          window.electronAPI?.setWindowVibrancy?.(resolved.electron.vibrancy),
          window.electronAPI?.setWindowHasShadow?.(resolved.electron.hasShadow),
        ]).then(() => {
          // Signal that the renderer is ready - main process will show the window
          // Only signal once on initial load
          if (!hasSignaledReady.current) {
            hasSignaledReady.current = true
            window.electronAPI?.signalRendererReady?.()
          }
        }).catch(() => {
          // Still signal ready even if vibrancy fails
          if (!hasSignaledReady.current) {
            hasSignaledReady.current = true
            window.electronAPI?.signalRendererReady?.()
          }
        })
      }
    }
  }, [mode, tintAlpha, blurPx, resolvedTheme])

  if (isRecordButton || isAreaSelection) return children

  return <div className="h-screen w-screen window-surface">{children}</div>
}
