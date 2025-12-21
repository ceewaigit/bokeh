'use client'

import React, { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { ClickEffectAnimation, ClickEffectStyle, ClickTextAnimation, ClickTextMode, CursorEffectData, Effect } from '@/types/project'
import { EffectType } from '@/types'
import { DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects'
import { InfoTooltip } from './info-tooltip'

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

  const [size, setSize] = useState(cursorData?.size ?? DEFAULT_CURSOR_DATA.size)
  const [idleTimeoutSec, setIdleTimeoutSec] = useState((cursorData?.idleTimeout ?? DEFAULT_CURSOR_DATA.idleTimeout) / 1000)
  const [speed, setSpeed] = useState(cursorData?.speed ?? DEFAULT_CURSOR_DATA.speed)
  const [smoothness, setSmoothness] = useState(cursorData?.smoothness ?? DEFAULT_CURSOR_DATA.smoothness)
  const [glide, setGlide] = useState(cursorData?.glide ?? DEFAULT_CURSOR_DATA.glide ?? 0.75)
  const [tiltMaxDeg, setTiltMaxDeg] = useState(cursorData?.directionalTiltMaxDeg ?? DEFAULT_CURSOR_DATA.directionalTiltMaxDeg ?? 6)
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

  useEffect(() => {
    setSize(cursorData?.size ?? DEFAULT_CURSOR_DATA.size)
  }, [cursorData?.size])

  useEffect(() => {
    setIdleTimeoutSec((cursorData?.idleTimeout ?? DEFAULT_CURSOR_DATA.idleTimeout) / 1000)
  }, [cursorData?.idleTimeout])

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
    setTiltMaxDeg(cursorData?.directionalTiltMaxDeg ?? DEFAULT_CURSOR_DATA.directionalTiltMaxDeg ?? 6)
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
              Show and customize the cursor overlay.
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
                <InfoTooltip content="Changes the size of the cursor." />
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
              {/* Speed slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label className="text-xs font-medium text-muted-foreground">Responsiveness</label>
                    <InfoTooltip content="Adjusts how much the cursor moves." />
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{speed.toFixed(2)}</span>
                </div>
                <Slider
                  value={[speed]}
                  onValueChange={([value]) => setSpeed(value)}
                  onValueCommit={([value]) => onUpdateCursor({ speed: value })}
                  min={0.01}
                  max={1}
                  step={0.01}
                  className="w-full"
                />
              </div>

              {/* Smoothness slider */}
              <div className="border-t border-border/30 pt-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Smoothness</label>
                  <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{smoothness.toFixed(2)}</span>
                </div>
                <Slider
                  value={[smoothness]}
                  onValueChange={([value]) => setSmoothness(value)}
                  onValueCommit={([value]) => onUpdateCursor({ smoothness: value })}
                  min={0.1}
                  max={1}
                  step={0.05}
                  className="w-full"
                />
              </div>

              {/* Glide slider */}
              <div className="border-t border-border/30 pt-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label className="text-xs font-medium text-muted-foreground">Glide</label>
                    <InfoTooltip content="Adds a slight delay to the cursor for a smoother feel." />
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{glide.toFixed(2)}</span>
                </div>
                <Slider
                  value={[glide]}
                  onValueChange={([value]) => setGlide(value)}
                  onValueCommit={([value]) => onUpdateCursor({ glide: value })}
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-full"
                />
              </div>

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
                  <InfoTooltip content="Interpolates mouse movement for smoother cursor motion." />
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
                  <InfoTooltip content="Adds blur to fast cursor movements." />
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
                    <InfoTooltip content="How much the cursor tilts opposite its movement (0° disables)." />
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
                    <InfoTooltip content="Hides the cursor when it's not moving." />
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
                          <InfoTooltip content="How long to wait before hiding the cursor." />
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
                        <InfoTooltip content="Fades the cursor instead of instantly hiding/showing it." />
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
        </div>
      )}
    </div>
  )
}
