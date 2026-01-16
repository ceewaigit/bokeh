'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Video, ChevronRight } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { Switch } from '@/components/ui/switch'
import type { CropEffectData } from '@/types/project'
import type { WebcamLayoutData, WebcamShape, WebcamAnchor } from '../types'
import { DEFAULT_WEBCAM_DATA, WEBCAM_SHAPE_PRESETS } from '../config'
import { DEFAULT_CROP_DATA, clampCropData, isFullFrameCrop } from '@/features/rendering/canvas/math/transforms/crop-transform'
import { useProjectStore } from '@/features/core/stores/project-store'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { createVideoStreamUrl } from '@/features/media/recording/components/library/utils/recording-paths'
import { useOverlayState } from '@/features/rendering/overlays/hooks/use-overlay-state'
import { OverlayAnchor } from '@/types/overlays'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'
import { UpdateClipCommand } from '@/features/core/commands'

import { WebcamGeneral } from './webcam/webcam-general'
import { WebcamPreview } from './webcam/webcam-preview'
import { WebcamStyle } from './webcam/webcam-style'
import { WebcamAnimations } from './webcam/webcam-animations'

/**
 * WebcamTab - Controls webcam overlay styling
 * 
 * ARCHITECTURE: Webcam styling now lives on clip.layout, NOT as a separate Effect.
 * This component reads from the active webcam clip's layout and updates via UpdateClip command.
 */
export function WebcamTab() {
  const project = useProjectStore((s) => s.currentProject)
  const currentTime = useProjectStore((s) => s.currentTime)
  const executorRef = useCommandExecutor()

  // Get webcam clips and find active one
  const webcamClips = useMemo(() => {
    if (!project) return []
    return TimelineDataService.getWebcamClips(project)
  }, [project])

  const recordingsMap = useMemo(() => {
    if (!project) return new Map()
    return TimelineDataService.getRecordingsMap(project)
  }, [project])

  // Find active webcam clip at current time
  const activeWebcamClip = useMemo(() => {
    if (webcamClips.length === 0) return null
    const clipAtTime = webcamClips.find(clip =>
      currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
    )
    return clipAtTime ?? webcamClips[0]
  }, [webcamClips, currentTime])

  // Read layout from clip (SSOT)
  const webcamData = activeWebcamClip?.layout ?? DEFAULT_WEBCAM_DATA

  // Local state for controls - synced from clip.layout
  const [enabled, setEnabled] = useState(true)
  const [shape, setShape] = useState<WebcamShape>(webcamData.shape)
  const [size, setSize] = useState(webcamData.size)
  const [position, setPosition] = useState(webcamData.position)
  const [cornerRadius, setCornerRadius] = useState(webcamData.cornerRadius)
  const [borderEnabled, setBorderEnabled] = useState(webcamData.borderEnabled)
  const [borderWidth, setBorderWidth] = useState(webcamData.borderWidth)
  const [borderColor, setBorderColor] = useState(webcamData.borderColor)
  const [shadowEnabled, setShadowEnabled] = useState(webcamData.shadowEnabled)
  const [shadowBlur, setShadowBlur] = useState(webcamData.shadowBlur)
  const [entryAnimation, setEntryAnimation] = useState(webcamData.animations?.entry?.type ?? 'none')
  const [exitAnimation, setExitAnimation] = useState(webcamData.animations?.exit?.type ?? 'none')
  const [pipAnimation, setPipAnimation] = useState(webcamData.animations?.pip?.type ?? 'none')
  const [mirror, setMirror] = useState(webcamData.mirror)
  const [opacity, setOpacity] = useState(webcamData.opacity)
  const [padding, setPadding] = useState(webcamData.padding ?? DEFAULT_WEBCAM_DATA.padding)
  const [reduceOpacityOnZoom, setReduceOpacityOnZoom] = useState(webcamData.reduceOpacityOnZoom ?? false)
  const [zoomInfluence, setZoomInfluence] = useState(webcamData.zoomInfluence ?? DEFAULT_WEBCAM_DATA.zoomInfluence)

  const [showAdvanced, setShowAdvanced] = useState(false)

  const { resolvedAnchors } = useOverlayState()
  const occupiedAnchors = useMemo(() => {
    const occupied = new Set<OverlayAnchor>()
    resolvedAnchors.forEach((anchor, effectId) => {
      // Exclude current webcam clip from occupied check
      if (effectId !== activeWebcamClip?.id) {
        occupied.add(anchor)
      }
    })
    return occupied
  }, [resolvedAnchors, activeWebcamClip?.id])

  // Sync local state from clip.layout when it changes
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
      setReduceOpacityOnZoom(webcamData.reduceOpacityOnZoom ?? false)
      setZoomInfluence(webcamData.zoomInfluence ?? DEFAULT_WEBCAM_DATA.zoomInfluence)
    }
  }, [webcamData])

  // Update handler - writes to clip.layout via UpdateClip command
  const handleUpdate = useCallback((updates: Partial<WebcamLayoutData>) => {
    if (!activeWebcamClip) return

    const currentLayout = activeWebcamClip.layout ?? DEFAULT_WEBCAM_DATA
    const newLayout: WebcamLayoutData = { ...currentLayout, ...updates }

    executorRef.current?.execute(UpdateClipCommand, activeWebcamClip.id, { layout: newLayout })
  }, [activeWebcamClip, executorRef])

  // Shape change
  const handleShapeChange = (newShape: WebcamShape) => {
    setShape(newShape)
    const preset = WEBCAM_SHAPE_PRESETS[newShape]
    handleUpdate({ shape: newShape, cornerRadius: preset.cornerRadius })
  }

  const handlePositionUpdate = (preset: { x: number; y: number; anchor: WebcamAnchor }) => {
    setPosition(preset)
    handleUpdate({ position: preset })
  }

  const webcamRecording = useMemo(() => {
    if (!activeWebcamClip) return null
    return recordingsMap.get(activeWebcamClip.recordingId) ?? null
  }, [recordingsMap, activeWebcamClip])

  const hasWebcamFootage = useMemo(() => {
    return webcamClips.some(clip => recordingsMap.has(clip.recordingId))
  }, [webcamClips, recordingsMap])

  // Extract primitive path values (stable strings that don't change when object refs change)
  const recordingFilePath = webcamRecording?.filePath
  const recordingFolderPath = webcamRecording?.folderPath

  // Only recalculate when the actual PATH VALUES change, not object references
  // This prevents video from blinking when crop changes trigger project updates
  const webcamPreviewSrc = useMemo(() => {
    if (!recordingFilePath) return null

    // Inline path resolution using primitive values only
    let resolvedPath: string
    if (recordingFilePath.startsWith('/') || recordingFilePath.startsWith('data:')) {
      resolvedPath = recordingFilePath
    } else if (recordingFolderPath) {
      const basename = recordingFilePath.split('/').pop() || recordingFilePath
      resolvedPath = `${recordingFolderPath.replace(/\/$/, '')}/${basename}`
    } else {
      resolvedPath = recordingFilePath
    }

    return createVideoStreamUrl(resolvedPath) || resolvedPath
  }, [recordingFilePath, recordingFolderPath])

  // Cache last valid src to prevent unmount during transient null states in update cycle
  const lastValidSrcRef = useRef<string | null>(null)
  if (webcamPreviewSrc) {
    lastValidSrcRef.current = webcamPreviewSrc
  }
  const stablePreviewSrc = lastValidSrcRef.current

  const webcamAspectRatio = useMemo(() => {
    if (webcamRecording?.width && webcamRecording?.height) {
      return webcamRecording.width / webcamRecording.height
    }
    return 16 / 9
  }, [webcamRecording?.width, webcamRecording?.height])

  const sourceCrop = webcamData.sourceCrop ?? DEFAULT_CROP_DATA
  const flipCropX = useCallback((crop: CropEffectData) => {
    return clampCropData({
      ...crop,
      x: 1 - crop.x - crop.width
    })
  }, [])

  const smartSourceCrop = useMemo(() => {
    let crop = sourceCrop;

    // Smart Center Crop Logic (Sync with WebcamClipRenderer.tsx)
    // If full frame default, present a center square crop in the UI
    if (isFullFrameCrop(crop) && hasWebcamFootage && webcamAspectRatio > 0) {
      if (Math.abs(webcamAspectRatio - 1) > 0.01) {
        let cropW = 1;
        let cropH = 1;
        if (webcamAspectRatio > 1) {
          cropW = 1 / webcamAspectRatio;
          cropH = 1;
        } else {
          cropW = 1;
          cropH = webcamAspectRatio;
        }
        crop = {
          width: cropW,
          height: cropH,
          x: (1 - cropW) / 2,
          y: (1 - cropH) / 2
        };
      }
    }
    return crop;
  }, [sourceCrop, webcamAspectRatio, hasWebcamFootage]);

  const displayCrop = useMemo(() => (
    mirror ? flipCropX(smartSourceCrop) : smartSourceCrop
  ), [flipCropX, mirror, smartSourceCrop])

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
      <div className="rounded-2xl border border-dashed border-border/70 bg-background/30 px-3 py-6 text-center text-muted-foreground overflow-hidden">
        <Video className="mx-auto mb-3 h-8 w-8 opacity-50" />
        <p className="text-xs font-medium">No webcam footage in this project.</p>
        <p className="mt-1 text-xs">Import or record with webcam enabled to use these settings.</p>
      </div>
    )
  }

  if (!activeWebcamClip) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-background/30 px-3 py-6 text-center text-muted-foreground overflow-hidden">
        <Video className="mx-auto mb-3 h-8 w-8 opacity-50" />
        <p className="text-xs font-medium">No webcam clip selected.</p>
        <p className="mt-1 text-xs">Position playhead over a webcam clip to edit settings.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 rounded-pill border border-border/60 bg-background/60 p-1">
            <Video className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold tracking-[-0.015em]">Webcam Overlay</div>
            <p className="text-xs text-muted-foreground">Picture-in-picture styling and placement.</p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(checked)
            // TODO: Handle enabled state on clip level if needed
          }}
        />
      </div>

      {enabled && (
        <>
          <WebcamGeneral
            shape={shape}
            size={size}
            position={position.anchor}
            occupiedAnchors={occupiedAnchors}
            onShapeChange={handleShapeChange}
            onSizeChange={(v) => {
              setSize(v)
              handleUpdate({ size: v })
            }}
            onPositionChange={() => { }}
            onPositionUpdate={handlePositionUpdate}
          />

          {stablePreviewSrc && (
            <WebcamPreview
              webcamData={webcamData}
              previewSrc={stablePreviewSrc}
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
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
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
                reduceOpacityOnZoom={reduceOpacityOnZoom ?? false}
                onReduceOpacityOnZoomChange={(v) => {
                  setReduceOpacityOnZoom(v)
                  handleUpdate({ reduceOpacityOnZoom: v })
                }}
                zoomInfluence={zoomInfluence}
                onZoomInfluenceChange={(v) => {
                  setZoomInfluence(v)
                  handleUpdate({ zoomInfluence: v })
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
                      ...(webcamData.animations ?? DEFAULT_WEBCAM_DATA.animations),
                      entry: { ...DEFAULT_WEBCAM_DATA.animations.entry, type: v }
                    }
                  })
                }}
                exitAnimation={exitAnimation}
                onExitChange={(v) => {
                  setExitAnimation(v)
                  handleUpdate({
                    animations: {
                      ...(webcamData.animations ?? DEFAULT_WEBCAM_DATA.animations),
                      exit: { ...DEFAULT_WEBCAM_DATA.animations.exit, type: v }
                    }
                  })
                }}
                pipAnimation={pipAnimation}
                onPipChange={(v) => {
                  setPipAnimation(v)
                  handleUpdate({
                    animations: {
                      ...(webcamData.animations ?? DEFAULT_WEBCAM_DATA.animations),
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
