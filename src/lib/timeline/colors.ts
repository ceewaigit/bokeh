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

  return {
    isDark: document.documentElement.classList.contains('dark'),
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

    // Additional semantic colors for timeline
    success: getCSSVar('--success') || 'hsl(142, 71%, 45%)',
    warning: getCSSVar('--warning') || 'hsl(38, 92%, 50%)',
    info: getCSSVar('--info') || 'hsl(217, 91%, 60%)',

    // Timeline-specific colors
    playhead: getCSSVar('--destructive') || 'hsl(0, 84%, 60%)',
    zoomBlock: getCSSVar('--info') || 'hsl(217, 75%, 55%)',
    // zoomBlockHover removed (unused)
    screenBlock: 'hsl(24, 75%, 55%)',
  }
}

// Default colors for SSR/fallback
const getDefaultColors = () => ({
  isDark: true,
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
  success: 'hsl(0, 0%, 80%)', // White/Grey for Audio
  warning: 'hsl(38, 92%, 50%)',
  info: 'hsl(267, 100%, 61%)', // Purple for Video
  playhead: 'hsl(267, 100%, 61%)', // Purple playhead
  zoomBlock: 'hsl(280, 65%, 60%)', // Soft Purple for Zoom
  // zoomBlockHover removed (unused)
  screenBlock: 'hsl(24, 75%, 55%)',
})

// Hook for React components that updates when theme changes
export const useTimelineColors = () => {
  const [colors, setColors] = React.useState(getTimelineColors())

  React.useEffect(() => {
    // Update colors when theme changes
    const updateColors = () => {
      // Small delay to ensure CSS variables have updated
      setTimeout(() => {
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
      observer.disconnect()
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  return colors
}
