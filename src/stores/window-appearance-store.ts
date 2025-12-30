import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WindowSurfaceMode = 'solid' | 'glass' | 'clear' | 'custom'

export type WindowSurfacePreset =
  | 'solid'
  | 'glass-light'
  | 'glass'
  | 'glass-strong'
  | 'clear-light'
  | 'clear'
  | 'clear-strong'

interface WindowAppearanceState {
  mode: WindowSurfaceMode
  opacity: number
  blurPx: number
  setMode: (mode: WindowSurfaceMode) => void
  setOpacity: (opacity: number) => void
  setBlurPx: (blurPx: number) => void
  applyPreset: (preset: WindowSurfacePreset) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const MIN_GLASS_BLUR_PX = 1

const PRESETS = {
  solid: { mode: 'solid' as const, opacity: 1, blurPx: 0 },

  // Glass: frosted glass aesthetic with strong blur and translucency
  // Higher opacity + high blur = clean, readable, premium feel
  'glass-light': { mode: 'glass' as const, opacity: 0.08, blurPx: 18 },
  glass: { mode: 'glass' as const, opacity: 0.12, blurPx: 26 },
  'glass-strong': { mode: 'glass' as const, opacity: 0.16, blurPx: 34 },

  // Clear glass: no blur, medium opacity for a true transparent glass feel
  'clear-light': { mode: 'clear' as const, opacity: 0.52, blurPx: 0 },
  clear: { mode: 'clear' as const, opacity: 0.72, blurPx: 0 },
  'clear-strong': { mode: 'clear' as const, opacity: 0.92, blurPx: 0 },
} as const

const DEFAULT_STATE = {
  mode: 'solid' as const,
  opacity: PRESETS.solid.opacity,
  blurPx: PRESETS.solid.blurPx,
}

const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value)

const normalizeWindowAppearanceState = (
  state: Partial<WindowAppearanceState> & { mode?: string } = {}
): Pick<WindowAppearanceState, 'mode' | 'opacity' | 'blurPx'> => {
  const mode: WindowSurfaceMode =
    state.mode === 'solid' || state.mode === 'glass' || state.mode === 'clear' || state.mode === 'custom'
      ? state.mode
      : DEFAULT_STATE.mode

  const preset =
    mode === 'custom' ? PRESETS.glass : mode === 'glass' ? PRESETS.glass : mode === 'clear' ? PRESETS.clear : PRESETS.solid
  const minBlur = mode === 'custom' || mode === 'glass' ? MIN_GLASS_BLUR_PX : 0

  return {
    mode,
    opacity: isFiniteNumber(state.opacity) ? clamp(state.opacity, 0, 1) : preset.opacity,
    blurPx: isFiniteNumber(state.blurPx) ? clamp(state.blurPx, minBlur, 40) : preset.blurPx,
  }
}

export const useWindowAppearanceStore = create<WindowAppearanceState>()(
  persist(
    (set, get) => ({
      mode: 'solid',
      opacity: PRESETS.solid.opacity,
      blurPx: PRESETS.solid.blurPx,
      setMode: (mode) => {
        if (mode === 'custom') {
          set({ mode })
          return
        }
        // Keep mode selection simple: default to the "medium" preset.
        const preset =
          mode === 'solid'
            ? PRESETS.solid
            : mode === 'glass'
              ? PRESETS.glass
              : PRESETS.clear
        set({ mode: preset.mode, opacity: preset.opacity, blurPx: preset.blurPx })
      },
      setOpacity: (opacity) => {
        const nextOpacity = clamp(opacity, 0, 1)
        const currentMode = get().mode
        const nextMode: WindowSurfaceMode =
          currentMode === 'glass' || currentMode === 'clear' ? currentMode : 'custom'
        set({ opacity: nextOpacity, mode: nextMode })
      },
      setBlurPx: (blurPx) => {
        const currentMode = get().mode
        const min = currentMode === 'solid' || currentMode === 'clear' ? 0 : MIN_GLASS_BLUR_PX
        const nextBlur = clamp(blurPx, min, 40)
        if (currentMode === 'clear' && nextBlur > 0) {
          set({ blurPx: nextBlur, mode: 'glass' })
          return
        }
        const nextMode: WindowSurfaceMode = currentMode === 'glass' ? 'glass' : 'custom'
        set({ blurPx: nextBlur, mode: nextMode })
      },
      applyPreset: (preset) => {
        const p = PRESETS[preset]
        set({ mode: p.mode, opacity: p.opacity, blurPx: p.blurPx })
      },
    }),
    {
      name: 'window-appearance',
      version: 4,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<WindowAppearanceState> & { mode?: string }

        // Older versions used `transparent`; map it to `clear`.
        if ((state.mode as string) === 'transparent') state.mode = 'clear'

        if (version < 4) {
          return {
            ...state,
            ...normalizeWindowAppearanceState(state),
          }
        }
        return {
          ...state,
          ...normalizeWindowAppearanceState(state),
        }
      },
    }
  )
)

// Sync appearance changes across Electron windows via localStorage events
// Track the listener for potential cleanup and use AbortController pattern
let storageListenerCleanup: (() => void) | null = null

function setupStorageListener() {
  if (typeof window === 'undefined' || storageListenerCleanup) return

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === 'window-appearance') {
      try {
        const stored = JSON.parse(event.newValue || '{}')
        if (stored?.state) {
          const nextState = normalizeWindowAppearanceState(stored.state)
          useWindowAppearanceStore.setState(nextState)
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  window.addEventListener('storage', handleStorageChange)

  // Provide cleanup function for proper disposal
  storageListenerCleanup = () => {
    window.removeEventListener('storage', handleStorageChange)
    storageListenerCleanup = null
  }
}

// Initialize listener
setupStorageListener()

// Export cleanup function for use when needed (e.g., HMR, testing)
export function cleanupWindowAppearanceListener() {
  storageListenerCleanup?.()
}
