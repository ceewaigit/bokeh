import type { KeyboardEvent, KeystrokeEffectData } from '@/types/project'
import { KeystrokePosition } from '@/types/project'
import { getPrintableCharFromKey, isShortcutModifier, isStandaloneModifierKey } from '@/lib/keyboard/keyboard-utils'
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects'

type StylePreset = 'default' | 'glass' | 'minimal' | 'terminal' | 'outline'

interface KeystrokeSegment {
  text: string
  startTime: number
  endTime: number
  isShortcut: boolean
  charTimestamps: number[]
  // For combined shortcuts: individual parts with their timestamps
  shortcutParts?: { text: string; timestamp: number }[]
}

export type KeystrokeDrawRect = {
  x: number
  y: number
  width: number
  height: number
}

export class KeystrokeRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private keyHistory: KeyboardEvent[] = []
  private segments: KeystrokeSegment[] = []
  private options: Required<KeystrokeEffectData>
  private dpr: number = 1  // Device pixel ratio for Retina support

  constructor(initialOptions: KeystrokeEffectData = {}) {
    this.options = {
      ...DEFAULT_KEYSTROKE_DATA,
      ...initialOptions
    } as Required<KeystrokeEffectData>
  }

  updateSettings(newOptions: KeystrokeEffectData) {
    this.options = {
      ...this.options,
      ...newOptions
    } as Required<KeystrokeEffectData>
  }

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
  }

  /**
   * Set the device pixel ratio for Retina display support.
   * When set, the renderer will apply a scale transform for crisp rendering.
   */
  setDPR(dpr: number) {
    this.dpr = dpr
  }

  setKeyboardEvents(events: KeyboardEvent[]) {
    // Ensure deterministic behavior and correct incremental rendering even if
    // metadata events are not in strict chronological order.
    const orderedEvents = events
      .map((e, index) => ({ e, index }))
      .sort((a, b) => (a.e.timestamp - b.e.timestamp) || (a.index - b.index))
      .map(({ e }) => e)

    this.keyHistory = orderedEvents
    this.segments = this.computeSegments(orderedEvents)
  }

  private computeSegments(events: KeyboardEvent[]): KeystrokeSegment[] {
    const segments: KeystrokeSegment[] = []
    const BUFFER_TIMEOUT = 800
    const SHORTCUT_COMBINE_THRESHOLD = 1000 // Combine shortcuts within 1 second
    const displayDuration = this.options.displayDuration || 2000

    let currentBuffer: {
      text: string
      startTime: number
      lastKeyTime: number
      charTimestamps: number[]
    } | null = null

    const flushBuffer = () => {
      if (currentBuffer && currentBuffer.text.trim().length > 0) {
        const trimmedText = currentBuffer.text.trim()
        const leftTrimCount = currentBuffer.text.length - currentBuffer.text.trimStart().length
        const adjustedTimestamps = currentBuffer.charTimestamps.slice(
          leftTrimCount,
          leftTrimCount + trimmedText.length
        )
        segments.push({
          text: trimmedText,
          startTime: currentBuffer.startTime,
          endTime: currentBuffer.lastKeyTime + displayDuration,
          isShortcut: false,
          charTimestamps: adjustedTimestamps
        })
      }
      currentBuffer = null
    }

    // Helper to add a shortcut, combining with previous if within threshold
    const addShortcut = (keyDisplay: string, timestamp: number) => {
      const lastSeg = segments[segments.length - 1]
      // Combine if previous segment is also a shortcut and within threshold
      if (lastSeg && lastSeg.isShortcut && (timestamp - lastSeg.charTimestamps[lastSeg.charTimestamps.length - 1]) <= SHORTCUT_COMBINE_THRESHOLD) {
        // Combine with previous shortcut - store parts for progressive reveal
        if (!lastSeg.shortcutParts) {
          // Convert existing single shortcut to parts format
          lastSeg.shortcutParts = [{ text: lastSeg.text, timestamp: lastSeg.startTime }]
        }
        lastSeg.shortcutParts.push({ text: keyDisplay, timestamp })
        lastSeg.text = lastSeg.shortcutParts.map(p => p.text).join(' + ')
        lastSeg.endTime = timestamp + displayDuration
        lastSeg.charTimestamps.push(timestamp)
      } else {
        // Create new shortcut segment
        segments.push({
          text: keyDisplay,
          startTime: timestamp,
          endTime: timestamp + displayDuration,
          isShortcut: true,
          charTimestamps: [timestamp]
        })
      }
    }

    for (const event of events) {
      const key = event.key
      if (isStandaloneModifierKey(key)) continue

      const shortcut = isShortcutModifier(event.modifiers || [])
      const isSpecialKey = key === 'Enter' || key === 'Tab' || key === 'Escape'
      const isTimeGap = currentBuffer && (event.timestamp - currentBuffer.lastKeyTime > BUFFER_TIMEOUT)

      if (isTimeGap && currentBuffer) flushBuffer()
      if ((isSpecialKey || shortcut) && currentBuffer) flushBuffer()

      if (shortcut) {
        const keyDisplay = this.formatModifierKey(key, event.modifiers)
        addShortcut(keyDisplay, event.timestamp)
      } else if (isSpecialKey) {
        const keyDisplay = this.formatSpecialKey(key)
        addShortcut(keyDisplay, event.timestamp)
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
          if (!currentBuffer) {
            currentBuffer = { text: '', startTime: event.timestamp, lastKeyTime: event.timestamp, charTimestamps: [] }
          }
          currentBuffer.text += printable
          currentBuffer.charTimestamps.push(event.timestamp)
          currentBuffer.lastKeyTime = event.timestamp
        }
      }
    }

    flushBuffer()
    return segments
  }

  render(timestamp: number, videoWidth: number, videoHeight: number): KeystrokeDrawRect | null {
    if (!this.canvas || !this.ctx || this.segments.length === 0) return null

    const ctx = this.ctx
    const displayDuration = this.options.displayDuration || 2000
    const fadeOutDuration = this.options.fadeOutDuration || 400
    const fadeInDuration = 120

    // Apply DPR scale transform for crisp Retina rendering
    // This must be done before any drawing operations
    if (this.dpr !== 1) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    }

    let activeSegment: KeystrokeSegment | null = null
    let displayText: string | null = null
    let isMidTyping = false

    // Prefer the most recent visible segment so newer typing replaces older
    // segments that are still within their display/fade window.
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const segment = this.segments[i]
      const fadeEnd = segment.endTime + fadeOutDuration
      if (segment.startTime > timestamp || fadeEnd < timestamp) continue

      if (segment.isShortcut) {
        // For combined shortcuts, progressively reveal parts based on their timestamps
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

    let opacity = 1
    const elapsed = timestamp - activeSegment.startTime

    // Calculate fade in and fade out independently, then combine
    const fadeIn = elapsed < fadeInDuration ? elapsed / fadeInDuration : 1

    let fadeOut = 1
    if (!isMidTyping && timestamp >= activeSegment.endTime) {
      const fadeProgress = (timestamp - activeSegment.endTime) / fadeOutDuration
      fadeOut = Math.max(0, 1 - fadeProgress)
    }

    opacity = Math.min(fadeIn, fadeOut)

    if (opacity <= 0) return null

    const position = this.calculatePosition(videoWidth, videoHeight)
    return this.drawKeystroke(displayText, position.x, position.y, opacity)
  }

  private formatModifierKey(key: string, modifiers: string[]): string {
    let displayKey = this.normalizeKey(key)
    if (modifiers.length > 0 && displayKey.length === 1) {
      const parts: string[] = []
      const useSymbols = this.options.showModifierSymbols !== false
      if (modifiers.includes('cmd') || modifiers.includes('meta')) parts.push(useSymbols ? '⌘' : 'Cmd+')
      if (modifiers.includes('ctrl')) parts.push(useSymbols ? '⌃' : 'Ctrl+')
      if (modifiers.includes('alt') || modifiers.includes('option')) parts.push(useSymbols ? '⌥' : 'Alt+')
      if (modifiers.includes('shift')) parts.push(useSymbols ? '⇧' : 'Shift+')
      parts.push(displayKey.toUpperCase())
      return parts.join('')
    }
    return displayKey.length === 1 ? displayKey : this.formatSpecialKey(key)
  }

  private normalizeKey(key: string): string {
    if (key.startsWith('Key') && key.length === 4) return key.charAt(3).toUpperCase()
    if (key.startsWith('Digit') && key.length === 6) return key.charAt(5)
    if (key.length === 1) return key
    return key
  }

  private formatSpecialKey(key: string): string {
    const keyMap: Record<string, string> = {
      'Space': '␣', 'Enter': '↵', 'Return': '↵', 'Tab': '⇥',
      'Backspace': '⌫', 'Delete': '⌦', 'Escape': 'esc',
      'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
    }
    if (keyMap[key]) return keyMap[key]
    if (key.startsWith('Key') && key.length === 4) return key.charAt(3).toUpperCase()
    if (key.startsWith('Digit') && key.length === 6) return key.charAt(5)
    if (key.match(/^F\d{1,2}$/)) return key
    return key.toLowerCase()
  }

  private calculatePosition(videoWidth: number, videoHeight: number): { x: number; y: number } {
    const scale = this.options.scale || 1
    const margin = 48 * scale

    switch (this.options.position) {
      case KeystrokePosition.BottomRight:
        return { x: videoWidth - margin - 100, y: videoHeight - margin }
      case KeystrokePosition.TopCenter:
        return { x: videoWidth / 2, y: margin }
      case KeystrokePosition.BottomCenter:
      default:
        return { x: videoWidth / 2, y: videoHeight - margin }
    }
  }

  private drawKeystroke(text: string, x: number, y: number, opacity: number): KeystrokeDrawRect | null {
    if (!this.ctx) return null

    const ctx = this.ctx
    const scale = this.options.scale || 1
    const fontSize = (this.options.fontSize || 14) * scale
    const padding = (this.options.padding || 10) * scale
    const borderRadius = (this.options.borderRadius || 8) * scale
    const preset = this.options.stylePreset || 'glass'

    ctx.save()
    ctx.globalAlpha = opacity

    // Clean, professional typography
    const isTerminal = preset === 'terminal'
    const fontFamily = isTerminal
      ? 'ui-monospace, "SF Mono", Monaco, "Cascadia Code", monospace'
      : '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

    ctx.font = `500 ${fontSize}px ${fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const metrics = ctx.measureText(text)
    const textWidth = metrics.width
    const hPad = padding * 1.4
    const vPad = padding * 0.9
    const boxWidth = textWidth + hPad * 2
    const boxHeight = fontSize + vPad * 2
    const boxX = x - boxWidth / 2
    const boxY = y - boxHeight / 2

    this.drawBackground(ctx, preset, boxX, boxY, boxWidth, boxHeight, borderRadius, scale)
    this.drawText(ctx, preset, text, x, y, scale)

    ctx.restore()

    // Return an expanded rectangle for targeted clearing on next frame.
    // Include some padding to cover blur/shadows/subpixel AA.
    const clearPad = Math.ceil(24 * scale)
    return {
      x: Math.floor(boxX - clearPad),
      y: Math.floor(boxY - clearPad),
      width: Math.ceil(boxWidth + clearPad * 2),
      height: Math.ceil(boxHeight + clearPad * 2),
    }
  }

  private drawBackground(
    ctx: CanvasRenderingContext2D,
    preset: StylePreset,
    x: number, y: number,
    w: number, h: number,
    r: number,
    scale: number
  ) {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)

    switch (preset) {
      case 'glass': {
        // Clean, subtle glass - NOT over-designed
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
        ctx.fill()

        // Single subtle border, no gradient gimmicks
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
        ctx.lineWidth = 0.5
        ctx.stroke()
        break
      }

      case 'minimal': {
        // No background at all - just the text
        break
      }

      case 'terminal': {
        // Clean dark with subtle accent
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)'
        ctx.lineWidth = 1
        ctx.stroke()
        break
      }

      case 'outline': {
        // Simple outline, no fill
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        break
      }

      case 'default':
      default: {
        // Solid, professional
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
        ctx.shadowBlur = 8 * scale
        ctx.shadowOffsetY = 2 * scale
        ctx.fillStyle = this.options.backgroundColor || 'rgba(24, 24, 27, 0.9)'
        ctx.fill()
        break
      }
    }

    // Reset shadow
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
  }

  private drawText(ctx: CanvasRenderingContext2D, preset: StylePreset, text: string, x: number, y: number, scale: number) {
    switch (preset) {
      case 'minimal':
        // Text shadow for readability
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
        ctx.shadowBlur = 6 * scale
        ctx.shadowOffsetY = 2 * scale
        ctx.fillStyle = '#ffffff'
        ctx.fillText(text, x, y)
        break

      case 'terminal':
        ctx.fillStyle = '#4ade80'
        ctx.fillText(text, x, y)
        break

      case 'outline':
        // White text with subtle shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
        ctx.shadowBlur = 4 * scale
        ctx.fillStyle = '#ffffff'
        ctx.fillText(text, x, y)
        break

      default:
        ctx.fillStyle = this.options.textColor || '#ffffff'
        ctx.fillText(text, x, y)
        break
    }

    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  }

  reset() { }

  hasKeystrokesAtTime(timestamp: number): boolean {
    const fadeOutDuration = this.options.fadeOutDuration || 400
    return this.segments.some(s => s.startTime <= timestamp && s.endTime + fadeOutDuration > timestamp)
  }
}
