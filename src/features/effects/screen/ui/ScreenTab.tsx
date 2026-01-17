'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Feather, Gauge, Zap, CircleOff } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'
import type { Clip, Effect, ScreenEffectData } from '@/types/project'
import { ScreenEffectPreset } from '@/types/project'
import type { SelectedEffectLayer } from '@/features/effects/types'
import { EffectLayerType, EffectType } from '@/features/effects/types'
import { AddEffectCommand } from '@/features/core/commands'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'
import { DEFAULT_SCREEN_DATA, SCREEN_EFFECT_PRESETS } from '../config'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useEffectById } from '@/features/core/stores/selectors/effect-selectors'

interface DepthStylePreviewProps {
    tiltX: number
    tiltY: number
    perspective: number
    preset: ScreenEffectPreset
    isSelected: boolean
    isHovered: boolean
}

function DepthStylePreview({ tiltX, tiltY, perspective, preset, isSelected, isHovered }: DepthStylePreviewProps) {
    // Use full transform values to match the actual video effect
    const scaledTiltX = tiltX
    const scaledTiltY = tiltY
    const scaledPerspective = perspective

    // Center adjustment for TableView (matching screen-transform.ts)
    let centerAdjust = ''
    if (preset === ScreenEffectPreset.TableView) {
        const ty = -scaledTiltX * 0.1
        centerAdjust = ` translate3d(0, ${ty}px, 0)`
    }

    // Use inline perspective() to match the video transform approach
    const transform = `perspective(${scaledPerspective}px) rotateX(${scaledTiltX}deg) rotateY(${scaledTiltY}deg)${centerAdjust}`

    return (
        <div
            className="relative w-full aspect-[16/10] rounded-md overflow-hidden"
            style={{
                background: 'linear-gradient(145deg, hsl(var(--muted)/0.3) 0%, hsl(var(--muted)/0.5) 100%)'
            }}
        >
            <div
                className={cn(
                    "absolute inset-2 rounded-sm transition-all duration-200",
                    isSelected
                        ? "bg-gradient-to-br from-primary/60 to-primary/40 shadow-lg"
                        : "bg-gradient-to-br from-foreground/25 to-foreground/15 shadow-md",
                    isHovered && !isSelected && "from-foreground/35 to-foreground/20"
                )}
                style={{
                    transform,
                    transformStyle: 'preserve-3d',
                    transformOrigin: 'center center'
                }}
            >
                {/* Simulated screen content lines */}
                <div className="absolute inset-1.5 flex flex-col gap-1 justify-center items-center">
                    <div className={cn(
                        "w-3/4 h-0.5 rounded-full",
                        isSelected ? "bg-primary-foreground/40" : "bg-foreground/20"
                    )} />
                    <div className={cn(
                        "w-1/2 h-0.5 rounded-full",
                        isSelected ? "bg-primary-foreground/30" : "bg-foreground/15"
                    )} />
                </div>
            </div>
        </div>
    )
}

interface ScreenTabProps {
    selectedClip: Clip | null
    selectedEffectLayer?: SelectedEffectLayer
    onEffectChange: (type: EffectType, data: Partial<Effect['data']>) => void
}

export function ScreenTab({ selectedClip, selectedEffectLayer, onEffectChange }: ScreenTabProps) {
    const [introMs, setIntroMs] = useState(DEFAULT_SCREEN_DATA.introMs ?? 300)
    const [outroMs, setOutroMs] = useState(DEFAULT_SCREEN_DATA.outroMs ?? 300)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [hoveredStyle, setHoveredStyle] = useState<string | null>(null)
    const executorRef = useCommandExecutor()
    // PERF: Use granular selector instead of searching entire effects array
    // This prevents re-renders when unrelated effects change
    const selectedScreenId = selectedEffectLayer?.type === EffectLayerType.Screen
        ? (selectedEffectLayer.id ?? null)
        : null
    const screenEffect = useEffectById(selectedScreenId)
    const screenData = screenEffect?.data as ScreenEffectData | undefined
    const currentPreset = screenData?.preset ?? DEFAULT_SCREEN_DATA.preset

    // Keep UI in sync if selection changes; these values are currently "best-effort" defaults.
    useEffect(() => {
        setIntroMs(screenData?.introMs ?? DEFAULT_SCREEN_DATA.introMs ?? 300)
        setOutroMs(screenData?.outroMs ?? DEFAULT_SCREEN_DATA.outroMs ?? 300)
    }, [selectedEffectLayer?.id, screenData?.introMs, screenData?.outroMs])

    const styleOptions = useMemo(() => [
        {
            id: 'table-view',
            label: 'Table View',
            preset: ScreenEffectPreset.TableView,
            description: 'Flat on desk perspective'
        },
        {
            id: 'showcase',
            label: 'Showcase',
            preset: ScreenEffectPreset.Showcase,
            description: 'Clean product-shot angle'
        },
        {
            id: 'floating',
            label: 'Floating',
            preset: ScreenEffectPreset.FloatingCard,
            description: 'Subtle depth, minimal tilt'
        },
        {
            id: 'smooth',
            label: 'Smooth',
            preset: ScreenEffectPreset.Subtle,
            description: 'Gentle depth with soft motion'
        },
        {
            id: 'focused',
            label: 'Focused',
            preset: ScreenEffectPreset.Hero,
            description: 'Deeper, dramatic tilt'
        }
    ], [])

    const speedPresets: Array<{
        id: string
        label: string
        introMs: number
        outroMs: number
        description: string
        icon: React.ComponentType<{ className?: string }>
    }> = [
            { id: 'smooth', label: 'Smooth', introMs: 600, outroMs: 600, description: 'Long, elegant ease', icon: Feather },
            { id: 'medium', label: 'Medium', introMs: 350, outroMs: 350, description: 'Balanced, natural pace', icon: Gauge },
            { id: 'rapid', label: 'Rapid', introMs: 150, outroMs: 150, description: 'Quick, snappy motion', icon: Zap },
            { id: 'none', label: 'None', introMs: 0, outroMs: 0, description: 'Instant cut', icon: CircleOff }
        ]

    const applySpeedPreset = (intro: number, outro: number) => {
        setIntroMs(intro)
        setOutroMs(outro)
        onEffectChange(EffectType.Screen, { introMs: intro, outroMs: outro })
    }

    return (
        <div className="space-y-3">
            {/* Add Screen Block */}
            <div className="rounded-2xl bg-background/40 p-3 overflow-hidden">
                <button
                    className="w-full px-3 py-2 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-all"
                    onClick={async () => {
                        const startTime = selectedClip ? selectedClip.startTime : useProjectStore.getState().currentTime
                        const duration = selectedClip ? selectedClip.duration : 3000

                        const newEffect: Effect = {
                            id: `screen-${Date.now()}`,
                            type: EffectType.Screen,
                            startTime: startTime,
                            endTime: startTime + duration,
                            enabled: true,
                            data: { preset: ScreenEffectPreset.Subtle }
                        }
                        // Use command pattern for undo/redo support
                        await executorRef.current?.execute(AddEffectCommand, newEffect)
                    }}
                >
                    Add Depth Block
                </button>
                <div className="mt-2 flex items-center justify-center gap-2">
                    <p className="text-2xs text-muted-foreground/70 italic leading-snug">
                        Adds a block you can resize on the timeline.
                    </p>
                    <InfoTooltip content="Select the block on the timeline to edit its preset here." />
                </div>
            </div>

            {/* Show presets only when a screen block is selected */}
            {selectedEffectLayer?.type === EffectLayerType.Screen && selectedEffectLayer?.id ? (
                <div className="rounded-2xl bg-background/40 p-3 space-y-3 overflow-hidden">
                    <div className="space-y-2">
                        <label className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 block">Depth Style</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {styleOptions.map((option) => {
                                const isSelected = currentPreset === option.preset
                                const isHovered = hoveredStyle === option.id
                                const presetValues = SCREEN_EFFECT_PRESETS[option.preset]
                                return (
                                    <button
                                        key={option.id}
                                        className={cn(
                                            'group flex flex-col gap-1 rounded-lg border p-1.5 text-left transition-all',
                                            isSelected
                                                ? 'border-primary/60 bg-primary/10 shadow-sm'
                                                : 'border-border/40 bg-background/40 hover:bg-background/60 hover:border-border/60'
                                        )}
                                        onClick={() => onEffectChange(EffectType.Screen, { preset: option.preset })}
                                        onMouseEnter={() => setHoveredStyle(option.id)}
                                        onMouseLeave={() => setHoveredStyle(null)}
                                    >
                                        <DepthStylePreview
                                            tiltX={presetValues?.tiltX ?? 0}
                                            tiltY={presetValues?.tiltY ?? 0}
                                            perspective={presetValues?.perspective ?? 1000}
                                            preset={option.preset}
                                            isSelected={isSelected}
                                            isHovered={isHovered}
                                        />
                                        <div className="px-0.5">
                                            <div className={cn(
                                                "text-2xs font-medium leading-tight truncate",
                                                isSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                                            )}>
                                                {option.label}
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="space-y-2 pt-1">
                        <label className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 block">Motion</label>
                        <div className="grid grid-cols-4 gap-1.5">
                            {speedPresets.map((option) => {
                                const Icon = option.icon
                                const isSelected = introMs === option.introMs && outroMs === option.outroMs
                                return (
                                    <button
                                        key={option.id}
                                        className={cn(
                                            'group flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-all',
                                            isSelected
                                                ? 'border-primary/60 bg-primary/10 text-foreground shadow-sm'
                                                : 'border-border/40 bg-background/40 text-muted-foreground hover:bg-background/60 hover:text-foreground'
                                        )}
                                        onClick={() => applySpeedPreset(option.introMs, option.outroMs)}
                                    >
                                        <div className={cn(
                                            'flex h-6 w-6 items-center justify-center rounded-md border',
                                            isSelected ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/40 bg-background/60 text-muted-foreground'
                                        )}>
                                            <Icon className="h-3 w-3" />
                                        </div>
                                        <div className="text-2xs font-medium leading-tight">{option.label}</div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-background/30 hover:bg-background/50 rounded-md transition-colors"
                    >
                        <span>Advanced</span>
                        <span className={cn("text-2xs uppercase tracking-[0.2em] transition-opacity", showAdvanced ? "opacity-100" : "opacity-60")}>
                            {showAdvanced ? 'On' : 'Off'}
                        </span>
                    </button>

                    {showAdvanced && (
                        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 pt-3 border-t border-border/30 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="group space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-muted-foreground transition-colors duration-150 group-hover:text-foreground">Ease In</label>
                                    <span className="text-xs font-mono tabular-nums text-muted-foreground/70 transition-colors duration-150 group-hover:text-foreground/80">{introMs}ms</span>
                                </div>
                                <Slider
                                    value={[introMs]}
                                    onValueChange={([value]) => setIntroMs(value)}
                                    onValueCommit={([value]) => onEffectChange(EffectType.Screen, { introMs: value })}
                                    min={0}
                                    max={1000}
                                    step={50}
                                />
                            </div>
                            <div className="group space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-muted-foreground transition-colors duration-150 group-hover:text-foreground">Ease Out</label>
                                    <span className="text-xs font-mono tabular-nums text-muted-foreground/70 transition-colors duration-150 group-hover:text-foreground/80">{outroMs}ms</span>
                                </div>
                                <Slider
                                    value={[outroMs]}
                                    onValueChange={([value]) => setOutroMs(value)}
                                    onValueCommit={([value]) => onEffectChange(EffectType.Screen, { outroMs: value })}
                                    min={0}
                                    max={1000}
                                    step={50}
                                />
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="rounded-2xl bg-background/40 p-3 overflow-hidden">
                    <p className="text-2xs text-muted-foreground leading-snug">Select a depth block on the timeline to update its look.</p>
                </div>
            )}
        </div>
    )
}
