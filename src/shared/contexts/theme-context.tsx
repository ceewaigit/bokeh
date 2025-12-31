'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light' | 'system'
export type ColorPreset = 'default' | 'sand' | 'industrial' | 'forest' | 'nordic' | 'midnight' | 'space'

interface ThemeContextType {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  colorPreset: ColorPreset
  setTheme: (theme: Theme) => void
  setColorPreset: (preset: ColorPreset) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark')
  const [colorPreset, setColorPreset] = useState<ColorPreset>('default')

  useEffect(() => {
    // Load saved settings from localStorage
    const savedTheme = localStorage.getItem('theme') as Theme | null
    if (savedTheme) {
      setTheme(savedTheme)
    } else {
      setTheme('dark')
      localStorage.setItem('theme', 'dark')
    }

    const savedPreset = localStorage.getItem('color-preset') as ColorPreset | null
    if (savedPreset) {
      setColorPreset(savedPreset)
    } else {
      setColorPreset('sand') // New default as requested
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

  useEffect(() => {
    // Apply theme and preset to document
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)

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