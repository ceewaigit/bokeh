import type { KeyboardEvent } from '@/types/project'

function hasShift(modifiers: string[] = []): boolean {
  return modifiers.some(m => m.toLowerCase() === 'shift')
}

/**
 * Convert a raw key string (e.g. "KeyA", "Digit1") into a printable character
 * into a printable character for typing overlays and WPM calculation.
 * Returns null for non-printable/control keys.
 */
export function getPrintableCharFromKey(key: string, modifiers: string[] = []): string | null {
  if (!key) return null

  // Direct space / special aliases
  if (key === 'Space' || key === ' ') return ' '

  // uiohook-style key names
  if (key.startsWith('Key') && key.length === 4) {
    const ch = key.charAt(3)
    return hasShift(modifiers) ? ch.toUpperCase() : ch.toLowerCase()
  }
  if (key.startsWith('Digit') && key.length === 6) {
    return key.charAt(5)
  }
  if (key.startsWith('Numpad')) {
    const numpadKey = key.slice(6)
    if (numpadKey.length === 1) return numpadKey
  }

  // Already printable
  if (key.length === 1) return key

  return null
}

export function isStandaloneModifierKey(key: string): boolean {
  const modifierKeys = [
    'CapsLock', 'Shift', 'Control', 'Alt', 'Meta', 'Command', 'Option', 'Fn',
    'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
    'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'
  ]
  return modifierKeys.includes(key)
}

export function isLikelyKeyboardKey(key: string): boolean {
  if (!key) return false

  // uiohook keyboard handler uses `KeyboardEvent.code`-style strings (KeyA/Digit1/etc)
  // but we also allow already-printable characters.
  if (getPrintableCharFromKey(key) !== null) return true

  // Drop common non-keyboard artifacts / placeholders
  if (key.startsWith('Unknown(')) return false
  if (['left', 'right', 'middle'].includes(key.toLowerCase())) return false

  const knownNonPrintable = new Set([
    'Escape',
    'Backspace',
    'Tab',
    'Enter',
    'Space',
    'CapsLock',
    'NumLock',
    'ScrollLock',
    'PrintScreen',
    'Pause',
    'Insert',
    'Delete',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'ArrowLeft',
    'ArrowUp',
    'ArrowRight',
    'ArrowDown',
    'ShiftLeft',
    'ShiftRight',
    'ControlLeft',
    'ControlRight',
    'AltLeft',
    'AltRight',
    'MetaLeft',
    'MetaRight',
  ])
  if (knownNonPrintable.has(key)) return true

  // Function keys
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return true

  // Numpad operator keys
  if (/^Numpad(Enter|Add|Subtract|Multiply|Divide|Decimal)$/.test(key)) return true

  return false
}

export function isShortcutModifier(modifiers: string[] = []): boolean {
  return modifiers.some(m => {
    const lower = m.toLowerCase()
    return lower === 'cmd' || lower === 'meta' || lower === 'command' ||
      lower === 'ctrl' || lower === 'control' ||
      lower === 'alt' || lower === 'option'
  })
}

export function countPrintableCharacters(events: KeyboardEvent[]): number {
  return events.reduce((count, e) => {
    const printable = getPrintableCharFromKey(e.key, e.modifiers)
    return count + (printable ? 1 : 0)
  }, 0)
}
