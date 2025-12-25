'use client'

import React, { useEffect, useState } from 'react'
import { ChevronRight, RotateCcw, Plus, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { ClickEffectAnimation, ClickEffectStyle, ClickTextAnimation, ClickTextMode, CursorEffectData, CursorMotionPreset, Effect } from '@/types/project'
import { EffectType } from '@/types'
import { CURSOR_MOTION_PRESETS, DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects'
import { InfoTooltip } from './info-tooltip'
import { useProjectStore } from '@/stores/project-store'

interface CursorTabProps {
  cursorEffect: Effect | undefined
  onUpdateCursor: (updates: any) => void
  onEffectChange: (type: EffectType, data: any) => void
}

export function CursorTab({ cursorEffect, onUpdateCursor, onEffectChange }: CursorTabProps) {
  const cursorData = cursorEffect?.data as CursorEffectData | undefined
  const hideOnIdle = cursorData?.hideOnIdle ?? DEFAULT_CURSOR_DATA.hideOnIdle
  const fadeOnIdle = cursorData?.fadeOnIdle ?? DEFAULT_CURSOR_DATA.fadeOnIdle
  const clickEffectsEnabled = cursorData?.clickEffects ?? DEFAULT_CURSOR_DATA.clickEffects
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showFineTune, setShowFineTune] = useState(false)

  const [size, setSize] = useState(cursorData?.size ?? DEFAULT_CURSOR_DATA.size)
  const [motionPreset, setMotionPreset] = useState<CursorMotionPreset>(cursorData?.motionPreset ?? DEFAULT_CURSOR_DATA.motionPreset ?? 'cinematic')
  const [idleTimeoutSec, setIdleTimeoutSec] = useState((cursorData?.idleTimeout ?? DEFAULT_CURSOR_DATA.idleTimeout) / 1000)
  const [speed, setSpeed] = useState(cursorData?.speed ?? DEFAULT_CURSOR_DATA.speed)
  const [smoothness, setSmoothness] = useState(cursorData?.smoothness ?? DEFAULT_CURSOR_DATA.smoothness)
  const [glide, setGlide] = useState(cursorData?.glide ?? DEFAULT_CURSOR_DATA.glide ?? 0.75)
  const [tiltMaxDeg, setTiltMaxDeg] = useState(cursorData?.directionalTiltMaxDeg ?? DEFAULT_CURSOR_DATA.directionalTiltMaxDeg ?? 10)
  const [clickStyle, setClickStyle] = useState<ClickEffectStyle>(cursorData?.clickEffectStyle ?? DEFAULT_CURSOR_DATA.clickEffectStyle ?? 'ripple')
  const [clickAnimation, setClickAnimation] = useState<ClickEffectAnimation>(cursorData?.clickEffectAnimation ?? DEFAULT_CURSOR_DATA.clickEffectAnimation ?? 'expand')
  const [clickDurationMs, setClickDurationMs] = useState(cursorData?.clickEffectDurationMs ?? DEFAULT_CURSOR_DATA.clickEffectDurationMs ?? 300)
  const [clickRadius, setClickRadius] = useState(cursorData?.clickEffectMaxRadius ?? DEFAULT_CURSOR_DATA.clickEffectMaxRadius ?? 50)
  const [clickLineWidth, setClickLineWidth] = useState(cursorData?.clickEffectLineWidth ?? DEFAULT_CURSOR_DATA.clickEffectLineWidth ?? 2)
  const [clickColor, setClickColor] = useState(cursorData?.clickEffectColor ?? DEFAULT_CURSOR_DATA.clickEffectColor ?? '#ffffff')
  const [clickWordsInput, setClickWordsInput] = useState((cursorData?.clickTextWords ?? DEFAULT_CURSOR_DATA.clickTextWords ?? ['click!']).join(', '))
  const [clickTextMode, setClickTextMode] = useState<ClickTextMode>(cursorData?.clickTextMode ?? DEFAULT_CURSOR_DATA.clickTextMode ?? 'random')
  const [clickTextAnimation, setClickTextAnimation] = useState<ClickTextAnimation>(cursorData?.clickTextAnimation ?? DEFAULT_CURSOR_DATA.clickTextAnimation ?? 'float')
  const [clickTextSize, setClickTextSize] = useState(cursorData?.clickTextSize ?? DEFAULT_CURSOR_DATA.clickTextSize ?? 16)
  const [clickTextColor, setClickTextColor] = useState(cursorData?.clickTextColor ?? DEFAULT_CURSOR_DATA.clickTextColor ?? '#ffffff')
  const [clickTextOffsetY, setClickTextOffsetY] = useState(cursorData?.clickTextOffsetY ?? DEFAULT_CURSOR_DATA.clickTextOffsetY ?? -12)
  const [clickTextRise, setClickTextRise] = useState(cursorData?.clickTextRise ?? DEFAULT_CURSOR_DATA.clickTextRise ?? 24)
  const [returnDuration, setReturnDuration] = useState(1.0)

  useEffect(() => {
    setSize(cursorData?.size ?? DEFAULT_CURSOR_DATA.size)
  }, [cursorData?.size])

  useEffect(() => {
    setIdleTimeoutSec((cursorData?.idleTimeout ?? DEFAULT_CURSOR_DATA.idleTimeout) / 1000)
  }, [cursorData?.idleTimeout])

  useEffect(() => {
    setMotionPreset(cursorData?.motionPreset ?? DEFAULT_CURSOR_DATA.motionPreset ?? 'cinematic')
  }, [cursorData?.motionPreset])

  useEffect(() => {
    setSpeed(cursorData?.speed ?? DEFAULT_CURSOR_DATA.speed)
  }, [cursorData?.speed])

  useEffect(() => {
    setSmoothness(cursorData?.smoothness ?? DEFAULT_CURSOR_DATA.smoothness)
  }, [cursorData?.smoothness])

  useEffect(() => {
    setGlide(cursorData?.glide ?? DEFAULT_CURSOR_DATA.glide ?? 0.75)
  }, [cursorData?.glide])

  useEffect(() => {
    setTiltMaxDeg(cursorData?.directionalTiltMaxDeg ?? DEFAULT_CURSOR_DATA.directionalTiltMaxDeg ?? 10)
  }, [cursorData?.directionalTiltMaxDeg])

  useEffect(() => {
    setClickStyle(cursorData?.clickEffectStyle ?? DEFAULT_CURSOR_DATA.clickEffectStyle ?? 'ripple')
  }, [cursorData?.clickEffectStyle])

  useEffect(() => {
    setClickAnimation(cursorData?.clickEffectAnimation ?? DEFAULT_CURSOR_DATA.clickEffectAnimation ?? 'expand')
  }, [cursorData?.clickEffectAnimation])

  useEffect(() => {
    setClickDurationMs(cursorData?.clickEffectDurationMs ?? DEFAULT_CURSOR_DATA.clickEffectDurationMs ?? 300)
  }, [cursorData?.clickEffectDurationMs])

  useEffect(() => {
    setClickRadius(cursorData?.clickEffectMaxRadius ?? DEFAULT_CURSOR_DATA.clickEffectMaxRadius ?? 50)
  }, [cursorData?.clickEffectMaxRadius])

  useEffect(() => {
    setClickLineWidth(cursorData?.clickEffectLineWidth ?? DEFAULT_CURSOR_DATA.clickEffectLineWidth ?? 2)
  }, [cursorData?.clickEffectLineWidth])

  useEffect(() => {
    setClickColor(cursorData?.clickEffectColor ?? DEFAULT_CURSOR_DATA.clickEffectColor ?? '#ffffff')
  }, [cursorData?.clickEffectColor])

  useEffect(() => {
    setClickWordsInput((cursorData?.clickTextWords ?? DEFAULT_CURSOR_DATA.clickTextWords ?? ['click!']).join(', '))
  }, [cursorData?.clickTextWords])

  useEffect(() => {
    setClickTextMode(cursorData?.clickTextMode ?? DEFAULT_CURSOR_DATA.clickTextMode ?? 'random')
  }, [cursorData?.clickTextMode])

  useEffect(() => {
    setClickTextAnimation(cursorData?.clickTextAnimation ?? DEFAULT_CURSOR_DATA.clickTextAnimation ?? 'float')
  }, [cursorData?.clickTextAnimation])

  useEffect(() => {
    setClickTextSize(cursorData?.clickTextSize ?? DEFAULT_CURSOR_DATA.clickTextSize ?? 16)
  }, [cursorData?.clickTextSize])

  useEffect(() => {
    setClickTextColor(cursorData?.clickTextColor ?? DEFAULT_CURSOR_DATA.clickTextColor ?? '#ffffff')
  }, [cursorData?.clickTextColor])

  useEffect(() => {
    setClickTextOffsetY(cursorData?.clickTextOffsetY ?? DEFAULT_CURSOR_DATA.clickTextOffsetY ?? -12)
  }, [cursorData?.clickTextOffsetY])

  useEffect(() => {
    setClickTextRise(cursorData?.clickTextRise ?? DEFAULT_CURSOR_DATA.clickTextRise ?? 24)
  }, [cursorData?.clickTextRise])

  const parseClickWords = (input: string) => {
    return input
      .split(',')
      .map((word) => word.trim())
      .filter((word) => word.length > 0)
  }

  const showTextControls = clickStyle === 'text' || clickStyle === 'ripple-text'
  const showRingControls = clickStyle === 'ripple' || clickStyle === 'ripple-text'

  return (
    <div className="space-y-3">
      {/* Master cursor visibility toggle */}
      <div className="p-3 bg-background/40 rounded-lg">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium leading-none">Cursor</div>
            <div className="mt-1 text-[10px] text-muted-foreground leading-snug">
              Display and style the cursor
            </div>
          </div>
          <Switch
            aria-label="Show cursor"
            checked={cursorEffect?.enabled ?? false}
            onCheckedChange={(checked) => {
              if (cursorEffect) {
                onEffectChange(EffectType.Cursor, { ...cursorData, enabled: checked })
              } else {
                onEffectChange(EffectType.Cursor, {
                  ...DEFAULT_CURSOR_DATA,
                  enabled: checked
                })
              }
            }}
          />
        </div>
      </div>

      {/* Only show cursor settings when enabled */}
      {cursorEffect?.enabled && (
        <div className="space-y-2">
          <div className="p-3 bg-background/40 rounded-lg space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <label className="text-xs font-medium text-muted-foreground">Size</label>
                <InfoTooltip content="Cursor size multiplier" />
              </div>
              <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{size.toFixed(1)}x</span>
            </div>
            <Slider
              value={[size]}
              onValueChange={([value]) => setSize(value)}
              onValueCommit={([value]) => onUpdateCursor({ size: value })}
              min={0.5}
              max={8}
              step={0.1}
              className="w-full"
            />
          </div>



          {/* Advanced Section */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-background/30 hover:bg-background/50 rounded-lg transition-colors"
          >
            <span>Advanced</span>
            <ChevronRight className={cn("w-3 h-3 transition-transform duration-200", showAdvanced && "rotate-90")} />
          </button>

          {showAdvanced && (
            <div className="p-3 bg-background/40 rounded-lg space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
              {/* Motion Style Preset */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <label className="text-xs font-medium text-muted-foreground">Motion Style</label>
                  <InfoTooltip content="How the cursor moves and animates" />
                </div>
                <Select
                  value={motionPreset}
                  onValueChange={(value) => {
                    const preset = value as CursorMotionPreset
                    setMotionPreset(preset)
                    if (preset !== 'custom') {
                      const presetValues = CURSOR_MOTION_PRESETS[preset]
                      setSpeed(presetValues.speed)
                      setSmoothness(presetValues.smoothness)
                      setGlide(presetValues.glide)
                      onUpdateCursor({
                        motionPreset: preset,
                        speed: presetValues.speed,
                        smoothness: presetValues.smoothness,
                        glide: presetValues.glide
                      })
                    } else {
                      onUpdateCursor({ motionPreset: preset })
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cinematic">Cinematic</SelectItem>
                    <SelectItem value="smooth">Smooth</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="responsive">Responsive</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fine-tune Section */}
              <button
                onClick={() => setShowFineTune(!showFineTune)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-medium text-muted-foreground/70 hover:text-muted-foreground bg-background/20 hover:bg-background/30 rounded transition-colors"
              >
                <span>Fine-tune</span>
                <ChevronRight className={cn("w-2.5 h-2.5 transition-transform duration-200", showFineTune && "rotate-90")} />
              </button>

              {showFineTune && (
                <div className="pl-2 space-y-2.5 border-l-2 border-border/30 animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* Speed/Responsiveness slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-medium text-muted-foreground/80">Responsiveness</label>
                      <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">{speed.toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[speed]}
                      onValueChange={([value]) => setSpeed(value)}
                      onValueCommit={([value]) => {
                        setMotionPreset('custom')
                        onUpdateCursor({ speed: value, motionPreset: 'custom' })
                      }}
                      min={0.01}
                      max={1}
                      step={0.01}
                      className="w-full"
                    />
                  </div>

                  {/* Smoothness slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-medium text-muted-foreground/80">Smoothness</label>
                      <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">{smoothness.toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[smoothness]}
                      onValueChange={([value]) => setSmoothness(value)}
                      onValueCommit={([value]) => {
                        setMotionPreset('custom')
                        onUpdateCursor({ smoothness: value, motionPreset: 'custom' })
                      }}
                      min={0.1}
                      max={1}
                      step={0.05}
                      className="w-full"
                    />
                  </div>

                  {/* Glide slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-medium text-muted-foreground/80">Glide</label>
                      <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">{glide.toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[glide]}
                      onValueChange={([value]) => setGlide(value)}
                      onValueCommit={([value]) => {
                        setMotionPreset('custom')
                        onUpdateCursor({ glide: value, motionPreset: 'custom' })
                      }}
                      min={0}
                      max={1}
                      step={0.05}
                      className="w-full"
                    />
                  </div>
                </div>
              )}

              {/* Click Animation */}
              <div className="border-t border-border/30 pt-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="text-xs leading-none">Click Animation</div>
                    <InfoTooltip content="Shows an animation when you click." />
                  </div>
                  <Switch
                    className="scale-90 origin-right"
                    checked={clickEffectsEnabled}
                    onCheckedChange={(checked) => onUpdateCursor({ clickEffects: checked })}
                  />
                </div>

                {clickEffectsEnabled && (
                  <div className="pl-2 space-y-2 border-l-2 border-border/30">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-medium text-muted-foreground">Style</div>
                        <Select
                          value={clickStyle}
                          onValueChange={(value) => {
                            const next = value as ClickEffectStyle
                            setClickStyle(next)
                            onUpdateCursor({ clickEffectStyle: next })
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Minimal</SelectItem>
                            <SelectItem value="ripple">Ripple</SelectItem>
                            <SelectItem value="ripple-text">Ripple + Text</SelectItem>
                            <SelectItem value="text">Text Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {showRingControls && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-medium text-muted-foreground">Animation</div>
                          <Select
                            value={clickAnimation}
                            onValueChange={(value) => {
                              const next = value as ClickEffectAnimation
                              setClickAnimation(next)
                              onUpdateCursor({ clickEffectAnimation: next })
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="expand">Expand</SelectItem>
                              <SelectItem value="pulse">Pulse</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-medium text-muted-foreground">Duration</div>
                          <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{clickDurationMs}ms</span>
                        </div>
                        <Slider
                          value={[clickDurationMs]}
                          onValueChange={([value]) => setClickDurationMs(value)}
                          onValueCommit={([value]) => onUpdateCursor({ clickEffectDurationMs: value })}
                          min={100}
                          max={1000}
                          step={20}
                        />
                      </div>

                      {showRingControls && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-medium text-muted-foreground">Radius</div>
                            <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{clickRadius}px</span>
                          </div>
                          <Slider
                            value={[clickRadius]}
                            onValueChange={([value]) => setClickRadius(value)}
                            onValueCommit={([value]) => onUpdateCursor({ clickEffectMaxRadius: value })}
                            min={10}
                            max={120}
                            step={2}
                          />
                        </div>
                      )}
                    </div>

                    {showRingControls && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-medium text-muted-foreground">Line Width</div>
                            <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{clickLineWidth}px</span>
                          </div>
                          <Slider
                            value={[clickLineWidth]}
                            onValueChange={([value]) => setClickLineWidth(value)}
                            onValueCommit={([value]) => onUpdateCursor({ clickEffectLineWidth: value })}
                            min={1}
                            max={8}
                            step={1}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-[10px] font-medium text-muted-foreground">Ring Color</div>
                          <input
                            type="color"
                            value={clickColor}
                            onChange={(e) => {
                              setClickColor(e.target.value)
                              onUpdateCursor({ clickEffectColor: e.target.value })
                            }}
                            className="h-8 w-full rounded border border-border/40 bg-background/60"
                          />
                        </div>
                      </div>
                    )}

                    {showTextControls && (
                      <>
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-medium text-muted-foreground">Words (comma-separated)</div>
                          <input
                            value={clickWordsInput}
                            onChange={(e) => setClickWordsInput(e.target.value)}
                            onBlur={() => onUpdateCursor({ clickTextWords: parseClickWords(clickWordsInput) })}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.currentTarget.blur()
                              }
                            }}
                            className="w-full h-8 px-2 rounded border border-border/40 bg-background/60 text-xs"
                            placeholder="click!, tap!, wow!"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <div className="text-[10px] font-medium text-muted-foreground">Word Mode</div>
                            <Select
                              value={clickTextMode}
                              onValueChange={(value) => {
                                const next = value as ClickTextMode
                                setClickTextMode(next)
                                onUpdateCursor({ clickTextMode: next })
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="random">Random</SelectItem>
                                <SelectItem value="sequence">Sequence</SelectItem>
                                <SelectItem value="single">Single</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[10px] font-medium text-muted-foreground">Text Animation</div>
                            <Select
                              value={clickTextAnimation}
                              onValueChange={(value) => {
                                const next = value as ClickTextAnimation
                                setClickTextAnimation(next)
                                onUpdateCursor({ clickTextAnimation: next })
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="float">Float</SelectItem>
                                <SelectItem value="pop">Pop</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] font-medium text-muted-foreground">Text Size</div>
                              <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{clickTextSize}px</span>
                            </div>
                            <Slider
                              value={[clickTextSize]}
                              onValueChange={([value]) => setClickTextSize(value)}
                              onValueCommit={([value]) => onUpdateCursor({ clickTextSize: value })}
                              min={8}
                              max={48}
                              step={1}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[10px] font-medium text-muted-foreground">Text Color</div>
                            <input
                              type="color"
                              value={clickTextColor}
                              onChange={(e) => {
                                setClickTextColor(e.target.value)
                                onUpdateCursor({ clickTextColor: e.target.value })
                              }}
                              className="h-8 w-full rounded border border-border/40 bg-background/60"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] font-medium text-muted-foreground">Text Offset</div>
                              <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{clickTextOffsetY}px</span>
                            </div>
                            <Slider
                              value={[clickTextOffsetY]}
                              onValueChange={([value]) => setClickTextOffsetY(value)}
                              onValueCommit={([value]) => onUpdateCursor({ clickTextOffsetY: value })}
                              min={-80}
                              max={80}
                              step={2}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] font-medium text-muted-foreground">Text Rise</div>
                              <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{clickTextRise}px</span>
                            </div>
                            <Slider
                              value={[clickTextRise]}
                              onValueChange={([value]) => setClickTextRise(value)}
                              onValueCommit={([value]) => onUpdateCursor({ clickTextRise: value })}
                              min={0}
                              max={120}
                              step={2}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Smooth Movement */}
              <div className="border-t border-border/30 pt-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="text-xs leading-none">Smooth Movement</div>
                  <InfoTooltip content="Smooths out jerky cursor movements" />
                </div>
                <Switch
                  className="scale-90 origin-right"
                  checked={cursorData?.gliding ?? DEFAULT_CURSOR_DATA.gliding}
                  onCheckedChange={(checked) => onUpdateCursor({ gliding: checked })}
                />
              </div>

              {/* Motion Blur */}
              <div className="border-t border-border/30 pt-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="text-xs leading-none">Motion Blur</div>
                  <InfoTooltip content="Blur trail on fast movements" />
                </div>
                <Switch
                  className="scale-90 origin-right"
                  checked={cursorData?.motionBlur ?? DEFAULT_CURSOR_DATA.motionBlur}
                  onCheckedChange={(checked) => onUpdateCursor({ motionBlur: checked })}
                />
              </div>

              {/* Directional Tilt */}
              <div className="border-t border-border/30 pt-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="text-xs leading-none">Directional Tilt</div>
                    <InfoTooltip content="Tilt cursor in movement direction" />
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{tiltMaxDeg.toFixed(0)}°</span>
                </div>
                <Slider
                  value={[tiltMaxDeg]}
                  onValueChange={([value]) => setTiltMaxDeg(value)}
                  onValueCommit={([value]) => onUpdateCursor({ directionalTilt: value > 0, directionalTiltMaxDeg: value })}
                  min={0}
                  max={25}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Hide When Idle */}
              <div className="border-t border-border/30 pt-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="text-xs leading-none">Hide When Idle</div>
                    <InfoTooltip content="Auto-hide idle cursor" />
                  </div>
                  <Switch
                    className="scale-90 origin-right"
                    checked={cursorData?.hideOnIdle ?? DEFAULT_CURSOR_DATA.hideOnIdle}
                    onCheckedChange={(checked) => onUpdateCursor({ hideOnIdle: checked })}
                  />
                </div>

                {hideOnIdle && (
                  <div className="pl-2 space-y-2 border-l-2 border-border/30">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <label className="text-xs font-medium text-muted-foreground">Timeout</label>
                          <InfoTooltip content="Seconds until cursor hides" />
                        </div>
                        <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">
                          {idleTimeoutSec.toFixed(1)}s
                        </span>
                      </div>
                      <Slider
                        value={[idleTimeoutSec]}
                        onValueChange={([value]) => setIdleTimeoutSec(value)}
                        onValueCommit={([value]) => onUpdateCursor({ idleTimeout: value * 1000 })}
                        min={1}
                        max={10}
                        step={0.5}
                        className="w-full"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="text-xs leading-none">Fade In/Out</div>
                        <InfoTooltip content="Fade animation" />
                      </div>
                      <Switch
                        className="scale-90 origin-right"
                        checked={fadeOnIdle}
                        onCheckedChange={(checked) => onUpdateCursor({ fadeOnIdle: checked })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cursor Return Clip Utility */}
          <div className="pt-2 border-t border-border/30 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Utilities</div>
            </div>
            <div className="space-y-2">
              <div className="space-y-1.5">
                <div className="text-[10px] font-medium text-muted-foreground">Duration (seconds)</div>
                <div className="flex items-center justify-between p-2 bg-background/20 rounded-md border border-border/10">
                  <span className="text-xs font-mono tabular-nums text-foreground/80">{returnDuration.toFixed(1)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setReturnDuration(d => Math.max(0.5, d - 0.5))}
                      className="p-1 hover:bg-background/40 rounded-sm transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setReturnDuration(d => Math.min(10.0, d + 0.5))}
                      className="p-1 hover:bg-background/40 rounded-sm transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={() => useProjectStore.getState().addCursorReturnClip({
                  durationMs: returnDuration * 1000
                })}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-all border border-primary/20 active:scale-98"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Add Cursor Return Clip</span>
              </button>
              <div className="text-[10px] text-muted-foreground/50 leading-snug px-2 text-center">
                Animate cursor back to start — great for seamless loops
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
