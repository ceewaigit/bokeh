import type { TranscriptWord } from '@/types/project'
import { clamp01 } from '@/features/rendering/canvas/math/clamp'
import { lerp } from '@/features/rendering/canvas/math/lerp'

type Rgba = { r: number; g: number; b: number; a: number }

function parseCssColorToRgba(color: string): Rgba | null {
  const c = color.trim()
  if (c.startsWith('#')) {
    const hex = c.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return { r, g, b, a: 1 }
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return { r, g, b, a: 1 }
    }
    if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      const a = parseInt(hex.slice(6, 8), 16) / 255
      return { r, g, b, a: Number.isFinite(a) ? a : 1 }
    }
  }

  const rgbaMatch = c.match(/^rgba\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/i)
  if (rgbaMatch) {
    const r = Number(rgbaMatch[1])
    const g = Number(rgbaMatch[2])
    const b = Number(rgbaMatch[3])
    const a = Number(rgbaMatch[4])
    if ([r, g, b, a].every(n => Number.isFinite(n))) {
      return { r, g, b, a: clamp01(a) }
    }
    return null
  }

  const rgbMatch = c.match(/^rgb\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/i)
  if (rgbMatch) {
    const r = Number(rgbMatch[1])
    const g = Number(rgbMatch[2])
    const b = Number(rgbMatch[3])
    if ([r, g, b].every(n => Number.isFinite(n))) {
      return { r, g, b, a: 1 }
    }
  }

  return null
}

export function mixColors(from: string, to: string, t: number): string {
  const clamped = clamp01(t)
  const a = parseCssColorToRgba(from)
  const b = parseCssColorToRgba(to)
  if (!a || !b) {
    return clamped >= 0.5 ? to : from
  }
  const r = Math.round(lerp(a.r, b.r, clamped))
  const g = Math.round(lerp(a.g, b.g, clamped))
  const bCh = Math.round(lerp(a.b, b.b, clamped))
  const alpha = Math.round(lerp(a.a, b.a, clamped) * 1000) / 1000
  return `rgba(${r}, ${g}, ${bCh}, ${alpha})`
}

export function scaleAlpha(color: string, alphaScale: number): string {
  const rgba = parseCssColorToRgba(color)
  if (!rgba) return color
  const alpha = Math.round(rgba.a * clamp01(alphaScale) * 1000) / 1000
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${alpha})`
}

export function getHighlightWeight(timeMs: number, word: TranscriptWord, transitionMs: number): number {
  const duration = Math.max(1, transitionMs)
  const start = word.startTime
  const end = word.endTime

  if (timeMs < start) return 0
  if (timeMs < start + duration) return clamp01((timeMs - start) / duration)
  if (timeMs < end) return 1
  if (timeMs < end + duration) return clamp01(1 - (timeMs - end) / duration)
  return 0
}
