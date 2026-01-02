import type { KeyboardEvent, KeystrokeEffectData } from '@/types/project'
import { KEYSTROKE_CONFIG } from '@/shared/config/physics-config'
import { getPrintableCharFromKey, isShortcutModifier, isStandaloneModifierKey } from '@/features/keyboard/keyboard-utils'

export type KeystrokeStylePreset = 'default' | 'glass' | 'minimal' | 'terminal' | 'outline'

export interface KeystrokeSegment {
  text: string
  startTime: number
  endTime: number
  isShortcut: boolean
  charTimestamps: number[]
  shortcutParts?: { text: string; timestamp: number }[]
}

export interface KeystrokeDisplayState {
  text: string
  opacity: number
}

export interface KeystrokePresetStyle {
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  textColor?: string
  boxShadow?: { color: string; blur: number; offsetY: number }
  textShadow?: { color: string; blur: number; offsetY: number }
}

const FADE_IN_MS = 120

export function computeKeystrokeSegments(events: KeyboardEvent[], options: Required<KeystrokeEffectData>): KeystrokeSegment[] {
  const segments: KeystrokeSegment[] = []
  const bufferTimeoutMs = KEYSTROKE_CONFIG.bufferTimeout
  const shortcutCombineThresholdMs = 1000
  const displayDuration = options.displayDuration || KEYSTROKE_CONFIG.defaultDisplayDuration

  let currentBuffer: { text: string; startTime: number; lastKeyTime: number; charTimestamps: number[] } | null = null

  const flushBuffer = () => {
    if (currentBuffer && currentBuffer.text.trim().length > 0) {
      const trimmedText = currentBuffer.text.trim()
      const leftTrimCount = currentBuffer.text.length - currentBuffer.text.trimStart().length
      const adjustedTimestamps = currentBuffer.charTimestamps.slice(leftTrimCount, leftTrimCount + trimmedText.length)
      segments.push({
        text: trimmedText,
        startTime: currentBuffer.startTime,
        endTime: currentBuffer.lastKeyTime + displayDuration,
        isShortcut: false,
        charTimestamps: adjustedTimestamps,
      })
    }
    currentBuffer = null
  }

  const addShortcut = (keyDisplay: string, timestamp: number) => {
    const lastSeg = segments[segments.length - 1]
    if (
      lastSeg &&
      lastSeg.isShortcut &&
      timestamp - lastSeg.charTimestamps[lastSeg.charTimestamps.length - 1] <= shortcutCombineThresholdMs
    ) {
      if (!lastSeg.shortcutParts) {
        lastSeg.shortcutParts = [{ text: lastSeg.text, timestamp: lastSeg.startTime }]
      }
      lastSeg.shortcutParts.push({ text: keyDisplay, timestamp })
      lastSeg.text = lastSeg.shortcutParts.map(p => p.text).join(' + ')
      lastSeg.endTime = timestamp + displayDuration
      lastSeg.charTimestamps.push(timestamp)
    } else {
      segments.push({ text: keyDisplay, startTime: timestamp, endTime: timestamp + displayDuration, isShortcut: true, charTimestamps: [timestamp] })
    }
  }

  const orderedEvents = events
    .map((e, index) => ({ e, index }))
    .sort((a, b) => a.e.timestamp - b.e.timestamp || a.index - b.index)
    .map(({ e }) => e)

  for (const event of orderedEvents) {
    const key = event.key
    if (isStandaloneModifierKey(key)) continue

    const shortcut = isShortcutModifier(event.modifiers || [])
    const isSpecialKey = key === 'Enter' || key === 'Tab' || key === 'Escape'
    const isTimeGap = currentBuffer && event.timestamp - currentBuffer.lastKeyTime > bufferTimeoutMs

    if (isTimeGap && currentBuffer) flushBuffer()
    if ((isSpecialKey || shortcut) && currentBuffer) flushBuffer()

    if (shortcut) {
      addShortcut(formatModifierKey(key, event.modifiers, options.showModifierSymbols !== false), event.timestamp)
    } else if (isSpecialKey) {
      addShortcut(formatSpecialKey(key), event.timestamp)
    } else if (key === 'Backspace' || key === 'Delete') {
      if (currentBuffer && currentBuffer.text.length > 0) {
        currentBuffer.text = currentBuffer.text.slice(0, -1)
        currentBuffer.charTimestamps.pop()
        currentBuffer.lastKeyTime = event.timestamp
        if (currentBuffer.text.length === 0) currentBuffer = null
      }
    } else {
      const printable = getPrintableCharFromKey(key, event.modifiers)
      if (printable) {
        if (!currentBuffer) currentBuffer = { text: '', startTime: event.timestamp, lastKeyTime: event.timestamp, charTimestamps: [] }
        currentBuffer.text += printable
        currentBuffer.charTimestamps.push(event.timestamp)
        currentBuffer.lastKeyTime = event.timestamp
      }
    }
  }

  flushBuffer()
  return segments
}

export function getKeystrokeDisplayState(
  segments: KeystrokeSegment[],
  timestamp: number,
  options: Required<KeystrokeEffectData>
): KeystrokeDisplayState | null {
  if (segments.length === 0) return null

  const fadeOutDuration = options.fadeOutDuration || KEYSTROKE_CONFIG.fadeOutDuration
  let activeSegment: KeystrokeSegment | null = null
  let displayText: string | null = null
  let isMidTyping = false

  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]
    const fadeEnd = segment.endTime + fadeOutDuration
    if (segment.startTime > timestamp || fadeEnd < timestamp) continue

    if (segment.isShortcut) {
      if (segment.shortcutParts && segment.shortcutParts.length > 1) {
        const visibleParts = segment.shortcutParts.filter(p => p.timestamp <= timestamp)
        if (visibleParts.length === 0) continue
        displayText = visibleParts.map(p => p.text).join(' + ')
        isMidTyping = visibleParts.length < segment.shortcutParts.length
      } else {
        displayText = segment.text
      }
      activeSegment = segment
      break
    }

    let charsToShow = 0
    for (const charTime of segment.charTimestamps) {
      if (charTime <= timestamp) charsToShow++
      else break
    }

    if (charsToShow === 0) continue

    displayText = segment.text.substring(0, charsToShow)
    activeSegment = segment
    isMidTyping = charsToShow < segment.text.length
    break
  }

  if (!activeSegment || !displayText) return null

  const elapsed = timestamp - activeSegment.startTime
  const fadeIn = elapsed < FADE_IN_MS ? elapsed / FADE_IN_MS : 1

  let fadeOut = 1
  if (!isMidTyping && timestamp >= activeSegment.endTime) {
    const fadeProgress = (timestamp - activeSegment.endTime) / fadeOutDuration
    fadeOut = Math.max(0, 1 - fadeProgress)
  }

  const opacity = Math.min(fadeIn, fadeOut)
  if (opacity <= 0) return null

  return { text: displayText, opacity }
}

export function getKeystrokeFontFamily(preset: KeystrokeStylePreset, fontFamily?: string): string {
  if (preset === 'terminal') return 'ui-monospace, \"SF Mono\", Monaco, \"Cascadia Code\", monospace'
  return fontFamily || '-apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif'
}

export function getKeystrokePresetStyle(
  preset: KeystrokeStylePreset,
  options: Required<KeystrokeEffectData>,
  scale: number
): KeystrokePresetStyle {
  switch (preset) {
    case 'glass':
      return { backgroundColor: 'rgba(0, 0, 0, 0.65)', borderColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 0.5, textColor: '#ffffff' }
    case 'minimal':
      return { textColor: '#ffffff', textShadow: { color: 'rgba(0, 0, 0, 0.6)', blur: 6 * scale, offsetY: 2 * scale } }
    case 'terminal':
      return { backgroundColor: 'rgba(0, 0, 0, 0.85)', borderColor: 'rgba(74, 222, 128, 0.4)', borderWidth: 1, textColor: '#4ade80' }
    case 'outline':
      return { borderColor: 'rgba(255, 255, 255, 0.7)', borderWidth: 1.5, textColor: '#ffffff', textShadow: { color: 'rgba(0, 0, 0, 0.5)', blur: 4 * scale, offsetY: 0 } }
    case 'default':
    default:
      return { backgroundColor: options.backgroundColor || 'rgba(24, 24, 27, 0.9)', textColor: options.textColor || '#ffffff', boxShadow: { color: 'rgba(0, 0, 0, 0.2)', blur: 8 * scale, offsetY: 2 * scale } }
  }
}

function formatModifierKey(key: string, modifiers: string[], useSymbols: boolean): string {
  const displayKey = normalizeKey(key)
  if (modifiers.length > 0 && displayKey.length === 1) {
    const parts: string[] = []
    if (modifiers.includes('cmd') || modifiers.includes('meta')) parts.push(useSymbols ? '⌘' : 'Cmd+')
    if (modifiers.includes('ctrl')) parts.push(useSymbols ? '⌃' : 'Ctrl+')
    if (modifiers.includes('alt') || modifiers.includes('option')) parts.push(useSymbols ? '⌥' : 'Alt+')
    if (modifiers.includes('shift')) parts.push(useSymbols ? '⇧' : 'Shift+')
    parts.push(displayKey.toUpperCase())
    return parts.join('')
  }
  return displayKey.length === 1 ? displayKey : formatSpecialKey(key)
}

function normalizeKey(key: string): string {
  if (key.startsWith('Key') && key.length === 4) return key.charAt(3).toUpperCase()
  if (key.startsWith('Digit') && key.length === 6) return key.charAt(5)
  if (key === 'Space') return 'Space'
  return key
}

function formatSpecialKey(key: string): string {
  switch (key) {
    case 'Enter':
      return '⏎'
    case 'Tab':
      return '⇥'
    case 'Escape':
      return '⎋'
    default:
      return normalizeKey(key)
  }
}

