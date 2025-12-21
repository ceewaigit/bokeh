"use client"

import * as React from "react"
import { type LucideIcon } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface HeaderButtonProps extends Omit<ButtonProps, "size"> {
    icon?: LucideIcon
    tooltip?: string
    shortcut?: string
    active?: boolean
}

export const HeaderButton = React.forwardRef<HTMLButtonElement, HeaderButtonProps>(
    ({ className, children, icon: Icon, tooltip, shortcut, active, variant = "ghost", ...props }, ref) => {
        const button = (
            <Button
                ref={ref}
                variant={variant}
                size="sm"
                className={cn(
                    "h-7 px-3 text-[11px] font-medium transition-all",
                    "hover:bg-muted/40 active:scale-95",
                    active && "bg-muted/40 text-foreground",
                    // When purely an icon button (no children), ensure square aspect ratio and centering
                    !children && "w-7 px-0",
                    className
                )}
                {...props}
            >
                {Icon && (
                    <Icon className={cn("w-3.5 h-3.5", children && "mr-1.5")} />
                )}
                {children}
            </Button>
        )

        if (!tooltip) {
            return button
        }

        return (
            <TooltipProvider delayDuration={400}>
                <Tooltip>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs flex items-center gap-2">
                        <span>{tooltip}</span>
                        {shortcut && (
                            <span className="ml-1 text-[10px] text-muted-foreground font-sans bg-muted/20 px-1 py-0.5 rounded">
                                {shortcut}
                            </span>
                        )}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )
    }
)
HeaderButton.displayName = "HeaderButton"
