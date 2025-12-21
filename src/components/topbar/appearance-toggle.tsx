"use client"

import { useState } from "react"
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
import { useTheme } from "@/contexts/theme-context"
import { useWindowAppearanceStore, type WindowSurfaceMode } from "@/stores/window-appearance-store"
import { cn, clamp } from "@/lib/utils"

// Preset definitions matching the store - modern glassmorphism
const GLASS_PRESETS = {
    light: { opacity: 0.05, blurPx: 2 },
    medium: { opacity: 0.10, blurPx: 4 },
    strong: { opacity: 0.20, blurPx: 6 },
} as const

const CLEAR_PRESETS = {
    light: { opacity: 0.75, blurPx: 0 },
    medium: { opacity: 0.85, blurPx: 0 },
    strong: { opacity: 0.95, blurPx: 0 },
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

    const mode = useWindowAppearanceStore((s) => s.mode)
    const opacity = useWindowAppearanceStore((s) => s.opacity)
    const blurPx = useWindowAppearanceStore((s) => s.blurPx)
    const setMode = useWindowAppearanceStore((s) => s.setMode)
    const setOpacity = useWindowAppearanceStore((s) => s.setOpacity)
    const setBlurPx = useWindowAppearanceStore((s) => s.setBlurPx)
    const applyPreset = useWindowAppearanceStore((s) => s.applyPreset)

    const isSolid = mode === "solid"
    const isGlass = mode === "glass"
    const isClear = mode === "clear"

    // Check if a preset is currently active
    const isGlassPresetActive = (preset: keyof typeof GLASS_PRESETS) => {
        if (mode !== "glass") return false
        const p = GLASS_PRESETS[preset]
        return Math.abs(opacity - p.opacity) < 0.01 && Math.abs(blurPx - p.blurPx) < 1
    }

    const isClearPresetActive = (preset: keyof typeof CLEAR_PRESETS) => {
        if (mode !== "clear") return false
        const p = CLEAR_PRESETS[preset]
        return Math.abs(opacity - p.opacity) < 0.01
    }

    // Opacity controls - allow full range for glass/custom
    const opacityMin = mode === "glass" || mode === "custom" ? 0 : 70
    const opacityMax = mode === "glass" || mode === "custom" ? 90 : 98
    const opacityPct = Math.round(opacity * 100)

    const blurMin = 0
    const blurMax = 30 // Reduced max since we want subtle blur

    // Cycle through themes on button click
    const cycleTheme = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (theme === "light") setTheme("dark")
        else if (theme === "dark") setTheme("system")
        else setTheme("light")
    }

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
                            Clear
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="glass" className="text-xs">
                            Glass
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>

                    {/* Quick presets - only show for glass or clear modes */}
                    {(isGlass || isClear) && (
                        <>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-2">
                                <div className="text-[11px] text-muted-foreground mb-2">
                                    {isGlass ? "Glass" : "Clear"} Presets
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-6 text-[10px]",
                                            (isGlass ? isGlassPresetActive("light") : isClearPresetActive("light")) && "ring-1 ring-primary bg-primary/10"
                                        )}
                                        onClick={() => applyPreset(isGlass ? "glass-light" : "clear-light")}
                                    >
                                        Light
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-6 text-[10px]",
                                            (isGlass ? isGlassPresetActive("medium") : isClearPresetActive("medium")) && "ring-1 ring-primary bg-primary/10"
                                        )}
                                        onClick={() => applyPreset(isGlass ? "glass" : "clear")}
                                    >
                                        Medium
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-6 text-[10px]",
                                            (isGlass ? isGlassPresetActive("strong") : isClearPresetActive("strong")) && "ring-1 ring-primary bg-primary/10"
                                        )}
                                        onClick={() => applyPreset(isGlass ? "glass-strong" : "clear-strong")}
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
                            {/* Opacity slider */}
                            <div>
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                                    <span>Opacity</span>
                                    <span className="font-mono">{Math.round(clamp(opacityPct, opacityMin, opacityMax))}%</span>
                                </div>
                                <Slider
                                    value={[clamp(opacityPct, opacityMin, opacityMax)]}
                                    min={opacityMin}
                                    max={opacityMax}
                                    step={1}
                                    onValueChange={([value]) => setOpacity(value / 100)}
                                    disabled={isSolid}
                                />
                            </div>

                            {/* Blur slider */}
                            <div>
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                                    <span>Blur</span>
                                    <span className="font-mono">{Math.round(blurPx)}px</span>
                                </div>
                                <Slider
                                    value={[Math.round(blurPx)]}
                                    min={blurMin}
                                    max={blurMax}
                                    step={1}
                                    onValueChange={([value]) => setBlurPx(value)}
                                    disabled={isSolid || mode === "clear"}
                                />
                            </div>

                            {/* Custom mode hint */}
                            {(mode === "glass" || mode === "clear") && (
                                <p className="text-[10px] text-muted-foreground/70">
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
