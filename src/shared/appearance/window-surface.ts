export type WindowSurfaceMode = 'solid' | 'clear' | 'frosted' | 'custom'

export type WindowSurfacePreset =
  | 'solid'
  | 'clear-light'
  | 'clear'
  | 'clear-strong'
  | 'frosted-light'
  | 'frosted'
  | 'frosted-strong'

export const WINDOW_SURFACE_PERSIST_KEY = 'window-surface'

export const WINDOW_SURFACE_PRESETS: Record<
  WindowSurfacePreset,
  { mode: WindowSurfaceMode; tintAlpha: number; blurPx: number }
> = {
  solid: { mode: 'solid', tintAlpha: 1, blurPx: 0 },

  // Glass (clear): see-through, minimal tint.
  // Note: `tintAlpha` is overlay alpha (higher = less transparent).
  'clear-light': { mode: 'clear', tintAlpha: 0.7, blurPx: 14 },
  clear: { mode: 'clear', tintAlpha: 0.8, blurPx: 22 },
  'clear-strong': { mode: 'clear', tintAlpha: 0.9, blurPx: 30 },

  // Frosted: heavier blur, still see-through (frost = blur, not opacity).
  'frosted-light': { mode: 'frosted', tintAlpha: 0.6, blurPx: 32 },
  frosted: { mode: 'frosted', tintAlpha: 0.7, blurPx: 44 },
  'frosted-strong': { mode: 'frosted', tintAlpha: 0.8, blurPx: 56 },
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value)

function parseMode(mode: unknown): WindowSurfaceMode | null {
  if (mode === 'solid' || mode === 'clear' || mode === 'frosted' || mode === 'custom') return mode
  return null
}

export function normalizeWindowSurfaceState(
  state: { mode?: unknown; tintAlpha?: unknown; blurPx?: unknown } = {}
): { mode: WindowSurfaceMode; tintAlpha: number; blurPx: number } {
  const mode = parseMode(state.mode) ?? 'solid'

  const defaultPreset =
    mode === 'custom'
      ? WINDOW_SURFACE_PRESETS.frosted
      : mode === 'frosted'
        ? WINDOW_SURFACE_PRESETS.frosted
        : mode === 'clear'
          ? WINDOW_SURFACE_PRESETS.clear
          : WINDOW_SURFACE_PRESETS.solid

  const tintAlpha = isFiniteNumber(state.tintAlpha) ? clamp(state.tintAlpha, 0, 1) : defaultPreset.tintAlpha
  const blurPx = isFiniteNumber(state.blurPx) ? clamp(state.blurPx, 0, 120) : defaultPreset.blurPx

  return { mode, tintAlpha, blurPx }
}

export function resolveWindowSurfaceTokens(input: {
  mode: WindowSurfaceMode
  tintAlpha: number
  blurPx: number
  resolvedTheme: 'dark' | 'light'
}) {
  const tintAlpha = isFiniteNumber(input.tintAlpha) ? clamp(input.tintAlpha, 0, 1) : WINDOW_SURFACE_PRESETS.solid.tintAlpha
  const blurPx = isFiniteNumber(input.blurPx) ? clamp(input.blurPx, 0, 120) : WINDOW_SURFACE_PRESETS.solid.blurPx

  const isDark = input.resolvedTheme === 'dark'
  const frostedVibrancy = isDark ? 'under-window' : 'light'

  if (input.mode === 'solid') {
    return {
      datasetMode: 'solid' as const,
      cssVars: { tintAlpha: 1, blurPx: 0 },
      electron: { vibrancy: null, hasShadow: true },
    }
  }

  if (input.mode === 'clear') {
    return {
      datasetMode: 'clear' as const,
      // Glass: do not apply macOS vibrancy; keep the window truly see-through.
      cssVars: { tintAlpha: clamp(tintAlpha, 0, 1), blurPx },
      electron: { vibrancy: null, hasShadow: false },
    }
  }

  const isFrostedLike =
    input.mode === 'frosted' || (input.mode === 'custom' && blurPx >= 1)

  if (!isFrostedLike) {
    // Custom with no blur behaves like "clear", but keeps the dataset mode.
    return {
      datasetMode: 'custom' as const,
      cssVars: { tintAlpha: clamp(tintAlpha, 0, 1), blurPx },
      electron: { vibrancy: null, hasShadow: false },
    }
  }

  const clampedBlur = Math.max(1, blurPx)
  return {
    datasetMode: (input.mode === 'custom' ? 'custom' : 'frosted') as 'custom' | 'frosted',
    cssVars: { tintAlpha: clamp(tintAlpha, 0, 1), blurPx: clampedBlur },
    electron: { vibrancy: frostedVibrancy, hasShadow: false },
  }
}
