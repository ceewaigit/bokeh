import React from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { usePreviewSettingsStore, type PreviewSettings } from '@/stores/preview-settings-store'
import { cn } from '@/lib/utils'

const GUIDE_COLORS = [
    { label: 'Ink', value: '#111111' },
    { label: 'Graphite', value: '#2c2c2c' },
    { label: 'White', value: '#ffffff' },
    { label: 'Red', value: '#ff4444' },
    { label: 'Blue', value: '#4488ff' },
    { label: 'Green', value: '#44ff44' },
    { label: 'Yellow', value: '#ffff44' },
]

export function GuidesSection() {
    const showRuleOfThirds = usePreviewSettingsStore((s) => s.showRuleOfThirds)
    const showCenterGuides = usePreviewSettingsStore((s) => s.showCenterGuides)
    const showSafeZones = usePreviewSettingsStore((s) => s.showSafeZones)
    const guideColor = usePreviewSettingsStore((s) => s.guideColor)
    const guideOpacity = usePreviewSettingsStore((s) => s.guideOpacity)
    const safeZoneMargin = usePreviewSettingsStore((s) => s.safeZoneMargin)
    const setPreviewSettings = usePreviewSettingsStore((s) => s.setPreviewSettings)

    const updatePreviewSettings = (key: keyof PreviewSettings, value: PreviewSettings[keyof PreviewSettings]) => {
        setPreviewSettings({
            [key]: value
        })
    }

    return (
        <div className="space-y-4 pt-1.5">
            {/* Toggles */}
            <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                    <Label htmlFor="rule-thirds" className="text-[10px] font-medium text-muted-foreground">Rule of Thirds</Label>
                    <Switch
                        id="rule-thirds"
                        checked={showRuleOfThirds}
                        onCheckedChange={(c) => updatePreviewSettings('showRuleOfThirds', c)}
                        className="scale-75 origin-right"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <Label htmlFor="center-guides" className="text-[10px] font-medium text-muted-foreground">Center Guides</Label>
                    <Switch
                        id="center-guides"
                        checked={showCenterGuides}
                        onCheckedChange={(c) => updatePreviewSettings('showCenterGuides', c)}
                        className="scale-75 origin-right"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <Label htmlFor="safe-zones" className="text-[10px] font-medium text-muted-foreground">Safe Zones</Label>
                    <Switch
                        id="safe-zones"
                        checked={showSafeZones}
                        onCheckedChange={(c) => updatePreviewSettings('showSafeZones', c)}
                        className="scale-75 origin-right"
                    />
                </div>
            </div>

            <div className="h-px bg-border/40" />

            {/* Appearance Settings - Only show if any guide is enabled */}
            {(showRuleOfThirds || showCenterGuides || showSafeZones) ? (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <h4 className="text-[11px] font-semibold text-foreground/80 tracking-[-0.01em]">Appearance</h4>

                    {/* Color Picker */}
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Color</Label>
                        <div className="flex items-center gap-2">
                            {GUIDE_COLORS.map((color) => (
                                <button
                                    key={color.value}
                                    onClick={() => updatePreviewSettings('guideColor', color.value)}
                                    className={cn(
                                        "w-4 h-4 rounded-full border border-white/10 transition-all",
                                        guideColor === color.value ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110" : "hover:scale-105"
                                    )}
                                    style={{ backgroundColor: color.value }}
                                    title={color.label}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Opacity Slider */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] text-muted-foreground">Opacity</Label>
                            <span className="text-[10px] font-mono text-muted-foreground/70">{Math.round(guideOpacity * 100)}%</span>
                        </div>
                        <Slider
                            value={[guideOpacity]}
                            onValueChange={([v]) => updatePreviewSettings('guideOpacity', v)}
                            min={0.1}
                            max={1}
                            step={0.1}
                            className="w-full"
                        />
                    </div>

                    {/* Safe Zone Margin Slider (only if Safe Zones enabled) */}
                    {showSafeZones && (
                        <div className="space-y-2.5 animate-in fade-in slide-in-from-top-1">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] text-muted-foreground">Safe Zone Margin</Label>
                                <span className="text-[10px] font-mono text-muted-foreground/70">{safeZoneMargin}%</span>
                            </div>
                            <Slider
                                value={[safeZoneMargin]}
                                onValueChange={([v]) => updatePreviewSettings('safeZoneMargin', v)}
                                min={5}
                                max={25}
                                step={1}
                                className="w-full"
                            />
                        </div>
                    )}
                </div>
            ) : (
                <div className="py-8 text-center px-4">
                    <p className="text-xs text-muted-foreground/60">
                        Enable a guide above to customize its appearance
                    </p>
                </div>
            )}
        </div>
    )
}
