"use client"

import { AnimatePresence, motion } from 'framer-motion'

interface SidebarHeaderProps {
  /** Current tab key for animation */
  tabKey: string
  /** Title text to display */
  title: string
  /** Optional content to render on the right side */
  suffix?: React.ReactNode
}

export function SidebarHeader({ tabKey, title, suffix }: SidebarHeaderProps) {
  return (
    <div className="h-12 flex items-center px-4 border-b border-border/30 bg-transparent sticky top-0 z-elevated">
      <AnimatePresence mode="popLayout">
        <motion.h2
          key={tabKey}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-ui-sm font-semibold tracking-tight"
        >
          {title}
        </motion.h2>
      </AnimatePresence>
      {suffix}
    </div>
  )
}
