'use client'

import React, { useMemo } from 'react'
import { ZoomIn, AppWindow, Activity, ChevronDown, RotateCcw, Target, Video, Crosshair } from 'lucide-react'
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
import { EffectStore } from '@/features/effects/core/effects-store'
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
import { getEffectiveZoomEaseDurations } from '@/features/rendering/canvas/math/transforms/zoom-transform'
import { motion, AnimatePresence } from 'framer-motion'
import { useShallow } from 'zustand/react/shallow'

// Inline option button for compact selections
function InlineOption({
    label,
    active,
    onClick
}: {
    label: string
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-2.5 py-1.5 text-2xs font-medium rounded-md transition-all",
                active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
        >
            {label}
        </button>
    )
}

// Sub-section for nested options
function SubSection({
    children,
    className
}: {
    children: React.ReactNode
    className?: string
}) {
    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn("overflow-hidden", className)}
        >
            <div className="pl-3 border-l-2 border-primary/20 space-y-3 py-2">
                {children}
            </div>
        </motion.div>
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

    // Local state for sliders
    const [localScale, setLocalScale] = React.useState<number | null>(null)
    const [localIntroMs, setLocalIntroMs] = React.useState<number | null>(null)
    const [localOutroMs, setLocalOutroMs] = React.useState<number | null>(null)
    const [localStiffness, setLocalStiffness] = React.useState<number | null>(null)
    const [localDamping, setLocalDamping] = React.useState<number | null>(null)

    // UI state
    const [cameraStylePreset, setCameraStylePreset] = React.useState<string>('cinematic')
    const [isEffectsOpen, setIsEffectsOpen] = React.useState(false)
    const [isTimingOpen, setIsTimingOpen] = React.useState(false)
    const [isAdvancedBlurOpen, setIsAdvancedBlurOpen] = React.useState(false)

    // Track scale before Center mode to restore when switching away
    const [preZoomScale, setPreZoomScale] = React.useState<number | null>(null)

    // Timeout refs for debouncing
    const scaleResetTimeoutRef = React.useRef<number | null>(null)
    const introResetTimeoutRef = React.useRef<number | null>(null)
    const outroResetTimeoutRef = React.useRef<number | null>(null)

    const scheduleReset = (
        timeoutRef: React.RefObject<number | null>,
        reset: () => void,
        delayMs: number
    ) => {
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
        timeoutRef.current = window.setTimeout(reset, delayMs)
    }

    // Presets
    const cameraStylePresets = React.useMemo(() => ([
        { id: 'tight', label: 'Tight', stiffness: 300, damping: 35, mass: 1, value: 8 },
        { id: 'balanced', label: 'Balanced', stiffness: 180, damping: 27, mass: 1, value: 24 },
        { id: 'cinematic', label: 'Cinematic', stiffness: 60, damping: 15, mass: 1, value: 48 },
        { id: 'floaty', label: 'Floaty', stiffness: 30, damping: 6, mass: 1, value: 72 },
        { id: 'custom', label: 'Custom', stiffness: null, damping: null, mass: null, value: null },
    ] as const), [])

    const cursorFramingOptions = useMemo(() => ([
        { id: 'deadzone', label: 'Stable' },
        { id: 'smooth', label: 'Glide' },
        { id: 'direct', label: 'Locked' },
    ] as const), [])

    const zoomAimOptions = useMemo(() => ([
        { id: 'cursor', label: 'Cursor' },
        { id: 'lead', label: 'Predict' },
        { id: 'center', label: 'Center' },
    ] as const), [])

    const transitionStyleOptions = useMemo(() => ([
        { id: 'smoother', label: 'Smooth' },
        { id: 'expo', label: 'Cinematic' },
        { id: 'sine', label: 'Gentle' },
        { id: 'cubic', label: 'Sharp' },
        { id: 'linear', label: 'Linear' },
    ] as const), [])

    // Sync preset state with camera settings
    React.useEffect(() => {
        if (camera.cameraDynamics) {
            const match = cameraStylePresets.find(p => p.stiffness === camera.cameraDynamics?.stiffness && p.damping === camera.cameraDynamics?.damping)
            setCameraStylePreset(match?.id ?? 'custom')
        }
    }, [camera, cameraStylePresets])

    // Seed manual target from live camera position
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

    // Selected block data
    const selectedBlock = selectedEffectLayer?.type === EffectLayerType.Zoom ? zoomEffects.find(e => e.id === selectedEffectLayer.id) : null
    const selectedZoomData = selectedBlock?.data as ZoomEffectData | undefined

    // Block settings
    const followStrategy = selectedZoomData?.followStrategy ?? ZoomFollowStrategy.Mouse
    const isFillScreen = selectedZoomData?.autoScale === 'fill'
    const isCenterLocked = followStrategy === ZoomFollowStrategy.Center
    const isManualFocus = followStrategy === ZoomFollowStrategy.Manual
    const isTrackCursor = !isCenterLocked && !isManualFocus
    const hasManualTarget = isManualFocus && selectedZoomData?.targetX != null && selectedZoomData?.targetY != null
    const blockDurationMs = selectedBlock ? Math.max(0, selectedBlock.endTime - selectedBlock.startTime) : 0

    const selectedMouseFollowAlgorithm = selectedZoomData?.mouseFollowAlgorithm ?? DEFAULT_ZOOM_DATA.mouseFollowAlgorithm ?? 'deadzone'
    const selectedZoomIntoCursorMode = selectedZoomData?.zoomIntoCursorMode ?? DEFAULT_ZOOM_DATA.zoomIntoCursorMode ?? 'cursor'
    const selectedTransitionStyle = selectedZoomData?.transitionStyle ?? 'smoother'

    const _effectiveEase = React.useMemo(() => {
        return getEffectiveZoomEaseDurations(
            Math.max(0, blockDurationMs),
            selectedZoomData?.introMs ?? DEFAULT_ZOOM_DATA.introMs,
            selectedZoomData?.outroMs ?? DEFAULT_ZOOM_DATA.outroMs,
            selectedZoomData?.scale ?? DEFAULT_ZOOM_DATA.scale
        )
    }, [blockDurationMs, selectedZoomData?.introMs, selectedZoomData?.outroMs, selectedZoomData?.scale])

    // Dynamic slider limits based on block duration
    // Max for each transition = block duration (system handles overlap gracefully)
    // Round to nearest 50ms for cleaner UI
    const introMs = selectedZoomData?.introMs ?? DEFAULT_ZOOM_DATA.introMs
    const outroMs = selectedZoomData?.outroMs ?? DEFAULT_ZOOM_DATA.outroMs
    const maxTransitionMs = Math.max(100, Math.ceil(blockDurationMs / 50) * 50)
    // Ensure the current value is always reachable (in case block was shortened)
    const introSliderMax = Math.max(maxTransitionMs, introMs)
    const outroSliderMax = Math.max(maxTransitionMs, outroMs)

    const handleBlockUpdate = (updates: Partial<ZoomBlock>) => {
        if (selectedBlock && onZoomBlockUpdate) {
            onZoomBlockUpdate(selectedBlock.id, updates)
        }
    }

    return (
        <div className="space-y-3">
            {/* ========== ZOOM BLOCK SETTINGS (when selected) ========== */}
            {selectedBlock ? (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-primary/20 text-primary">
                                <Target className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-semibold">Zoom Block</span>
                        </div>
                        <span className="text-2xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">
                            {Math.round(blockDurationMs)}ms
                        </span>
                    </div>

                    {/* Zoom Level */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <ZoomIn className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs font-medium">Zoom Level</span>
                            </div>
                            <span className="text-xs font-mono text-primary tabular-nums">
                                {isFillScreen ? 'Fill' : `${(localScale ?? selectedZoomData?.scale ?? DEFAULT_ZOOM_DATA.scale).toFixed(1)}x`}
                            </span>
                        </div>
                        <Slider
                            value={[localScale ?? selectedZoomData?.scale ?? DEFAULT_ZOOM_DATA.scale]}
                            onValueChange={([value]) => setLocalScale(value)}
                            onValueCommit={([value]) => {
                                handleBlockUpdate({ scale: value })
                                scheduleReset(scaleResetTimeoutRef, () => setLocalScale(null), 300)
                            }}
                            min={1}
                            max={3}
                            step={0.1}
                            disabled={isFillScreen}
                        />
                        <div className="flex justify-between text-3xs text-muted-foreground/60 tabular-nums">
                            <span>1x</span>
                            <span>3x</span>
                        </div>
                    </div>

                    {/* Focus Mode */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-1.5">
                            <Crosshair className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs font-medium">Focus</span>
                        </div>
                        <div className="flex gap-1.5">
                            <InlineOption
                                label="Track Cursor"
                                active={isTrackCursor}
                                onClick={() => {
                                    // Restore scale if coming from Center mode
                                    const restoreScale = isCenterLocked && preZoomScale != null ? preZoomScale : undefined
                                    handleBlockUpdate({
                                        followStrategy: ZoomFollowStrategy.Mouse,
                                        autoScale: undefined,
                                        ...(restoreScale != null && { scale: restoreScale })
                                    })
                                    if (restoreScale != null) setPreZoomScale(null)
                                }}
                            />
                            <InlineOption
                                label="Manual Point"
                                active={isManualFocus}
                                onClick={() => {
                                    const manualTarget = seedManualTargetFromLiveCamera()
                                    // Fallback to center with screen dimensions if seeding fails
                                    const target = manualTarget ?? {
                                        targetX: (sourceDims?.width ?? 1920) / 2,
                                        targetY: (sourceDims?.height ?? 1080) / 2,
                                        screenWidth: sourceDims?.width ?? 1920,
                                        screenHeight: sourceDims?.height ?? 1080
                                    }
                                    // Restore scale if coming from Center mode
                                    const restoreScale = isCenterLocked && preZoomScale != null ? preZoomScale : undefined
                                    handleBlockUpdate({
                                        followStrategy: ZoomFollowStrategy.Manual,
                                        autoScale: undefined,
                                        ...target,
                                        ...(restoreScale != null && { scale: restoreScale })
                                    })
                                    if (restoreScale != null) setPreZoomScale(null)
                                }}
                            />
                            <InlineOption
                                label="Center"
                                active={isCenterLocked}
                                onClick={() => {
                                    // Save current scale to restore later when leaving Center mode
                                    const currentScale = selectedZoomData?.scale ?? DEFAULT_ZOOM_DATA.scale
                                    if (!isCenterLocked && currentScale > 1) {
                                        setPreZoomScale(currentScale)
                                    }
                                    handleBlockUpdate({ followStrategy: ZoomFollowStrategy.Center, scale: 1, autoScale: 'fill' })
                                }}
                            />
                        </div>

                        {/* Track Cursor sub-options */}
                        <AnimatePresence>
                            {isTrackCursor && !isFillScreen && (
                                <SubSection>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-2xs text-muted-foreground">Pan Style</span>
                                            <InfoTooltip content="How smoothly the camera follows your cursor movements" />
                                        </div>
                                        <div className="flex gap-1">
                                            {cursorFramingOptions.map(opt => (
                                                <InlineOption
                                                    key={opt.id}
                                                    label={opt.label}
                                                    active={selectedMouseFollowAlgorithm === opt.id}
                                                    onClick={() => handleBlockUpdate({ mouseFollowAlgorithm: opt.id as ZoomEffectData['mouseFollowAlgorithm'] })}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-2xs text-muted-foreground">Zoom Aim</span>
                                            <InfoTooltip content="Where the zoom focuses when transitioning in" />
                                        </div>
                                        <div className="flex gap-1">
                                            {zoomAimOptions.map(opt => (
                                                <InlineOption
                                                    key={opt.id}
                                                    label={opt.label}
                                                    active={selectedZoomIntoCursorMode === opt.id}
                                                    onClick={() => handleBlockUpdate({ zoomIntoCursorMode: opt.id as ZoomEffectData['zoomIntoCursorMode'] })}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <CompactSlider
                                        label="Dead Zone"
                                        value={selectedZoomData?.mouseIdlePx ?? DEFAULT_ZOOM_DATA.mouseIdlePx ?? 3}
                                        min={1}
                                        max={20}
                                        step={1}
                                        unit="px"
                                        onValueChange={v => handleBlockUpdate({ mouseIdlePx: v })}
                                    />
                                </SubSection>
                            )}
                        </AnimatePresence>

                        {/* Manual target preview */}
                        <AnimatePresence>
                            {isManualFocus && !isFillScreen && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="rounded-lg border border-border/40 bg-background/30 p-2.5 space-y-2">
                                        <ZoomTargetPreview
                                            zoomData={selectedZoomData!}
                                            screenWidth={sourceDims?.width ?? selectedZoomData?.screenWidth ?? timelineMetadata?.width ?? 1920}
                                            screenHeight={sourceDims?.height ?? selectedZoomData?.screenHeight ?? timelineMetadata?.height ?? 1080}
                                            outputWidth={timelineMetadata?.width ?? 1920}
                                            outputHeight={timelineMetadata?.height ?? 1080}
                                            cropData={cropData}
                                            onCommit={(updates) => handleBlockUpdate(updates)}
                                        />
                                        {!hasManualTarget && (
                                            <p className="text-2xs text-muted-foreground/70">
                                                Drag inside preview to set zoom point
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Transition Timing (collapsible) */}
                    <div className="space-y-2">
                        <button
                            onClick={() => setIsTimingOpen(!isTimingOpen)}
                            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                        >
                            <ChevronDown className={cn("w-3 h-3 transition-transform", isTimingOpen && "rotate-180")} />
                            Transition Timing
                        </button>
                        <AnimatePresence>
                            {isTimingOpen && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between text-2xs text-muted-foreground">
                                                <span>Zoom In</span>
                                                <span className="font-mono tabular-nums">
                                                    {(localIntroMs ?? selectedZoomData?.introMs ?? DEFAULT_ZOOM_DATA.introMs) === 0
                                                        ? 'Instant'
                                                        : `${localIntroMs ?? selectedZoomData?.introMs ?? DEFAULT_ZOOM_DATA.introMs}ms`}
                                                </span>
                                            </div>
                                            <Slider
                                                value={[localIntroMs ?? selectedZoomData?.introMs ?? DEFAULT_ZOOM_DATA.introMs]}
                                                onValueChange={([v]) => setLocalIntroMs(v)}
                                                onValueCommit={([v]) => {
                                                    handleBlockUpdate({ introMs: v })
                                                    scheduleReset(introResetTimeoutRef, () => setLocalIntroMs(null), 300)
                                                }}
                                                min={0}
                                                max={introSliderMax}
                                                step={50}
                                            />
                                            <div className="flex justify-between text-3xs text-muted-foreground/50">
                                                <span>Instant</span>
                                                <span>{introSliderMax}ms</span>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between text-2xs text-muted-foreground">
                                                <span>Zoom Out</span>
                                                <span className="font-mono tabular-nums">
                                                    {(localOutroMs ?? selectedZoomData?.outroMs ?? DEFAULT_ZOOM_DATA.outroMs) === 0
                                                        ? 'Instant'
                                                        : `${localOutroMs ?? selectedZoomData?.outroMs ?? DEFAULT_ZOOM_DATA.outroMs}ms`}
                                                </span>
                                            </div>
                                            <Slider
                                                value={[localOutroMs ?? selectedZoomData?.outroMs ?? DEFAULT_ZOOM_DATA.outroMs]}
                                                onValueChange={([v]) => setLocalOutroMs(v)}
                                                onValueCommit={([v]) => {
                                                    handleBlockUpdate({ outroMs: v })
                                                    scheduleReset(outroResetTimeoutRef, () => setLocalOutroMs(null), 300)
                                                }}
                                                min={0}
                                                max={outroSliderMax}
                                                step={50}
                                            />
                                            <div className="flex justify-between text-3xs text-muted-foreground/50">
                                                <span>Instant</span>
                                                <span>{outroSliderMax}ms</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Curve Style */}
                                    <div className="pt-3 space-y-2 border-t border-border/20 mt-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-2xs text-muted-foreground">Curve Style</span>
                                            <InfoTooltip content="Controls how the zoom accelerates and decelerates" />
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {transitionStyleOptions.map(opt => (
                                                <InlineOption
                                                    key={opt.id}
                                                    label={opt.label}
                                                    active={selectedTransitionStyle === opt.id}
                                                    onClick={() => handleBlockUpdate({ transitionStyle: opt.id as ZoomEffectData['transitionStyle'] })}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            ) : (
                /* No block selected prompt */
                <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Target className="w-4 h-4" />
                        <span className="text-sm font-medium">No zoom block selected</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground/70 pl-6">
                        Click a zoom block on the timeline to adjust its settings
                    </p>
                </div>
            )}

            {/* ========== CAMERA FEEL (global) ========== */}
            <div className="rounded-2xl border border-border/30 bg-background/20 backdrop-blur-sm p-4 space-y-3 shadow-sm">
                <div className="flex items-start justify-between">
                    <SectionHeader
                        icon={Video}
                        title="Camera Feel"
                        subtitle="Global pan smoothness"
                    />
                    <button
                        onClick={() => setCameraSettings(DEFAULT_PROJECT_SETTINGS.camera)}
                        className="p-1.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors rounded-md hover:bg-muted/20"
                        title="Reset to defaults"
                    >
                        <RotateCcw className="w-3 h-3" />
                    </button>
                </div>
                <SegmentedControl
                    options={cameraStylePresets}
                    value={cameraStylePreset}
                    onChange={(id) => {
                        setCameraStylePreset(id)  // Always update UI state first
                        const preset = cameraStylePresets.find(p => p.id === id)
                        if (preset && preset.id !== 'custom') {
                            setCameraSettings({
                                cameraDynamics: { stiffness: preset.stiffness!, damping: preset.damping!, mass: preset.mass! },
                                cameraSmoothness: preset.value
                            })
                        }
                    }}
                    namespace="camera-style"
                />
                <AnimatePresence>
                    {cameraStylePreset === 'custom' && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="pt-2 space-y-4">
                                <CompactSlider
                                    label="Responsiveness"
                                    value={localStiffness ?? camera.cameraDynamics?.stiffness ?? 120}
                                    min={30}
                                    max={200}
                                    onValueChange={setLocalStiffness}
                                    onValueCommit={v => setCameraSettings({
                                        cameraDynamics: {
                                            stiffness: v,
                                            damping: localDamping ?? camera.cameraDynamics?.damping ?? 30,
                                            mass: 1
                                        }
                                    })}
                                />
                                <CompactSlider
                                    label="Damping"
                                    value={localDamping ?? camera.cameraDynamics?.damping ?? 30}
                                    min={5}
                                    max={100}
                                    onValueChange={setLocalDamping}
                                    onValueCommit={v => setCameraSettings({
                                        cameraDynamics: {
                                            stiffness: localStiffness ?? camera.cameraDynamics?.stiffness ?? 120,
                                            damping: v,
                                            mass: 1
                                        }
                                    })}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ========== MOTION EFFECTS (collapsible) ========== */}
            <AccordionSection
                title="Motion Effects"
                className="rounded-2xl border border-border/30 bg-background/20 backdrop-blur-sm shadow-sm"
                contentClassName="p-4 pt-0 space-y-4"
                open={isEffectsOpen}
                onOpenChange={setIsEffectsOpen}
            >
                {/* Zoom Blur */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <AppWindow className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">Zoom Blur</span>
                        <Switch
                            checked={camera.refocusBlurEnabled ?? false}
                            onCheckedChange={v => setCameraSettings({ refocusBlurEnabled: v })}
                            className="ml-auto scale-90"
                        />
                    </div>
                    {camera.refocusBlurEnabled && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="overflow-hidden"
                        >
                            <CompactSlider
                                label="Intensity"
                                value={camera.refocusBlurIntensity ?? 40}
                                min={0}
                                max={100}
                                unit="%"
                                onValueChange={v => setCameraSettings({ refocusBlurIntensity: v })}
                            />
                        </motion.div>
                    )}
                </div>

                <div className="border-t border-border/30" />

                {/* Motion Blur */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">Motion Blur</span>
                        <Switch
                            checked={camera.motionBlurEnabled ?? false}
                            onCheckedChange={v => setCameraSettings({ motionBlurEnabled: v })}
                            className="ml-auto scale-90"
                        />
                    </div>
                    {camera.motionBlurEnabled && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="overflow-hidden space-y-3"
                        >
                            <CompactSlider
                                label="Shutter Angle"
                                value={camera.motionBlurIntensity ?? 25}
                                min={0}
                                max={100}
                                step={5}
                                unit="%"
                                onValueChange={v => setCameraSettings({ motionBlurIntensity: v })}
                            />

                            <button
                                onClick={() => setIsAdvancedBlurOpen(!isAdvancedBlurOpen)}
                                className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <ChevronDown className={cn("w-3 h-3 transition-transform", isAdvancedBlurOpen && "rotate-180")} />
                                Advanced
                            </button>

                            <AnimatePresence>
                                {isAdvancedBlurOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="space-y-3 pl-3 border-l-2 border-border/30">
                                            <CompactSlider
                                                label="Threshold"
                                                value={camera.motionBlurThreshold ?? 20}
                                                min={0}
                                                max={100}
                                                unit="%"
                                                onValueChange={v => setCameraSettings({ motionBlurThreshold: v })}
                                            />
                                            <CompactSlider
                                                label="Max Radius"
                                                value={camera.motionBlurClamp ?? 45}
                                                min={10}
                                                max={100}
                                                unit="px"
                                                onValueChange={v => setCameraSettings({ motionBlurClamp: v })}
                                            />
                                            <div className="flex items-center justify-between py-1 text-2xs text-muted-foreground">
                                                <span>WebGL Pipeline</span>
                                                <Switch
                                                    checked={camera.motionBlurUseWebglVideo ?? true}
                                                    onCheckedChange={v => setCameraSettings({ motionBlurUseWebglVideo: v })}
                                                    className="scale-90"
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </div>
            </AccordionSection>
        </div>
    )
}
