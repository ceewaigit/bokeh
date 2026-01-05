'use client'

import React, { useEffect, useState } from 'react'
import { Target, Wind, Sparkles, Gauge, Zap, CircleOff } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'
import type { Clip, Effect, ScreenEffectData } from '@/types/project'
import { ScreenEffectPreset } from '@/types/project'
import type { SelectedEffectLayer } from '@/features/effects/types'
import { EffectLayerType, EffectType } from '@/features/effects/types'
import { AddEffectCommand } from '@/features/core/commands'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'
import { DEFAULT_SCREEN_DATA } from '../config'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'
import { useProjectStore } from '@/features/core/stores/project-store'

interface ScreenTabProps {
    selectedClip: Clip | null
    selectedEffectLayer?: SelectedEffectLayer
    onEffectChange: (type: EffectType, data: Partial<Effect['data']>) => void
}

export function ScreenTab({ selectedClip, selectedEffectLayer, onEffectChange }: ScreenTabProps) {
    const [introMs, setIntroMs] = useState(DEFAULT_SCREEN_DATA.introMs ?? 300)
    const [outroMs, setOutroMs] = useState(DEFAULT_SCREEN_DATA.outroMs ?? 300)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const executorRef = useCommandExecutor()
    const screenEffect = useProjectStore((s) => {
        if (!selectedEffectLayer?.id || selectedEffectLayer.type !== EffectLayerType.Screen) return null
        return s.currentProject?.timeline.effects?.find((effect) => effect.id === selectedEffectLayer.id) ?? null
    })
    const screenData = screenEffect?.data as ScreenEffectData | undefined
    const currentPreset = screenData?.preset ?? DEFAULT_SCREEN_DATA.preset

    // Keep UI in sync if selection changes; these values are currently "best-effort" defaults.
    useEffect(() => {
        setIntroMs(screenData?.introMs ?? DEFAULT_SCREEN_DATA.introMs ?? 300)
        setOutroMs(screenData?.outroMs ?? DEFAULT_SCREEN_DATA.outroMs ?? 300)
    }, [selectedEffectLayer?.id, screenData?.introMs, screenData?.outroMs])

    const styleOptions: Array<{
        id: string
        label: string
        preset: ScreenEffectPreset
        description: string
        icon: React.ComponentType<{ className?: string }>
    }> = [
            {
                id: 'focused',
                label: 'Focused',
                preset: ScreenEffectPreset.Hero,
                description: 'Deeper, more dramatic tilt',
                icon: Target
            },
            {
                id: 'smooth',
                label: 'Smooth',
                preset: ScreenEffectPreset.Subtle,
                description: 'Gentle depth with soft motion',
                icon: Wind
            }
        ]

    const speedPresets: Array<{
        id: string
        label: string
        introMs: number
        outroMs: number
        description: string
        icon: React.ComponentType<{ className?: string }>
    }> = [
            { id: 'smooth', label: 'Smooth', introMs: 600, outroMs: 600, description: 'Long, elegant ease', icon: Sparkles },
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
                        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                            {styleOptions.map((option) => {
                                const Icon = option.icon
                                const isSelected = currentPreset === option.preset
                                return (
                                    <button
                                        key={option.id}
                                        className={cn(
                                            'group flex min-w-0 flex-col gap-2 rounded-lg border px-2.5 py-2.5 text-left transition-all',
                                            isSelected
                                                ? 'border-primary/60 bg-primary/10 text-foreground shadow-sm'
                                                : 'border-border/40 bg-background/40 text-muted-foreground hover:bg-background/60 hover:text-foreground'
                                        )}
                                        onClick={() => onEffectChange(EffectType.Screen, { preset: option.preset })}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className={cn(
                                                'flex h-7 w-7 items-center justify-center rounded-md border',
                                                isSelected ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/40 bg-background/60 text-muted-foreground'
                                            )}>
                                                <Icon className="h-3.5 w-3.5" />
                                            </div>
                                            {isSelected && (
                                                <span className="text-3xs font-semibold uppercase tracking-[0.18em] text-primary/80">Active</span>
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-xs font-semibold leading-tight">{option.label}</div>
                                            <div className="mt-1 text-2xs leading-snug text-muted-foreground/80">{option.description}</div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="space-y-2 pt-1">
                        <label className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 block">Motion</label>
                        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                            {speedPresets.map((option) => {
                                const Icon = option.icon
                                const isSelected = introMs === option.introMs && outroMs === option.outroMs
                                return (
                                    <button
                                        key={option.id}
                                        className={cn(
                                            'group flex min-w-0 flex-col gap-2 rounded-lg border px-2.5 py-2.5 text-left transition-all',
                                            isSelected
                                                ? 'border-primary/60 bg-primary/10 text-foreground shadow-sm'
                                                : 'border-border/40 bg-background/40 text-muted-foreground hover:bg-background/60 hover:text-foreground'
                                        )}
                                        onClick={() => applySpeedPreset(option.introMs, option.outroMs)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className={cn(
                                                'flex h-7 w-7 items-center justify-center rounded-md border',
                                                isSelected ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/40 bg-background/60 text-muted-foreground'
                                            )}>
                                                <Icon className="h-3.5 w-3.5" />
                                            </div>
                                            {isSelected && (
                                                <span className="text-3xs font-semibold uppercase tracking-[0.18em] text-primary/80">Active</span>
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-xs font-semibold leading-tight">{option.label}</div>
                                            <div className="mt-1 text-2xs leading-snug text-muted-foreground/80">{option.description}</div>
                                        </div>
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
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">Ease In</label>
                                    <span className="text-2xs text-muted-foreground/70 font-mono tabular-nums">{introMs}ms</span>
                                </div>
                                <Slider
                                    value={[introMs]}
                                    onValueChange={([value]) => setIntroMs(value)}
                                    onValueCommit={([value]) => onEffectChange(EffectType.Screen, { introMs: value })}
                                    min={0}
                                    max={1000}
                                    step={50}
                                    className="w-full"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">Ease Out</label>
                                    <span className="text-2xs text-muted-foreground/70 font-mono tabular-nums">{outroMs}ms</span>
                                </div>
                                <Slider
                                    value={[outroMs]}
                                    onValueChange={([value]) => setOutroMs(value)}
                                    onValueCommit={([value]) => onEffectChange(EffectType.Screen, { outroMs: value })}
                                    min={0}
                                    max={1000}
                                    step={50}
                                    className="w-full"
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
