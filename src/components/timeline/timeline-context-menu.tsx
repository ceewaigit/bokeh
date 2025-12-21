'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Scissors, ChevronsLeft, ChevronsRight, Layers, Copy, Trash2, Zap } from 'lucide-react'

interface TimelineContextMenuProps {
  x: number
  y: number
  clipId: string
  onSplit: (clipId: string) => void | Promise<void>
  onTrimStart: (clipId: string) => void | Promise<void>
  onTrimEnd: (clipId: string) => void | Promise<void>
  onDuplicate: (clipId: string) => void | Promise<void>
  onCut: (clipId: string) => void | Promise<void>
  onCopy: (clipId: string) => void | Promise<void>
  onPaste: () => void | Promise<void>
  onDelete: (clipId: string) => void | Promise<void>
  onSpeedUp: (clipId: string) => void | Promise<void>
  onClose: () => void
}

export const TimelineContextMenu = React.memo(({
  x,
  y,
  clipId,
  onSplit,
  onTrimStart,
  onTrimEnd,
  onDuplicate,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onSpeedUp,
  onClose
}: TimelineContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: x, top: y })

  const handleAction = async (action: () => void | Promise<void>) => {
    if (isBusy) return
    try {
      setIsBusy(true)
      await action()
    } finally {
      setIsBusy(false)
      onClose()
    }
  }

  // Clamp menu position to the viewport so it never renders off-screen.
  useLayoutEffect(() => {
    setPosition({ left: x, top: y })

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
    const PADDING = 12

    const raf = requestAnimationFrame(() => {
      const el = menuRef.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const viewportW = window.innerWidth
      const viewportH = window.innerHeight

      const maxLeft = Math.max(PADDING, viewportW - rect.width - PADDING)
      const maxTop = Math.max(PADDING, viewportH - rect.height - PADDING)

      const nextLeft = clamp(x, PADDING, maxLeft)
      const nextTop = clamp(y, PADDING, maxTop)

      // Avoid extra renders if unchanged.
      setPosition((prev) =>
        prev.left === nextLeft && prev.top === nextTop ? prev : { left: nextLeft, top: nextTop }
      )
    })

    return () => cancelAnimationFrame(raf)
  }, [x, y])

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    // Add listener with a small delay to avoid immediate close on right-click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed bg-popover border border-border rounded-md shadow-lg p-1 z-[9999] min-w-[240px]"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        maxHeight: 'calc(100vh - 24px)',
        overflowY: 'auto'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-2 py-1 text-[10px] font-medium tracking-wide text-muted-foreground/70">
        Clip
      </div>
      <button
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-[13px] leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onSplit(clipId))}
      >
        <Scissors className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Split at Playhead</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70 whitespace-nowrap">⌘K</span>
      </button>
      <button
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-[13px] leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onTrimStart(clipId))}
      >
        <ChevronsLeft className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Trim Start to Playhead</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70 whitespace-nowrap">[</span>
      </button>
      <button
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-[13px] leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onTrimEnd(clipId))}
      >
        <ChevronsRight className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Trim End to Playhead</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70 whitespace-nowrap">]</span>
      </button>
      <div className="h-px bg-border my-1" />
      <button
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-[13px] leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onCut(clipId))}
      >
        <span className="w-4 h-4 justify-self-center" aria-hidden />
        <span className="truncate text-left">Cut</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70 whitespace-nowrap">⌘X</span>
      </button>
      <button
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-[13px] leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onCopy(clipId))}
      >
        <Copy className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Copy</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70 whitespace-nowrap">⌘C</span>
      </button>
      <button
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-[13px] leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onPaste())}
      >
        <span className="w-4 h-4 justify-self-center" aria-hidden />
        <span className="truncate text-left">Paste</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70 whitespace-nowrap">⌘V</span>
      </button>
      <div className="h-px bg-border my-1" />
      <button
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-[13px] leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onDuplicate(clipId))}
      >
        <Layers className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Duplicate</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70 whitespace-nowrap">⌘D</span>
      </button>
      <button
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-[13px] leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onSpeedUp(clipId))}
      >
        <Zap className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Speed Up (2x)</span>
        <span />
      </button>
      <div className="h-px bg-border my-1" />
      <button
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-[13px] leading-none text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onDelete(clipId))}
      >
        <Trash2 className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Delete</span>
        <span className="font-mono text-[11px] tabular-nums text-destructive/70 whitespace-nowrap">⌫</span>
      </button>
    </div>
  )

  // Use portal to render at document body level
  if (typeof document !== 'undefined') {
    return ReactDOM.createPortal(menuContent, document.body)
  }

  return menuContent
})
