/**
 * Timeline color utilities using shadcn design tokens
 * These functions retrieve CSS variable values at runtime for Konva canvas rendering
 */

import * as React from 'react'

export const getTimelineColors = () => {
  if (typeof window === 'undefined') {
    // Fallback for SSR
    return getDefaultColors()
  }

  const computedStyle = getComputedStyle(document.documentElement)

  // Helper to get CSS variable value
  const getCSSVar = (varName: string): string => {
    const value = computedStyle.getPropertyValue(varName).trim()
    if (!value) return ''

    // Handle HSL values
    if (value.includes(' ')) {
      return `hsl(${value})`
    }
    return value
  }

  const getNumberVar = (varName: string, fallback: number) => {
    const value = computedStyle.getPropertyValue(varName).trim()
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const hslToRgba = (raw: string, alpha: number) => {
    const cleaned = raw
      .replace('hsl(', '')
      .replace(')', '')
      .replace('deg', '')
      .trim()
    const parts = cleaned.split(/[,\s]+/).filter(Boolean)
    if (parts.length < 3) return ''
    const h = (Number.parseFloat(parts[0]) % 360 + 360) % 360
    const s = Math.max(0, Math.min(100, Number.parseFloat(parts[1]))) / 100
    const l = Math.max(0, Math.min(100, Number.parseFloat(parts[2]))) / 100
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2
    let r = 0
    let g = 0
    let b = 0
    if (h < 60) [r, g, b] = [c, x, 0]
    else if (h < 120) [r, g, b] = [x, c, 0]
    else if (h < 180) [r, g, b] = [0, c, x]
    else if (h < 240) [r, g, b] = [0, x, c]
    else if (h < 300) [r, g, b] = [x, 0, c]
    else[r, g, b] = [c, 0, x]
    const to255 = (value: number) => Math.round((value + m) * 255)
    return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${alpha})`
  }

  const isDark = document.documentElement.classList.contains('dark')
  const windowSurfaceMode = document.documentElement.dataset.windowSurface
  const isGlassMode = windowSurfaceMode === 'glass' || windowSurfaceMode === 'custom' || windowSurfaceMode === 'clear'
  const surfaceOpacity = getNumberVar('--window-surface-opacity', 0.12)
  const glassAlpha = Math.min(0.45, Math.max(0.12, 0.08 + surfaceOpacity * 0.5))
  const rulerBase = computedStyle.getPropertyValue('--timeline-ruler').trim()
  const rulerGlassFill = rulerBase ? hslToRgba(rulerBase, glassAlpha) : ''

  return {
    isDark,
    isGlassMode,
    // Background colors
    background: getCSSVar('--background'),
    foreground: getCSSVar('--foreground'),
    card: getCSSVar('--card'),
    cardForeground: getCSSVar('--card-foreground'),

    // Muted colors for subtle elements
    muted: getCSSVar('--muted'),
    mutedForeground: getCSSVar('--muted-foreground'),

    // Border and separators
    border: getCSSVar('--border'),

    // Primary for selected/active states
    primary: getCSSVar('--primary'),
    primaryForeground: getCSSVar('--primary-foreground'),

    // Secondary for hover states
    secondary: getCSSVar('--secondary'),
    secondaryForeground: getCSSVar('--secondary-foreground'),

    // Accent colors for special elements
    accent: getCSSVar('--accent'),
    accentForeground: getCSSVar('--accent-foreground'),

    // Destructive for delete/remove actions
    destructive: getCSSVar('--destructive'),
    destructiveForeground: getCSSVar('--destructive-foreground'),

    // Glass-safe colors - semi-transparent for glass blur effect
    glassSafeBackground: isGlassMode
      ? (isDark ? 'rgba(30, 30, 35, 0.4)' : 'rgba(255, 255, 255, 0.2)')
      : (isDark ? 'rgba(20, 20, 25, 0.85)' : 'rgba(250, 250, 252, 0.9)'),

    // Glass-safe text colors (high contrast for glass backgrounds)
    glassForeground: isDark ? 'hsl(0, 0%, 100%)' : 'hsl(0, 0%, 0%)',
    glassSecondaryForeground: isDark ? 'hsl(0, 0%, 85%)' : 'hsl(0, 0%, 20%)',

    // Effect block label colors - guaranteed visibility on any background
    effectLabelColor: isDark ? 'hsl(0, 0%, 95%)' : 'hsl(0, 0%, 10%)',
    effectLabelShadow: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)',

    // Additional semantic colors for timeline
    success: getCSSVar('--success') || 'hsl(142, 71%, 45%)',
    warning: getCSSVar('--warning') || 'hsl(38, 92%, 50%)',
    info: getCSSVar('--info') || 'hsl(217, 91%, 60%)',

    // Timeline-specific colors - glass-aware
    ruler: isGlassMode
      ? (rulerGlassFill || (isDark ? 'rgba(25, 25, 30, 0.35)' : `rgba(255, 255, 255, ${glassAlpha})`))
      : getCSSVar('--timeline-ruler') || (isDark ? 'rgba(25, 25, 30, 0.9)' : 'rgba(245, 245, 248, 0.95)'),
    trackBackground: isGlassMode
      ? (isDark ? 'rgba(50, 50, 60, 0.3)' : 'rgba(255, 255, 255, 0.18)')
      : (isDark ? 'rgba(35, 35, 40, 0.6)' : 'rgba(240, 240, 245, 0.7)'),
    playhead: getCSSVar('--destructive') || 'hsl(263, 70%, 60%)',
    zoomBlock: getCSSVar('--primary') || 'hsl(263, 70%, 50%)',
    screenBlock: getCSSVar('--info') || 'hsl(200, 85%, 55%)',

    // Webcam track colors
    webcamClip: 'hsl(262, 83%, 58%)',
    webcamCircle: 'rgba(255, 255, 255, 0.15)',
    webcamTrack: isDark ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.08)',
    clipSelected: getCSSVar('--primary') || 'hsl(263, 70%, 50%)',
  }
}

// Default colors for SSR/fallback
const getDefaultColors = () => ({
  isDark: true,
  isGlassMode: false,
  background: 'hsl(240, 10%, 3.9%)',
  foreground: 'hsl(0, 0%, 98%)',
  card: 'hsl(240, 10%, 3.9%)',
  cardForeground: 'hsl(0, 0%, 98%)',
  muted: 'hsl(240, 3.7%, 15.9%)',
  mutedForeground: 'hsl(240, 5%, 64.9%)',
  border: 'hsl(240, 3.7%, 15.9%)',
  primary: 'hsl(0, 0%, 98%)',
  primaryForeground: 'hsl(240, 5.9%, 10%)',
  secondary: 'hsl(240, 3.7%, 15.9%)',
  secondaryForeground: 'hsl(0, 0%, 98%)',
  accent: 'hsl(240, 3.7%, 15.9%)',
  accentForeground: 'hsl(0, 0%, 98%)',
  destructive: 'hsl(0, 62.8%, 30.6%)',
  destructiveForeground: 'hsl(0, 0%, 98%)',
  // Glass-safe colors
  glassSafeBackground: 'rgba(20, 20, 25, 0.85)',
  glassForeground: 'hsl(0, 0%, 100%)',
  glassSecondaryForeground: 'hsl(0, 0%, 85%)',
  effectLabelColor: 'hsl(0, 0%, 95%)',
  effectLabelShadow: 'rgba(0,0,0,0.8)',
  success: 'hsl(0, 0%, 80%)',
  warning: 'hsl(38, 92%, 50%)',
  info: 'hsl(267, 100%, 61%)',
  ruler: 'rgba(25, 25, 30, 0.9)',
  trackBackground: 'rgba(35, 35, 40, 0.6)',
  playhead: 'hsl(263, 70%, 60%)',
  zoomBlock: 'hsl(263, 70%, 65%)',
  screenBlock: 'hsl(200, 85%, 55%)',
  webcamClip: 'hsl(262, 83%, 58%)',
  webcamCircle: 'rgba(255, 255, 255, 0.15)',
  webcamTrack: 'rgba(139, 92, 246, 0.1)',
  clipSelected: 'hsl(263, 70%, 50%)',
})

// Hook for React components that updates when theme changes
export const useTimelineColors = () => {
  const [colors, setColors] = React.useState(getTimelineColors())
  const updateTimeoutRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    // Update colors when theme changes
    const updateColors = () => {
      // Small delay to ensure CSS variables have updated
      if (updateTimeoutRef.current !== null) {
        window.clearTimeout(updateTimeoutRef.current)
      }
      updateTimeoutRef.current = window.setTimeout(() => {
        setColors(getTimelineColors())
      }, 10)
    }

    // Initial update
    updateColors()

    // Listen for theme changes via class mutations on document element
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          // Theme class changed, update colors
          updateColors()
        }
      })
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })

    // Also listen for storage events for theme changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'theme') {
        updateColors()
      }
    }
    window.addEventListener('storage', handleStorageChange)

    return () => {
      if (updateTimeoutRef.current !== null) {
        window.clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = null
      }
      observer.disconnect()
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  return colors
}
