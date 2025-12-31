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
import { useWindowAppearanceStore, type WindowSurfaceMode } from "@/stores/window-appearance-store"
import { cn, clamp } from "@/shared/utils/utils"

// Preset definitions matching the store - modern glassmorphism
const GLASS_PRESETS = {
    light: { opacity: 0.08, blurPx: 18 },
    medium: { opacity: 0.12, blurPx: 26 },
    strong: { opacity: 0.16, blurPx: 34 },
} as const

const CLEAR_PRESETS = {
    light: { opacity: 0.52, blurPx: 0 },
    medium: { opacity: 0.72, blurPx: 0 },
    strong: { opacity: 0.92, blurPx: 0 },
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
    const opacityMin = mode === "glass" || mode === "custom" || mode === "clear" ? 0 : 40
    const opacityMax = mode === "glass" || mode === "custom" || mode === "clear" ? 90 : 90
    const opacityPct = Math.round(opacity * 100)

    const blurMin = 0
    const blurMax = 30 // Reduced max since we want subtle blur

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
                        <DropdownMenuRadioItem value="glass" className="text-xs">
                            Frosted
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>

                    {/* Quick presets - only show for glass or clear modes */}
                    {(isGlass || isClear) && (
                        <>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-2">
                                <div className="text-2xs text-muted-foreground mb-2">
                                    {isGlass ? "Frosted" : "Glass"} Presets
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-6 text-3xs",
                                            (isGlass ? isGlassPresetActive("light") : isClearPresetActive("light")) && "border border-primary bg-primary/10"
                                        )}
                                        onClick={() => applyPreset(isGlass ? "glass-light" : "clear-light")}
                                    >
                                        Light
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-6 text-3xs",
                                            (isGlass ? isGlassPresetActive("medium") : isClearPresetActive("medium")) && "border border-primary bg-primary/10"
                                        )}
                                        onClick={() => applyPreset(isGlass ? "glass" : "clear")}
                                    >
                                        Medium
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-6 text-3xs",
                                            (isGlass ? isGlassPresetActive("strong") : isClearPresetActive("strong")) && "border border-primary bg-primary/10"
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
                                <div className="flex items-center justify-between text-2xs text-muted-foreground mb-1.5">
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
                                    disabled={isSolid || mode === "clear"}
                                />
                            </div>

                            {/* Custom mode hint */}
                            {(mode === "glass" || mode === "clear") && (
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
