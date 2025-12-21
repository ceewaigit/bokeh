import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Clamp a value between min and max
 * Replaces verbose Math.min(Math.max(...)) patterns
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function formatTime(ms: number, padMinutes = false): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  const displaySeconds = seconds % 60
  const displayMinutes = minutes % 60

  if (hours > 0) {
    return `${hours}:${displayMinutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`
  }

  const minStr = padMinutes ? displayMinutes.toString().padStart(2, '0') : displayMinutes.toString()
  return `${minStr}:${displaySeconds.toString().padStart(2, '0')}`
}