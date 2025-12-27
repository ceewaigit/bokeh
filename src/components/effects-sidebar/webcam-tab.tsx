'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ChevronRight, Video, Circle, Square, RectangleHorizontal, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { Effect, WebcamEffectData, WebcamShape, WebcamAnchor, WebcamEntryAnimation, WebcamExitAnimation, WebcamPipAnimation, CropEffectData } from '@/types/project'
import { EffectType, TrackType } from '@/types/project'
import { DEFAULT_WEBCAM_DATA, WEBCAM_POSITION_PRESETS, WEBCAM_SHAPE_PRESETS } from '@/lib/constants/default-effects'
import { DEFAULT_CROP_DATA, clampCropData } from '@/remotion/compositions/utils/transforms/crop-transform'
import { useProjectStore } from '@/stores/project-store'
import { CropOverlay } from '@/components/crop-overlay/CropOverlay'

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
  const project = useProjectStore((s) => s.currentProject)

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
  const [padding, setPadding] = useState(webcamData?.padding ?? DEFAULT_WEBCAM_DATA.padding)
  const [reduceOpacityOnZoom, setReduceOpacityOnZoom] = useState(webcamData?.reduceOpacityOnZoom ?? DEFAULT_WEBCAM_DATA.reduceOpacityOnZoom)
  const [cropPreviewSize, setCropPreviewSize] = useState({ width: 0, height: 0 })
  const cropPreviewRef = useRef<HTMLDivElement>(null)

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
      setEntryAnimation(webcamData.animations?.entry?.type ?? 'none')
      setExitAnimation(webcamData.animations?.exit?.type ?? 'none')
      setPipAnimation(webcamData.animations?.pip?.type ?? 'none')
      setMirror(webcamData.mirror)
      setOpacity(webcamData.opacity)
      setPadding(webcamData.padding ?? DEFAULT_WEBCAM_DATA.padding)
      setReduceOpacityOnZoom(webcamData.reduceOpacityOnZoom ?? DEFAULT_WEBCAM_DATA.reduceOpacityOnZoom)
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

  const webcamClip = useMemo(() => {
    if (!project?.timeline?.tracks) return null
    const track = project.timeline.tracks.find(t => t.type === TrackType.Webcam)
    return track?.clips?.[0] ?? null
  }, [project?.timeline?.tracks])

  const webcamRecording = useMemo(() => {
    if (!project?.recordings || !webcamClip) return null
    return project.recordings.find(r => r.id === webcamClip.recordingId) ?? null
  }, [project?.recordings, webcamClip])

  const webcamPreviewSrc = useMemo(() => {
    if (!webcamRecording?.filePath) return null
    const basename = webcamRecording.filePath.split('/').pop() || webcamRecording.filePath
    const resolvedPath = webcamRecording.folderPath
      ? `${webcamRecording.folderPath.replace(/\/$/, '')}/${basename}`
      : webcamRecording.filePath
    if (resolvedPath.startsWith('/')) {
      return `video-stream://local/${encodeURIComponent(resolvedPath)}`
    }
    return resolvedPath
  }, [webcamRecording])

  const webcamAspectRatio = useMemo(() => {
    if (webcamRecording?.width && webcamRecording?.height) {
      return webcamRecording.width / webcamRecording.height
    }
    return 16 / 9
  }, [webcamRecording?.width, webcamRecording?.height])

  const sourceCrop = webcamData?.sourceCrop ?? DEFAULT_CROP_DATA

  const constrainCropToSquare = useCallback((crop: CropEffectData) => {
    const centerX = crop.x + crop.width / 2
    const centerY = crop.y + crop.height / 2
    let height = crop.height
    let width = height / webcamAspectRatio

    if (width > 1) {
      width = 1
      height = width * webcamAspectRatio
    }
    if (height > 1) {
      height = 1
      width = height / webcamAspectRatio
    }

    const next = clampCropData({
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height
    })

    return next
  }, [webcamAspectRatio])

  const handleCropChange = useCallback((nextCrop: CropEffectData) => {
    handleUpdate({ sourceCrop: constrainCropToSquare(nextCrop) })
  }, [constrainCropToSquare, handleUpdate])

  const handleCropReset = useCallback(() => {
    handleUpdate({ sourceCrop: DEFAULT_CROP_DATA })
  }, [handleUpdate])

  useEffect(() => {
    const element = cropPreviewRef.current
    if (!element) return
    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      setCropPreviewSize({ width: rect.width, height: rect.height })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 rounded-full border border-border/60 bg-background/60 p-1">
            <Video className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold tracking-[-0.015em]">Webcam Overlay</div>
            <p className="text-[11px] text-muted-foreground">Picture-in-picture styling and placement.</p>
          </div>
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
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Shape</label>
            <div className="grid grid-cols-4 gap-1.5">
              {SHAPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleShapeChange(opt.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-all duration-150",
                    shape === opt.id
                      ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                      : "border-border/50 bg-background/40 text-muted-foreground hover:bg-background/70"
                  )}
                >
                  {opt.icon}
                  <span className="tracking-[-0.01em]">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Size Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Size</label>
              <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{size}%</span>
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
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Position</label>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-background/40 p-1.5">
              {POSITION_GRID.map((anchor) => (
                <button
                  key={anchor}
                  onClick={() => handlePositionClick(anchor)}
                  className={cn(
                    "aspect-square rounded-md transition-all duration-150",
                    position.anchor === anchor
                      ? "bg-primary shadow-sm"
                      : "bg-muted/40 hover:bg-muted/60"
                  )}
                  title={anchor}
                />
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground/70">Position the PiP, then refine the framing below.</p>
          </div>

          {/* Framing Crop */}
          {webcamEffect && webcamPreviewSrc && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Webcam Framing</label>
                <button
                  type="button"
                  onClick={handleCropReset}
                  className="flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              </div>
              <div
                ref={cropPreviewRef}
                className="relative w-full overflow-hidden rounded-xl border border-border/50 bg-black/50"
                style={{ aspectRatio: `${webcamAspectRatio}` }}
              >
                <video
                  src={webcamPreviewSrc}
                  className="absolute inset-0 h-full w-full object-cover"
                  muted
                  playsInline
                  loop
                  autoPlay
                />
                {cropPreviewSize.width > 0 && cropPreviewSize.height > 0 && (
                  <CropOverlay
                    cropData={sourceCrop}
                    onCropChange={handleCropChange}
                    onConfirm={() => null}
                    onReset={handleCropReset}
                    videoRect={{
                      x: 0,
                      y: 0,
                      width: cropPreviewSize.width,
                      height: cropPreviewSize.height
                    }}
                    showActions={false}
                    showInfo={false}
                  />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                Drag the box to reframe which part of the webcam is shown.
              </p>
            </div>
          )}

          {/* Padding Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Edge Padding</label>
              <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{padding}px</span>
            </div>
            <Slider
              value={[padding]}
              min={0}
              max={100}
              step={4}
              onValueChange={([v]) => {
                setPadding(v)
                handleUpdate({ padding: v })
              }}
            />
          </div>

          {/* Border Section */}
          <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-[-0.01em]">Border</span>
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
                  <label className="w-12 text-[11px] font-medium text-muted-foreground">Width</label>
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
                  <span className="w-8 text-[11px] font-mono tabular-nums text-muted-foreground">{borderWidth}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-12 text-[11px] font-medium text-muted-foreground">Color</label>
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => {
                      setBorderColor(e.target.value)
                      handleUpdate({ borderColor: e.target.value })
                    }}
                    className="h-6 w-12 cursor-pointer rounded-md border border-border/60 bg-background"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Shadow Section */}
          <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-[-0.01em]">Shadow</span>
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
                <label className="w-12 text-[11px] font-medium text-muted-foreground">Blur</label>
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
                <span className="w-8 text-[11px] font-mono tabular-nums text-muted-foreground">{shadowBlur}px</span>
              </div>
            )}
          </div>

          {/* Animations */}
          <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
            <span className="text-[11px] font-semibold tracking-[-0.01em]">Animations</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Entry</label>
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
                <label className="text-[11px] font-medium text-muted-foreground">Exit</label>
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
              <label className="text-[11px] font-medium text-muted-foreground">PiP Motion</label>
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
            className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <ChevronRight className={cn("w-3 h-3 transition-transform", showAdvanced && "rotate-90")} />
            Advanced Options
          </button>

          {showAdvanced && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
              {/* Mirror toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold tracking-[-0.01em]">Mirror</span>
                  <p className="text-[11px] text-muted-foreground">Flip webcam horizontally</p>
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
                  <label className="text-[11px] font-semibold tracking-[-0.01em]">Opacity</label>
                  <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{Math.round(opacity * 100)}%</span>
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

              {/* Reduce opacity when zoomed in */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold tracking-[-0.01em]">Fade on Zoom</span>
                  <p className="text-[11px] text-muted-foreground">Reduce opacity when zoomed in</p>
                </div>
                <Switch
                  checked={reduceOpacityOnZoom}
                  onCheckedChange={(checked) => {
                    setReduceOpacityOnZoom(checked)
                    handleUpdate({ reduceOpacityOnZoom: checked })
                  }}
                />
              </div>

              {/* Corner radius (for non-circle shapes) */}
              {shape !== 'circle' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold tracking-[-0.01em]">Corner Radius</label>
                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{cornerRadius}px</span>
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
        <div className="rounded-lg border border-dashed border-border/70 bg-background/30 px-3 py-6 text-center text-muted-foreground">
          <Video className="mx-auto mb-3 h-8 w-8 opacity-50" />
          <p className="text-[11px] font-medium">No webcam recording in this project.</p>
          <p className="mt-1 text-[11px]">Record with webcam enabled to use these settings.</p>
        </div>
      )}
    </div>
  )
}
