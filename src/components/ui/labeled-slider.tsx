'use client'

import * as React from 'react'
import { Slider } from './slider'
import { cn } from '@/shared/utils/utils'

interface LabeledSliderProps {
  /** Label text displayed on the left */
  label: string
  /** Current value to display on the right (already formatted with units) */
  displayValue: string
  /** Current slider value */
  value: number
  /** Called when slider value changes during drag */
  onValueChange: (value: number) => void
  /** Called when user commits the value (releases slider) */
  onValueCommit?: (value: number) => void
  /** Minimum value */
  min: number
  /** Maximum value */
  max: number
  /** Step increment */
  step?: number
  /** Whether slider is disabled */
  disabled?: boolean
  /** Additional className for the container */
  className?: string
  /** Use smaller text size (text-2xs instead of text-xs) */
  smallText?: boolean
}

/**
 * Slider with label and value display in a consistent layout.
 * Reduces repeated UI patterns across effect tabs.
 */
export function LabeledSlider({
  label,
  displayValue,
  value,
  onValueChange,
  onValueCommit,
  min,
  max,
  step = 1,
  disabled,
  className,
  smallText = false,
}: LabeledSliderProps) {
  const textSizeClass = smallText ? 'text-2xs' : 'text-xs'

  return (
    <div className={cn('group space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <span
          className={cn(
            textSizeClass,
            'text-muted-foreground group-hover:text-foreground/80 transition-colors'
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            textSizeClass,
            'font-mono tabular-nums text-muted-foreground/60 group-hover:text-muted-foreground transition-colors'
          )}
        >
          {displayValue}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onValueChange(v)}
        onValueCommit={onValueCommit ? ([v]) => onValueCommit(v) : undefined}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      />
    </div>
  )
}
