"use client"

import * as React from "react"
import { type LucideIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/shared/utils/utils"
import { motion, type HTMLMotionProps } from "framer-motion"
import { type VariantProps } from "class-variance-authority"

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"]

interface HeaderButtonProps extends Omit<HTMLMotionProps<"button">, "size" | "children"> {
    icon?: LucideIcon
    tooltip?: string
    shortcut?: string
    active?: boolean
    variant?: ButtonVariant
    children?: React.ReactNode
}

const springConfig = { type: "spring", stiffness: 420, damping: 32 } as const
const MotionButton = motion.button

export const HeaderButton = React.forwardRef<HTMLButtonElement, HeaderButtonProps>(
    ({ className, children, icon: Icon, tooltip, shortcut, active, variant = "ghost", ...props }, ref) => {
        const button = (
            <MotionButton
                ref={ref}
                className={cn(
                    buttonVariants({ variant, size: "sm" }),
                    "btn-bubble-none",
                    "h-7 px-3 text-[11px] font-medium",
                    "transition-all duration-150 ease-out",
                    "hover:bg-accent/80 hover:text-accent-foreground active:scale-[0.97]",
                    active && "bg-accent text-accent-foreground",
                    // When purely an icon button (no children), ensure square aspect ratio and centering
                    !children && "w-7 px-0",
                    className
                )}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springConfig}
                {...props}
            >
                {Icon && (
                    <Icon className={cn("w-3.5 h-3.5", children && "mr-1.5")} />
                )}
                {children}
            </MotionButton>
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
