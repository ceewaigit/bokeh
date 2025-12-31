'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AccordionSection } from '@/components/ui/accordion-section'
import type { KeystrokeEffectData, Effect, KeyboardEvent } from '@/types/project'
import { EffectType, KeystrokePosition } from '@/types'
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects'
import { InfoTooltip } from './info-tooltip'
import { useProjectStore } from '@/stores/project-store'
import { getKeystrokeEffects } from '@/features/effects/effect-filters'
import { EffectStore } from '@/lib/core/effects'
import { KeystrokePreviewOverlay } from '@/components/keystroke-preview-overlay'

interface KeystrokeTabProps {
  keystrokeEffect: Effect | undefined
  onUpdateKeystroke: (updates: Partial<KeystrokeEffectData>) => void
  onEffectChange: (type: EffectType, data: Partial<Effect['data']> & { enabled?: boolean }) => void
  onBulkToggleKeystrokes?: (enabled: boolean) => void
}

type StylePreset = 'default' | 'glass' | 'minimal' | 'terminal' | 'outline'

const STYLE_PRESETS: { value: StylePreset; label: string; description: string }[] = [
  { value: 'glass', label: 'Glass', description: 'Frosted glass with blur' },
  { value: 'minimal', label: 'Minimal', description: 'Clean, subtle appearance' },
  { value: 'outline', label: 'Outline', description: 'Bordered with transparency' },
  { value: 'terminal', label: 'Terminal', description: 'Retro coding aesthetic' },
  { value: 'default', label: 'Solid', description: 'Bold, opaque background' },
]

const POSITION_OPTIONS = [
  { value: KeystrokePosition.BottomCenter, label: 'Bottom', description: 'Centered at bottom' },
  { value: KeystrokePosition.TopCenter, label: 'Top', description: 'Centered at top' },
  { value: KeystrokePosition.BottomRight, label: 'Right', description: 'Bottom right corner' },
] as const

const PREVIEW_TEXT = 'bokeh.'
const PREVIEW_CHAR_INTERVAL_MS = 120
const PREVIEW_PAUSE_MS = 900

const buildPreviewEvents = (text: string, intervalMs: number): KeyboardEvent[] => {
  let timestamp = 0
  return text.split('').map((char) => {
    const key = char === ' ' ? 'Space' : char
    const event = { timestamp, key, modifiers: [] }
    timestamp += intervalMs
    return event
  })
}

export function KeystrokeTab({ keystrokeEffect, onUpdateKeystroke, onEffectChange, onBulkToggleKeystrokes }: KeystrokeTabProps) {
  const keystrokeData = keystrokeEffect?.data as KeystrokeEffectData | undefined
  const project = useProjectStore((s) => s.currentProject)

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
  const [previewTimeMs, setPreviewTimeMs] = useState(0)

  useEffect(() => setLocalFontSize(fontSize), [fontSize])
  useEffect(() => setLocalDisplayDuration(displayDuration), [displayDuration])
  useEffect(() => setLocalBorderRadius(borderRadius), [borderRadius])
  useEffect(() => setLocalPadding(padding), [padding])
  useEffect(() => setLocalScale(scale), [scale])
  useEffect(() => setLocalFadeOutDuration(fadeOutDuration), [fadeOutDuration])

  const previewEvents = useMemo(
    () => buildPreviewEvents(PREVIEW_TEXT, PREVIEW_CHAR_INTERVAL_MS),
    []
  )
  const previewDurationMs = useMemo(() => {
    const lastTimestamp = previewEvents[previewEvents.length - 1]?.timestamp ?? 0
    return lastTimestamp + localDisplayDuration + localFadeOutDuration + PREVIEW_PAUSE_MS
  }, [previewEvents, localDisplayDuration, localFadeOutDuration])

  useEffect(() => {
    if (!hasEnabledKeystrokes || previewDurationMs <= 0) {
      setPreviewTimeMs(0)
      return
    }
    const interval = window.setInterval(() => {
      setPreviewTimeMs((prev) => (prev + 50) % previewDurationMs)
    }, 50)
    return () => window.clearInterval(interval)
  }, [hasEnabledKeystrokes, previewDurationMs])

  const previewSettings: Partial<KeystrokeEffectData> = {
    ...keystrokeData,
    stylePreset: preset,
    fontSize: localFontSize,
    displayDuration: localDisplayDuration,
    position,
    borderRadius: localBorderRadius,
    padding: localPadding,
    scale: localScale,
    fadeOutDuration: localFadeOutDuration,
    showModifierSymbols,
  }

  return (
    <div className="space-y-2.5">
      {/* Toggle */}
      <div className="rounded-md bg-background/40 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold leading-none tracking-[-0.01em]">Keystrokes</div>
            <div className="mt-1 text-xs text-muted-foreground leading-snug">
              Display key presses on screen
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground/70 tabular-nums">
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
          <div className="rounded-2xl border border-border/20 bg-background/50 shadow-sm overflow-hidden">
            <div className="px-3 py-3 text-left font-[var(--font-display)] text-ui-sm font-semibold tracking-tight text-foreground">
              Preview
            </div>
            <div className="border-t border-border/15 bg-background/60 px-3 pb-3 pt-2">
              <div className="space-y-2">
                <div className="relative h-20 rounded-lg border border-border/50 bg-muted/30 ring-1 ring-border/20 shadow-inner overflow-hidden">
                  <KeystrokePreviewOverlay
                    currentTimeMs={previewTimeMs}
                    keystrokeEvents={previewEvents}
                    settings={previewSettings}
                    enabled
                    centered
                  />
                </div>
                <div className="text-xs text-muted-foreground/60 italic">
                  Uses your current style settings
                </div>
              </div>
            </div>
          </div>

          {/* Style */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Style</label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((s) => (
                <Tooltip key={s.value} delayDuration={400}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onUpdateKeystroke({ stylePreset: s.value })}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs font-semibold transition-all text-left",
                        preset === s.value
                          ? "border-primary/60 bg-primary/10 text-foreground shadow-sm"
                          : "border-border/40 bg-background/40 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                      )}
                    >
                      {s.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {s.description}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Position */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Position</label>
            <div className="flex flex-wrap gap-1.5">
              {POSITION_OPTIONS.map((p) => (
                <Tooltip key={p.value} delayDuration={400}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onUpdateKeystroke({ position: p.value })}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs font-semibold transition-all text-left",
                        position === p.value
                          ? "border-primary/60 bg-primary/10 text-foreground shadow-sm"
                          : "border-border/40 bg-background/40 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                      )}
                    >
                      {p.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {p.description}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Size */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Size</label>
              <span className="text-xs text-muted-foreground/70 tabular-nums">{localFontSize}px</span>
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
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Duration</label>
              <span className="text-xs text-muted-foreground/70 tabular-nums">{(localDisplayDuration / 1000).toFixed(1)}s</span>
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

          <AccordionSection title="Advanced" className="bg-background/30" contentClassName="pt-2.5">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Corner Radius</label>
                  <span className="text-xs text-muted-foreground/70 tabular-nums">{localBorderRadius}px</span>
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
                  <label className="text-xs font-medium text-muted-foreground">Padding</label>
                  <span className="text-xs text-muted-foreground/70 tabular-nums">{localPadding}px</span>
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
                  <label className="text-xs font-medium text-muted-foreground">Scale</label>
                  <span className="text-xs text-muted-foreground/70 tabular-nums">{(localScale * 100).toFixed(0)}%</span>
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
                  <label className="text-xs font-medium text-muted-foreground">Fade Out</label>
                  <span className="text-xs text-muted-foreground/70 tabular-nums">{localFadeOutDuration}ms</span>
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
                  <label className="text-xs font-medium text-muted-foreground">Use Symbols</label>
                  <InfoTooltip content="Use symbols (⌘) instead of text (Cmd)" />
                </div>
                <Switch
                  checked={showModifierSymbols}
                  onCheckedChange={(v) => onUpdateKeystroke({ showModifierSymbols: v })}
                />
              </div>
            </div>
          </AccordionSection>
        </div>
      )}
    </div>
  )
}
