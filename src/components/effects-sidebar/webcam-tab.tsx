'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { ChevronRight, Video, Circle, Square, RectangleHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { Effect, WebcamEffectData, WebcamShape, WebcamAnchor, WebcamEntryAnimation, WebcamExitAnimation, WebcamPipAnimation } from '@/types/project'
import { EffectType } from '@/types'
import { DEFAULT_WEBCAM_DATA, WEBCAM_POSITION_PRESETS, WEBCAM_SHAPE_PRESETS } from '@/lib/constants/default-effects'
import { InfoTooltip } from './info-tooltip'

interface WebcamTabProps {
  webcamEffect: Effect | undefined
  onUpdateWebcam: (updates: Partial<WebcamEffectData>) => void
  onEffectChange: (type: EffectType, data: WebcamEffectData) => void
}

// Shape preset buttons with icons
const SHAPE_OPTIONS: { id: WebcamShape; label: string; icon: React.ReactNode }[] = [
  { id: 'circle', label: 'Circle', icon: <Circle className="w-4 h-4" /> },
  { id: 'squircle', label: 'Squircle', icon: <div className="w-4 h-4 rounded-lg border-2 border-current" /> },
  { id: 'rounded-rect', label: 'Rounded', icon: <RectangleHorizontal className="w-4 h-4" /> },
  { id: 'rectangle', label: 'Rectangle', icon: <Square className="w-4 h-4" /> },
]

// Position grid options
const POSITION_GRID: WebcamAnchor[] = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
]

export function WebcamTab({ webcamEffect, onUpdateWebcam, onEffectChange }: WebcamTabProps) {
  const webcamData = webcamEffect?.data as WebcamEffectData | undefined

  // Local state for controls
  const [enabled, setEnabled] = useState(webcamEffect?.enabled ?? true)
  const [shape, setShape] = useState<WebcamShape>(webcamData?.shape ?? DEFAULT_WEBCAM_DATA.shape)
  const [size, setSize] = useState(webcamData?.size ?? DEFAULT_WEBCAM_DATA.size)
  const [position, setPosition] = useState(webcamData?.position ?? DEFAULT_WEBCAM_DATA.position)
  const [cornerRadius, setCornerRadius] = useState(webcamData?.cornerRadius ?? DEFAULT_WEBCAM_DATA.cornerRadius)
  const [borderEnabled, setBorderEnabled] = useState(webcamData?.borderEnabled ?? DEFAULT_WEBCAM_DATA.borderEnabled)
  const [borderWidth, setBorderWidth] = useState(webcamData?.borderWidth ?? DEFAULT_WEBCAM_DATA.borderWidth)
  const [borderColor, setBorderColor] = useState(webcamData?.borderColor ?? DEFAULT_WEBCAM_DATA.borderColor)
  const [shadowEnabled, setShadowEnabled] = useState(webcamData?.shadowEnabled ?? DEFAULT_WEBCAM_DATA.shadowEnabled)
  const [shadowBlur, setShadowBlur] = useState(webcamData?.shadowBlur ?? DEFAULT_WEBCAM_DATA.shadowBlur)
  const [entryAnimation, setEntryAnimation] = useState(webcamData?.animations?.entry?.type ?? DEFAULT_WEBCAM_DATA.animations.entry.type)
  const [exitAnimation, setExitAnimation] = useState(webcamData?.animations?.exit?.type ?? DEFAULT_WEBCAM_DATA.animations.exit.type)
  const [pipAnimation, setPipAnimation] = useState(webcamData?.animations?.pip?.type ?? DEFAULT_WEBCAM_DATA.animations.pip.type)
  const [mirror, setMirror] = useState(webcamData?.mirror ?? DEFAULT_WEBCAM_DATA.mirror)
  const [opacity, setOpacity] = useState(webcamData?.opacity ?? DEFAULT_WEBCAM_DATA.opacity)

  const [showAdvanced, setShowAdvanced] = useState(false)

  // Sync from effect data
  useEffect(() => {
    if (webcamData) {
      setShape(webcamData.shape)
      setSize(webcamData.size)
      setPosition(webcamData.position)
      setCornerRadius(webcamData.cornerRadius)
      setBorderEnabled(webcamData.borderEnabled)
      setBorderWidth(webcamData.borderWidth)
      setBorderColor(webcamData.borderColor)
      setShadowEnabled(webcamData.shadowEnabled)
      setShadowBlur(webcamData.shadowBlur)
      setEntryAnimation(webcamData.animations?.entry?.type ?? 'scale')
      setExitAnimation(webcamData.animations?.exit?.type ?? 'fade')
      setPipAnimation(webcamData.animations?.pip?.type ?? 'none')
      setMirror(webcamData.mirror)
      setOpacity(webcamData.opacity)
    }
  }, [webcamData])

  useEffect(() => {
    setEnabled(webcamEffect?.enabled ?? true)
  }, [webcamEffect?.enabled])

  // Update handler
  const handleUpdate = useCallback((updates: Partial<WebcamEffectData>) => {
    const current = webcamData ?? DEFAULT_WEBCAM_DATA
    const merged: WebcamEffectData = { ...current, ...updates }
    onEffectChange(EffectType.Webcam, merged)
  }, [webcamData, onEffectChange])

  // Shape change
  const handleShapeChange = (newShape: WebcamShape) => {
    setShape(newShape)
    const preset = WEBCAM_SHAPE_PRESETS[newShape]
    handleUpdate({ shape: newShape, cornerRadius: preset.cornerRadius })
  }

  // Position grid click
  const handlePositionClick = (anchor: WebcamAnchor) => {
    const preset = WEBCAM_POSITION_PRESETS[anchor]
    setPosition(preset)
    handleUpdate({ position: preset })
  }

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Webcam Overlay</span>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(checked)
            if (webcamEffect) {
              onUpdateWebcam({ ...webcamData } as any) // Just trigger re-render
            }
          }}
        />
      </div>

      {enabled && (
        <>
          {/* Shape Presets */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Shape</label>
            <div className="grid grid-cols-4 gap-1.5">
              {SHAPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleShapeChange(opt.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
                    shape === opt.id
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {opt.icon}
                  <span className="text-[10px]">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Size Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Size</label>
              <span className="text-xs text-muted-foreground">{size}%</span>
            </div>
            <Slider
              value={[size]}
              min={5}
              max={50}
              step={1}
              onValueChange={([v]) => {
                setSize(v)
                handleUpdate({ size: v })
              }}
            />
          </div>

          {/* Position Grid */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Position</label>
            <div className="grid grid-cols-3 gap-1 p-2 bg-muted/30 rounded-lg">
              {POSITION_GRID.map((anchor) => (
                <button
                  key={anchor}
                  onClick={() => handlePositionClick(anchor)}
                  className={cn(
                    "aspect-square rounded transition-all",
                    position.anchor === anchor
                      ? "bg-primary"
                      : "bg-muted/50 hover:bg-muted"
                  )}
                  title={anchor}
                />
              ))}
            </div>
          </div>

          {/* Border Section */}
          <div className="space-y-3 p-3 bg-muted/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Border</span>
              <Switch
                checked={borderEnabled}
                onCheckedChange={(checked) => {
                  setBorderEnabled(checked)
                  handleUpdate({ borderEnabled: checked })
                }}
              />
            </div>
            {borderEnabled && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-12">Width</label>
                  <Slider
                    value={[borderWidth]}
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={([v]) => {
                      setBorderWidth(v)
                      handleUpdate({ borderWidth: v })
                    }}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-6">{borderWidth}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-12">Color</label>
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => {
                      setBorderColor(e.target.value)
                      handleUpdate({ borderColor: e.target.value })
                    }}
                    className="h-6 w-12 rounded border-0 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Shadow Section */}
          <div className="space-y-3 p-3 bg-muted/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Shadow</span>
              <Switch
                checked={shadowEnabled}
                onCheckedChange={(checked) => {
                  setShadowEnabled(checked)
                  handleUpdate({ shadowEnabled: checked })
                }}
              />
            </div>
            {shadowEnabled && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-12">Blur</label>
                <Slider
                  value={[shadowBlur]}
                  min={0}
                  max={50}
                  step={1}
                  onValueChange={([v]) => {
                    setShadowBlur(v)
                    handleUpdate({ shadowBlur: v })
                  }}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-6">{shadowBlur}px</span>
              </div>
            )}
          </div>

          {/* Animations */}
          <div className="space-y-3 p-3 bg-muted/20 rounded-lg">
            <span className="text-xs font-medium">Animations</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Entry</label>
                <Select
                  value={entryAnimation}
                  onValueChange={(v: WebcamEntryAnimation) => {
                    setEntryAnimation(v)
                    handleUpdate({
                      animations: {
                        ...(webcamData?.animations ?? DEFAULT_WEBCAM_DATA.animations),
                        entry: { ...DEFAULT_WEBCAM_DATA.animations.entry, type: v }
                      }
                    })
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="fade">Fade</SelectItem>
                    <SelectItem value="scale">Scale</SelectItem>
                    <SelectItem value="slide">Slide</SelectItem>
                    <SelectItem value="bounce">Bounce</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Exit</label>
                <Select
                  value={exitAnimation}
                  onValueChange={(v: WebcamExitAnimation) => {
                    setExitAnimation(v)
                    handleUpdate({
                      animations: {
                        ...(webcamData?.animations ?? DEFAULT_WEBCAM_DATA.animations),
                        exit: { ...DEFAULT_WEBCAM_DATA.animations.exit, type: v }
                      }
                    })
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="fade">Fade</SelectItem>
                    <SelectItem value="scale">Scale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">PiP Motion</label>
              <Select
                value={pipAnimation}
                onValueChange={(v: WebcamPipAnimation) => {
                  setPipAnimation(v)
                  handleUpdate({
                    animations: {
                      ...(webcamData?.animations ?? DEFAULT_WEBCAM_DATA.animations),
                      pip: { ...DEFAULT_WEBCAM_DATA.animations.pip, type: v }
                    }
                  })
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="float">Float</SelectItem>
                  <SelectItem value="breathe">Breathe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Advanced Section */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("w-3 h-3 transition-transform", showAdvanced && "rotate-90")} />
            Advanced Options
          </button>

          {showAdvanced && (
            <div className="space-y-3 p-3 bg-muted/20 rounded-lg">
              {/* Mirror toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium">Mirror</span>
                  <p className="text-[10px] text-muted-foreground">Flip webcam horizontally</p>
                </div>
                <Switch
                  checked={mirror}
                  onCheckedChange={(checked) => {
                    setMirror(checked)
                    handleUpdate({ mirror: checked })
                  }}
                />
              </div>

              {/* Opacity */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">Opacity</label>
                  <span className="text-xs text-muted-foreground">{Math.round(opacity * 100)}%</span>
                </div>
                <Slider
                  value={[opacity * 100]}
                  min={10}
                  max={100}
                  step={5}
                  onValueChange={([v]) => {
                    const o = v / 100
                    setOpacity(o)
                    handleUpdate({ opacity: o })
                  }}
                />
              </div>

              {/* Corner radius (for non-circle shapes) */}
              {shape !== 'circle' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium">Corner Radius</label>
                    <span className="text-xs text-muted-foreground">{cornerRadius}px</span>
                  </div>
                  <Slider
                    value={[cornerRadius]}
                    min={0}
                    max={50}
                    step={2}
                    onValueChange={([v]) => {
                      setCornerRadius(v)
                      handleUpdate({ cornerRadius: v })
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* No webcam recording message */}
      {!webcamEffect && (
        <div className="text-center py-8 text-muted-foreground">
          <Video className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No webcam recording in this project.</p>
          <p className="text-[10px] mt-1">Record with webcam enabled to use these settings.</p>
        </div>
      )}
    </div>
  )
}
