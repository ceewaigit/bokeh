import React, { useState } from 'react'
import { Info, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useProjectStore } from '@/features/stores/project-store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/shared/utils/utils'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose
} from '@/components/ui/dialog'
import { DEFAULT_EFFECT_GENERATION_CONFIG, type EffectGenerationConfig } from '@/features/effects/services/effect-generation-service'

export function EditingSection() {
    const editing = useProjectStore((s) => s.settings.editing)
    const updateSettings = useProjectStore((s) => s.updateSettings)
    const regenerateAllEffects = useProjectStore((s) => s.regenerateAllEffects)
    const { snapToGrid, showWaveforms, autoRipple = true } = editing
    const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false)
    const [showAdvanced, setShowAdvanced] = useState(false)

    // Local config state for the dialog
    const [config, setConfig] = useState<EffectGenerationConfig>({ ...DEFAULT_EFFECT_GENERATION_CONFIG })

    const updateEditingSettings = (key: keyof typeof editing, value: boolean) => {
        updateSettings({
            editing: {
                ...editing,
                [key]: value
            }
        })
    }

    const handleRegenerateConfirm = () => {
        regenerateAllEffects(config)
        setIsRegenerateDialogOpen(false)
    }

    const resetToDefaults = () => {
        setConfig({ ...DEFAULT_EFFECT_GENERATION_CONFIG })
    }

    return (
        <div className="space-y-4 pt-2">
            <div className="space-y-3">
                {/* Snap to Grid */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Label htmlFor="snap-grid" className="text-2xs font-medium text-muted-foreground whitespace-nowrap">
                            Snap to grid
                        </Label>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="left">Align clips to grid lines</TooltipContent>
                        </Tooltip>
                    </div>
                    <Switch
                        id="snap-grid"
                        checked={snapToGrid}
                        onCheckedChange={(c) => updateEditingSettings('snapToGrid', c)}
                        className="scale-75 origin-right"
                    />
                </div>

                {/* Show Waveforms */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Label htmlFor="show-waveforms" className="text-2xs font-medium text-muted-foreground whitespace-nowrap">
                            Waveforms
                        </Label>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="left">Display audio volume on clips</TooltipContent>
                        </Tooltip>
                    </div>
                    <Switch
                        id="show-waveforms"
                        checked={showWaveforms}
                        onCheckedChange={(c) => updateEditingSettings('showWaveforms', c)}
                        className="scale-75 origin-right"
                    />
                </div>

                {/* Auto Ripple */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Label htmlFor="auto-ripple" className="text-2xs font-medium text-muted-foreground whitespace-nowrap">
                            Auto ripple
                        </Label>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="left">Close gaps when deleting clips</TooltipContent>
                        </Tooltip>
                    </div>
                    <Switch
                        id="auto-ripple"
                        checked={autoRipple}
                        onCheckedChange={(c) => updateEditingSettings('autoRipple', c)}
                        className="scale-75 origin-right"
                    />
                </div>
            </div>

            {/* Separator */}
            <div className="border-t border-border/40" />

            {/* Regenerate All Effects */}
            <div className="space-y-2">
                <Dialog open={isRegenerateDialogOpen} onOpenChange={setIsRegenerateDialogOpen}>
                <DialogTrigger asChild>
                    <button
                        className="w-full flex items-center justify-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition-all group hover:bg-destructive/20"
                    >
                        <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-[-180deg] transition-transform duration-500" />
                        Regenerate Effects
                    </button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-destructive" />
                                <DialogTitle>Regenerate All Effects?</DialogTitle>
                            </div>
                            <DialogDescription className="pt-2">
                                This will reset zoom, keystroke, and auto-generated 3D effects to their auto-detected state, and restore framing (crop + mockups) to defaults.
                            </DialogDescription>
                        </DialogHeader>

                    {/* Advanced Settings Toggle */}
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                        <span>Advanced Settings</span>
                        <ChevronRight className={cn("w-4 h-4 transition-transform duration-200", showAdvanced && "rotate-90")} />
                    </button>

                    {showAdvanced && (
                        <div className="space-y-3 rounded-md bg-muted/20 p-3 animate-in fade-in slide-in-from-top-1 duration-150">
                            {/* Min Idle Duration */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-2xs text-muted-foreground">Min Idle Duration</span>
                                    <span className="text-2xs font-mono text-muted-foreground tabular-nums">
                                        {(config.minIdleDurationMs / 1000).toFixed(1)}s
                                    </span>
                                </div>
                                    <Slider
                                        value={[config.minIdleDurationMs]}
                                        onValueChange={([value]) => setConfig(prev => ({ ...prev, minIdleDurationMs: value }))}
                                        min={1000}
                                        max={10000}
                                        step={500}
                                        className="w-full"
                                    />
                                    <p className="text-2xs text-muted-foreground/60">Minimum duration to detect as idle period</p>
                                </div>

                                {/* Auto 3D Threshold */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-2xs text-muted-foreground">Auto 3D Threshold</span>
                                        <span className="text-2xs font-mono text-muted-foreground tabular-nums">
                                            {config.auto3DThreshold.toFixed(1)}x
                                        </span>
                                    </div>
                                    <Slider
                                        value={[config.auto3DThreshold]}
                                        onValueChange={([value]) => setConfig(prev => ({ ...prev, auto3DThreshold: value }))}
                                        min={1.5}
                                        max={3.5}
                                        step={0.1}
                                        className="w-full"
                                    />
                                    <p className="text-2xs text-muted-foreground/60">Apply 3D Window effect when zoom reaches this level</p>
                                </div>

                                {/* Max Zooms Per Minute */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-2xs text-muted-foreground">Max Zooms/Min</span>
                                        <span className="text-2xs font-mono text-muted-foreground tabular-nums">
                                            {config.maxZoomsPerMinute ?? 4}
                                        </span>
                                    </div>
                                    <Slider
                                        value={[config.maxZoomsPerMinute ?? 4]}
                                        onValueChange={([value]) => setConfig(prev => ({ ...prev, maxZoomsPerMinute: value }))}
                                        min={1}
                                        max={10}
                                        step={1}
                                        className="w-full"
                                    />
                                    <p className="text-2xs text-muted-foreground/60">Fewer = longer, more deliberate zooms</p>
                                </div>

                                {/* Min Gap Between Zooms */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-2xs text-muted-foreground">Min Gap</span>
                                        <span className="text-2xs font-mono text-muted-foreground tabular-nums">
                                            {((config.minZoomGapMs ?? 6000) / 1000).toFixed(1)}s
                                        </span>
                                    </div>
                                    <Slider
                                        value={[config.minZoomGapMs ?? 6000]}
                                        onValueChange={([value]) => setConfig(prev => ({ ...prev, minZoomGapMs: value }))}
                                        min={2000}
                                        max={15000}
                                        step={1000}
                                        className="w-full"
                                    />
                                    <p className="text-2xs text-muted-foreground/60">Minimum time between zoom blocks</p>
                                </div>

                                {/* Easing Durations */}
                                <div className="space-y-2">
                                    <span className="text-2xs text-muted-foreground">Easing Duration</span>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-2xs text-muted-foreground/80">In</span>
                                                <span className="text-2xs font-mono text-muted-foreground/80 tabular-nums">
                                                    {config.defaultIntroMs}ms
                                                </span>
                                            </div>
                                            <Slider
                                                value={[config.defaultIntroMs]}
                                                onValueChange={([value]) => setConfig(prev => ({ ...prev, defaultIntroMs: value }))}
                                                min={100}
                                                max={1000}
                                                step={50}
                                                className="w-full"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-2xs text-muted-foreground/80">Out</span>
                                                <span className="text-2xs font-mono text-muted-foreground/80 tabular-nums">
                                                    {config.defaultOutroMs}ms
                                                </span>
                                            </div>
                                            <Slider
                                                value={[config.defaultOutroMs]}
                                                onValueChange={([value]) => setConfig(prev => ({ ...prev, defaultOutroMs: value }))}
                                                min={100}
                                                max={1000}
                                                step={50}
                                                className="w-full"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Reset to Defaults */}
                                <button
                                    onClick={resetToDefaults}
                                    className="w-full text-2xs text-muted-foreground hover:text-foreground py-1"
                                >
                                    Reset to defaults
                                </button>
                            </div>
                        )}

                        <DialogFooter className="gap-2 sm:gap-0">
                            <DialogClose asChild>
                                <Button variant="ghost" size="sm">Cancel</Button>
                            </DialogClose>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleRegenerateConfirm}
                            >
                                Regenerate
                            </Button>
                        </DialogFooter>
                </DialogContent>
            </Dialog>
            <p className="text-2xs text-muted-foreground/70 text-center leading-snug">
                Restore auto-detected defaults
            </p>
        </div>

    </div>
    )
}
