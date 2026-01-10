/**
 * Activity Suggestion Popover
 * 
 * Logic:
 * - Typing periods: Speed Up only (no trim)
 * - Idle periods (edge or mid-clip): BOTH Speed Up AND Trim options
 * - All types: Can dismiss or apply all speed-ups
 * 
 * Clean, minimal design - user chooses the action they want.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { SpeedUpType } from '@/types/speed-up'
import { FastForward, Scissors, X } from 'lucide-react'

const spring = { type: 'spring', stiffness: 500, damping: 30 } as const

export interface ActivitySuggestionPopoverProps {
  x: number
  y: number
  period: SpeedUpPeriod
  allTypingPeriods: SpeedUpPeriod[]
  allIdlePeriods: SpeedUpPeriod[]
  onApply: (period: SpeedUpPeriod) => Promise<void>
  onTrim?: (period: SpeedUpPeriod) => Promise<void>
  onDismiss?: (period: SpeedUpPeriod) => Promise<void>
  onApplyAll?: () => Promise<void>
  onClose: () => void
}

export function ActivitySuggestionPopover({
  x,
  y,
  period,
  allTypingPeriods,
  allIdlePeriods,
  onApply,
  onTrim,
  onDismiss,
  onApplyAll,
  onClose
}: ActivitySuggestionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [loading, setLoading] = useState<'speedup' | 'trim' | null>(null)

  // Determine period type
  const isTyping = period.type === SpeedUpType.Typing
  const isTrimStart = period.type === SpeedUpType.TrimStart
  const isTrimEnd = period.type === SpeedUpType.TrimEnd
  const isEdgeTrim = isTrimStart || isTrimEnd
  const isIdle = period.type === SpeedUpType.Idle || isEdgeTrim

  // UI logic:
  // - Typing: Speed up only
  // - Idle (any type): Both speed up AND trim
  const canTrim = isIdle && onTrim
  const showApplyAll = onApplyAll && (allTypingPeriods.length + allIdlePeriods.length) > 1

  const totalAll = allTypingPeriods.length + allIdlePeriods.length

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Position clamping
  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const pad = 12
    setPos({
      left: Math.min(Math.max(x, pad), window.innerWidth - rect.width - pad),
      top: Math.min(Math.max(y, pad), window.innerHeight - rect.height - pad)
    })
  }, [x, y])

  // Stats
  const stats = useMemo(() => {
    const durationMs = period.endTime - period.startTime
    const speedUpSaved = durationMs * (1 - 1 / period.suggestedSpeedMultiplier)
    const trimSaved = period.metadata?.trimSavedMs || durationMs

    const fmt = (ms: number) => {
      const s = ms / 1000
      return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(0).padStart(2, '0')}`
    }

    return {
      duration: fmt(durationMs),
      speedUpSaved: fmt(speedUpSaved),
      trimSaved: fmt(trimSaved),
      multiplier: period.suggestedSpeedMultiplier.toFixed(1)
    }
  }, [period])

  // Get display label for the period type
  const typeLabel = useMemo(() => {
    if (isTyping) return 'Typing'
    if (isTrimStart) return 'Start Idle'
    if (isTrimEnd) return 'End Idle'
    return 'Idle'
  }, [isTyping, isTrimStart, isTrimEnd])

  const handleSpeedUp = async () => {
    setLoading('speedup')
    try {
      // For edge idle (trim types), convert to regular idle period for speed-up
      const speedUpPeriod = isEdgeTrim ? { ...period, type: SpeedUpType.Idle } : period
      await onApply(speedUpPeriod)
    } finally {
      onClose()
    }
  }

  const handleTrim = async () => {
    setLoading('trim')
    try {
      if (onTrim) {
        await onTrim(period)
      }
    } finally {
      onClose()
    }
  }

  const handleApplyAll = async () => {
    if (onApplyAll) {
      setLoading('speedup')
      try {
        await onApplyAll()
      } finally {
        onClose()
      }
    }
  }

  const content = (
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.95, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={spring}
        className="fixed z-[9999] rounded-xl bg-popover/95 backdrop-blur-lg border border-border shadow-xl overflow-hidden"
        style={{ left: pos.left, top: pos.top, minWidth: canTrim ? 200 : 160 }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header with dismiss (X) button */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <span className="text-xs font-medium text-foreground/70">
            {typeLabel}
            <span className="text-foreground/40 ml-1.5">{stats.duration}</span>
          </span>
          <button
            onClick={onClose}
            title="Dismiss"
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Options */}
        <div className="p-1.5 space-y-1">
          {/* Speed Up option - available for all types */}
          <button
            onClick={handleSpeedUp}
            disabled={loading !== null}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/80 transition-colors text-left disabled:opacity-50"
          >
            <div className="w-7 h-7 rounded-md bg-sky-500/15 flex items-center justify-center">
              <FastForward className="w-3.5 h-3.5 text-sky-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-foreground">Speed Up</div>
              <div className="text-[10px] text-muted-foreground">
                {stats.multiplier}× · saves {stats.speedUpSaved}
              </div>
            </div>
          </button>

          {/* Trim option - available for ALL idle types (edge or mid-clip) */}
          {canTrim && (
            <button
              onClick={handleTrim}
              disabled={loading !== null}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/80 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-7 h-7 rounded-md bg-rose-500/15 flex items-center justify-center">
                <Scissors className="w-3.5 h-3.5 text-rose-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-foreground">Trim</div>
                <div className="text-[10px] text-muted-foreground">
                  Remove · saves {stats.trimSaved}
                </div>
              </div>
            </button>
          )}

          {/* Dismiss option - removes the bar with undo support */}
          <button
            onClick={async () => {
              if (onDismiss) {
                setLoading('speedup') // reuse loading state
                try {
                  await onDismiss(period)
                } finally {
                  onClose()
                }
              } else {
                onClose()
              }
            }}
            disabled={loading !== null}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/80 transition-colors text-left disabled:opacity-50"
          >
            <div className="w-7 h-7 rounded-md bg-muted/50 flex items-center justify-center">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-foreground">Dismiss</div>
              <div className="text-[10px] text-muted-foreground">
                Remove bar (Cmd+Z to undo)
              </div>
            </div>
          </button>

          {/* Apply All Speed-Ups - shown if multiple periods exist */}
          {showApplyAll && (
            <button
              onClick={handleApplyAll}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
            >
              Speed up all ({totalAll})
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )

  return typeof document !== 'undefined'
    ? ReactDOM.createPortal(content, document.body)
    : content
}
