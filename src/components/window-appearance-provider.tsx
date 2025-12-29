"use client"

import { useEffect, useState } from 'react'
import { useWindowAppearanceStore, type WindowSurfaceMode } from '@/stores/window-appearance-store'
import { clamp } from '@/shared/utils/utils'

const normalizeNumber = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback)

const getOpacityFallback = (mode: WindowSurfaceMode) => {
  if (mode === 'solid') return 1
  if (mode === 'clear') return 0.75
  return 0.12
}

function modeToVars(mode: WindowSurfaceMode, opacity: number, blurPx: number, isDark: boolean) {
  const safeOpacity = normalizeNumber(opacity, getOpacityFallback(mode))
  const safeBlur = normalizeNumber(blurPx, 0)

  // Solid mode: handled by CSS [data-window-surface="solid"] selector
  if (mode === 'solid') {
    return { opacity: 1, blurPx: 0 }
  }
  // "clear" means bright tint with no blur, but keep translucency visible
  if (mode === 'clear') return { opacity: clamp(safeOpacity, 0.5, 0.95), blurPx: 0 }

  // 'glass' and 'custom'
  // Keep tint light in light mode while avoiding a grey cast.
  const minOpacity = isDark ? 0.1 : 0.08
  const effectiveOpacity = Math.max(minOpacity, safeOpacity)

  return { opacity: clamp(effectiveOpacity, 0, 0.95), blurPx: Math.max(0, safeBlur) }
}

export function WindowAppearanceProvider({ children }: { children: React.ReactNode }) {
  const mode = useWindowAppearanceStore((s) => s.mode)
  const opacity = useWindowAppearanceStore((s) => s.opacity)
  const blurPx = useWindowAppearanceStore((s) => s.blurPx)
  const [isDark, setIsDark] = useState(true) // Default to true to prevent flash in dark mode

  const isRecordButton = typeof window !== 'undefined' && window.location.hash === '#/record-button'
  const isAreaSelection = typeof window !== 'undefined' && window.location.hash === '#/area-selection'

  useEffect(() => {
    // Initial check
    setIsDark(document.documentElement.classList.contains('dark'))

    // Observe theme class changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          setIsDark(document.documentElement.classList.contains('dark'))
        }
      })
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })

    return () => observer.disconnect()
  }, [])

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
    const vars = modeToVars(mode, opacity, blurPx, isDark)

    root.style.setProperty('--window-surface-opacity', String(vars.opacity))
    // Apply blur directly - no scaling
    root.style.setProperty('--window-surface-blur', `${vars.blurPx}px`)
    root.dataset.windowSurface = mode
  }, [mode, opacity, blurPx, isDark])

  useEffect(() => {
    // Never change main-process window settings for overlays.
    if (typeof window === 'undefined') return
    if (window.location.hash === '#/record-button') return
    if (window.location.hash === '#/area-selection') return

    // On macOS, vibrancy enables background blurring behind a transparent window.
    // Use 'under-window' for a light, subtle blur - less aggressive than 'sidebar'
    // This allows the CSS backdrop-filter to be the primary blur control
    const desiredVibrancy = (mode === 'glass' || mode === 'custom')
        ? (isDark ? 'under-window' : 'light')
        : null
    window.electronAPI?.setWindowVibrancy?.(desiredVibrancy).catch(() => { })
    window.electronAPI?.setWindowHasShadow?.(mode === 'solid').catch(() => { })
  }, [mode, opacity, blurPx, isDark])

  if (isRecordButton || isAreaSelection) return children

  return <div className="h-screen w-screen window-surface">{children}</div>
}
