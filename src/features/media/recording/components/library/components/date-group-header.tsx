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
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "w-full col-span-full",
          "pb-4 first:pt-0",
          className
        )}
      >
        <div className="flex items-center gap-2.5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </h2>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {count}
          </span>
        </div>
      </motion.div>
    )
  }
)
