'use client'

import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { KeystrokeEffectData, Effect } from '@/types/project'
import { EffectType, KeystrokePosition } from '@/types'
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects'
import { InfoTooltip } from './info-tooltip'
import { useProjectStore } from '@/stores/project-store'
import { getKeystrokeEffects } from '@/lib/effects/effect-filters'
import { EffectStore } from '@/lib/core/effects'
import { ChevronRight } from 'lucide-react'

interface KeystrokeTabProps {
  keystrokeEffect: Effect | undefined
  onUpdateKeystroke: (updates: any) => void
  onEffectChange: (type: EffectType, data: any) => void
  onBulkToggleKeystrokes?: (enabled: boolean) => void
}

type StylePreset = 'default' | 'glass' | 'minimal' | 'terminal' | 'outline'

const STYLE_PRESETS: { value: StylePreset; label: string }[] = [
  { value: 'glass', label: 'Glass' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'outline', label: 'Outline' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'default', label: 'Solid' },
]

const POSITION_OPTIONS = [
  { value: KeystrokePosition.BottomCenter, label: 'Bottom' },
  { value: KeystrokePosition.TopCenter, label: 'Top' },
  { value: KeystrokePosition.BottomRight, label: 'Right' },
] as const

export function KeystrokeTab({ keystrokeEffect, onUpdateKeystroke, onEffectChange, onBulkToggleKeystrokes }: KeystrokeTabProps) {
  const keystrokeData = keystrokeEffect?.data as KeystrokeEffectData | undefined
  const project = useProjectStore((s) => s.currentProject)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const keystrokeEffects = React.useMemo(() => {
    if (!project) return []
    return getKeystrokeEffects(EffectStore.getAll(project))
  }, [project])

  const hasEnabledKeystrokes = React.useMemo(() => {
    return keystrokeEffects.some(e => e.enabled)
  }, [keystrokeEffects])

  const keyboardEventCount = React.useMemo(() => {
    if (!project?.recordings?.length) return 0
    return project.recordings.reduce((sum, r) => sum + (r.metadata?.keyboardEvents?.length ?? 0), 0)
  }, [project?.recordings])

  // Current values with defaults
  const preset = keystrokeData?.stylePreset ?? DEFAULT_KEYSTROKE_DATA.stylePreset ?? 'glass'
  const fontSize = keystrokeData?.fontSize ?? DEFAULT_KEYSTROKE_DATA.fontSize ?? 14
  const displayDuration = keystrokeData?.displayDuration ?? DEFAULT_KEYSTROKE_DATA.displayDuration ?? 2000
  const position = keystrokeData?.position ?? DEFAULT_KEYSTROKE_DATA.position ?? KeystrokePosition.BottomCenter
  const borderRadius = keystrokeData?.borderRadius ?? DEFAULT_KEYSTROKE_DATA.borderRadius ?? 8
  const padding = keystrokeData?.padding ?? DEFAULT_KEYSTROKE_DATA.padding ?? 10
  const scale = keystrokeData?.scale ?? DEFAULT_KEYSTROKE_DATA.scale ?? 1
  const showModifierSymbols = keystrokeData?.showModifierSymbols ?? DEFAULT_KEYSTROKE_DATA.showModifierSymbols ?? true
  const fadeOutDuration = keystrokeData?.fadeOutDuration ?? DEFAULT_KEYSTROKE_DATA.fadeOutDuration ?? 400

  const [localFontSize, setLocalFontSize] = useState(fontSize)
  const [localDisplayDuration, setLocalDisplayDuration] = useState(displayDuration)
  const [localBorderRadius, setLocalBorderRadius] = useState(borderRadius)
  const [localPadding, setLocalPadding] = useState(padding)
  const [localScale, setLocalScale] = useState(scale)
  const [localFadeOutDuration, setLocalFadeOutDuration] = useState(fadeOutDuration)

  useEffect(() => setLocalFontSize(fontSize), [fontSize])
  useEffect(() => setLocalDisplayDuration(displayDuration), [displayDuration])
  useEffect(() => setLocalBorderRadius(borderRadius), [borderRadius])
  useEffect(() => setLocalPadding(padding), [padding])
  useEffect(() => setLocalScale(scale), [scale])
  useEffect(() => setLocalFadeOutDuration(fadeOutDuration), [fadeOutDuration])

  return (
    <div className="space-y-2.5">
      {/* Toggle */}
      <div className="rounded-md bg-background/40 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold leading-none tracking-[-0.01em]">Keystrokes</div>
            <div className="mt-1 text-[11px] text-muted-foreground leading-snug">
              Display key presses on screen
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground/70 tabular-nums">
              {keystrokeEffects.length > 0 ? `${keystrokeEffects.length} blocks` : `${keyboardEventCount} events`}
            </div>
          </div>
          <Switch
            checked={hasEnabledKeystrokes}
            onCheckedChange={(checked) => {
              if (onBulkToggleKeystrokes) onBulkToggleKeystrokes(checked)
              else onEffectChange(EffectType.Keystroke, { ...keystrokeData, enabled: checked })
            }}
          />
        </div>
      </div>

      {hasEnabledKeystrokes && (
        <div className="rounded-md bg-background/40 p-2.5 space-y-3">
          {/* Style */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Style</label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => onUpdateKeystroke({ stylePreset: s.value })}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-all text-left",
                    preset === s.value
                      ? "border-primary/60 bg-primary/10 text-foreground shadow-sm"
                      : "border-border/40 bg-background/40 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Position */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Position</label>
            <div className="flex flex-wrap gap-1.5">
              {POSITION_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => onUpdateKeystroke({ position: p.value })}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-all text-left",
                    position === p.value
                      ? "border-primary/60 bg-primary/10 text-foreground shadow-sm"
                      : "border-border/40 bg-background/40 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Size</label>
              <span className="text-[11px] text-muted-foreground/70 tabular-nums">{localFontSize}px</span>
            </div>
            <Slider
              value={[localFontSize]}
              onValueChange={([v]) => setLocalFontSize(v)}
              onValueCommit={([v]) => onUpdateKeystroke({ fontSize: v })}
              min={10}
              max={28}
              step={1}
              className="w-full"
            />
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Duration</label>
              <span className="text-[11px] text-muted-foreground/70 tabular-nums">{(localDisplayDuration / 1000).toFixed(1)}s</span>
            </div>
            <Slider
              value={[localDisplayDuration]}
              onValueChange={([v]) => setLocalDisplayDuration(v)}
              onValueCommit={([v]) => onUpdateKeystroke({ displayDuration: v })}
              min={500}
              max={5000}
              step={100}
              className="w-full"
            />
          </div>

          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-background/30 hover:bg-background/50 rounded-md transition-colors"
          >
            <span>Advanced</span>
            <ChevronRight className={cn("h-3 w-3 transition-transform", showAdvanced && "rotate-90")} />
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-1 border-t border-border/20">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">Corner Radius</label>
                  <span className="text-[11px] text-muted-foreground/70 tabular-nums">{localBorderRadius}px</span>
                </div>
                <Slider
                  value={[localBorderRadius]}
                  onValueChange={([v]) => setLocalBorderRadius(v)}
                  onValueCommit={([v]) => onUpdateKeystroke({ borderRadius: v })}
                  min={0}
                  max={24}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Padding */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">Padding</label>
                  <span className="text-[11px] text-muted-foreground/70 tabular-nums">{localPadding}px</span>
                </div>
                <Slider
                  value={[localPadding]}
                  onValueChange={([v]) => setLocalPadding(v)}
                  onValueCommit={([v]) => onUpdateKeystroke({ padding: v })}
                  min={4}
                  max={20}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Scale */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">Scale</label>
                  <span className="text-[11px] text-muted-foreground/70 tabular-nums">{(localScale * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[localScale]}
                  onValueChange={([v]) => setLocalScale(v)}
                  onValueCommit={([v]) => onUpdateKeystroke({ scale: v })}
                  min={0.5}
                  max={2}
                  step={0.1}
                  className="w-full"
                />
              </div>

              {/* Fade Duration */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">Fade Out</label>
                  <span className="text-[11px] text-muted-foreground/70 tabular-nums">{localFadeOutDuration}ms</span>
                </div>
                <Slider
                  value={[localFadeOutDuration]}
                  onValueChange={([v]) => setLocalFadeOutDuration(v)}
                  onValueCommit={([v]) => onUpdateKeystroke({ fadeOutDuration: v })}
                  min={100}
                  max={1000}
                  step={50}
                  className="w-full"
                />
              </div>

              {/* Toggle: Modifier Symbols */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Use Symbols</label>
                  <InfoTooltip content="Use symbols (⌘) instead of text (Cmd)" />
                </div>
                <Switch
                  checked={showModifierSymbols}
                  onCheckedChange={(v) => onUpdateKeystroke({ showModifierSymbols: v })}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
