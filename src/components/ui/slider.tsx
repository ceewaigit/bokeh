"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/shared/utils/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center group cursor-default h-5",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track
      className={cn(
        "relative h-[3px] w-full grow overflow-hidden rounded-full",
        "bg-foreground/[0.08]",
        // Subtle hover scale on the track - Apple-esque micro-interaction
        "transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
        "group-hover:scale-y-[1.4] group-hover:bg-foreground/[0.12]",
        "group-active:scale-y-[1.2]",
        // GPU acceleration for smooth transforms
        "will-change-transform"
      )}
    >
      <SliderPrimitive.Range
        className={cn(
          "absolute h-full rounded-full",
          "bg-primary/80",
          "transition-colors duration-150 ease-out",
          "group-hover:bg-primary"
        )}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "block h-[15px] w-[15px] rounded-full",
        "bg-white",
        "shadow-[0_0.5px_1px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.04)]",
        // Smooth, snappy transitions - Apple-esque
        "transition-[transform,box-shadow] duration-100 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
        // Subtle scale on hover, pressed state
        "hover:scale-[1.06]",
        "active:scale-[0.96] active:shadow-[0_0.5px_1px_rgba(0,0,0,0.16),0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.06)]",
        "focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40"
      )}
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
