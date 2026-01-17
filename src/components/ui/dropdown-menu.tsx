"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

import { cn } from "@/shared/utils/utils"

// Spring configs for Apple-like animations
const hoverSpring = { type: "spring", duration: 0.3, bounce: 0 } as const
const selectSpring = { type: "spring", stiffness: 350, damping: 25 } as const

// Context for sharing hover state across menu items
const DropdownMenuHoverContext = React.createContext<{
  hoveredId: string | null
  setHoveredId: (id: string | null) => void
}>({ hoveredId: null, setHoveredId: () => {} })

// Context for tracking selected radio item (for sliding selection indicator)
const DropdownMenuRadioContext = React.createContext<{
  selectedValue: string | undefined
  groupId: string
}>({ selectedValue: undefined, groupId: '' })

const DropdownMenu = DropdownMenuPrimitive.Root

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = DropdownMenuPrimitive.Sub

// Wrap RadioGroup to track selected value for animated selection indicator
const DropdownMenuRadioGroup = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioGroup>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioGroup>
>(({ value, children, ...props }, ref) => {
  const groupId = React.useId()
  return (
    <DropdownMenuPrimitive.RadioGroup ref={ref} value={value} {...props}>
      <DropdownMenuRadioContext.Provider value={{ selectedValue: value, groupId }}>
        {children}
      </DropdownMenuRadioContext.Provider>
    </DropdownMenuPrimitive.RadioGroup>
  )
})
DropdownMenuRadioGroup.displayName = DropdownMenuPrimitive.RadioGroup.displayName

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => {
  const itemId = React.useId()
  const { hoveredId, setHoveredId } = React.useContext(DropdownMenuHoverContext)
  const isHovered = hoveredId === itemId

  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        "group relative flex cursor-default select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        inset && "pl-8",
        className
      )}
      onMouseEnter={() => setHoveredId(itemId)}
      {...props}
    >
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute inset-0 rounded-lg bg-accent"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={hoverSpring}
            layoutId="dropdown-menu-hover"
          />
        )}
      </AnimatePresence>
      <span className="relative z-10 flex items-center gap-2 flex-1 transition-transform duration-150 group-hover:translate-x-0.5">
        {children}
      </span>
      <ChevronRight className="relative z-10 ml-auto transition-transform duration-150 group-hover:translate-x-0.5" />
    </DropdownMenuPrimitive.SubTrigger>
  )
})
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-floating min-w-[8rem] overflow-hidden rounded-xl border border-glass-border bg-popover/85 backdrop-blur-xl p-1 text-popover-foreground shadow-xl",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-[0.98]",
      "data-[state=open]:duration-300 data-[state=open]:ease-spring",
      "data-[state=closed]:duration-200 data-[state=closed]:ease-out",
      "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
      "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      "origin-[--radix-dropdown-menu-content-transform-origin]",
      className
    )}
    {...props}
  />
))
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, children, ...props }, ref) => {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-floating max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden",
          // macOS-style rounded corners and surface
          "rounded-xl border border-foreground/[0.12] bg-popover/95 backdrop-blur-2xl backdrop-saturate-150",
          // No drop shadow - clean flat look
          "shadow-none",
          "dark:border-foreground/[0.08]",
          // Typography
          "p-1 text-popover-foreground",
          // Animations - snappy, Apple-esque
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]",
          "data-[state=open]:duration-150 data-[state=open]:ease-out",
          "data-[state=closed]:duration-100 data-[state=closed]:ease-in",
          "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1",
          "data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
          "origin-[--radix-dropdown-menu-content-transform-origin]",
          className
        )}
        onMouseLeave={() => setHoveredId(null)}
        onDoubleClick={(e) => e.stopPropagation()}
        {...props}
      >
        <DropdownMenuHoverContext.Provider value={{ hoveredId, setHoveredId }}>
          {children}
        </DropdownMenuHoverContext.Provider>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
})
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => {
  const itemId = React.useId()
  const { hoveredId, setHoveredId } = React.useContext(DropdownMenuHoverContext)
  const isHovered = hoveredId === itemId

  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        "group relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        inset && "pl-8",
        className
      )}
      onMouseEnter={() => setHoveredId(itemId)}
      {...props}
    >
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute inset-0 rounded-md bg-foreground/[0.05]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
      <span className="relative z-10 flex items-center gap-2 w-full transition-colors duration-100">
        {children}
      </span>
    </DropdownMenuPrimitive.Item>
  )
})
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => {
  const itemId = React.useId()
  const { hoveredId, setHoveredId } = React.useContext(DropdownMenuHoverContext)
  const isHovered = hoveredId === itemId

  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        "group relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      checked={checked}
      onMouseEnter={() => setHoveredId(itemId)}
      {...props}
    >
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute inset-0 rounded-lg bg-accent"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={hoverSpring}
            layoutId="dropdown-menu-hover"
          />
        )}
      </AnimatePresence>
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center z-10">
        <DropdownMenuPrimitive.ItemIndicator>
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={selectSpring}
          >
            <Check className="h-4 w-4" />
          </motion.span>
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      <span className="relative z-10 flex items-center gap-2 transition-transform duration-150 group-hover:translate-x-0.5">
        {children}
      </span>
    </DropdownMenuPrimitive.CheckboxItem>
  )
})
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, value, ...props }, ref) => {
  const itemId = React.useId()
  const { hoveredId, setHoveredId } = React.useContext(DropdownMenuHoverContext)
  const { selectedValue, groupId } = React.useContext(DropdownMenuRadioContext)
  const isHovered = hoveredId === itemId
  const isSelected = selectedValue === value

  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      value={value}
      className={cn(
        "group relative flex cursor-default select-none items-center rounded-md py-1.5 px-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      onMouseEnter={() => setHoveredId(itemId)}
      onDoubleClick={(e) => e.stopPropagation()}
      {...props}
    >
      {/* Hover background - only when not selected */}
      <AnimatePresence>
        {isHovered && !isSelected && (
          <motion.div
            className="absolute inset-0 rounded-md bg-foreground/[0.05]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
          />
        )}
      </AnimatePresence>
      {/* Selected background */}
      {isSelected && (
        <motion.div
          className="absolute inset-0 rounded-md bg-foreground/[0.06]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1 }}
          layoutId={`dropdown-selected-${groupId}`}
        />
      )}
      <span className={cn(
        "relative z-10 flex items-center gap-2 transition-colors duration-100",
        isSelected ? "text-foreground" : "text-foreground/70"
      )}>
        {children}
      </span>
    </DropdownMenuPrimitive.RadioItem>
  )
})
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-xs font-semibold text-muted-foreground",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-foreground/[0.06]", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  )
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}
