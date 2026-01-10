import { getPrintableCharFromKey } from '@/features/core/keyboard/keyboard-utils'

describe('keyboard utils', () => {
  test('maps uiohook/Web `code`-style keys to printable characters', () => {
    expect(getPrintableCharFromKey('Quote', [])).toBe('\'')
    expect(getPrintableCharFromKey('Quote', ['shift'])).toBe('"')
    expect(getPrintableCharFromKey('Period', [])).toBe('.')
    expect(getPrintableCharFromKey('Comma', ['shift'])).toBe('<')
    expect(getPrintableCharFromKey('Digit1', ['shift'])).toBe('!')
    expect(getPrintableCharFromKey('Minus', ['shift'])).toBe('_')
  })
})

