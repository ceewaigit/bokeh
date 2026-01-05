"use client"

import * as React from "react"
import { cn } from "@/shared/utils/utils"
import { motion, AnimatePresence } from "framer-motion"

interface SegmentedControlProps<T extends string | number> {
    value: T
    onChange: (value: T) => void
    options: { value: T; label: string; tooltip?: string }[]
    disabled?: boolean
    layout?: 'inline' | 'grid'
    columns?: 2 | 3 | 4
    className?: string
    size?: 'sm' | 'md'
}

export function SegmentedControl<T extends string | number>({
    value,
    onChange,
    options,
    disabled,
    layout = 'inline',
    columns = 4,
    className,
    size = 'sm',
}: SegmentedControlProps<T>) {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [indicatorStyle, setIndicatorStyle] = React.useState<{ left: number; width: number } | null>(null)
    const selectedIndex = options.findIndex(opt => opt.value === value)

    // Calculate indicator position
    React.useEffect(() => {
        if (!containerRef.current || selectedIndex === -1) return
        const buttons = containerRef.current.querySelectorAll('button')
        const selectedButton = buttons[selectedIndex]
        if (selectedButton) {
            const containerRect = containerRef.current.getBoundingClientRect()
            const buttonRect = selectedButton.getBoundingClientRect()
            setIndicatorStyle({
                left: buttonRect.left - containerRect.left,
                width: buttonRect.width,
            })
        }
    }, [selectedIndex, options.length])

    const sizeClasses = size === 'sm'
        ? 'text-[11px] py-1 px-2.5'
        : 'text-xs py-1.5 px-3'

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative inline-flex rounded-md p-0.5",
                "bg-muted/40 backdrop-blur-sm",
                layout === 'grid' && `grid grid-cols-${columns}`,
                layout === 'inline' && "flex",
                className
            )}
        >
            {/* Animated indicator */}
            <AnimatePresence>
                {indicatorStyle && (
                    <motion.div
                        layoutId="segmented-indicator"
                        className="absolute top-0.5 bottom-0.5 rounded-[5px] bg-background shadow-sm border border-border/30"
                        initial={false}
                        animate={{
                            left: indicatorStyle.left,
                            width: indicatorStyle.width,
                        }}
                        transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 35,
                        }}
                    />
                )}
            </AnimatePresence>

            {options.map((option) => {
                const isSelected = value === option.value
                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "relative z-10 font-medium rounded-[5px] transition-colors duration-150",
                            sizeClasses,
                            isSelected
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground/80",
                            disabled && "opacity-50 cursor-not-allowed",
                            layout === 'inline' && "flex-1 text-center"
                        )}
                        title={option.tooltip}
                    >
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}
