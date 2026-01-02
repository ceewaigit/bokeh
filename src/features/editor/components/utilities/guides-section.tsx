import React from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { usePreviewSettingsStore, type PreviewSettings } from '@/features/stores/preview-settings-store'
import { ColorPickerPopover } from '@/components/ui/color-picker'

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
                    <Label htmlFor="rule-thirds" className="text-2xs font-medium text-muted-foreground">Rule of Thirds</Label>
                    <Switch
                        id="rule-thirds"
                        checked={showRuleOfThirds}
                        onCheckedChange={(c) => updatePreviewSettings('showRuleOfThirds', c)}
                        className="scale-75 origin-right"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <Label htmlFor="center-guides" className="text-2xs font-medium text-muted-foreground">Center Guides</Label>
                    <Switch
                        id="center-guides"
                        checked={showCenterGuides}
                        onCheckedChange={(c) => updatePreviewSettings('showCenterGuides', c)}
                        className="scale-75 origin-right"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <Label htmlFor="safe-zones" className="text-2xs font-medium text-muted-foreground">Safe Zones</Label>
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
                    <h4 className="text-2xs font-semibold text-foreground/80 tracking-[-0.01em]">Appearance</h4>

                    {/* Color Picker */}
                    <div className="space-y-1.5">
                        <Label className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Color</Label>
                        <ColorPickerPopover
                            value={guideColor}
                            onChange={(value) => updatePreviewSettings('guideColor', value)}
                            label="Pick guide color"
                            className="w-full justify-between"
                            swatchClassName="h-5 w-5"
                        />
                    </div>

                    {/* Opacity Slider */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <Label className="text-2xs text-muted-foreground">Opacity</Label>
                            <span className="text-2xs font-mono text-muted-foreground/70">{Math.round(guideOpacity * 100)}%</span>
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
                                <Label className="text-2xs text-muted-foreground">Safe Zone Margin</Label>
                                <span className="text-2xs font-mono text-muted-foreground/70">{safeZoneMargin}%</span>
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
