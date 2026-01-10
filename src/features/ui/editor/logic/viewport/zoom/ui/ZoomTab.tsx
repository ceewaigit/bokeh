'use client'

import React, { useMemo } from 'react'
import { ZoomIn, Sparkles, Gauge, AppWindow, Activity, ChevronRight, RotateCcw } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { AccordionSection } from '@/components/ui/accordion-section'
import { useProjectStore } from '@/features/core/stores/project-store'
import type { Clip, Effect, ZoomEffectData, ZoomBlock, CropEffectData } from '@/types/project'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import type { SelectedEffectLayer } from '@/features/effects/types'
import { EffectLayerType } from '@/features/effects/types'
import { getCropEffectForClip, getDataOfType, getEffectsOfType } from '@/features/effects/core/filters'
import { EffectStore } from '@/features/effects/core/store'
import { AddEffectCommand } from '@/features/core/commands'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'
import { DEFAULT_ZOOM_DATA } from '../config'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'
import { ZoomTargetPreview } from './ZoomTargetPreview'
import { CompactSlider, SegmentedControl, SectionHeader } from '@/features/effects/components/motion-controls'
import { useTimelineMetadata } from '@/features/ui/timeline/hooks/use-timeline-metadata'
import { getSourceDimensions, getSourceDimensionsStatic } from '@/features/rendering/canvas/math/coordinates'
import { msToFrame } from '@/features/rendering/renderer/compositions/utils/time/frame-time'
import { getCameraOutputContext } from '@/features/ui/editor/logic/viewport/logic/path-calculator'
import { getActiveClipDataAtFrame } from '@/features/rendering/renderer/utils/get-active-clip-data-at-frame'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { computeCameraState } from '@/features/ui/editor/logic/viewport/logic/orchestrator'
import { DEFAULT_PROJECT_SETTINGS } from '@/features/core/settings/defaults'
import { motion, AnimatePresence } from 'framer-motion'
import { useShallow } from 'zustand/react/shallow'

interface ZoomBlockEditorProps {
    blockId: string
    zoomData: ZoomEffectData
    sourceDims: { width: number; height: number } | null
    timelineMetadata: any
    cropData: CropEffectData | null
    onUpdate: (blockId: string, updates: Partial<ZoomBlock>) => void
    seedManualTarget: () => any
}

function ZoomBlockEditor({
    blockId,
    zoomData,
    sourceDims,
    timelineMetadata,
    cropData,
    onUpdate,
    seedManualTarget
}: ZoomBlockEditorProps) {
    const [localScale, setLocalScale] = React.useState<number | null>(null)
    const [localIntroMs, setLocalIntroMs] = React.useState<number | null>(null)
    const [localOutroMs, setLocalOutroMs] = React.useState<number | null>(null)
    const [localMouseIdlePx, setLocalMouseIdlePx] = React.useState<number | null>(null)

    const scaleResetTimeoutRef = React.useRef<number | null>(null)
    const introResetTimeoutRef = React.useRef<number | null>(null)
    const outroResetTimeoutRef = React.useRef<number | null>(null)
    const mouseIdleResetTimeoutRef = React.useRef<number | null>(null)

    const scheduleReset = (
        timeoutRef: React.MutableRefObject<number | null>,
        reset: () => void,
        delayMs: number
    ) => {
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
        timeoutRef.current = window.setTimeout(reset, delayMs)
    }

    const followStrategy = zoomData.followStrategy ?? ZoomFollowStrategy.Mouse
    const isFillScreen = zoomData.autoScale === 'fill'
    const isCenterLocked = followStrategy === ZoomFollowStrategy.Center
    const isManualFocus = followStrategy === ZoomFollowStrategy.Manual
    const hasManualTarget = isManualFocus && zoomData.targetX != null && zoomData.targetY != null

    return (
        <div className="space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Scale Control */}
            <div className="rounded-md bg-background/40 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <ZoomIn className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-semibold tracking-[-0.01em]">Zoom Level</span>
                        <InfoTooltip content="Adjusts how close the zoom feels." />
                    </div>
                    <span className="text-xs font-mono text-primary tabular-nums">
                        {isFillScreen ? 'Fill' : `${(localScale ?? zoomData.scale ?? DEFAULT_ZOOM_DATA.scale).toFixed(1)}x`}
                    </span>
                </div>
                <Slider
                    value={[localScale ?? zoomData.scale ?? DEFAULT_ZOOM_DATA.scale]}
                    onValueChange={([value]) => setLocalScale(value)}
                    onValueCommit={([value]) => {
                        onUpdate(blockId, { scale: value })
                        scheduleReset(scaleResetTimeoutRef, () => setLocalScale(null), 300)
                    }}
                    min={1}
                    max={7}
                    step={0.1}
                    disabled={isFillScreen}
                />
                <div className="flex justify-between text-xs text-muted-foreground/70 tabular-nums">
                    <span>1x</span>
                    <span>7x</span>
                </div>
            </div>

            {/* Focus Mode */}
            <div className="rounded-md bg-background/40 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-[-0.01em]">Focus Mode</span>
                    <InfoTooltip content="Choose whether zoom tracks the pointer, stays centered, or locks to a manual zoom point." />
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { id: ZoomFollowStrategy.Mouse, label: 'Track Cursor', active: !isCenterLocked && !isManualFocus },
                        { id: ZoomFollowStrategy.Manual, label: 'Manual', active: isManualFocus },
                        { id: ZoomFollowStrategy.Center, label: 'Center Lock', active: isCenterLocked }
                    ].map(mode => (
                        <button
                            key={mode.id}
                            className={cn(
                                "px-3 py-2 text-xs font-medium rounded-md transition-colors",
                                mode.active ? "bg-primary text-primary-foreground" : "bg-background/60 text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => {
                                if (mode.id === ZoomFollowStrategy.Center) {
                                    onUpdate(blockId, { followStrategy: mode.id, scale: 1, autoScale: 'fill' })
                                } else if (mode.id === ZoomFollowStrategy.Manual) {
                                    onUpdate(blockId, { followStrategy: mode.id, autoScale: undefined, ...seedManualTarget() })
                                } else {
                                    onUpdate(blockId, { followStrategy: mode.id, autoScale: undefined })
                                }
                            }}
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground/70 leading-snug">
                    <span>
                        {isManualFocus ? 'Manual zoom lets you drag the zoom window in the sidebar preview.' : 'Center Lock keeps the view fixed for a clean, professional look.'}
                    </span>
                    {isManualFocus && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2 py-0.5 text-2xs uppercase tracking-[0.2em] text-muted-foreground/80">
                            <Sparkles className="h-3 w-3" />
                            Sidebar drag
                        </span>
                    )}
                </div>
            </div>

            {isManualFocus && !isFillScreen && (
                <div className="rounded-md border border-border/40 bg-background/30 p-2.5 space-y-3">
                    <ZoomTargetPreview
                        zoomData={zoomData}
                        screenWidth={sourceDims?.width ?? zoomData.screenWidth ?? timelineMetadata?.width ?? 1920}
                        screenHeight={sourceDims?.height ?? zoomData.screenHeight ?? timelineMetadata?.height ?? 1080}
                        outputWidth={timelineMetadata?.width ?? 1920}
                        outputHeight={timelineMetadata?.height ?? 1080}
                        cropData={cropData}
                        onCommit={(updates) => onUpdate(blockId, updates)}
                    />
                    {!hasManualTarget && (
                        <div className="text-xs text-muted-foreground/70 leading-snug">
                            Drag inside the preview to set your first zoom point.
                        </div>
                    )}
                </div>
            )}

            {/* Easing Controls */}
            <div className="rounded-lg bg-background/40 p-3 space-y-3">
                <SectionHeader icon={Gauge} title="Transition Timing" />
                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                    {[
                        { label: 'Zoom In', val: localIntroMs, dataVal: zoomData.introMs, set: setLocalIntroMs, commit: (v: number) => { onUpdate(blockId, { introMs: v }); scheduleReset(introResetTimeoutRef, () => setLocalIntroMs(null), 300) } },
                        { label: 'Zoom Out', val: localOutroMs, dataVal: zoomData.outroMs, set: setLocalOutroMs, commit: (v: number) => { onUpdate(blockId, { outroMs: v }); scheduleReset(outroResetTimeoutRef, () => setLocalOutroMs(null), 300) } }
                    ].map((ease, i) => (
                        <div key={i} className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{ease.label}</span>
                                <span className="font-mono tabular-nums">{ease.val ?? (ease.dataVal || DEFAULT_ZOOM_DATA.introMs)}ms</span>
                            </div>
                            <Slider
                                value={[ease.val ?? (ease.dataVal || DEFAULT_ZOOM_DATA.introMs)]}
                                onValueChange={([v]) => ease.set(v)}
                                onValueCommit={([v]) => ease.commit(v)}
                                min={0} max={2000} step={50}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <AccordionSection title="Advanced" className="bg-background/30" contentClassName="pt-2.5">
                {!isFillScreen ? (
                    <div className="rounded-md bg-background/30 p-3 space-y-3">
                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            <span>Dead Zone</span>
                            <span className="font-mono tabular-nums">{zoomData.mouseIdlePx ?? DEFAULT_ZOOM_DATA.mouseIdlePx ?? 3}px</span>
                        </div>
                        <Slider
                            value={[localMouseIdlePx ?? (zoomData.mouseIdlePx ?? DEFAULT_ZOOM_DATA.mouseIdlePx ?? 3)]}
                            onValueChange={([v]) => setLocalMouseIdlePx(v)}
                            onValueCommit={([v]) => {
                                onUpdate(blockId, { mouseIdlePx: v })
                                scheduleReset(mouseIdleResetTimeoutRef, () => setLocalMouseIdlePx(null), 200)
                            }}
                            min={1} max={20} step={1}
                        />
                        <p className="text-xs text-muted-foreground/70">Minimum cursor movement to trigger pan</p>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground/70">Advanced tracking is disabled when “Fill screen” is enabled.</p>
                )}
            </AccordionSection>
        </div>
    )
}

interface ZoomTabProps {
    effects: Effect[] | undefined
    selectedEffectLayer?: SelectedEffectLayer
    selectedClip: Clip | null
    onZoomBlockUpdate?: (blockId: string, updates: Partial<ZoomBlock>) => void
}

export function ZoomTab({
    effects,
    selectedEffectLayer,
    selectedClip,
    onZoomBlockUpdate
}: ZoomTabProps) {
    const executorRef = useCommandExecutor()
    const { project, currentTime } = useProjectStore(
        useShallow(s => ({
            project: s.currentProject,
            currentTime: s.currentTime,
        }))
    )
    const camera = useProjectStore(s => s.currentProject?.settings.camera ?? DEFAULT_PROJECT_SETTINGS.camera)
    const setCameraSettings = useProjectStore(s => s.setCameraSettings)
    const timelineMetadata = useTimelineMetadata(project)

    const zoomEffects = effects ? getEffectsOfType(effects, EffectType.Zoom) : []
    const cropEffect = selectedClip && effects ? getCropEffectForClip(effects, selectedClip) : null
    const cropData = cropEffect ? getDataOfType<CropEffectData>(cropEffect, EffectType.Crop) : null

    const activeRecording = useMemo(() => {
        if (!project?.recordings?.length) return null
        return selectedClip
            ? project.recordings.find(r => r.id === selectedClip.recordingId) ?? null
            : project.recordings[0]
    }, [project, selectedClip])

    const sourceDims = useMemo(() => activeRecording ? getSourceDimensionsStatic(activeRecording, activeRecording.metadata ?? null) : null, [activeRecording])

    const [localStiffness, setLocalStiffness] = React.useState<number | null>(null)
    const [localDamping, setLocalDamping] = React.useState<number | null>(null)
    const [cameraStylePreset, setCameraStylePreset] = React.useState<string>('cinematic')
    const [zoomBlurPreset, setZoomBlurPreset] = React.useState<string>('balanced')
    const [motionBlurPreset, setMotionBlurPreset] = React.useState<string>('balanced')
    const [isAdvancedBlurOpen, setIsAdvancedBlurOpen] = React.useState(false)

    const cameraStylePresets = React.useMemo(() => ([
        { id: 'tight', label: 'Tight', stiffness: 300, damping: 35, mass: 1, value: 8 },
        { id: 'balanced', label: 'Balanced', stiffness: 180, damping: 27, mass: 1, value: 24 },
        { id: 'steady', label: 'Steady', stiffness: 100, damping: 20, mass: 1, value: 36 },
        { id: 'cinematic', label: 'Cinematic', stiffness: 60, damping: 15, mass: 1, value: 48 },
        { id: 'floaty', label: 'Floaty', stiffness: 30, damping: 6, mass: 1, value: 72 },
        { id: 'custom', label: 'Custom', stiffness: null, damping: null, mass: null, value: null },
    ] as const), [])

    const zoomBlurPresets = React.useMemo(() => ([
        { id: 'subtle', label: 'Subtle', value: 30 },
        { id: 'balanced', label: 'Balanced', value: 50 },
        { id: 'dynamic', label: 'Dynamic', value: 70 },
        { id: 'custom', label: 'Custom', value: null },
    ] as const), [])

    const motionBlurPresets = React.useMemo(() => ([
        { id: 'subtle', label: 'Subtle', values: { intensity: 25, threshold: 20, gamma: 1.0, smooth: 8, ramp: 0.5, clamp: 45, black: 0, saturation: 1.0, samples: 16 } },
        { id: 'balanced', label: 'Balanced', values: { intensity: 100, threshold: 70, gamma: 1.0, smooth: 6, ramp: 0.5, clamp: 60, black: 0, saturation: 1.0, samples: 32 } },
        { id: 'dynamic', label: 'Dynamic', values: { intensity: 100, threshold: 30, gamma: 1.0, smooth: 5, ramp: 0.3, clamp: 100, black: 0, saturation: 1.0, samples: 48 } },
        { id: 'custom', label: 'Custom', values: null },
    ] as const), [])

    React.useEffect(() => {
        if (camera.cameraDynamics) {
            const match = cameraStylePresets.find(p => p.stiffness === camera.cameraDynamics?.stiffness && p.damping === camera.cameraDynamics?.damping)
            setCameraStylePreset(match?.id ?? 'custom')
        }
    }, [camera, cameraStylePresets])

    React.useEffect(() => {
        if (!camera.refocusBlurEnabled) {
            setZoomBlurPreset('balanced') // Default visual state
            return
        }
        const match = zoomBlurPresets.find(p => p.value === camera.refocusBlurIntensity)
        setZoomBlurPreset(match?.id ?? 'custom')
    }, [camera.refocusBlurEnabled, camera.refocusBlurIntensity, zoomBlurPresets])

    React.useEffect(() => {
        if (!camera.motionBlurEnabled) {
            setMotionBlurPreset('balanced') // Default visual state
            return
        }
        // Fuzzy match intensity and threshold
        const match = motionBlurPresets.find(p =>
            p.values &&
            p.values.intensity === camera.motionBlurIntensity &&
            p.values.threshold === camera.motionBlurThreshold
        )
        setMotionBlurPreset(match?.id ?? 'custom')
    }, [camera.motionBlurEnabled, camera.motionBlurIntensity, camera.motionBlurThreshold, motionBlurPresets])

    const seedManualTargetFromLiveCamera = () => {
        if (!project || !timelineMetadata) return null
        const fps = timelineMetadata.fps
        const frameLayout = TimelineDataService.getFrameLayout(project, fps)
        const recordingsMap = TimelineDataService.getRecordingsMap(project)
        const frame = Math.max(0, msToFrame(currentTime, fps))
        const clipData = getActiveClipDataAtFrame({ frame, frameLayout, fps, effects: effects ?? EffectStore.getAll(project), getRecording: (id) => recordingsMap.get(id) ?? null })
        if (!clipData) return null

        const context = getCameraOutputContext({ clipEffects: clipData.effects, timelineMs: currentTime, compositionWidth: timelineMetadata.width, compositionHeight: timelineMetadata.height, recording: clipData.recording })
        const computed = computeCameraState({ ...context, effects: clipData.effects, timelineMs: currentTime, sourceTimeMs: clipData.sourceTimeMs, recording: clipData.recording, metadata: clipData.recording?.metadata ?? null, physics: { x: 0.5, y: 0.5, vx: 0, vy: 0, lastTimeMs: currentTime, lastSourceTimeMs: clipData.sourceTimeMs }, deterministic: true })
        const dims = getSourceDimensions(clipData.sourceTimeMs, clipData.recording, clipData.recording?.metadata ?? null)

        return { targetX: Math.max(0, Math.min(1, computed.zoomCenter.x)) * dims.width, targetY: Math.max(0, Math.min(1, computed.zoomCenter.y)) * dims.height, screenWidth: dims.width, screenHeight: dims.height }
    }

    const selectedBlock = selectedEffectLayer?.type === EffectLayerType.Zoom ? zoomEffects.find(e => e.id === selectedEffectLayer.id) : null

    return (
        <div className="space-y-2.5">
            <div className="rounded-2xl border border-border/30 bg-background/20 backdrop-blur-sm p-3.5 space-y-3 shadow-sm hover:bg-background/30 overflow-hidden">
                <SectionHeader icon={Gauge} title="Cameraman Style" subtitle="Tune pan timing and feel" action={<button onClick={() => setCameraSettings(DEFAULT_PROJECT_SETTINGS.camera)} className="p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"><RotateCcw className="w-3 h-3" /></button>} />
                <SegmentedControl options={cameraStylePresets} value={cameraStylePreset} onChange={(id) => {
                    const preset = cameraStylePresets.find(p => p.id === id)
                    if (preset && preset.id !== 'custom') {
                        setCameraSettings({ cameraDynamics: { stiffness: preset.stiffness!, damping: preset.damping!, mass: preset.mass! }, cameraSmoothness: preset.value })
                    }
                }} namespace="camera-style" wrap columns={3} />
                <AnimatePresence>
                    {cameraStylePreset === 'custom' && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="pt-1 space-y-4">
                            <CompactSlider label="Responsiveness" value={localStiffness ?? camera.cameraDynamics?.stiffness ?? 120} min={10} max={300} onValueChange={setLocalStiffness} onValueCommit={v => setCameraSettings({ cameraDynamics: { stiffness: v, damping: localDamping ?? camera.cameraDynamics?.damping ?? 30, mass: 1 } })} />
                            <CompactSlider label="Damping" value={localDamping ?? camera.cameraDynamics?.damping ?? 30} min={5} max={100} onValueChange={setLocalDamping} onValueCommit={v => setCameraSettings({ cameraDynamics: { stiffness: localStiffness ?? camera.cameraDynamics?.stiffness ?? 120, damping: v, mass: 1 } })} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="rounded-2xl border border-border/30 bg-background/20 backdrop-blur-sm p-3.5 space-y-4 shadow-sm hover:bg-background/30 overflow-hidden">
                <SectionHeader icon={AppWindow} title="Zoom Blur" subtitle="Depth during transitions" />
                <SegmentedControl options={zoomBlurPresets} value={zoomBlurPreset} onChange={id => {
                    const val = zoomBlurPresets.find(p => p.id === id)?.value
                    if (val != null) setCameraSettings({ refocusBlurIntensity: val, refocusBlurEnabled: val > 0 })
                }} namespace="zoom-blur" wrap columns={3} />
                <AnimatePresence>
                    {zoomBlurPreset === 'custom' && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="pt-1">
                            <CompactSlider label="Blur Strength" value={camera.refocusBlurIntensity ?? 40} min={0} max={100} unit="%" onValueChange={v => setCameraSettings({ refocusBlurIntensity: v, refocusBlurEnabled: v > 0 })} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {selectedBlock ? (
                <ZoomBlockEditor
                    blockId={selectedBlock.id}
                    zoomData={selectedBlock.data as ZoomEffectData}
                    sourceDims={sourceDims}
                    timelineMetadata={timelineMetadata}
                    cropData={cropData}
                    onUpdate={onZoomBlockUpdate!}
                    seedManualTarget={seedManualTargetFromLiveCamera}
                />
            ) : (
                <div className="rounded-md bg-background/40 p-2.5">
                    <div className="text-xs font-semibold tracking-[-0.01em]">Select a zoom block</div>
                    <p className="mt-1 text-xs text-muted-foreground">Click a zoom block in the timeline to edit behavior.</p>
                </div>
            )}

            <div className="rounded-2xl border border-border/30 bg-background/20 backdrop-blur-sm p-3.5 space-y-4 shadow-sm hover:bg-background/30 overflow-hidden">
                <SectionHeader icon={Activity} title="Motion Blur" subtitle="Natural movement trails" />
                <SegmentedControl options={motionBlurPresets} value={motionBlurPreset} onChange={id => {
                    const v = motionBlurPresets.find(p => p.id === id)?.values
                    if (v) setCameraSettings({ motionBlurIntensity: v.intensity, motionBlurThreshold: v.threshold, motionBlurGamma: v.gamma, motionBlurSmoothWindow: v.smooth, motionBlurRampRange: v.ramp, motionBlurClamp: v.clamp, motionBlurBlackLevel: v.black ?? 0, motionBlurSaturation: v.saturation ?? 1.0, motionBlurSamples: v.samples, motionBlurEnabled: true })
                }} namespace="motion-blur" />
                <CompactSlider label="Shutter Angle" value={camera.motionBlurIntensity ?? 50} min={0} max={200} step={5} unit="%" onValueChange={v => setCameraSettings({ motionBlurIntensity: v, motionBlurEnabled: v > 0 })} />
                <button onClick={() => setIsAdvancedBlurOpen(!isAdvancedBlurOpen)} className="flex items-center gap-1.5 text-3xs font-semibold text-muted-foreground hover:text-primary"><ChevronRight className={cn("w-3 h-3 transition-transform", isAdvancedBlurOpen && "rotate-90")} />ADVANCED SETTINGS</button>
                <AnimatePresence>
                    {isAdvancedBlurOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-4 pb-2 pl-1 border-l-2 border-border/30 ml-1.5">
                            <CompactSlider label="Threshold" value={camera.motionBlurThreshold ?? 50} min={0} max={100} unit="%" onValueChange={v => setCameraSettings({ motionBlurThreshold: v })} />
                            <CompactSlider label="Max Radius" value={camera.motionBlurClamp ?? 60} min={10} max={200} unit=" px" onValueChange={v => setCameraSettings({ motionBlurClamp: v })} />
                            <div className="flex items-center justify-between py-1 text-2xs text-muted-foreground"><span>WebGL Pipeline</span><Switch checked={camera.motionBlurUseWebglVideo ?? true} onCheckedChange={v => setCameraSettings({ motionBlurUseWebglVideo: v })} /></div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
