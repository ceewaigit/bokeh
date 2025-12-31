/**
 * Speed-Up Suggestion Popover
 * Unified popover for both typing and idle speed-up suggestions
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { SpeedUpType } from '@/types/speed-up'
import { Button } from '@/components/ui/button'
import { Check, CheckCheck, Trash2, Zap, Moon } from 'lucide-react'

export interface SpeedUpSuggestionPopoverProps {
  x: number
  y: number
  period: SpeedUpPeriod
  allTypingPeriods: SpeedUpPeriod[]
  allIdlePeriods: SpeedUpPeriod[]
  onApply: (period: SpeedUpPeriod) => Promise<void>
  onApplyAll?: () => Promise<void>  // Apply ALL (typing + idle) to ALL clips
  onRemove?: (period: SpeedUpPeriod) => void
  onClose: () => void
}

export function SpeedUpSuggestionPopover({
  x,
  y,
  period,
  allTypingPeriods,
  allIdlePeriods,
  onApply,
  onApplyAll,
  onRemove,
  onClose
}: SpeedUpSuggestionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const firstActionRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y })

  const isTyping = period.type === SpeedUpType.Typing
  const Icon = isTyping ? Zap : Moon
  const title = isTyping ? 'Typing speed-up' : 'Idle speed-up'
  const iconColor = isTyping ? 'text-amber-500' : 'text-indigo-500'

  const totalAll = allTypingPeriods.length + allIdlePeriods.length

  // Close on click outside
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Clamp position to viewport
  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const padding = 8
    const maxLeft = window.innerWidth - rect.width - padding
    const maxTop = window.innerHeight - rect.height - padding
    const left = Math.min(Math.max(x, padding), Math.max(padding, maxLeft))
    const top = Math.min(Math.max(y, padding), Math.max(padding, maxTop))
    setPos({ left, top })
  }, [x, y])

  // Focus first action
  useEffect(() => {
    firstActionRef.current?.focus()
  }, [])

  const stats = useMemo(() => {
    const durationMs = Math.max(0, period.endTime - period.startTime)
    const timeSavedMs =
      durationMs > 0
        ? durationMs * (1 - 1 / Math.max(1, period.suggestedSpeedMultiplier))
        : 0

    const formatMs = (ms: number) => {
      const s = ms / 1000
      if (s < 60) return `${s.toFixed(1)}s`
      const m = Math.floor(s / 60)
      const rem = Math.round(s % 60)
      return `${m}:${rem.toString().padStart(2, '0')}`
    }

    return {
      duration: formatMs(durationMs),
      timeSaved: formatMs(timeSavedMs),
      wpm: period.metadata?.averageWpm ? Math.round(period.metadata.averageWpm) : null,
      confidencePct: Math.round(period.confidence * 100),
    }
  }, [period])

  const content = (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${title} suggestion`}
      className="fixed z-[9999] w-popover rounded-lg border border-border bg-popover text-popover-foreground shadow-xl backdrop-blur-sm"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-2.5 py-2 border-b border-border/60">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <div className="text-2xs text-muted-foreground tabular-nums">
            {stats.wpm ? `Avg ${stats.wpm} WPM · ` : ''}
            {stats.duration} · saves ~{stats.timeSaved}
            {stats.confidencePct < 70 && ` · ${stats.confidencePct}%`}
          </div>
        </div>
        <div className="mt-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-2xs font-semibold tabular-nums">
          {period.suggestedSpeedMultiplier.toFixed(1)}×
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => {
              onRemove(period)
              onClose()
            }}
            aria-label="Remove suggestion"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {/* Apply All (unified - both types) */}
          {onApplyAll && totalAll > 1 && (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={async () => {
                await onApplyAll()
                onClose()
              }}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              All ({totalAll})
            </Button>
          )}

          {/* Apply this period */}
          <Button
            ref={firstActionRef}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={async () => {
              await onApply(period)
              onClose()
            }}
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            Apply
          </Button>
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return ReactDOM.createPortal(content, document.body)
  }
  return content
}
