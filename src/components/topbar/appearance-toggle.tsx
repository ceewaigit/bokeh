"use client"

import { useCallback, useState } from "react"
import { Sun, Moon, Monitor, ChevronDown, ChevronRight, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
    align = "end",
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

    // Cycle through themes on button click
    const cycleTheme = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        const nextTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light"
        setTheme(nextTheme)
    }, [setTheme, theme])

    const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor

    return (
        <div className={cn("flex items-center", className)}>
            {/* Theme button - cycles through themes */}
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-background/50 rounded-r-none"
                onClick={cycleTheme}
                title={`Theme: ${theme} (click to change)`}
            >
                <ThemeIcon className="w-3.5 h-3.5" />
            </Button>

            {/* Dropdown for glassmorphism */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-5 hover:bg-background/50 rounded-l-none border-l border-border/30 px-0"
                        title="Window appearance"
                    >
                        <ChevronDown className="w-3 h-3 opacity-60" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={align} className="w-56">
                    <DropdownMenuLabel className="text-xs">Window Style</DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    <DropdownMenuRadioGroup
                        value={mode}
                        onValueChange={(value) => setMode(value as WindowSurfaceMode)}
                    >
                        <DropdownMenuRadioItem value="solid" className="text-xs">
                            Solid
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="clear" className="text-xs">
                            Glass
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="frosted" className="text-xs">
                            Frosted
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>

                    {/* Quick presets - only show for glass or clear modes */}
                    {(isFrosted || isClear) && (
                        <>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-2">
                                <div className="text-2xs text-muted-foreground mb-2">
                                    {isFrosted ? "Frosted" : "Glass"} Presets
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-6 text-3xs",
                                            (isFrosted ? isFrostedPresetActive("light") : isClearPresetActive("light")) && "border border-primary bg-primary/10"
                                        )}
                                        onClick={() => applyPreset(isFrosted ? "frosted-light" : "clear-light")}
                                    >
                                        Light
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-6 text-3xs",
                                            (isFrosted ? isFrostedPresetActive("medium") : isClearPresetActive("medium")) && "border border-primary bg-primary/10"
                                        )}
                                        onClick={() => applyPreset(isFrosted ? "frosted" : "clear")}
                                    >
                                        Medium
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-6 text-3xs",
                                            (isFrosted ? isFrostedPresetActive("strong") : isClearPresetActive("strong")) && "border border-primary bg-primary/10"
                                        )}
                                        onClick={() => applyPreset(isFrosted ? "frosted-strong" : "clear-strong")}
                                    >
                                        Strong
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}

                    <DropdownMenuSeparator />

                    {/* Advanced toggle */}
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                        <div className="flex items-center gap-1.5">
                            <Settings2 className="w-3 h-3" />
                            Advanced
                        </div>
                        <ChevronRight className={cn("w-3 h-3 transition-transform", showAdvanced && "rotate-90")} />
                    </button>

                    {showAdvanced && (
                        <div className="px-2 py-2 space-y-3 border-t border-border/30">
                            {/* Tint slider */}
                            <div>
                                <div className="flex items-center justify-between text-2xs text-muted-foreground mb-1.5">
                                    <span>Opacity</span>
                                    <span className="font-mono">{Math.round(clamp(opacityPct, opacityMin, opacityMax))}%</span>
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
                                <div className="flex items-center justify-between text-2xs text-muted-foreground mb-1.5">
                                    <span>Blur</span>
                                    <span className="font-mono">{Math.round(blurPx)}px</span>
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
                                <p className="text-3xs text-muted-foreground/70">
                                    Adjusting sliders switches to custom mode
                                </p>
                            )}
                        </div>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
