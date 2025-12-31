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
}

export function SegmentedControl<T extends string | number>({
    value,
    onChange,
    options,
    disabled,
    layout = 'inline',
    columns = 4,
    className,
}: SegmentedControlProps<T>) {
    return (
        <div
            className={cn(
                "grid gap-2",
                layout === 'grid' && `grid-cols-${columns}`,
                layout === 'inline' && "grid-flow-col auto-cols-fr",
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
                            "relative px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 outline-none",
                            "border border-border/40 hover:border-border/80 hover:bg-muted/30",
                            isSelected && "text-black border-transparent",
                            disabled && "opacity-50 cursor-not-allowed",
                            !isSelected && "bg-muted/10 text-muted-foreground hover:text-foreground"
                        )}
                        title={option.tooltip}
                    >
                        {isSelected && (
                            <motion.div
                                layoutId={`segmented-indicator-${className}`}
                                className="absolute inset-0 bg-white rounded-md z-0 shadow-sm"
                                initial={false}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            />
                        )}
                        <span className="relative z-10">{option.label}</span>
                    </button>
                )
            })}
        </div>
    )
}
