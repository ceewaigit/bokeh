import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/utils/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-[13px] font-medium transition-colors duration-100 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        // Primary - solid accent color, subtle hover
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        // Destructive - red tones
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
        // Outline - bordered, transparent fill
        outline:
          "border border-foreground/[0.12] bg-transparent hover:bg-foreground/[0.04] active:bg-foreground/[0.08]",
        // Secondary - muted fill
        secondary:
          "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1] active:bg-foreground/[0.14]",
        // Ghost - invisible until hover
        ghost:
          "hover:bg-foreground/[0.06] active:bg-foreground/[0.1]",
        // Link - text only
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3.5 py-1.5",
        sm: "h-7 px-2.5 text-[12px]",
        lg: "h-9 px-5",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
