'use client'

import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'

// Use useLayoutEffect on client, useEffect on server (SSR safety)
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export type Theme = 'dark' | 'light' | 'system'
export type ColorPreset = 'default' | 'sand' | 'industrial' | 'forest' | 'nordic' | 'midnight' | 'space' | 'mono'

interface ThemeContextType {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  colorPreset: ColorPreset
  setTheme: (theme: Theme) => void
  setColorPreset: (preset: ColorPreset) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

// Helper to read theme from localStorage synchronously
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const saved = localStorage.getItem('theme') as Theme | null
  return saved || 'dark'
}

// Helper to resolve theme (handles 'system' preference)
function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme as 'dark' | 'light'
}

// Helper to read color preset from localStorage synchronously
function getInitialColorPreset(): ColorPreset {
  if (typeof window === 'undefined') return 'sand'
  const saved = localStorage.getItem('color-preset') as ColorPreset | null
  return saved || 'sand'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read localStorage synchronously on first render to prevent flash
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => resolveTheme(getInitialTheme()))
  const [colorPreset, setColorPreset] = useState<ColorPreset>(getInitialColorPreset)

  useEffect(() => {
    // Ensure localStorage has values (for first-time users)
    if (!localStorage.getItem('theme')) {
      localStorage.setItem('theme', 'dark')
    }
    if (!localStorage.getItem('color-preset')) {
      localStorage.setItem('color-preset', 'sand')
    }
  }, [])

  useEffect(() => {
    // Update resolved theme based on system preference
    const updateResolvedTheme = () => {
      if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        setResolvedTheme(isDark ? 'dark' : 'light')
      } else {
        setResolvedTheme(theme as 'dark' | 'light')
      }
    }

    updateResolvedTheme()

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => updateResolvedTheme()
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  // Use layoutEffect to apply theme class BEFORE browser paint
  useIsomorphicLayoutEffect(() => {
    // Apply theme and preset to document
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)

    // Set initial window-surface data for CSS fallback (before WindowSurfaceProvider hydrates)
    if (!root.dataset.windowSurface) {
      root.dataset.windowSurface = 'frosted'  // default assumption
    }

    // Apply color preset
    root.setAttribute('data-color-preset', colorPreset)

    // Save to localStorage
    localStorage.setItem('theme', theme)
    localStorage.setItem('color-preset', colorPreset)
  }, [theme, resolvedTheme, colorPreset])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, colorPreset, setColorPreset }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
