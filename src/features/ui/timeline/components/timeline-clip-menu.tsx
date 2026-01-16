'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { motion } from 'framer-motion'
import { Scissors, ChevronsLeft, ChevronsRight, Layers, Copy, Trash2, Zap } from 'lucide-react'
import { useTimelineOperations } from './timeline-operations-context'

const springConfig = { type: 'spring', stiffness: 520, damping: 28 } as const

interface TimelineContextMenuProps {
  x: number
  y: number
  clipId: string
  onClose: () => void
}

export const TimelineContextMenu = React.memo(({
  x,
  y,
  clipId,
  onClose
}: TimelineContextMenuProps) => {
  const {
    onSplitClip,
    onTrimClipStart,
    onTrimClipEnd,
    onDuplicateClip,
    onCutClip,
    onCopyClip,
    onPasteClip,
    onDeleteClip,
    onSpeedUpClip
  } = useTimelineOperations()
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
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: 5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={springConfig}
      className="fixed bg-popover border border-border rounded-md shadow-lg p-1 z-[9999] min-w-popover"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        maxHeight: 'calc(100vh - 24px)',
        overflowY: 'auto'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-2 py-1 text-3xs font-medium tracking-wide text-muted-foreground/70">
        Clip
      </div>
      <motion.button
        whileHover={{ scale: 1.02, x: 2 }}
        transition={{ duration: 0.1 }}
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-ui-sm leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onSplitClip(clipId))}
      >
        <Scissors className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Split at Playhead</span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground/70 whitespace-nowrap">⌘K</span>
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.02, x: 2 }}
        transition={{ duration: 0.1 }}
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-ui-sm leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onTrimClipStart(clipId))}
      >
        <ChevronsLeft className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Trim Start to Playhead</span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground/70 whitespace-nowrap">[</span>
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.02, x: 2 }}
        transition={{ duration: 0.1 }}
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-ui-sm leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onTrimClipEnd(clipId))}
      >
        <ChevronsRight className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Trim End to Playhead</span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground/70 whitespace-nowrap">]</span>
      </motion.button>
      <div className="h-px bg-border my-1" />
      <motion.button
        whileHover={{ scale: 1.02, x: 2 }}
        transition={{ duration: 0.1 }}
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-ui-sm leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onCutClip(clipId))}
      >
        <span className="w-4 h-4 justify-self-center" aria-hidden />
        <span className="truncate text-left">Cut</span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground/70 whitespace-nowrap">⌘X</span>
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.02, x: 2 }}
        transition={{ duration: 0.1 }}
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-ui-sm leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onCopyClip(clipId))}
      >
        <Copy className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Copy</span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground/70 whitespace-nowrap">⌘C</span>
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.02, x: 2 }}
        transition={{ duration: 0.1 }}
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-ui-sm leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onPasteClip())}
      >
        <span className="w-4 h-4 justify-self-center" aria-hidden />
        <span className="truncate text-left">Paste</span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground/70 whitespace-nowrap">⌘V</span>
      </motion.button>
      <div className="h-px bg-border my-1" />
      <motion.button
        whileHover={{ scale: 1.02, x: 2 }}
        transition={{ duration: 0.1 }}
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-ui-sm leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onDuplicateClip(clipId))}
      >
        <Layers className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Duplicate</span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground/70 whitespace-nowrap">⌘D</span>
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.02, x: 2 }}
        transition={{ duration: 0.1 }}
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-ui-sm leading-none hover:bg-accent hover:text-accent-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onSpeedUpClip(clipId))}
      >
        <Zap className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Speed Up (2x)</span>
        <span />
      </motion.button>
      <div className="h-px bg-border my-1" />
      <motion.button
        whileHover={{ scale: 1.02, x: 2 }}
        transition={{ duration: 0.1 }}
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 w-full px-3 py-2 text-ui-sm leading-none text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-sm"
        disabled={isBusy}
        onClick={() => void handleAction(() => onDeleteClip(clipId))}
      >
        <Trash2 className="w-4 h-4 justify-self-center" />
        <span className="truncate text-left">Delete</span>
        <span className="font-mono text-2xs tabular-nums text-destructive/70 whitespace-nowrap">⌫</span>
      </motion.button>
    </motion.div>
  )

  // Use portal to render at document body level
  if (typeof document !== 'undefined') {
    return ReactDOM.createPortal(menuContent, document.body)
  }

  return menuContent
})

TimelineContextMenu.displayName = 'TimelineContextMenu'
