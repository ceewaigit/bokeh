'use client'

import * as React from 'react'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/shared/utils/utils'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type AccordionSectionProps = {
  title: React.ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  right?: React.ReactNode
  className?: string
  headerClassName?: string
  contentClassName?: string
  children: React.ReactNode
  disabled?: boolean
  disabledTooltip?: string
}

export function AccordionSection({
  title,
  defaultOpen = false,
  open,
  onOpenChange,
  right,
  className,
  headerClassName,
  contentClassName,
  children,
  disabled,
  disabledTooltip
}: AccordionSectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const isControlled = typeof open === 'boolean'
  const isOpen = isControlled ? open : uncontrolledOpen
  const contentId = React.useId()

  const setOpen = React.useCallback((next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }, [isControlled, onOpenChange])

  const content = (
    <div
      className={cn(
        'rounded-2xl border border-border/20 bg-background/50 shadow-sm transition-shadow duration-150 overflow-hidden',
        className,
        disabled && "opacity-60"
      )}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        disabled={disabled}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-3 py-3 text-left text-ui-sm font-semibold tracking-tight text-foreground transition-colors duration-150 hover:text-foreground/80',
          disabled ? "cursor-not-allowed" : "hover:text-foreground/80",
          headerClassName
        )}
        data-springy
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-primary/70 transition-transform duration-200',
              isOpen && 'rotate-90'
            )}
          />
          <span className="flex-1 truncate">{title}</span>
        </div>
        {right ? (
          <div className="flex shrink-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>
            {right}
          </div>
        ) : null}
      </button>

      {isOpen && !disabled ? (
        <div
          id={contentId}
          className={cn(
            'border-t border-border/15 bg-background/60 px-3 pb-3 pt-2 animate-in fade-in slide-in-from-top-3 duration-150',
            contentClassName
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  )

  if (disabled && disabledTooltip) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>{content}</div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[200px]">
            {disabledTooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return content
}
