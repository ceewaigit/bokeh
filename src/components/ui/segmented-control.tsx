"use client"

import * as React from "react"
import { cn } from "@/shared/utils/utils"
import { motion } from "framer-motion"

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
    // Unique ID for this instance to prevent layoutId conflicts
    const instanceId = React.useId()

    const sizeClasses = size === 'sm'
        ? 'text-2xs py-[5px] px-2.5'
        : 'text-xs py-2 px-3'

    return (
        <div
            className={cn(
                "relative rounded-lg p-[3px]",
                "bg-black/[0.06] dark:bg-white/[0.06]",
                layout === 'grid' && `grid gap-[3px]`,
                layout === 'grid' && columns === 2 && "grid-cols-2",
                layout === 'grid' && columns === 3 && "grid-cols-3",
                layout === 'grid' && columns === 4 && "grid-cols-4",
                layout === 'inline' && "inline-flex gap-[3px]",
                className
            )}
        >
            {options.map((option) => {
                const isSelected = value === option.value
                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "relative z-10 font-medium rounded-md transition-colors duration-100 min-w-0",
                            "tracking-[-0.01em]",
                            sizeClasses,
                            isSelected
                                ? "text-foreground"
                                : "text-muted-foreground/70 hover:text-foreground/80",
                            disabled && "opacity-40 cursor-not-allowed",
                            layout === 'inline' && "text-center"
                        )}
                        title={option.tooltip}
                    >
                        {/* Animated background indicator */}
                        {isSelected && (
                            <motion.div
                                layoutId={`segmented-indicator-${instanceId}`}
                                className={cn(
                                    "absolute inset-0 rounded-[5px]",
                                    "bg-white dark:bg-white/[0.12]",
                                    "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.03)]",
                                    "dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(255,255,255,0.04)]"
                                )}
                                initial={false}
                                transition={{
                                    type: "spring",
                                    stiffness: 500,
                                    damping: 35,
                                    mass: 0.8,
                                }}
                            />
                        )}
                        <span className="relative z-10 truncate">{option.label}</span>
                    </button>
                )
            })}
        </div>
    )
}
