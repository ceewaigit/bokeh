import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'

export const springConfig = { type: 'spring', stiffness: 520, damping: 28 } as const

export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-start gap-3 pb-2">
      <div className="p-1.5 rounded-md bg-primary/10 text-primary">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold tracking-tight text-foreground">{title}</div>
        {subtitle && (
          <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 font-medium">
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
  columns?: 2 | 3
}) {
  // Use unique ID per instance to prevent layoutId conflicts across components
  const instanceId = React.useId()

  return (
    <div
      className={cn(
        "relative p-1 bg-muted/40 rounded-lg border border-border/40",
        wrap
          ? cn(
            "grid gap-1",
            columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-2"
          )
          : "flex"
      )}
    >
      {options.map((option) => {
        const isActive = value === option.id
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              "relative py-1.5 text-[11px] font-medium leading-none transition-colors z-10 text-center min-w-0",
              wrap ? "w-full px-2" : "flex-1",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
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
                  className="absolute inset-0 bg-background shadow-sm rounded-md border border-border/20"
                />
              )}
            </AnimatePresence>
            <span className="relative z-10">{option.label}</span>
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
  description
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
}) {
  return (
    <div className="group space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          {label}
        </span>
        <span className="text-[11px] font-mono font-medium tabular-nums text-foreground bg-muted/30 px-1.5 py-0.5 rounded">
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
        className="[&>.relative>.absolute]:bg-primary/80 [&_.block]:border-primary/50 [&_.block]:ring-offset-background [&_.block]:transition-transform [&_.block]:active:scale-105"
      />
      {description && (
        <p className="text-[10px] text-muted-foreground/60 leading-tight">
          {description}
        </p>
      )}
    </div>
  )
}
