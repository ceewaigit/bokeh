import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'

export const springConfig = { type: 'spring', stiffness: 500, damping: 32 } as const

export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ElementType
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="p-1.5 rounded-md bg-primary/8 text-primary">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="text-ui-sm font-semibold tracking-[-0.01em] text-foreground">{title}</div>
          {action && <div className="mt-0.5">{action}</div>}
        </div>
        {subtitle && (
          <div className="text-2xs text-muted-foreground/70 leading-snug mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

export function SegmentedControl({
  options,
  value,
  onChange,
  namespace,
  wrap = false,
  columns
}: {
  options: ReadonlyArray<{ id: string, label: string }>
  value: string
  onChange: (id: string) => void
  namespace: string
  wrap?: boolean
  columns?: 2 | 3 | 4 | 5
}) {
  // Use unique ID per instance to prevent layoutId conflicts across components
  const instanceId = React.useId()

  const gridColsClass = columns === 2 ? "grid-cols-2"
    : columns === 3 ? "grid-cols-3"
    : columns === 4 ? "grid-cols-4"
    : columns === 5 ? "grid-cols-5"
    : "grid-cols-2"

  return (
    <div
      className={cn(
        "relative p-[3px] rounded-lg",
        "bg-black/[0.06] dark:bg-white/[0.06]",
        wrap
          ? cn("grid gap-[3px]", gridColsClass)
          : "flex gap-[3px]"
      )}
    >
      {options.map((option) => {
        const isActive = value === option.id
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              "relative py-[5px] text-2xs font-medium leading-none transition-colors duration-100 z-10 text-center tracking-[-0.01em]",
              wrap ? "w-full px-2" : "flex-1 min-w-fit px-2.5",
              isActive
                ? "text-foreground"
                : "text-muted-foreground/70 hover:text-foreground/80"
            )}
          >
            <AnimatePresence mode="wait">
              {isActive && (
                <motion.div
                  key={`seg-${namespace}-${instanceId}-active`}
                  layoutId={`seg-${namespace}-${instanceId}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={springConfig}
                  className={cn(
                    "absolute inset-0 rounded-lg",
                    "bg-white dark:bg-white/[0.12]",
                    "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.03)]",
                    "dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(255,255,255,0.04)]"
                  )}
                />
              )}
            </AnimatePresence>
            <span className="relative z-10 truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function CompactSlider({
  label,
  value,
  onValueChange,
  onValueCommit,
  min,
  max,
  step = 1,
  unit = '',
  description,
  tooltip
}: {
  label: string
  value: number
  onValueChange: (val: number) => void
  onValueCommit?: (val: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  description?: string
  tooltip?: string
}) {
  return (
    <div className="group space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-2xs font-medium",
              "text-muted-foreground/80",
              "transition-colors duration-100",
              "group-hover:text-foreground/90"
            )}
          >
            {label}
          </span>
          {tooltip && <InfoTooltip content={tooltip} />}
        </div>
        <span
          className={cn(
            "text-2xs font-mono tabular-nums",
            "text-muted-foreground/60",
            "transition-colors duration-100",
            "group-hover:text-foreground/70"
          )}
        >
          {value}{unit}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onValueChange(v)}
        onValueCommit={([v]) => onValueCommit?.(v)}
        min={min}
        max={max}
        step={step}
      />
      {description && (
        <p className="text-2xs text-muted-foreground/50 leading-snug pt-0.5">
          {description}
        </p>
      )}
    </div>
  )
}
