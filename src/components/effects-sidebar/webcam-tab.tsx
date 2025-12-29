'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { Video, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import type { Effect, WebcamEffectData, WebcamShape, WebcamAnchor, CropEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import { DEFAULT_WEBCAM_DATA, WEBCAM_SHAPE_PRESETS } from '@/lib/constants/default-effects'
import { DEFAULT_CROP_DATA, clampCropData } from '@/remotion/compositions/utils/transforms/crop-transform'
import { useProjectStore } from '@/stores/project-store'
import { TimelineDataService } from '@/lib/timeline/timeline-data-service'
import { resolveRecordingPath, createVideoStreamUrl } from '@/components/recordings-library/utils/recording-paths'

import { WebcamGeneral } from './webcam/webcam-general'
import { WebcamPreview } from './webcam/webcam-preview'
import { WebcamStyle } from './webcam/webcam-style'
import { WebcamAnimations } from './webcam/webcam-animations'

interface WebcamTabProps {
  webcamEffect: Effect | undefined
  onUpdateWebcam: (updates: Partial<WebcamEffectData>) => void
  onEffectChange: (type: EffectType, data: WebcamEffectData) => void
}

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
  const handlePositionChange = (_anchor: WebcamAnchor) => {
    // We only update the anchor visually here if needed, but the main update happens in onPositionUpdate
    // Actually, position is an object {x, y, anchor}, so we need to set the preset.
    // This logic is slightly split between 'anchor' selection and updating the full position object.
  }

  const handlePositionUpdate = (preset: { x: number; y: number; anchor: WebcamAnchor }) => {
    setPosition(preset)
    handleUpdate({ position: preset })
  }

  const recordingsMap = useMemo(() => {
    if (!project) return new Map()
    return TimelineDataService.getRecordingsMap(project)
  }, [project])

  const webcamClips = useMemo(() => {
    if (!project) return []
    return TimelineDataService.getWebcamClips(project)
  }, [project])

  const webcamClip = useMemo(() => {
    if (!webcamEffect || webcamClips.length === 0) return null
    const duration = Math.max(0, webcamEffect.endTime - webcamEffect.startTime)
    const targetTime = webcamEffect.startTime + duration / 2
    const clipAtTime = webcamClips.find(
      (clip) => targetTime >= clip.startTime && targetTime < clip.startTime + clip.duration
    )
    if (clipAtTime && recordingsMap.has(clipAtTime.recordingId)) return clipAtTime
    return webcamClips.find(clip => recordingsMap.has(clip.recordingId)) ?? null
  }, [webcamClips, webcamEffect, recordingsMap])

  const webcamRecording = useMemo(() => {
    if (!webcamClip) return null
    return recordingsMap.get(webcamClip.recordingId) ?? null
  }, [recordingsMap, webcamClip])

  const hasWebcamFootage = useMemo(() => {
    return webcamClips.some(clip => recordingsMap.has(clip.recordingId))
  }, [webcamClips, recordingsMap])

  const webcamPreviewSrc = useMemo(() => {
    const resolvedPath = resolveRecordingPath(webcamRecording)
    return createVideoStreamUrl(resolvedPath) || resolvedPath
  }, [webcamRecording])

  const webcamAspectRatio = useMemo(() => {
    if (webcamRecording?.width && webcamRecording?.height) {
      return webcamRecording.width / webcamRecording.height
    }
    return 16 / 9
  }, [webcamRecording?.width, webcamRecording?.height])

  const sourceCrop = webcamData?.sourceCrop ?? DEFAULT_CROP_DATA
  const flipCropX = useCallback((crop: CropEffectData) => {
    return clampCropData({
      ...crop,
      x: 1 - crop.x - crop.width
    })
  }, [])
  const displayCrop = useMemo(() => (
    mirror ? flipCropX(sourceCrop) : sourceCrop
  ), [flipCropX, mirror, sourceCrop])

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
    const normalized = mirror ? flipCropX(nextCrop) : nextCrop
    handleUpdate({ sourceCrop: constrainCropToSquare(normalized) })
  }, [constrainCropToSquare, flipCropX, handleUpdate, mirror])

  const handleCropReset = useCallback(() => {
    handleUpdate({ sourceCrop: DEFAULT_CROP_DATA })
  }, [handleUpdate])


  if (!hasWebcamFootage) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-background/30 px-3 py-6 text-center text-muted-foreground">
        <Video className="mx-auto mb-3 h-8 w-8 opacity-50" />
        <p className="text-[12px] font-medium">No webcam footage in this project.</p>
        <p className="mt-1 text-[12px]">Import or record with webcam enabled to use these settings.</p>
      </div>
    )
  }

  if (!webcamEffect) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-background/30 px-3 py-6 text-center text-muted-foreground">
        <Video className="mx-auto mb-3 h-8 w-8 opacity-50" />
        <p className="text-[12px] font-medium">Select a webcam block to edit settings.</p>
        <p className="mt-1 text-[12px]">Choose a webcam block on the timeline to customize it.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 rounded-full border border-border/60 bg-background/60 p-1">
            <Video className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <div className="text-[12px] font-semibold tracking-[-0.015em]">Webcam Overlay</div>
            <p className="text-[12px] text-muted-foreground">Picture-in-picture styling and placement.</p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(checked)
            if (webcamEffect) {
              onUpdateWebcam({ ...(webcamData ?? DEFAULT_WEBCAM_DATA) }) // Just trigger re-render
            }
          }}
        />
      </div>

      {enabled && (
        <>
          <WebcamGeneral
            shape={shape}
            size={size}
            position={position.anchor}
            onShapeChange={handleShapeChange}
            onSizeChange={(v) => {
              setSize(v)
              handleUpdate({ size: v })
            }}
            onPositionChange={handlePositionChange}
            onPositionUpdate={handlePositionUpdate}
          />

          {webcamEffect && webcamPreviewSrc && (
            <WebcamPreview
              webcamEffect={webcamEffect}
              webcamData={webcamData}
              previewSrc={webcamPreviewSrc}
              aspectRatio={webcamAspectRatio}
              displayCrop={displayCrop}
              onCropChange={handleCropChange}
              onReset={handleCropReset}
              mirror={mirror}
            />
          )}

          {/* Advanced Section */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <ChevronRight className={cn("w-3 h-3 transition-transform", showAdvanced && "rotate-90")} />
            Advanced Options
          </button>

          {showAdvanced && (
            <>
              <WebcamStyle
                padding={padding}
                onPaddingChange={(v) => {
                  setPadding(v)
                  handleUpdate({ padding: v })
                }}
                borderEnabled={borderEnabled}
                onBorderEnabledChange={(v) => {
                  setBorderEnabled(v)
                  handleUpdate({ borderEnabled: v })
                }}
                borderWidth={borderWidth}
                onBorderWidthChange={(v) => {
                  setBorderWidth(v)
                  handleUpdate({ borderWidth: v })
                }}
                borderColor={borderColor}
                onBorderColorChange={(v) => {
                  setBorderColor(v)
                  handleUpdate({ borderColor: v })
                }}
                shadowEnabled={shadowEnabled}
                onShadowEnabledChange={(v) => {
                  setShadowEnabled(v)
                  handleUpdate({ shadowEnabled: v })
                }}
                shadowBlur={shadowBlur}
                onShadowBlurChange={(v) => {
                  setShadowBlur(v)
                  handleUpdate({ shadowBlur: v })
                }}
                mirror={mirror}
                onMirrorChange={(v) => {
                  setMirror(v)
                  handleUpdate({ mirror: v })
                }}
                opacity={opacity}
                onOpacityChange={(v) => {
                  setOpacity(v)
                  handleUpdate({ opacity: v })
                }}
                reduceOpacityOnZoom={reduceOpacityOnZoom}
                onReduceOpacityOnZoomChange={(v) => {
                  setReduceOpacityOnZoom(v)
                  handleUpdate({ reduceOpacityOnZoom: v })
                }}
                cornerRadius={cornerRadius}
                onCornerRadiusChange={(v) => {
                  setCornerRadius(v)
                  handleUpdate({ cornerRadius: v })
                }}
                showCornerRadius={shape !== 'circle'}
              />

              <WebcamAnimations
                entryAnimation={entryAnimation}
                onEntryChange={(v) => {
                  setEntryAnimation(v)
                  handleUpdate({
                    animations: {
                      ...(webcamData?.animations ?? DEFAULT_WEBCAM_DATA.animations),
                      entry: { ...DEFAULT_WEBCAM_DATA.animations.entry, type: v }
                    }
                  })
                }}
                exitAnimation={exitAnimation}
                onExitChange={(v) => {
                  setExitAnimation(v)
                  handleUpdate({
                    animations: {
                      ...(webcamData?.animations ?? DEFAULT_WEBCAM_DATA.animations),
                      exit: { ...DEFAULT_WEBCAM_DATA.animations.exit, type: v }
                    }
                  })
                }}
                pipAnimation={pipAnimation}
                onPipChange={(v) => {
                  setPipAnimation(v)
                  handleUpdate({
                    animations: {
                      ...(webcamData?.animations ?? DEFAULT_WEBCAM_DATA.animations),
                      pip: { ...DEFAULT_WEBCAM_DATA.animations.pip, type: v }
                    }
                  })
                }}
              />
            </>
          )}
        </>
      )}

    </div>
  )
}
