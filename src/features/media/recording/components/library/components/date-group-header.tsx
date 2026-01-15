"use client"

import { forwardRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
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
    const reduceMotion = useReducedMotion()

    return (
      <motion.div
        ref={ref}
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className={cn(
          "w-full col-span-full",
          "pb-4 first:pt-0",
          className
        )}
      >
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
            {label}
          </h2>
          <span className="text-[10px] text-muted-foreground/40 tabular-nums">
            {count}
          </span>
        </div>
      </motion.div>
    )
  }
)
