"use client"

import { forwardRef } from 'react'
import { cn } from '@/shared/utils/utils'

interface DateGroupHeaderProps {
  /** Category label (e.g., "Today", "Past 7 days") */
  label: string
  /** Number of recordings in this group */
  count: number
  /** Additional className */
  className?: string
}

export const DateGroupHeader = forwardRef<HTMLDivElement, DateGroupHeaderProps>(
  function DateGroupHeader({ label, count, className }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "w-full col-span-full",
          "pb-3 first:pt-0",
          className
        )}
      >
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
            {label}
          </h2>
          <span className="text-[10px] text-muted-foreground/30 tabular-nums font-medium">
            {count}
          </span>
        </div>
      </div>
    )
  }
)
