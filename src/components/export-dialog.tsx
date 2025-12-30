"use client"

import { useState, useEffect, useMemo } from 'react'
import { useExportStore } from '@/stores/export-store'
import { useProjectStore } from '@/stores/project-store'
import { Button } from './ui/button'
import { SegmentedControl } from './ui/segmented-control'
import {
  TooltipProvider,
} from './ui/tooltip'
import {
  Download,
  Play,
  FileVideo,
  X,
  Check,
  Zap,
  AlertCircle
} from 'lucide-react'
import { clamp } from '@/lib/core/math'
import { cn } from '@/shared/utils/utils'
import { toast } from 'sonner'
import { ExportFormat, QualityLevel, AspectRatioPreset } from '@/types/project'
import { calculateCanvasDimensions, getAspectRatioPreset } from '@/lib/constants/aspect-ratio-presets'
import { DEFAULT_PROJECT_SETTINGS } from '@/lib/settings/defaults'

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

type Resolution =
  | 'native'
  | '5k'
  | '4k'
  | '1440p'
  | '1080p'
  | '720p'
  | 'scale-75'
  | 'scale-50'
type FrameRate = 30 | 60
type Format = 'mp4' | 'prores' | 'gif'

type UiMachineProfile = {
  cpuCores: number
  totalMemoryGB: number
  gpuAvailable: boolean
}

export function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  const {
    lastExport,
    exportProject,
    exportAsGIF,
    cancelExport,
    saveLastExport,
    reset
  } = useExportStore()

  const currentProject = useProjectStore((s) => s.currentProject)
  const progress = useProjectStore((s) => s.progress)
  const isExporting = progress.isProcessing
  const uiSettings = useProjectStore((s) => s.settings)
  const projectSettings = useProjectStore((s) => s.currentProject?.settings ?? DEFAULT_PROJECT_SETTINGS)

  // Get canvas settings and source resolution
  const canvasSettings = currentProject?.settings.canvas

  // Get source resolution from recordings (max dims across recordings)
  const recordingResolution = useMemo(() => {
    if (!currentProject?.recordings?.length) {
      return { width: 1920, height: 1080 }
    }
    const firstRec = currentProject.recordings[0]
    const fallbackWidth = firstRec.width || 1920
    const fallbackHeight = firstRec.height || 1080

    const maxWidth = currentProject.recordings.reduce((max, r) => Math.max(max, r.width || 0), 0) || fallbackWidth
    const maxHeight = currentProject.recordings.reduce((max, r) => Math.max(max, r.height || 0), 0) || fallbackHeight

    return {
      width: maxWidth,
      height: maxHeight
    }
  }, [currentProject?.recordings])

  // Calculate effective source resolution based on canvas aspect ratio
  const sourceResolution = useMemo(() => {
    // If no canvas settings or Original, use recording resolution
    if (!canvasSettings || canvasSettings.aspectRatio === AspectRatioPreset.Original) {
      return recordingResolution
    }

    // Calculate canvas dimensions based on aspect ratio preset
    const canvasDims = calculateCanvasDimensions(
      canvasSettings.aspectRatio,
      recordingResolution.height, // Use recording height as base
      canvasSettings.customWidth,
      canvasSettings.customHeight,
      recordingResolution.width,
      recordingResolution.height
    )

    return canvasDims
  }, [canvasSettings, recordingResolution])

  // Get aspect ratio label for display
  const canvasAspectLabel = useMemo(() => {
    if (!canvasSettings || canvasSettings.aspectRatio === AspectRatioPreset.Original) {
      return null
    }
    const preset = getAspectRatioPreset(canvasSettings.aspectRatio)
    return preset?.label || null
  }, [canvasSettings])

  const makeEven = (n: number) => Math.max(2, Math.floor(n / 2) * 2)

  const computeDimsForTargetHeight = useMemo(() => (targetHeight: number) => {
    const safeSourceW = Math.max(2, sourceResolution.width)
    const safeSourceH = Math.max(2, sourceResolution.height)
    const aspect = safeSourceW / safeSourceH
    const height = makeEven(targetHeight)
    const width = makeEven(Math.round(height * aspect))
    return { width, height }
  }, [sourceResolution])

  const formatPixelsTooltip = useMemo(() => (dims: { width: number; height: number }, hint?: string) => {
    const sourcePixels = Math.max(1, sourceResolution.width * sourceResolution.height)
    const pixels = Math.max(1, dims.width * dims.height)
    const pct = Math.round((pixels / sourcePixels) * 100)
    const pctText = pct === 100 ? '100% pixels' : `${pct}% pixels`
    return `${dims.width}×${dims.height}${hint ? ` · ${hint}` : ''} · ${pctText}`
  }, [sourceResolution])

  // Available resolution options based on source - show native + sensible downscales.
  const resolutionOptions = useMemo(() => {
    const options: Array<{ value: Resolution; label: string; tooltip: string; dims: { width: number; height: number } }> = []
    const sourceH = sourceResolution.height
    const sourceW = sourceResolution.width

    const pushUnique = (value: Resolution, label: string, dims: { width: number; height: number }, hint?: string) => {
      const key = `${dims.width}x${dims.height}`
      if (options.some((o) => `${o.dims.width}x${o.dims.height}` === key)) return
      options.push({
        value,
        label,
        dims,
        tooltip: formatPixelsTooltip(dims, hint),
      })
    }

    // Native first
    pushUnique('native', 'Native', { width: sourceW, height: sourceH }, 'Source')

    // Standard tiers (height-based), computed to match source aspect ratio.
    const tiers: Array<{ value: Resolution; label: string; height: number }> = [
      { value: '5k', label: '5K', height: 2880 },
      { value: '4k', label: '4K', height: 2160 },
      { value: '1440p', label: '1440p', height: 1440 },
      { value: '1080p', label: '1080p', height: 1080 },
      { value: '720p', label: '720p', height: 720 },
    ]

    for (const tier of tiers) {
      if (sourceH > tier.height) {
        pushUnique(tier.value, tier.label, computeDimsForTargetHeight(tier.height))
      }
    }

    // Scale-based options to bridge gaps between tiers for non-standard source resolutions.
    const scales: Array<{ value: Resolution; label: string; scale: number; hint: string }> = [
      { value: 'scale-75', label: '75%', scale: 0.75, hint: 'Downscale' },
      { value: 'scale-50', label: '50%', scale: 0.5, hint: 'Downscale' },
    ]

    for (const s of scales) {
      const targetH = Math.round(sourceH * s.scale)
      if (targetH > 720 && targetH < sourceH) {
        pushUnique(s.value, s.label, computeDimsForTargetHeight(targetH), s.hint)
      }
    }

    return options
  }, [sourceResolution, computeDimsForTargetHeight, formatPixelsTooltip])

  // Default to 1080p when available; fallback handled by option validation.
  const [resolution, setResolution] = useState<Resolution>('1080p')

  // Local state for frame rate/format controls (syncs to ProjectStore)
  const [frameRate, setFrameRate] = useState<FrameRate>(30)
  const [format, setFormat] = useState<Format>('mp4')

  const setProjectResolution = useProjectStore((s) => s.setResolution)
  const setProjectFramerate = useProjectStore((s) => s.setFramerate)
  const setProjectFormat = useProjectStore((s) => s.setFormat)
  const setProjectQuality = useProjectStore((s) => s.setQuality)

  const [machineProfile, setMachineProfile] = useState<UiMachineProfile | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const cpuCores =
      typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
        ? navigator.hardwareConcurrency
        : 8
    const totalMemoryGB =
      typeof navigator !== 'undefined' && typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
        ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory)
        : 16
    // We don’t have a reliable GPU capability signal in the renderer; assume true for user-facing estimates.
    setMachineProfile({ cpuCores, totalMemoryGB, gpuAvailable: true })
  }, [isOpen])

  const selectedResolution = useMemo(() => {
    const selected = resolutionOptions.find((o) => o.value === resolution)
    const dims = selected?.dims ?? sourceResolution
    const megapixels = (dims.width * dims.height) / 1_000_000
    const sourceMegapixels = (sourceResolution.width * sourceResolution.height) / 1_000_000
    const fpsMultiplier = (format === 'gif' ? 15 : frameRate) / 30
    const workUnits = megapixels * fpsMultiplier
    const sourceWorkUnits = sourceMegapixels * fpsMultiplier
    return { dims, megapixels, sourceMegapixels, fpsMultiplier, workUnits, sourceWorkUnits }
  }, [format, frameRate, resolution, resolutionOptions, sourceResolution])

  const exportSpeed = useMemo(() => {
    if (format === 'gif') {
      return { label: 'Fast', tone: 'ok' as const, loadIndex: 0 }
    }

    const cpuCores = machineProfile?.cpuCores ?? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8) ?? 8
    const totalMemoryGB = machineProfile?.totalMemoryGB ?? 16
    const gpuFactor = machineProfile?.gpuAvailable ? 1.15 : 1
    const capacity = Math.max(1, cpuCores * (totalMemoryGB / 16) * gpuFactor)
    const loadIndex = selectedResolution.workUnits / capacity

    if (loadIndex < 0.7) return { label: 'Fast', tone: 'ok' as const, loadIndex }
    if (loadIndex < 1.2) return { label: 'Balanced', tone: 'ok' as const, loadIndex }
    if (loadIndex < 2.0) return { label: 'Slow', tone: 'warn' as const, loadIndex }
    return { label: 'Very slow', tone: 'warn' as const, loadIndex }
  }, [format, machineProfile, selectedResolution.workUnits])

  const recommendations = useMemo(() => {
    if (format === 'gif') return null

    const cpuCores = machineProfile?.cpuCores ?? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8) ?? 8
    const totalMemoryGB = machineProfile?.totalMemoryGB ?? 16
    const gpuFactor = machineProfile?.gpuAvailable ? 1.15 : 1
    const capacity = Math.max(1, cpuCores * (totalMemoryGB / 16) * gpuFactor)

    const fpsMultiplier = selectedResolution.fpsMultiplier
    const currentWork = selectedResolution.workUnits

    const scored = resolutionOptions.map((o) => {
      const mp = (o.dims.width * o.dims.height) / 1_000_000
      const work = mp * fpsMultiplier
      const loadIndex = work / capacity
      return { ...o, mp, work, loadIndex }
    }).sort((a, b) => (b.dims.width * b.dims.height) - (a.dims.width * a.dims.height))

    const pickUnder = (threshold: number) => {
      const candidate = scored.find((s) => s.loadIndex <= threshold) ?? scored[scored.length - 1]
      const approxSpeedup = Math.max(1, currentWork / Math.max(0.001, candidate.work))
      return { value: candidate.value, label: candidate.label, approxSpeedup }
    }

    const recommended = pickUnder(1.2)
    const faster = pickUnder(0.7)
    const hasDistinctFaster = recommended.value !== faster.value
    return { recommended, faster, hasDistinctFaster }
  }, [format, machineProfile, resolutionOptions, selectedResolution.fpsMultiplier, selectedResolution.workUnits])

  // Update resolution if current selection isn't in available options
  useEffect(() => {
    const availableValues = resolutionOptions.map(o => o.value)
    if (!availableValues.includes(resolution)) {
      setResolution('native')
    }
  }, [resolutionOptions, resolution])

  // Update export settings when controls change
  useEffect(() => {
    const selected = resolutionOptions.find((o) => o.value === resolution)
    const dims = selected?.dims ?? sourceResolution

    const formatMap: Record<Format, ExportFormat> = {
      'mp4': ExportFormat.MP4,
      'prores': ExportFormat.MOV,
      'gif': ExportFormat.GIF,
    }

    const megapixels = (dims.width * dims.height) / 1_000_000
    const quality =
      megapixels > 8.3 ? QualityLevel.Ultra :
        megapixels > 2.1 ? QualityLevel.High :
          QualityLevel.Medium

    // Sync to ProjectStore
    setProjectResolution(dims.width, dims.height)
    setProjectFramerate(format === 'gif' ? 15 : frameRate)
    setProjectFormat(formatMap[format])
    setProjectQuality(quality)

  }, [resolution, frameRate, format, sourceResolution, resolutionOptions, setProjectResolution, setProjectFramerate, setProjectFormat, setProjectQuality])

  // Reset export state when project changes
  useEffect(() => {
    reset()
  }, [currentProject?.id, reset])

  const handleExport = async () => {
    if (!currentProject) return
    reset()

    try {
      if (format === 'gif') {
        const gifSettings: import('@/types/export').ExportSettings = {
          format: ExportFormat.GIF,
          framerate: 10,
          quality: QualityLevel.Low,
          resolution: projectSettings.resolution,
          outputPath: '',
          enhanceAudio: false
        }
        await exportAsGIF(currentProject, gifSettings)
      } else {
        const settings: import('@/types/export').ExportSettings = {
          format: uiSettings.format,
          framerate: projectSettings.frameRate,
          quality: uiSettings.quality,
          resolution: projectSettings.resolution,
          outputPath: '', // Handled by engine/storage
          enhanceAudio: projectSettings.audio?.enhanceAudio
        }
        await exportProject(currentProject, settings)
      }
      toast.success('Export completed')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Export failed'
      toast.error(msg)
    }
  }

  const handleSave = async () => {
    if (!lastExport) return
    const mime = lastExport.type || ''
    const extension =
      mime === 'video/mp4' ? 'mp4' :
        mime === 'video/webm' ? 'webm' :
          mime === 'image/gif' ? 'gif' :
            (uiSettings.format === ExportFormat.GIF ? 'gif' : uiSettings.format.toLowerCase())
    const filename = `${currentProject?.name || 'export'}.${extension}`
    try {
      await saveLastExport(filename)
      toast.success('File saved')
      reset()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save file'
      toast.error(msg)
    }
  }

  if (!isOpen) return null

  const formatEta = (seconds?: number) => {
    if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null
    const s = Math.round(seconds)
    const m = Math.floor(s / 60)
    const rem = s % 60
    if (m <= 0) return `${rem}s`
    return `${m}m${String(rem).padStart(2, '0')}s`
  }

  // Segmented control component


  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-6"
        onClick={() => !isExporting && onClose()}
      >
        <div
          className="bg-background border border-border/50 rounded-2xl w-[420px] shadow-2xl shadow-black/50 overflow-hidden"
          style={{
            animation: 'dialogIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <style>{`
            @keyframes dialogIn {
              from { opacity: 0; transform: scale(0.96) translateY(8px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-2 border-b border-border/50">
            <h2 className="text-sm font-semibold text-foreground">Export</h2>
            <button
              onClick={isExporting ? undefined : onClose}
              disabled={isExporting}
              className={cn(
                "w-6 h-6 rounded-md flex items-center justify-center transition-colors",
                isExporting ? "opacity-50 cursor-not-allowed" : "hover:bg-muted"
              )}
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Ready State */}
            {!isExporting && !lastExport && progress?.progressStage !== 'error' && (
              <div className="space-y-4">
                {/* Resolution */}
                <div className="space-y-2">
                  <label className="text-[13px] text-muted-foreground">Resolution</label>
                  <div className="flex justify-end">
                    <SegmentedControl
                      value={resolution}
                      onChange={setResolution}
                      disabled={format === 'gif'}
                      options={resolutionOptions}
                      layout="grid"
                      columns={4}
                      className="w-full max-w-[340px]"
                    />
                  </div>
                </div>

                {/* Frame Rate */}
                <div className="flex items-center justify-between">
                  <label className="text-[13px] text-muted-foreground">Frame Rate</label>
                  <SegmentedControl
                    value={frameRate}
                    onChange={setFrameRate}
                    disabled={format === 'gif'}
                    options={[
                      { value: 30 as FrameRate, label: '30', tooltip: 'Smaller file' },
                      { value: 60 as FrameRate, label: '60', tooltip: 'Smoother' },
                    ]}
                  />
                </div>

                {format !== 'gif' && exportSpeed.tone === 'warn' && recommendations && (
                  <div className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2">
                    <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div className="text-xs text-muted-foreground">
                      <span className="text-foreground">
                        This will export {exportSpeed.label.toLowerCase()} on this machine
                      </span>
                      {' '}({selectedResolution.dims.width}×{selectedResolution.dims.height} @ {frameRate}fps).{' '}
                      Time scales with pixels × fps.
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="rounded-md bg-background/60 px-2.5 py-1 text-[12px] font-medium text-foreground ring-1 ring-border/50 hover:bg-background"
                          onClick={() => setResolution(recommendations.recommended.value)}
                        >
                          Recommended: {recommendations.recommended.label} (≈{recommendations.recommended.approxSpeedup.toFixed(1)}×)
                        </button>
                        {recommendations.hasDistinctFaster ? (
                          <button
                            className="rounded-md bg-background/40 px-2.5 py-1 text-[12px] font-medium text-foreground ring-1 ring-border/30 hover:bg-background/60"
                            onClick={() => setResolution(recommendations.faster.value)}
                          >
                            Faster: {recommendations.faster.label} (≈{recommendations.faster.approxSpeedup.toFixed(1)}×)
                          </button>
                        ) : frameRate === 60 ? (
                          <button
                            className="rounded-md bg-background/40 px-2.5 py-1 text-[12px] font-medium text-foreground ring-1 ring-border/30 hover:bg-background/60"
                            onClick={() => setFrameRate(30)}
                          >
                            Faster: 30fps (≈2.0×)
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {/* Format */}
                <div className="flex items-center justify-between">
                  <label className="text-[13px] text-muted-foreground">Format</label>
                  <SegmentedControl
                    value={format}
                    onChange={setFormat}
                    options={[
                      { value: 'mp4' as Format, label: 'MP4', tooltip: 'Best compatibility' },
                      { value: 'prores' as Format, label: 'ProRes', tooltip: 'For editing' },
                      { value: 'gif' as Format, label: 'GIF', tooltip: 'Animated' },
                    ]}
                  />
                </div>

                {/* Divider & Summary */}
                <div className="pt-3 mt-1 border-t border-border/30">
                  <div className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2 text-muted-foreground/60">
                      <FileVideo className="w-3.5 h-3.5" />
                      <span>{currentProject?.timeline?.tracks?.[0]?.clips?.length || 0} clips · {currentProject?.timeline?.duration ? (currentProject.timeline.duration / 1000).toFixed(1) : '0.0'}s</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {canvasAspectLabel && (
                        <span
                          className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-primary/20"
                          title={`Canvas aspect ratio: ${canvasAspectLabel}`}
                        >
                          {canvasAspectLabel}
                        </span>
                      )}
                      {format !== 'gif' && (
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[11px] font-medium ring-1",
                            exportSpeed.tone === 'ok'
                              ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                              : "bg-amber-500/10 text-amber-300 ring-amber-500/20"
                          )}
                          title={machineProfile
                            ? `Estimated speed for this machine (${machineProfile.cpuCores} cores, ${machineProfile.totalMemoryGB.toFixed(1)}GB)`
                            : 'Estimated speed (machine-specific)'
                          }
                        >
                          {exportSpeed.label}
                        </span>
                      )}
                      <span className="font-medium text-foreground tabular-nums">
                        {format === 'gif'
                          ? '480p · 15fps'
                          : `${projectSettings.resolution.width}×${projectSettings.resolution.height} · ${frameRate}fps`
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Progress State */}
            {isExporting && progress && (() => {
              // Fun loading messages that rotate based on progress
              const funMessages = [
                'Brewing your pixels...',
                'Cooking up some bytes...',
                'Convincing frames to cooperate...',
                'Teaching bytes to dance...',
                'Polishing each frame...',
                'Assembling movie magic...',
                'Almost there, hang tight...',
                'Making it look good...',
                'Compressing with care...',
                'Frame by frame...',
                'Working on it...',
                'Finishing touches...',
                'Finishing...',
              ]
              const messageIndex = Math.floor((progress.progress / 100) * (funMessages.length - 1))
              const funMessage = funMessages[Math.min(messageIndex, funMessages.length - 1)]

              return (
                <div className="py-8 space-y-5">
                  <div className="relative w-16 h-16 mx-auto">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        className="stroke-muted/30"
                        strokeWidth="8"
                        fill="transparent"
                        r="42"
                        cx="50"
                        cy="50"
                      />
                      <circle
                        className="stroke-primary transition-all duration-300 ease-out"
                        strokeWidth="8"
                        strokeLinecap="round"
                        fill="transparent"
                        r="42"
                        cx="50"
                        cy="50"
                        strokeDasharray="264"
                        strokeDashoffset={264 - (clamp(progress.progress, 0, 100) / 100) * 264}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-semibold tabular-nums">
                        {Math.round(progress.progress)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] text-muted-foreground">
                      {funMessage}
                    </p>
                    {formatEta(progress.eta) && (
                      <p className="mt-1 text-[12px] text-muted-foreground/70 tabular-nums">
                        ETA {formatEta(progress.eta)}
                        {typeof progress.currentFrame === 'number' && typeof progress.totalFrames === 'number'
                          ? ` · ${progress.currentFrame}/${progress.totalFrames} frames`
                          : null}
                      </p>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Success State */}
            {lastExport && progress?.progressStage === 'complete' && (
              <div className="py-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Check className="w-4.5 h-4.5 text-emerald-500" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Export Complete</p>
                    <p className="text-xs text-muted-foreground">{progress.progressMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Error State */}
            {progress?.progressStage === 'error' && (
              <div className="py-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="w-4.5 h-4.5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Export Failed</p>
                    <p className="text-xs text-muted-foreground">{progress.progressMessage}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  className="w-full"
                >
                  Try Again
                </Button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-2 border-t border-border/50 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={isExporting ? cancelExport : onClose}
              className="text-xs"
            >
              Cancel
            </Button>

            {lastExport && progress?.progressStage === 'complete' ? (
              <Button size="sm" onClick={handleSave} className="text-xs">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Save
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleExport}
                disabled={!currentProject || isExporting}
                className="text-xs"
              >
                {isExporting ? (
                  <>
                    <Zap className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                    Export
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
