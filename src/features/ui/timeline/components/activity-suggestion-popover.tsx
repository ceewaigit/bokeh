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
import { cn } from '@/shared/utils/utils'

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Animation State (Springy Follow)
  // ─────────────────────────────────────────────────────────────────────────────
  const [hoveredOption, setHoveredOption] = useState<string | null>(null)

  const OptionButton = ({
    id,
    onClick,
    disabled,
    icon: Icon,
    iconColorClass,
    iconBgClass,
    label,
    description
  }: {
    id: string
    onClick: () => void
    disabled?: boolean
    icon: React.ElementType
    iconColorClass: string
    iconBgClass: string
    label: string
    description: React.ReactNode
  }) => {
    const isHovered = hoveredOption === id

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHoveredOption(id)}
        onMouseLeave={() => setHoveredOption(null)}
        className="group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left disabled:opacity-50 transition-none"
      >
        <AnimatePresence>
          {isHovered && !disabled && (
            <motion.div
              className="absolute inset-0 rounded-lg bg-foreground/5 dark:bg-white/10"
              layoutId="activity-popover-hover"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", duration: 0.2, bounce: 0 }}
            />
          )}
        </AnimatePresence>

        <div className={cn("relative z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95", iconBgClass)}>
          <Icon className={cn("w-4 h-4", iconColorClass)} />
        </div>
        <div className="relative z-10 flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-foreground tracking-tight">{label}</div>
          <div className="text-[11px] font-medium text-muted-foreground/80 leading-none mt-0.5">
            {description}
          </div>
        </div>
      </button>
    )
  }

  const content = (
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.95, y: 8, filter: 'blur(4px)' }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 0.95, filter: 'blur(2px)' }}
        transition={spring}
        className="fixed z-[9999] w-[240px] rounded-2xl bg-popover/85 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden p-1.5"
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1.5 mb-1 border-b border-border/10">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
            {typeLabel}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground/50">{stats.duration}</span>
            <button
              onClick={onClose}
              className="p-1 -mr-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Options List */}
        <div className="space-y-0.5">
          <OptionButton
            id="speedup"
            onClick={handleSpeedUp}
            disabled={loading !== null}
            icon={FastForward}
            iconColorClass="text-sky-500"
            iconBgClass="bg-sky-500/10"
            label="Speed Up"
            description={<>{stats.multiplier}× <span className="mx-1">·</span> Saves {stats.speedUpSaved}</>}
          />

          {canTrim && (
            <OptionButton
              id="trim"
              onClick={handleTrim}
              disabled={loading !== null}
              icon={Scissors}
              iconColorClass="text-rose-500"
              iconBgClass="bg-rose-500/10"
              label="Trim Segment"
              description={<>Remove <span className="mx-1">·</span> Saves {stats.trimSaved}</>}
            />
          )}

          <div className="my-1 h-px bg-white/5 mx-2" />

          <OptionButton
            id="dismiss"
            onClick={async () => {
              if (onDismiss) {
                setLoading('speedup')
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
            icon={X}
            iconColorClass="text-muted-foreground"
            iconBgClass="bg-black/5 dark:bg-white/5"
            label="Dismiss"
            description="Ignore suggestion"
          />

          {/* Apply All Footer */}
          {showApplyAll && (
            <motion.button
              onClick={handleApplyAll}
              disabled={loading !== null}
              className="mt-1 w-full py-2 text-[11px] font-medium text-primary/80 hover:text-primary transition-colors border-t border-border/10"
              whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
            >
              Apply to all ({totalAll} items)
            </motion.button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )

  return typeof document !== 'undefined'
    ? ReactDOM.createPortal(content, document.body)
    : content
}
