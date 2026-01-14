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
        ? 'text-2xs py-1.5 px-3'
        : 'text-xs py-2 px-4'

    const containerPadding = size === 'sm' ? 'p-1' : 'p-1.5'

    return (
        <div
            className={cn(
                "relative inline-flex rounded-lg",
                containerPadding,
                "bg-muted/50",
                layout === 'grid' && `grid grid-cols-${columns}`,
                layout === 'inline' && "flex",
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
                            "relative z-10 font-medium rounded-md transition-colors duration-150",
                            sizeClasses,
                            isSelected
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground/80",
                            disabled && "opacity-50 cursor-not-allowed",
                            layout === 'inline' && "flex-1 text-center"
                        )}
                        title={option.tooltip}
                    >
                        {/* Animated background indicator */}
                        {isSelected && (
                            <motion.div
                                layoutId={`segmented-indicator-${instanceId}`}
                                className="absolute inset-0 rounded-md bg-background shadow-sm border border-border/40"
                                initial={false}
                                transition={{
                                    type: "spring",
                                    stiffness: 500,
                                    damping: 35,
                                }}
                            />
                        )}
                        <span className="relative z-10">{option.label}</span>
                    </button>
                )
            })}
        </div>
    )
}
