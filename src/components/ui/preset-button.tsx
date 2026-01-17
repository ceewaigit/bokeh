'use client'

import React from 'react'
import { cn } from '@/shared/utils/utils'

interface PresetButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}

/**
 * PresetButton - A toggle-style button for preset selections
 * Used in speed controls, fade controls, and other preset-based UI
 */
export function PresetButton({
  active,
  onClick,
  children,
  className,
}: PresetButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 text-2xs font-medium rounded-md transition-all duration-100",
        "border",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-transparent text-muted-foreground border-border/50 hover:border-border hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  )
}
