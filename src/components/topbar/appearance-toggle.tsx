"use client"

import { useState, useEffect, useRef } from "react"
import { Sun, Moon, Monitor, ChevronRight, Settings2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Slider } from "@/components/ui/slider"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/shared/contexts/theme-context"
import { useWindowSurfaceStore, type WindowSurfaceMode } from "@/features/core/stores/window-surface-store"
import { WINDOW_SURFACE_PRESETS } from "@/shared/appearance/window-surface"
import { cn, clamp } from "@/shared/utils/utils"
import { springSnappy as springConfig } from "@/shared/constants/animations"

const FROSTED_PRESETS = {
    light: WINDOW_SURFACE_PRESETS["frosted-light"],
    medium: WINDOW_SURFACE_PRESETS["frosted"],
    strong: WINDOW_SURFACE_PRESETS["frosted-strong"],
} as const

const CLEAR_PRESETS = {
    light: WINDOW_SURFACE_PRESETS["clear-light"],
    medium: WINDOW_SURFACE_PRESETS["clear"],
    strong: WINDOW_SURFACE_PRESETS["clear-strong"],
} as const

interface AppearanceToggleProps {
    align?: "start" | "center" | "end"
    className?: string
}

export function AppearanceToggle({
    align = "start",
    className,
}: AppearanceToggleProps) {
    const { theme, setTheme } = useTheme()
    const [showAdvanced, setShowAdvanced] = useState(false)

    const mode = useWindowSurfaceStore((s) => s.mode)
    const tintAlpha = useWindowSurfaceStore((s) => s.tintAlpha)
    const blurPx = useWindowSurfaceStore((s) => s.blurPx)
    const setMode = useWindowSurfaceStore((s) => s.setMode)
    const setTintAlpha = useWindowSurfaceStore((s) => s.setTintAlpha)
    const setBlurPx = useWindowSurfaceStore((s) => s.setBlurPx)
    const applyPreset = useWindowSurfaceStore((s) => s.applyPreset)

    const isSolid = mode === "solid"
    const isFrosted = mode === "frosted"
    const isClear = mode === "clear"

    // Check if a preset is currently active
    const isFrostedPresetActive = (preset: keyof typeof FROSTED_PRESETS) => {
        if (mode !== "frosted") return false
        const p = FROSTED_PRESETS[preset]
        return Math.abs(tintAlpha - p.tintAlpha) < 0.01 && Math.abs(blurPx - p.blurPx) < 1
    }

    const isClearPresetActive = (preset: keyof typeof CLEAR_PRESETS) => {
        if (mode !== "clear") return false
        const p = CLEAR_PRESETS[preset]
        return Math.abs(tintAlpha - p.tintAlpha) < 0.01
    }

    const opacityPct = Math.round(tintAlpha * 100)
    const opacityMin = 0
    const opacityMax = 100

    const blurMin = 0
    const blurMax = 120

    const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor

    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    // Reset advanced panel when dropdown closes
    const handleOpenChange = (open: boolean) => {
        setIsOpen(open)
        if (!open) {
            setShowAdvanced(false)
        }
    }

    // Fallback click-outside handler for Electron drag regions
    useEffect(() => {
        if (!isOpen) return

        const handleClickOutside = (e: MouseEvent) => {
            // Check if click is outside the container
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                // Also check if click is not on the dropdown portal content
                const dropdownContent = document.querySelector('[data-radix-popper-content-wrapper]')
                if (dropdownContent && !dropdownContent.contains(e.target as Node)) {
                    setIsOpen(false)
                }
            }
        }

        // Use capture phase to catch events before drag regions
        document.addEventListener('mousedown', handleClickOutside, true)
        return () => document.removeEventListener('mousedown', handleClickOutside, true)
    }, [isOpen])

    return (
        <div ref={containerRef} className={cn("flex items-center", className)}>
            {/* Dropdown for theme + glassmorphism - combined into single button */}
            <DropdownMenu open={isOpen} onOpenChange={handleOpenChange} modal={true}>
                <DropdownMenuTrigger asChild>
                    <motion.button
                        className={cn(
                            "relative flex items-center justify-center",
                            "w-7 h-7 rounded-full",
                            "text-muted-foreground",
                            "transition-colors duration-100",
                            "hover:text-foreground hover:bg-foreground/10"
                        )}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.92 }}
                        transition={springConfig}
                        title={`Theme: ${theme}`}
                    >
                        <ThemeIcon className="w-3.5 h-3.5" />
                    </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align={align}
                    className="w-[220px] p-1.5"
                    onPointerDownOutside={() => setIsOpen(false)}
                    onEscapeKeyDown={() => setIsOpen(false)}
                    onInteractOutside={() => setIsOpen(false)}
                >
                    {/* Theme selector */}
                    <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider px-2 py-1">
                        Theme
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                        value={theme}
                        onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
                    >
                        <DropdownMenuRadioItem value="light" className="text-[13px] h-7 mx-0.5">
                            <Sun className="w-3.5 h-3.5 mr-2 opacity-60" />
                            Light
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dark" className="text-[13px] h-7 mx-0.5">
                            <Moon className="w-3.5 h-3.5 mr-2 opacity-60" />
                            Dark
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="system" className="text-[13px] h-7 mx-0.5">
                            <Monitor className="w-3.5 h-3.5 mr-2 opacity-60" />
                            System
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>

                    <DropdownMenuSeparator className="my-1.5" />

                    <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider px-2 py-1">
                        Window Style
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                        value={mode}
                        onValueChange={(value) => setMode(value as WindowSurfaceMode)}
                    >
                        <DropdownMenuRadioItem value="solid" className="text-[13px] h-7 mx-0.5">
                            Solid
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="clear" className="text-[13px] h-7 mx-0.5">
                            Glass
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="frosted" className="text-[13px] h-7 mx-0.5">
                            Frosted
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>

                    {/* Quick presets - segmented control style */}
                    {(isFrosted || isClear) && (
                        <>
                            <DropdownMenuSeparator className="my-1.5" />
                            <div className="px-2 py-1.5">
                                <div className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-2">
                                    {isFrosted ? "Frosted" : "Glass"} Presets
                                </div>
                                <div className="flex p-0.5 bg-foreground/[0.04] rounded-md">
                                    {(["light", "medium", "strong"] as const).map((preset) => {
                                        const isActive = isFrosted
                                            ? isFrostedPresetActive(preset)
                                            : isClearPresetActive(preset)
                                        return (
                                            <button
                                                key={preset}
                                                className={cn(
                                                    "flex-1 py-1 px-2 text-[11px] font-medium rounded",
                                                    "transition-colors duration-100",
                                                    isActive
                                                        ? "bg-foreground/[0.1] text-foreground"
                                                        : "text-muted-foreground/70 hover:text-muted-foreground"
                                                )}
                                                onClick={() => applyPreset(
                                                    isFrosted
                                                        ? preset === "medium" ? "frosted" : `frosted-${preset}` as any
                                                        : preset === "medium" ? "clear" : `clear-${preset}` as any
                                                )}
                                            >
                                                {preset.charAt(0).toUpperCase() + preset.slice(1)}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </>
                    )}

                    <DropdownMenuSeparator className="my-1.5" />

                    {/* Advanced toggle */}
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className={cn(
                            "w-full flex items-center justify-between px-2 py-1.5 rounded-md mx-0.5",
                            "text-[13px] text-muted-foreground",
                            "transition-colors duration-100",
                            "hover:text-foreground hover:bg-foreground/[0.05]"
                        )}
                        style={{ width: "calc(100% - 4px)" }}
                    >
                        <div className="flex items-center gap-2">
                            <Settings2 className="w-3.5 h-3.5 opacity-60" />
                            <span>Advanced</span>
                        </div>
                        <ChevronRight
                            className={cn(
                                "w-3 h-3 opacity-40 transition-transform duration-150 ease-out",
                                showAdvanced && "rotate-90"
                            )}
                        />
                    </button>

                    <AnimatePresence initial={false}>
                        {showAdvanced && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                                className="px-2 pt-2 pb-1 space-y-3 overflow-hidden"
                            >
                            {/* Tint slider */}
                            <div>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 mb-2">
                                    <span className="font-medium">Opacity</span>
                                    <span className="font-mono tabular-nums text-muted-foreground/60">
                                        {Math.round(clamp(opacityPct, opacityMin, opacityMax))}%
                                    </span>
                                </div>
                                <Slider
                                    value={[clamp(opacityPct, opacityMin, opacityMax)]}
                                    min={opacityMin}
                                    max={opacityMax}
                                    step={1}
                                    onValueChange={([value]) => setTintAlpha(value / 100)}
                                    disabled={isSolid}
                                />
                            </div>

                            {/* Blur slider */}
                            <div>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 mb-2">
                                    <span className="font-medium">Blur</span>
                                    <span className="font-mono tabular-nums text-muted-foreground/60">
                                        {Math.round(blurPx)}px
                                    </span>
                                </div>
                                <Slider
                                    value={[Math.round(blurPx)]}
                                    min={blurMin}
                                    max={blurMax}
                                    step={1}
                                    onValueChange={([value]) => setBlurPx(value)}
                                    disabled={isSolid}
                                />
                            </div>

                            {/* Custom mode hint */}
                            {(mode === "frosted" || mode === "clear") && (
                                <p className="text-[9px] text-muted-foreground/50 leading-tight">
                                    Adjusting sliders enables custom mode
                                </p>
                            )}
                        </motion.div>
                        )}
                    </AnimatePresence>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
