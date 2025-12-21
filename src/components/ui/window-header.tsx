import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface WindowHeaderProps {
  children?: React.ReactNode
  className?: string
  /** When true, children handle their own drag regions. Default: false (children wrapped in no-drag). */
  customDragRegions?: boolean
}

export const WindowHeader = forwardRef<HTMLDivElement, WindowHeaderProps>(
  function WindowHeader({ children, className, customDragRegions = false }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "h-12 pl-20 pr-4 flex items-center",
          "bg-transparent border-b border-border/40",
          className
        )}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {customDragRegions ? (
          children
        ) : (
          <div
            className="flex-1 flex items-center"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {children}
          </div>
        )}
      </div>
    )
  }
)
