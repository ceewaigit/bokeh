'use client'

import React, { useMemo } from 'react'
import { ZoomIn, Sparkles, Gauge, AppWindow } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'
import { AccordionSection } from '@/components/ui/accordion-section'
import { useProjectStore } from '@/features/stores/project-store'
import type { Clip, Effect, ZoomEffectData, ZoomBlock } from '@/types/project'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'
import { EffectLayerType } from '@/types/effects'
import { getCropData, getCropEffectForClip, getZoomEffects } from '@/features/effects/core/filters'
import { EffectStore } from '@/features/effects/core/store'
import { AddEffectCommand } from '@/features/commands'
import { useCommandExecutor } from '@/shared/hooks/use-command-executor'
import { DEFAULT_ZOOM_DATA } from '../config'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'
import { ZoomTargetPreview } from './ZoomTargetPreview'
import { CompactSlider, SegmentedControl, SectionHeader, springConfig } from '@/features/effects/components/motion-controls'
import { useTimelineMetadata } from '@/features/timeline/hooks/use-timeline-metadata'
import { getSourceDimensions, getSourceDimensionsStatic } from '@/features/canvas/math/coordinates'
import { msToFrame } from '@/features/renderer/compositions/utils/time/frame-time'
import { getCameraOutputContext } from '@/features/editor/logic/viewport/logic/path-calculator'
import { getActiveClipDataAtFrame } from '@/features/renderer/utils/get-active-clip-data-at-frame'
import { TimelineDataService } from '@/features/timeline/timeline-data-service'
import { computeCameraState, type CameraPhysicsState } from '@/features/editor/logic/viewport/logic/orchestrator'
import { DEFAULT_PROJECT_SETTINGS } from '@/features/settings/defaults'
import { motion, AnimatePresence } from 'framer-motion'

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
    const project = useProjectStore((s) => s.currentProject)
    const currentTime = useProjectStore((s) => s.currentTime)
    const cameraPathCache = useProjectStore((s) => s.cameraPathCache)
    const camera = useProjectStore((s) => s.currentProject?.settings.camera ?? DEFAULT_PROJECT_SETTINGS.camera)
    const setCameraSettings = useProjectStore((s) => s.setCameraSettings)
    const timelineMetadata = useTimelineMetadata(project)
    const zoomEffects = effects ? getZoomEffects(effects) : []
    const cropEffect = selectedClip && effects ? getCropEffectForClip(effects, selectedClip) : null
    const cropData = cropEffect ? getCropData(cropEffect) : null
    const activeRecording = useMemo(() => {
        if (!project?.recordings?.length) return null
        if (selectedClip) {
            return project.recordings.find(recording => recording.id === selectedClip.recordingId) ?? null
        }
        return project.recordings[0] ?? null
    }, [project, selectedClip])
    const sourceDims = useMemo(() => {
        if (!activeRecording) return null
        return getSourceDimensionsStatic(activeRecording, activeRecording.metadata ?? null)
    }, [activeRecording])

    // Local state for slider values during dragging
    const [localScale, setLocalScale] = React.useState<number | null>(null)
    const [localIntroMs, setLocalIntroMs] = React.useState<number | null>(null)
    const [localOutroMs, setLocalOutroMs] = React.useState<number | null>(null)
    const [localMouseIdlePx, setLocalMouseIdlePx] = React.useState<number | null>(null)
    const [localStiffness, setLocalStiffness] = React.useState<number | null>(null)
    const [localDamping, setLocalDamping] = React.useState<number | null>(null)
    const [cameraStylePreset, setCameraStylePreset] = React.useState<'tight' | 'balanced' | 'steady' | 'cinematic' | 'floaty' | 'custom'>('cinematic')
    const [zoomBlurPreset, setZoomBlurPreset] = React.useState<'subtle' | 'balanced' | 'dynamic' | 'custom'>('balanced')
    const scaleResetTimeoutRef = React.useRef<number | null>(null)
    const introResetTimeoutRef = React.useRef<number | null>(null)
    const outroResetTimeoutRef = React.useRef<number | null>(null)
    const mouseIdleResetTimeoutRef = React.useRef<number | null>(null)

    const scheduleReset = (
        timeoutRef: React.MutableRefObject<number | null>,
        reset: () => void,
        delayMs: number
    ) => {
        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = window.setTimeout(reset, delayMs)
    }

    React.useEffect(() => {
        return () => {
            const timeouts = [
                scaleResetTimeoutRef,
                introResetTimeoutRef,
                outroResetTimeoutRef,
                mouseIdleResetTimeoutRef
            ]
            for (const ref of timeouts) {
                if (ref.current !== null) {
                    window.clearTimeout(ref.current)
                    ref.current = null
                }
            }
        }
    }, [])

    const cameraStylePresets = React.useMemo(() => ([
        // Tight: k=300, c=35 (zeta=1.0) -> Snappy, instant verification
        { id: 'tight', label: 'Tight', stiffness: 300, damping: 35, mass: 1, value: 8 },
        // Balanced: k=180, c=27 (zeta=1.0) -> Good balance of smoothness and tracking
        { id: 'balanced', label: 'Balanced', stiffness: 180, damping: 27, mass: 1, value: 24 },
        // Steady: k=100, c=20 (zeta=1.0) -> Smoother, absorbs jitters
        { id: 'steady', label: 'Steady', stiffness: 100, damping: 20, mass: 1, value: 36 },
        // Cinematic: k=60, c=15 (zeta=1.0) -> Slow, deliberate pans
        { id: 'cinematic', label: 'Cinematic', stiffness: 60, damping: 15, mass: 1, value: 48 },
        // Floaty: k=30, c=6 (zeta=0.55) -> Slight overshoot, very fluid
        { id: 'floaty', label: 'Floaty', stiffness: 30, damping: 6, mass: 1, value: 72 },
        { id: 'custom', label: 'Custom', stiffness: null, damping: null, mass: null, value: null },
    ] as const), [])

    const zoomBlurPresets = React.useMemo(() => ([
        { id: 'subtle', label: 'Subtle', value: 30 },
        { id: 'balanced', label: 'Balanced', value: 50 },
        { id: 'dynamic', label: 'Dynamic', value: 70 },
        { id: 'custom', label: 'Custom', value: null },
    ] as const), [])

    const resolveCameraStylePreset = React.useCallback((settings: typeof camera) => {
        // If we have dynamics, try to match a preset
        if (settings.cameraDynamics) {
            const { stiffness, damping } = settings.cameraDynamics
            const match = cameraStylePresets.find(p =>
                p.stiffness === stiffness && p.damping === damping
            )
            return (match?.id ?? 'custom') as typeof cameraStylePreset
        }

        // Fallback to lightness/smoothness legacy check
        const effectiveSmoothing = settings.cameraSmoothness ?? 48
        const match = cameraStylePresets.find(p => p.value === effectiveSmoothing)
        return (match?.id ?? 'custom') as typeof cameraStylePreset
    }, [cameraStylePresets])

    const resolveZoomBlurPreset = React.useCallback((intensity: number) => {
        const match = zoomBlurPresets.find(p => p.value === intensity)
        return (match?.id ?? 'custom') as typeof zoomBlurPreset
    }, [zoomBlurPresets])

    React.useEffect(() => {
        setCameraStylePreset(resolveCameraStylePreset(camera))
    }, [camera, resolveCameraStylePreset])

    React.useEffect(() => {
        setZoomBlurPreset(resolveZoomBlurPreset(camera.refocusBlurIntensity ?? 40))
    }, [camera.refocusBlurIntensity, resolveZoomBlurPreset])

    const applyCameraStylePreset = (preset: typeof cameraStylePreset) => {
        setCameraStylePreset(preset)
        const presetData = cameraStylePresets.find((item) => item.id === preset)
        if (!presetData || presetData.id === 'custom') return

        setLocalStiffness(presetData.stiffness)
        setLocalDamping(presetData.damping)

        // Update settings with new dynamics
        setCameraSettings({
            cameraDynamics: {
                stiffness: presetData.stiffness!,
                damping: presetData.damping!,
                mass: presetData.mass!
            },
            // Keep legacy sync just in case
            cameraSmoothness: presetData.value
        })
    }

    const applyZoomBlurPreset = (preset: typeof zoomBlurPreset) => {
        setZoomBlurPreset(preset)
        const presetValue = zoomBlurPresets.find((item) => item.id === preset)?.value
        if (presetValue == null) return
        setCameraSettings({ refocusBlurIntensity: presetValue, refocusBlurEnabled: presetValue > 0 })
    }

    const seedManualTargetFromLiveCamera = () => {
        if (!project || !timelineMetadata) return null
        const fps = timelineMetadata.fps
        const frameLayout = TimelineDataService.getFrameLayout(project, fps)
        const recordingsMap = TimelineDataService.getRecordingsMap(project)
        const timelineEffects = effects ?? EffectStore.getAll(project)
        const frame = Math.max(0, msToFrame(currentTime, fps))
        const clipData = getActiveClipDataAtFrame({
            frame,
            frameLayout,
            fps,
            effects: timelineEffects,
            getRecording: (id) => recordingsMap.get(id) ?? null,
        })
        if (!clipData) return null

        const {
            outputWidth,
            outputHeight,
            overscan,
            mockupScreenPosition,
            forceFollowCursor,
        } = getCameraOutputContext({
            clipEffects: clipData.effects,
            timelineMs: currentTime,
            compositionWidth: timelineMetadata.width,
            compositionHeight: timelineMetadata.height,
            recording: clipData.recording,
        })

        const seedPhysics: CameraPhysicsState = {
            x: 0.5,
            y: 0.5,
            vx: 0,
            vy: 0,
            lastTimeMs: currentTime,
            lastSourceTimeMs: clipData.sourceTimeMs,
        }

        const computed = computeCameraState({
            effects: clipData.effects,
            timelineMs: currentTime,
            sourceTimeMs: clipData.sourceTimeMs,
            recording: clipData.recording,
            metadata: clipData.recording?.metadata ?? null,
            outputWidth,
            outputHeight,
            overscan,
            mockupScreenPosition,
            forceFollowCursor,
            physics: seedPhysics,
            deterministic: true,
        })

        const sourceDimsAtTime = getSourceDimensions(
            clipData.sourceTimeMs,
            clipData.recording,
            clipData.recording?.metadata ?? null
        )

        const clampedX = Math.max(0, Math.min(1, computed.zoomCenter.x))
        const clampedY = Math.max(0, Math.min(1, computed.zoomCenter.y))

        return {
            targetX: clampedX * sourceDimsAtTime.width,
            targetY: clampedY * sourceDimsAtTime.height,
            screenWidth: sourceDimsAtTime.width,
            screenHeight: sourceDimsAtTime.height,
        }
    }

    return (
        <div className="space-y-2.5">
            <div className="rounded-2xl border border-border/30 bg-background/20 backdrop-blur-sm p-3.5 space-y-3 shadow-sm transition-all hover:bg-background/30 overflow-hidden">
                <SectionHeader
                    icon={Gauge}
                    title="Cameraman Style"
                    subtitle="Tune pan timing and feel"
                />

                <SegmentedControl
                    options={cameraStylePresets}
                    value={cameraStylePreset}
                    onChange={(id) => applyCameraStylePreset(id as typeof cameraStylePreset)}
                    namespace="camera-style"
                    wrap
                    columns={3}
                />

                <AnimatePresence initial={false}>
                    {cameraStylePreset === 'custom' && (
                        <motion.div
                            key="camera-style-custom"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={springConfig}
                            className="pt-1 space-y-4"
                        >
                            <CompactSlider
                                label="Responsiveness (Stiffness)"
                                value={localStiffness ?? camera.cameraDynamics?.stiffness ?? 120}
                                min={10}
                                max={300}
                                step={10}
                                onValueChange={(val) => setLocalStiffness(val)}
                                onValueCommit={(val) => {
                                    setCameraSettings({
                                        cameraDynamics: {
                                            stiffness: val,
                                            damping: localDamping ?? camera.cameraDynamics?.damping ?? 30,
                                            mass: camera.cameraDynamics?.mass ?? 1
                                        }
                                    })
                                }}
                            />
                            <CompactSlider
                                label="Damping (Friction)"
                                value={localDamping ?? camera.cameraDynamics?.damping ?? 30}
                                min={5}
                                max={100}
                                step={5}
                                onValueChange={(val) => setLocalDamping(val)}
                                onValueCommit={(val) => {
                                    setCameraSettings({
                                        cameraDynamics: {
                                            stiffness: localStiffness ?? camera.cameraDynamics?.stiffness ?? 120,
                                            damping: val,
                                            mass: camera.cameraDynamics?.mass ?? 1
                                        }
                                    })
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="rounded-2xl border border-border/30 bg-background/20 backdrop-blur-sm p-3.5 space-y-4 shadow-sm transition-all hover:bg-background/30 overflow-hidden">
                <SectionHeader
                    icon={AppWindow}
                    title="Zoom Blur"
                    subtitle="Depth during transitions"
                />

                <SegmentedControl
                    options={zoomBlurPresets}
                    value={zoomBlurPreset}
                    onChange={(id) => applyZoomBlurPreset(id as typeof zoomBlurPreset)}
                    namespace="zoom-blur"
                    wrap
                    columns={3}
                />

                <AnimatePresence initial={false}>
                    {zoomBlurPreset === 'custom' && (
                        <motion.div
                            key="zoom-blur-custom"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={springConfig}
                            className="pt-1"
                        >
                            <CompactSlider
                                label="Blur Strength"
                                value={camera.refocusBlurIntensity ?? 40}
                                min={0}
                                max={100}
                                unit="%"
                                onValueChange={(val) => {
                                    setCameraSettings({ refocusBlurIntensity: val, refocusBlurEnabled: val > 0 })
                                    setZoomBlurPreset('custom')
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            {/* Quick Fill Screen Zoom */}
            {selectedClip && (
                <div className="rounded-md bg-background/40 p-2.5">
                    <button
                        className="w-full px-3 py-2 text-xs rounded-md transition-all flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary"
                        onClick={async () => {
                            const project = useProjectStore.getState().currentProject
                            if (!project) return
                            const existingZoomEffects = EffectStore.getAll(project).filter(e => e.type === EffectType.Zoom)
                                .sort((a, b) => a.startTime - b.startTime)
                            const blockDuration = Math.max(0, selectedClip.duration)
                            let finalStartTime = Math.max(0, selectedClip.startTime)

                            for (const effect of existingZoomEffects) {
                                if (finalStartTime < effect.endTime && (finalStartTime + blockDuration) > effect.startTime) {
                                    finalStartTime = effect.endTime + 100
                                }
                            }
                            const newEffect: Effect = {
                                id: `zoom-fill-${Date.now()}`,
                                type: EffectType.Zoom,
                                startTime: finalStartTime,
                                endTime: finalStartTime + blockDuration,
                                enabled: true,
                                data: {
                                    origin: 'manual',
                                    scale: 1,
                                    introMs: DEFAULT_ZOOM_DATA.introMs,
                                    outroMs: DEFAULT_ZOOM_DATA.outroMs,
                                    smoothing: 50,
                                    followStrategy: ZoomFollowStrategy.Center,
                                    autoScale: 'fill'
                                } as ZoomEffectData
                            }
                            await executorRef.current?.execute(AddEffectCommand, newEffect)
                        }}
                    >
                        Fill Frame Zoom
                    </button>
                    <div className="mt-2 flex items-center justify-center gap-2">
                        <p className="text-xs text-muted-foreground/70 italic leading-snug">
                            Adds a centered zoom region to fill the frame
                        </p>
                        <InfoTooltip content="Creates a zoom region you can adjust on the timeline" />
                    </div>
                </div>
            )}

            {/* Selected Zoom Block Editor */}
            {selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer?.id ? (() => {
                const selectedBlock = zoomEffects.find(e => e.id === selectedEffectLayer.id)
                if (!selectedBlock) return null
                const zoomData = selectedBlock.data as ZoomEffectData
                if (!zoomData) return null
                const followStrategy = zoomData.followStrategy ?? ZoomFollowStrategy.Mouse
                const isFillScreen = zoomData.autoScale === 'fill'
                const isCenterLocked = followStrategy === ZoomFollowStrategy.Center
                const isManualFocus = followStrategy === ZoomFollowStrategy.Manual
                const hasManualTarget = isManualFocus
                    && zoomData.targetX != null
                    && zoomData.targetY != null

                return (
                    <div
                        key={`zoom-block-${selectedEffectLayer.id}`}
                        className="space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200"
                    >
                        {/* Scale Control */}
                        <div className="rounded-md bg-background/40 p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <ZoomIn className="w-3 h-3 text-muted-foreground" />
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold leading-none tracking-[-0.01em]">Zoom Level</span>
                                        <InfoTooltip content="Adjusts how close the zoom feels." />
                                    </div>
                                </div>
                                <span className="text-xs font-mono text-primary tabular-nums">
                                    {isFillScreen ? 'Fill' : `${(localScale ?? zoomData.scale ?? DEFAULT_ZOOM_DATA.scale).toFixed(1)}x`}
                                </span>
                            </div>
                            <Slider
                                key={`scale-${selectedEffectLayer.id}`}
                                value={[localScale ?? zoomData.scale ?? DEFAULT_ZOOM_DATA.scale]}
                                onValueChange={([value]) => setLocalScale(value)}
                                onValueCommit={([value]) => {
                                    if (selectedEffectLayer.id && onZoomBlockUpdate) {
                                        onZoomBlockUpdate(selectedEffectLayer.id, { scale: value })
                                        scheduleReset(scaleResetTimeoutRef, () => setLocalScale(null), 300)
                                    }
                                }}
                                min={1}
                                max={7}
                                step={0.1}
                                className="w-full"
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
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold leading-none tracking-[-0.01em]">Focus Mode</span>
                                    <InfoTooltip content="Choose whether zoom tracks the pointer, stays centered, or locks to a manual zoom point." />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    className={cn(
                                        "px-3 py-2 text-xs font-medium rounded-md transition-colors",
                                        !isCenterLocked && !isManualFocus
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-background/60 text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() => {
                                        if (selectedEffectLayer.id && onZoomBlockUpdate) {
                                            onZoomBlockUpdate(selectedEffectLayer.id, {
                                                followStrategy: ZoomFollowStrategy.Mouse,
                                                autoScale: undefined
                                            })
                                        }
                                    }}
                                >
                                    Track Cursor
                                </button>
                                <button
                                    className={cn(
                                        "px-3 py-2 text-xs font-medium rounded-md transition-colors",
                                        isManualFocus
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-background/60 text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() => {
                                        if (selectedEffectLayer.id && onZoomBlockUpdate) {
                                            const updates: Partial<ZoomEffectData> = {
                                                followStrategy: ZoomFollowStrategy.Manual,
                                                autoScale: undefined
                                            }

                                            const liveSeed = seedManualTargetFromLiveCamera()
                                            if (liveSeed) {
                                                updates.targetX = liveSeed.targetX
                                                updates.targetY = liveSeed.targetY
                                                updates.screenWidth = liveSeed.screenWidth
                                                updates.screenHeight = liveSeed.screenHeight
                                            } else if (timelineMetadata && cameraPathCache && cameraPathCache.length > 0) {
                                                const frame = Math.max(0, Math.min(cameraPathCache.length - 1, msToFrame(currentTime, timelineMetadata.fps)))
                                                const frameData = cameraPathCache[frame]
                                                if (frameData?.zoomCenter) {
                                                    const baseWidth = sourceDims?.width ?? zoomData.screenWidth ?? timelineMetadata.width
                                                    const baseHeight = sourceDims?.height ?? zoomData.screenHeight ?? timelineMetadata.height
                                                    updates.targetX = frameData.zoomCenter.x * baseWidth
                                                    updates.targetY = frameData.zoomCenter.y * baseHeight
                                                    updates.screenWidth = baseWidth
                                                    updates.screenHeight = baseHeight
                                                }
                                            }

                                            onZoomBlockUpdate(selectedEffectLayer.id, {
                                                ...updates
                                            })
                                        }
                                    }}
                                >
                                    Manual
                                </button>
                                <button
                                    className={cn(
                                        "px-3 py-2 text-xs font-medium rounded-md transition-colors",
                                        isCenterLocked
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-background/60 text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() => {
                                        if (selectedEffectLayer.id && onZoomBlockUpdate) {
                                            onZoomBlockUpdate(selectedEffectLayer.id, {
                                                followStrategy: ZoomFollowStrategy.Center,
                                                scale: 1,
                                                autoScale: 'fill'
                                            })
                                            setLocalScale(1)
                                            scheduleReset(scaleResetTimeoutRef, () => setLocalScale(null), 300)
                                        }
                                    }}
                                >
                                    Center Lock
                                </button>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground/70 leading-snug">
                                <span>
                                    {isManualFocus
                                        ? 'Manual zoom lets you drag the zoom window in the sidebar preview.'
                                        : 'Center Lock keeps the view fixed for a clean, professional look.'}
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
                                    onCommit={(updates) => {
                                        if (selectedEffectLayer.id && onZoomBlockUpdate) {
                                            onZoomBlockUpdate(selectedEffectLayer.id, updates)
                                        }
                                    }}
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
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold leading-none tracking-[-0.01em]">Transition Timing</span>
                                <InfoTooltip content="Makes the zoom transition smooth" />
                            </div>
                            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                                {/* Ease In */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">Zoom In</span>
                                        <span className="text-xs font-mono text-muted-foreground tabular-nums">
                                            {localIntroMs ?? (zoomData.introMs || DEFAULT_ZOOM_DATA.introMs)}ms
                                        </span>
                                    </div>
                                    <Slider
                                        key={`intro-${selectedEffectLayer.id}`}
                                        value={[localIntroMs ?? (zoomData.introMs || DEFAULT_ZOOM_DATA.introMs)]}
                                        onValueChange={([value]) => setLocalIntroMs(value)}
                                        onValueCommit={([value]) => {
                                            if (selectedEffectLayer.id && onZoomBlockUpdate) {
                                                onZoomBlockUpdate(selectedEffectLayer.id, { introMs: value })
                                                scheduleReset(introResetTimeoutRef, () => setLocalIntroMs(null), 300)
                                            }
                                        }}
                                        min={0}
                                        max={2000}
                                        step={50}
                                        className="w-full"
                                    />
                                </div>
                                {/* Ease Out */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">Zoom Out</span>
                                        <span className="text-xs font-mono text-muted-foreground tabular-nums">
                                            {localOutroMs ?? (zoomData.outroMs || DEFAULT_ZOOM_DATA.outroMs)}ms
                                        </span>
                                    </div>
                                    <Slider
                                        key={`outro-${selectedEffectLayer.id}`}
                                        value={[localOutroMs ?? (zoomData.outroMs || DEFAULT_ZOOM_DATA.outroMs)]}
                                        onValueChange={([value]) => setLocalOutroMs(value)}
                                        onValueCommit={([value]) => {
                                            if (selectedEffectLayer.id && onZoomBlockUpdate) {
                                                onZoomBlockUpdate(selectedEffectLayer.id, { outroMs: value })
                                                scheduleReset(outroResetTimeoutRef, () => setLocalOutroMs(null), 300)
                                            }
                                        }}
                                        min={0}
                                        max={2000}
                                        step={50}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        </div>

                        <AccordionSection
                            title={
                                <span className="flex items-center gap-2">
                                    Advanced
                                    <InfoTooltip content="Fine-tune how zoom regions track pointer movement." />
                                </span>
                            }
                            className="bg-background/30"
                            contentClassName="pt-2.5"
                        >
                            {!isFillScreen ? (
                                <div className="rounded-md bg-background/30 p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Dead Zone</span>
                                            <InfoTooltip content="How far cursor must move before camera follows" />
                                        </div>
                                        <span className="text-xs font-mono text-muted-foreground tabular-nums">
                                            {zoomData.mouseIdlePx ?? DEFAULT_ZOOM_DATA.mouseIdlePx ?? 3}px
                                        </span>
                                    </div>
                                    <Slider
                                        key={`mouseidle-${selectedEffectLayer.id}`}
                                        value={[localMouseIdlePx ?? (zoomData.mouseIdlePx ?? DEFAULT_ZOOM_DATA.mouseIdlePx ?? 3)]}
                                        onValueChange={([value]) => setLocalMouseIdlePx(value)}
                                        onValueCommit={([value]) => {
                                            if (selectedEffectLayer.id && onZoomBlockUpdate) {
                                                onZoomBlockUpdate(selectedEffectLayer.id, { mouseIdlePx: value })
                                                scheduleReset(mouseIdleResetTimeoutRef, () => setLocalMouseIdlePx(null), 200)
                                            }
                                        }}
                                        min={1}
                                        max={20}
                                        step={1}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-muted-foreground/70 leading-snug">Minimum cursor movement to trigger pan</p>
                                </div>
                            ) : (
                                <div className="text-xs text-muted-foreground/70 leading-snug">
                                    Advanced tracking is disabled when “Fill screen” is enabled.
                                </div>
                            )}
                        </AccordionSection>

                        {/* Divider */}
                        <div className="border-t border-border/30" />
                    </div>
                )
            })() : (
                <div className="rounded-md bg-background/40 p-2.5">
                    <div className="text-xs font-semibold leading-none tracking-[-0.01em]">Select a zoom block</div>
                    <div className="mt-1 text-xs text-muted-foreground leading-snug">
                        Click a zoom block in the timeline to edit focus behavior, timing, and target.
                    </div>
                </div>
            )}

        </div >
    )
}
