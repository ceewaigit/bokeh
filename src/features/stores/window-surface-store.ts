import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  type WindowSurfaceMode,
  type WindowSurfacePreset,
  WINDOW_SURFACE_PERSIST_KEY,
  WINDOW_SURFACE_PRESETS,
} from '@/shared/appearance/window-surface'

export type { WindowSurfaceMode, WindowSurfacePreset } from '@/shared/appearance/window-surface'

interface WindowSurfaceState {
  mode: WindowSurfaceMode
  tintAlpha: number
  blurPx: number
  setMode: (mode: WindowSurfaceMode) => void
  setTintAlpha: (tintAlpha: number) => void
  setBlurPx: (blurPx: number) => void
  applyPreset: (preset: WindowSurfacePreset) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const DEFAULT_STATE = {
  mode: WINDOW_SURFACE_PRESETS.frosted.mode,
  tintAlpha: WINDOW_SURFACE_PRESETS.frosted.tintAlpha,
  blurPx: WINDOW_SURFACE_PRESETS.frosted.blurPx,
}

export const useWindowSurfaceStore = create<WindowSurfaceState>()(
  persist(
    (set, get) => ({
      mode: DEFAULT_STATE.mode,
      tintAlpha: DEFAULT_STATE.tintAlpha,
      blurPx: DEFAULT_STATE.blurPx,
      setMode: (mode) => {
        if (mode === 'custom') {
          set({ mode })
          return
        }
        // Keep mode selection simple: default to the "medium" preset.
        const preset =
          mode === 'solid'
            ? WINDOW_SURFACE_PRESETS.solid
            : mode === 'frosted'
              ? WINDOW_SURFACE_PRESETS.frosted
              : WINDOW_SURFACE_PRESETS.clear
        set({ mode: preset.mode, tintAlpha: preset.tintAlpha, blurPx: preset.blurPx })
      },
      setTintAlpha: (tintAlpha) => {
        const nextTintAlpha = clamp(tintAlpha, 0, 1)
        const currentMode = get().mode
        const nextMode: WindowSurfaceMode =
          currentMode === 'frosted' || currentMode === 'clear' ? currentMode : 'custom'
        set({ tintAlpha: nextTintAlpha, mode: nextMode })
      },
      setBlurPx: (blurPx) => {
        const currentMode = get().mode
        const nextBlur = clamp(blurPx, 0, 120)
        if (currentMode === 'solid') {
          set({ blurPx: nextBlur, mode: 'custom' })
          return
        }
        // Keep the selected mode; clear can have blur (glass), frosted can be tuned.
        set({ blurPx: nextBlur })
      },
      applyPreset: (preset) => {
        const p = WINDOW_SURFACE_PRESETS[preset]
        set({ mode: p.mode, tintAlpha: p.tintAlpha, blurPx: p.blurPx })
      },
    }),
    {
      name: WINDOW_SURFACE_PERSIST_KEY,
      version: 5,
      migrate: () => DEFAULT_STATE,
    }
  )
)
