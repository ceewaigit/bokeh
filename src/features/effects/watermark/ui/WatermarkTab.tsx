'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccordionSection } from '@/components/ui/accordion-section'
import { cn } from '@/shared/utils/utils'
import { useProjectStore } from '@/features/core/stores/project-store'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'
import {
  FONT_FAMILY_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  getWatermarkGate,
  normalizeWatermarkEffectData,
} from '../config'
import {
  WatermarkAnimationType,
  WatermarkLayout,
  WatermarkPulseAnimation,
  type WatermarkEffectDataPatch,
} from '../types'
import { WatermarkIconPicker } from './WatermarkIconPicker'

function LayoutButton({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-2 text-left text-xs font-medium transition-all duration-200',
        selected
          ? 'border-primary/20 bg-primary/10 text-primary shadow-sm'
          : 'border-transparent bg-transparent text-muted-foreground hover:bg-overlay-hover hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}

type WatermarkOrientation = 'horizontal' | 'stacked'
type WatermarkOrder = 'text-first' | 'icon-first'

function decodeLayout(layout: WatermarkLayout): {
  showIcon: boolean
  showText: boolean
  orientation: WatermarkOrientation
  order: WatermarkOrder
} {
  const showIcon = layout !== WatermarkLayout.TextOnly
  const showText = layout !== WatermarkLayout.IconOnly

  const orientation: WatermarkOrientation =
    layout === WatermarkLayout.IconTextStacked || layout === WatermarkLayout.TextIconStacked ? 'stacked' : 'horizontal'

  const order: WatermarkOrder =
    layout === WatermarkLayout.TextOnly ||
      layout === WatermarkLayout.TextIconHorizontal ||
      layout === WatermarkLayout.TextIconStacked
      ? 'text-first'
      : 'icon-first'

  return { showIcon, showText, orientation, order }
}

function encodeLayout(input: {
  showIcon: boolean
  showText: boolean
  orientation: WatermarkOrientation
  order: WatermarkOrder
}): WatermarkLayout {
  const { showIcon, showText, orientation, order } = input

  if (showIcon && !showText) return WatermarkLayout.IconOnly
  if (!showIcon && showText) return WatermarkLayout.TextOnly
  if (!showIcon && !showText) return WatermarkLayout.TextOnly

  if (orientation === 'stacked') {
    return order === 'text-first' ? WatermarkLayout.TextIconStacked : WatermarkLayout.IconTextStacked
  }
  return order === 'text-first' ? WatermarkLayout.TextIconHorizontal : WatermarkLayout.IconTextHorizontal
}

export function WatermarkTab() {
  const project = useProjectStore((s) => s.currentProject)
  const updateProjectData = useProjectStore((s) => s.updateProjectData)

  const gate = React.useMemo(() => getWatermarkGate(), [])
  const watermark = React.useMemo(() => normalizeWatermarkEffectData(project?.watermark), [project?.watermark])

  const [iconPickerOpen, setIconPickerOpen] = React.useState(false)

  const patch = React.useCallback(
    (updates: WatermarkEffectDataPatch) => {
      updateProjectData((p) => ({
        ...p,
        watermark: normalizeWatermarkEffectData({
          ...(p.watermark ?? {}),
          ...updates,
          containerStyle: {
            ...(p.watermark?.containerStyle ?? {}),
            ...(updates.containerStyle ?? {}),
            background: {
              ...(p.watermark?.containerStyle?.background ?? {}),
              ...(updates.containerStyle?.background ?? {}),
            },
          },
          textStyle: {
            ...(p.watermark?.textStyle ?? {}),
            ...(updates.textStyle ?? {}),
            textShadow: {
              ...(p.watermark?.textStyle?.textShadow ?? {}),
              ...(updates.textStyle?.textShadow ?? {}),
            },
            textOutline: {
              ...(p.watermark?.textStyle?.textOutline ?? {}),
              ...(updates.textStyle?.textOutline ?? {}),
            },
            textUnderline: {
              ...(p.watermark?.textStyle?.textUnderline ?? {}),
              ...(updates.textStyle?.textUnderline ?? {}),
            },
          },
          animations: {
            ...(p.watermark?.animations ?? {}),
            ...(updates.animations ?? {}),
            entry: {
              ...(p.watermark?.animations?.entry ?? {}),
              ...(updates.animations?.entry ?? {}),
            },
            exit: {
              ...(p.watermark?.animations?.exit ?? {}),
              ...(updates.animations?.exit ?? {}),
            },
            continuous: {
              ...(p.watermark?.animations?.continuous ?? {}),
              ...(updates.animations?.continuous ?? {}),
            },
          },
        }),
      }))
    },
    [updateProjectData]
  )

  if (!project) return null

  const showUpgradeOverlay = gate.customizationLocked

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-xl border border-glass-border bg-white/50 dark:bg-black/20 backdrop-blur-xl p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground/80 leading-relaxed font-medium">
              Watermark settings are saved with your project.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground/80">Enabled</span>
            <Switch
              checked={watermark.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              disabled={gate.toggleDisabled}
            />
          </div>
        </div>
      </div>

      <div className="relative">
        <div className={cn(showUpgradeOverlay && 'pointer-events-none select-none blur-[2px] opacity-60')}>
          {/* Layout */}
          <div className="rounded-xl border border-glass-border bg-white/40 dark:bg-black/20 backdrop-blur-md p-4 shadow-sm transition-all hover:bg-white/50 dark:hover:bg-black/30">
            <div className="flex items-center gap-2 mb-4">
              <div className="text-xs font-semibold text-foreground/80">Layout</div>
              <InfoTooltip content="Choose whether the watermark is horizontal or stacked, and whether text/icon comes first." />
            </div>
            {(() => {
              const state = decodeLayout(watermark.layout)
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <LayoutButton
                      label="Horizontal"
                      selected={state.orientation === 'horizontal'}
                      onClick={() => patch({ layout: encodeLayout({ ...state, orientation: 'horizontal' }) })}
                    />
                    <LayoutButton
                      label="Stacked"
                      selected={state.orientation === 'stacked'}
                      onClick={() => patch({ layout: encodeLayout({ ...state, orientation: 'stacked' }) })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <LayoutButton
                      label="Text first"
                      selected={state.order === 'text-first'}
                      onClick={() => patch({ layout: encodeLayout({ ...state, order: 'text-first' }) })}
                    />
                    <LayoutButton
                      label="Icon first"
                      selected={state.order === 'icon-first'}
                      onClick={() => patch({ layout: encodeLayout({ ...state, order: 'icon-first' }) })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Show Icon</label>
                      </div>
                      <Switch
                        checked={state.showIcon}
                        onCheckedChange={(v) => patch({ layout: encodeLayout({ ...state, showIcon: v }) })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Show Text</label>
                      </div>
                      <Switch
                        checked={state.showText}
                        onCheckedChange={(v) => patch({ layout: encodeLayout({ ...state, showText: v }) })}
                      />
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Content */}
          <div className="rounded-xl border border-glass-border bg-white/40 dark:bg-black/20 backdrop-blur-md p-4 space-y-4 shadow-sm transition-all hover:bg-white/50 dark:hover:bg-black/30">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-foreground/80">Content</div>
              <InfoTooltip content="Customize the watermark text and pick an icon from your media library." />
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Text</label>
                <Input
                  value={watermark.text}
                  onChange={(e) => patch({ text: e.target.value })}
                  placeholder="Watermark text"
                  className="h-9 bg-overlay-hover border-transparent focus:border-primary/20 focus:bg-background transition-colors"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="text-xs font-medium text-muted-foreground">Icon</div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIconPickerOpen(true)}
                  className="bg-overlay-hover border-transparent hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground text-xs h-8 px-3"
                >
                  Choose Image
                </Button>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="rounded-xl border border-glass-border bg-white/40 dark:bg-black/20 backdrop-blur-md p-4 space-y-5 shadow-sm transition-all hover:bg-white/50 dark:hover:bg-black/30">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-foreground/80">Appearance</div>
              <InfoTooltip content="Adjust opacity and logo size. Position is draggable in the preview (when available)." />
            </div>

            <div className="group space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground transition-colors duration-150 group-hover:text-foreground">Opacity</label>
                <span className="text-xs font-mono tabular-nums text-muted-foreground/70 transition-colors duration-150 group-hover:text-foreground/80">{Math.round(watermark.opacity * 100)}%</span>
              </div>
              <Slider
                value={[watermark.opacity]}
                onValueChange={([v]) => patch({ opacity: v })}
                min={0.3}
                max={1}
                step={0.01}
              />
            </div>

            <div className="group space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground transition-colors duration-150 group-hover:text-foreground">Icon Size</label>
                <span className="text-xs font-mono tabular-nums text-muted-foreground/70 transition-colors duration-150 group-hover:text-foreground/80">{watermark.iconSize.toFixed(0)}%</span>
              </div>
              <Slider
                value={[watermark.iconSize]}
                onValueChange={([v]) => patch({ iconSize: v })}
                min={5}
                max={20}
                step={1}
              />
            </div>
          </div>

          {/* Quick controls that remain available */}
          <div className="rounded-xl border border-glass-border bg-white/40 dark:bg-black/20 backdrop-blur-md p-4 space-y-4 shadow-sm transition-all hover:bg-white/50 dark:hover:bg-black/30">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-foreground/80">Visibility</div>
              <InfoTooltip content="Helps the watermark stay readable on bright backgrounds." />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <label className="text-xs font-medium text-muted-foreground">Background Chip</label>
                <InfoTooltip content="Adds a subtle translucent backing behind the watermark." />
              </div>
              <Switch
                checked={watermark.containerStyle?.background?.enabled ?? false}
                onCheckedChange={(v) => patch({ containerStyle: { background: { enabled: v } } })}
              />
            </div>
            {showUpgradeOverlay ? (
              <div className="font-display text-2xs italic text-muted-foreground/60 leading-snug">
                More customization coming soon
              </div>
            ) : null}
          </div>

          <AccordionSection title="Text Styling" defaultOpen={false} className="bg-background/50">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Font</label>
                  <Select
                    value={watermark.textStyle.fontFamily}
                    onValueChange={(v) => patch({ textStyle: { fontFamily: v } })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Font" />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_FAMILY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Weight</label>
                  <Select
                    value={String(watermark.textStyle.fontWeight)}
                    onValueChange={(v) => patch({ textStyle: { fontWeight: Number(v) } })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Weight" />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_WEIGHT_OPTIONS.map((opt) => (
                        <SelectItem key={String(opt.value)} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Shadow</label>
                  <Switch
                    checked={watermark.textStyle.textShadow?.enabled ?? false}
                    onCheckedChange={(v) => patch({ textStyle: { textShadow: { ...(watermark.textStyle.textShadow ?? {}), enabled: v } } })}
                  />
                </div>

                {(watermark.textStyle.textShadow?.enabled ?? false) ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="group space-y-1.5">
                      <label className="text-xs text-muted-foreground transition-colors duration-150 group-hover:text-foreground">Blur</label>
                      <Slider
                        value={[watermark.textStyle.textShadow?.blur ?? 0]}
                        onValueChange={([v]) =>
                          patch({ textStyle: { textShadow: { ...(watermark.textStyle.textShadow ?? {}), blur: v } } })
                        }
                        min={0}
                        max={20}
                        step={1}
                      />
                    </div>
                    <div className="group space-y-1.5">
                      <label className="text-xs text-muted-foreground transition-colors duration-150 group-hover:text-foreground">Y Offset</label>
                      <Slider
                        value={[watermark.textStyle.textShadow?.offsetY ?? 0]}
                        onValueChange={([v]) =>
                          patch({ textStyle: { textShadow: { ...(watermark.textStyle.textShadow ?? {}), offsetY: v } } })
                        }
                        min={-10}
                        max={10}
                        step={1}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Outline</label>
                  <Switch
                    checked={watermark.textStyle.textOutline?.enabled ?? false}
                    onCheckedChange={(v) => patch({ textStyle: { textOutline: { ...(watermark.textStyle.textOutline ?? {}), enabled: v } } })}
                  />
                </div>

                {(watermark.textStyle.textOutline?.enabled ?? false) ? (
                  <div className="group space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground transition-colors duration-150 group-hover:text-foreground">Width</label>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground/70 transition-colors duration-150 group-hover:text-foreground/80">
                        {(watermark.textStyle.textOutline?.width ?? 0).toFixed(0)}px
                      </span>
                    </div>
                    <Slider
                      value={[watermark.textStyle.textOutline?.width ?? 0]}
                      onValueChange={([v]) =>
                        patch({ textStyle: { textOutline: { ...(watermark.textStyle.textOutline ?? {}), width: v } } })
                      }
                      min={0}
                      max={8}
                      step={1}
                    />
                  </div>
                ) : null}

                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Underline</label>
                  <Switch
                    checked={watermark.textStyle.textUnderline?.enabled ?? false}
                    onCheckedChange={(v) =>
                      patch({ textStyle: { textUnderline: { ...(watermark.textStyle.textUnderline ?? {}), enabled: v } } })
                    }
                  />
                </div>

                {(watermark.textStyle.textUnderline?.enabled ?? false) ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="group space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground transition-colors duration-150 group-hover:text-foreground">Thickness</label>
                        <span className="text-xs font-mono tabular-nums text-muted-foreground/70 transition-colors duration-150 group-hover:text-foreground/80">
                          {(watermark.textStyle.textUnderline?.thickness ?? 0).toFixed(0)}px
                        </span>
                      </div>
                      <Slider
                        value={[watermark.textStyle.textUnderline?.thickness ?? 0]}
                        onValueChange={([v]) =>
                          patch({
                            textStyle: { textUnderline: { ...(watermark.textStyle.textUnderline ?? {}), thickness: v } },
                          })
                        }
                        min={1}
                        max={8}
                        step={1}
                      />
                    </div>

                    <div className="group space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground transition-colors duration-150 group-hover:text-foreground">Offset</label>
                        <span className="text-xs font-mono tabular-nums text-muted-foreground/70 transition-colors duration-150 group-hover:text-foreground/80">
                          {(watermark.textStyle.textUnderline?.offset ?? 0).toFixed(0)}px
                        </span>
                      </div>
                      <Slider
                        value={[watermark.textStyle.textUnderline?.offset ?? 0]}
                        onValueChange={([v]) =>
                          patch({
                            textStyle: { textUnderline: { ...(watermark.textStyle.textUnderline ?? {}), offset: v } },
                          })
                        }
                        min={0}
                        max={12}
                        step={1}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </AccordionSection>

          <AccordionSection title="Animation" defaultOpen={false} className="bg-background/50">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Entry</label>
                  <Select
                    value={watermark.animations.entry.type}
                    onValueChange={(v) => patch({ animations: { entry: { type: v as WatermarkAnimationType } } })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Entry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WatermarkAnimationType.None}>None</SelectItem>
                      <SelectItem value={WatermarkAnimationType.Fade}>Fade</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Exit</label>
                  <Select
                    value={watermark.animations.exit.type}
                    onValueChange={(v) => patch({ animations: { exit: { type: v as WatermarkAnimationType } } })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Exit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WatermarkAnimationType.None}>None</SelectItem>
                      <SelectItem value={WatermarkAnimationType.Fade}>Fade</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Continuous</label>
                <Select
                  value={watermark.animations.continuous.type}
                  onValueChange={(v) => patch({ animations: { continuous: { type: v as WatermarkPulseAnimation } } })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Continuous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={WatermarkPulseAnimation.None}>None</SelectItem>
                    <SelectItem value={WatermarkPulseAnimation.Breathe}>Breathe</SelectItem>
                    <SelectItem value={WatermarkPulseAnimation.Pulse}>Pulse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </AccordionSection>
        </div>

        {showUpgradeOverlay ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-background/40 backdrop-blur-lg" />
            <div className="relative z-10 max-w-[240px] text-center px-6 py-5">
              <div className="font-display text-base italic text-foreground/80">
                Custom watermarks
              </div>
              <div className="mt-2 text-2xs text-muted-foreground/70 leading-relaxed">
                Change text, logo, layout, styling, and animations or remove it entirely.
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <WatermarkIconPicker
        open={iconPickerOpen}
        onOpenChange={setIconPickerOpen}
        value={watermark.iconPath}
        onChange={(path) => {
          patch({ iconPath: path })
          setIconPickerOpen(false)
        }}
      />
    </div>
  )
}
