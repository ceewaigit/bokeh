import React, { useState } from 'react'
import { Volume2, VolumeX, Info, ChevronDown, ChevronRight } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useProjectStore } from '@/features/core/stores/project-store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { audioEnhancementManager, ENHANCEMENT_PRESETS } from '@/features/media/audio/audio-enhancement-manager'
import type { AudioEnhancementPreset, AudioEnhancementSettings } from '@/types/project'
import { DEFAULT_PROJECT_SETTINGS } from '@/features/core/settings/defaults'

const PRESET_LABELS: Record<AudioEnhancementPreset, string> = {
    off: 'Off',
    subtle: 'Subtle',
    balanced: 'Balanced',
    broadcast: 'Broadcast',
    custom: 'Custom',
}

const PRESET_DESCRIPTIONS: Record<AudioEnhancementPreset, string> = {
    off: 'No changes to audio',
    subtle: 'Light touch-ups while keeping it natural',
    balanced: 'Clearer, more consistent voice',
    broadcast: 'Professional radio-quality sound',
    custom: 'Your custom settings',
}

export function AudioSection() {
    const audio = useProjectStore((s) => s.currentProject?.settings.audio ?? DEFAULT_PROJECT_SETTINGS.audio)
    const setAudioSettings = useProjectStore((s) => s.setAudioSettings)
    const { volume, muted, fadeInDuration = 0.5, fadeOutDuration = 0.5 } = audio
    const [showAdvanced, setShowAdvanced] = useState(false)

    const currentPreset = audio.enhancementPreset || (audio.enhanceAudio ? 'balanced' : 'off')
    const customSettings = audio.customEnhancement || ENHANCEMENT_PRESETS.balanced

    // Show the active preset's values, or custom values if in custom mode
    const displaySettings = currentPreset === 'custom' || currentPreset === 'off'
        ? customSettings
        : ENHANCEMENT_PRESETS[currentPreset]

    const updateAudioSettings = (key: keyof typeof audio, value: unknown) => {
        setAudioSettings({
            [key]: value
        })
    }

    const handlePresetChange = (preset: AudioEnhancementPreset) => {
        const isEnabled = preset !== 'off'

        setAudioSettings({
            enhanceAudio: isEnabled,
            enhancementPreset: preset,
        })

        if (isEnabled) {
            audioEnhancementManager.applyPreset(preset, preset === 'custom' ? customSettings : undefined)
        }
    }

    const handleCustomSettingChange = (key: keyof AudioEnhancementSettings, value: number) => {
        const newSettings = { ...customSettings, [key]: value }
        setAudioSettings({
            customEnhancement: newSettings,
            enhancementPreset: 'custom',
            enhanceAudio: true,
        })
        audioEnhancementManager.applyPreset('custom', newSettings)
    }

    return (
        <div className="space-y-4 pt-1.5">
            {/* Master Volume */}
            <div className="space-y-3">
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Label className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Master Volume</Label>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="left">Overall volume level</TooltipContent>
                            </Tooltip>
                        </div>
                        <span className="text-2xs font-mono text-muted-foreground/70 tabular-nums">
                            {volume}%
                        </span>
                    </div>
                    <Slider
                        value={[volume]}
                        onValueChange={([v]) => updateAudioSettings('volume', v)}
                        min={0}
                        max={200}
                        step={1}
                        className="w-full"
                    />
                </div>

                {/* Mute Toggle */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {muted ? (
                            <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                            <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <Label htmlFor="mute-toggle" className="text-2xs font-medium text-muted-foreground">
                            Mute All
                        </Label>
                    </div>
                    <Switch
                        id="mute-toggle"
                        checked={muted}
                        onCheckedChange={(checked) => updateAudioSettings('muted', checked)}
                        className="scale-75 origin-right"
                    />
                </div>
            </div>

            <div className="h-px bg-border/40" />

            {/* Audio Enhancement */}
            <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                    <Label className="text-2xs font-semibold text-foreground/80 tracking-[-0.01em]">Enhancement</Label>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[200px]">
                            Improve voice clarity and consistency
                        </TooltipContent>
                    </Tooltip>
                </div>

                {/* Preset Buttons - 2x2 grid */}
                <div className="grid grid-cols-2 gap-1.5">
                    {(['off', 'subtle', 'balanced', 'broadcast'] as AudioEnhancementPreset[]).map((preset) => (
                        <Tooltip key={preset}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => handlePresetChange(preset)}
                                    className={`px-2.5 py-1.5 text-2xs rounded-md transition-colors ${currentPreset === preset
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted/40 text-muted-foreground hover:bg-muted/70'
                                        }`}
                                >
                                    {PRESET_LABELS[preset]}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                {PRESET_DESCRIPTIONS[preset]}
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </div>

                {/* Advanced Toggle */}
                {currentPreset !== 'off' && (
                    <>
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground transition-colors pt-1"
                        >
                            {showAdvanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            Advanced
                        </button>

                        {/* Advanced Controls */}
                        {showAdvanced && (
                            <div className="space-y-3 pt-1">
                                {/* Threshold */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-2xs text-muted-foreground">Threshold</Label>
                                        <span className="text-2xs font-mono text-muted-foreground/70">
                                            {displaySettings.threshold} dB
                                        </span>
                                    </div>
                                    <Slider
                                        value={[displaySettings.threshold]}
                                        onValueChange={([v]) => handleCustomSettingChange('threshold', v)}
                                        min={-60}
                                        max={0}
                                        step={1}
                                        className="w-full"
                                    />
                                </div>

                                {/* Ratio */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-2xs text-muted-foreground">Ratio</Label>
                                        <span className="text-2xs font-mono text-muted-foreground/70">
                                            {displaySettings.ratio}:1
                                        </span>
                                    </div>
                                    <Slider
                                        value={[displaySettings.ratio]}
                                        onValueChange={([v]) => handleCustomSettingChange('ratio', v)}
                                        min={1}
                                        max={20}
                                        step={0.5}
                                        className="w-full"
                                    />
                                </div>

                                {/* Attack */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-2xs text-muted-foreground">Attack</Label>
                                        <span className="text-2xs font-mono text-muted-foreground/70">
                                            {(displaySettings.attack * 1000).toFixed(0)} ms
                                        </span>
                                    </div>
                                    <Slider
                                        value={[displaySettings.attack * 1000]}
                                        onValueChange={([v]) => handleCustomSettingChange('attack', v / 1000)}
                                        min={1}
                                        max={100}
                                        step={1}
                                        className="w-full"
                                    />
                                </div>

                                {/* Release */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-2xs text-muted-foreground">Release</Label>
                                        <span className="text-2xs font-mono text-muted-foreground/70">
                                            {(displaySettings.release * 1000).toFixed(0)} ms
                                        </span>
                                    </div>
                                    <Slider
                                        value={[displaySettings.release * 1000]}
                                        onValueChange={([v]) => handleCustomSettingChange('release', v / 1000)}
                                        min={10}
                                        max={500}
                                        step={10}
                                        className="w-full"
                                    />
                                </div>

                                {/* Knee */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-2xs text-muted-foreground">Knee</Label>
                                        <span className="text-2xs font-mono text-muted-foreground/70">
                                            {displaySettings.knee} dB
                                        </span>
                                    </div>
                                    <Slider
                                        value={[displaySettings.knee]}
                                        onValueChange={([v]) => handleCustomSettingChange('knee', v)}
                                        min={0}
                                        max={40}
                                        step={1}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="h-px bg-border/40" />

            {/* Global Fades */}
            <div className="space-y-3">
                <h4 className="text-2xs font-semibold text-foreground/80 tracking-[-0.01em]">Global Fades</h4>

                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <Label className="text-2xs text-muted-foreground">Fade In</Label>
                        <span className="text-2xs font-mono text-muted-foreground/70">{fadeInDuration}s</span>
                    </div>
                    <Slider
                        value={[fadeInDuration]}
                        onValueChange={([v]) => updateAudioSettings('fadeInDuration', v)}
                        min={0}
                        max={5}
                        step={0.1}
                        className="w-full"
                    />
                </div>

                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <Label className="text-2xs text-muted-foreground">Fade Out</Label>
                        <span className="text-2xs font-mono text-muted-foreground/70">{fadeOutDuration}s</span>
                    </div>
                    <Slider
                        value={[fadeOutDuration]}
                        onValueChange={([v]) => updateAudioSettings('fadeOutDuration', v)}
                        min={0}
                        max={5}
                        step={0.1}
                        className="w-full"
                    />
                </div>
            </div>
        </div>
    )
}
