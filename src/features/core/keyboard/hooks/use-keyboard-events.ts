import { useEffect } from 'react'
import { keyboardManager } from '@/features/core/keyboard/keyboard-manager'

export interface KeyboardEventBinding {
  event: string
  handler: () => void
}

export function useKeyboardEvents(bindings: KeyboardEventBinding[], enabled = true) {
  useEffect(() => {
    if (!enabled) return

    bindings.forEach(({ event, handler }) => {
      keyboardManager.on(event as any, handler)
    })

    return () => {
      bindings.forEach(({ event, handler }) => {
        keyboardManager.removeListener(event as any, handler)
      })
    }
  }, [bindings, enabled])
}
