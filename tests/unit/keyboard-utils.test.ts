import { getPrintableCharFromKey, isLikelyKeyboardKey } from '@/lib/keyboard/keyboard-utils'

describe('keyboard-utils getPrintableCharFromKey', () => {
  it('handles uiohook KeyA/Digit1 patterns', () => {
    expect(getPrintableCharFromKey('KeyA')).toBe('a')
    expect(getPrintableCharFromKey('KeyA', ['shift'])).toBe('A')
    expect(getPrintableCharFromKey('Digit1')).toBe('1')
    expect(getPrintableCharFromKey('Numpad5')).toBe('5')
  })

  it('returns null for non-printable unknown codes', () => {
    expect(getPrintableCharFromKey('999')).toBeNull()
  })
})

describe('keyboard-utils isLikelyKeyboardKey', () => {
  it('accepts common KeyboardEvent.code values', () => {
    expect(isLikelyKeyboardKey('KeyA')).toBe(true)
    expect(isLikelyKeyboardKey('Digit1')).toBe(true)
    expect(isLikelyKeyboardKey('Numpad5')).toBe(true)
    expect(isLikelyKeyboardKey('Enter')).toBe(true)
    expect(isLikelyKeyboardKey('ArrowDown')).toBe(true)
    expect(isLikelyKeyboardKey('F13')).toBe(true)
  })

  it('rejects unknown placeholders and mouse-like keys', () => {
    expect(isLikelyKeyboardKey('Unknown(12345)')).toBe(false)
    expect(isLikelyKeyboardKey('left')).toBe(false)
    expect(isLikelyKeyboardKey('middle')).toBe(false)
  })
})
