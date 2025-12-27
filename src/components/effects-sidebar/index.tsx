'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'

import { cn } from '@/lib/utils'
import type { Clip, Effect, BackgroundEffectData, CursorEffectData, KeystrokeEffectData, WebcamEffectData } from '@/types/project'
import { EffectType, BackgroundType } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'
import { EffectLayerType } from '@/types/effects'
import { getBackgroundEffect, getCropEffectForClip, getCursorEffect, getKeystrokeEffect, getWebcamEffects } from '@/lib/effects/effect-filters'
import { resolveEffectIdForType } from '@/lib/effects/effect-selection'
import { DEFAULT_BACKGROUND_DATA } from '@/lib/constants/default-effects'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { SIDEBAR_TABS, SidebarTabId } from './constants'
import { TrackType } from '@/types/project'
import { useTrackExistence, useEffectTrackExistence } from '@/stores/selectors/timeline-selectors'

import { BackgroundTab } from './background-tab'
import { CursorTab } from './cursor-tab'
import { KeystrokeTab } from './keystroke-tab'
import { ZoomTab } from './zoom-tab'
import { ShapeTab } from './shape-tab'
import { ScreenTab } from './screen-tab'
import { CropTab } from './crop-tab'
import { ClipTab } from './clip-tab'
import { AdvancedTab } from './advanced-tab'
import { CanvasTab } from './canvas-tab'
import { WebcamTab } from './webcam-tab'
import { AnnotationsTab } from './annotations-tab'
import { AnimatePresence, motion } from 'framer-motion'
import { useProjectStore } from '@/stores/project-store'

const springConfig = { type: "spring", stiffness: 380, damping: 28 } as const

interface EffectsSidebarProps {
  className?: string
  selectedClip: Clip | null
  effects: Effect[] | undefined
  selectedEffectLayer?: SelectedEffectLayer
  onEffectChange: (type: EffectType, data: any) => void
  onZoomBlockUpdate?: (blockId: string, updates: any) => void
  onBulkToggleKeystrokes?: (enabled: boolean) => void
  onAddCrop?: () => void
  onRemoveCrop?: (effectId: string) => void
  onUpdateCrop?: (effectId: string, updates: any) => void
  onStartEditCrop?: () => void

  isEditingCrop?: boolean
  selectedTrackType?: TrackType
}

type StyleSubTabId = 'background' | 'frame' | 'screen'
type PointerSubTabId = 'cursor' | 'keystrokes'
type FramingSubTabId = 'zoom' | 'crop'

const EFFECT_LABELS: Partial<Record<EffectLayerType, string>> = {
  [EffectLayerType.Background]: 'Backdrop',
  [EffectLayerType.Screen]: 'Depth',
  [EffectLayerType.Webcam]: 'Camera',
  [EffectLayerType.Cursor]: 'Pointer',
  [EffectLayerType.Keystroke]: 'Typing',
  [EffectLayerType.Zoom]: 'Focus',
  [EffectLayerType.Crop]: 'Frame',
  [EffectLayerType.Plugin]: 'Tools',
  [EffectLayerType.Annotation]: 'Note',
}

function SubTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T
  onChange: (next: T) => void
  tabs: { id: T; label: string; disabled?: boolean }[]
}) {
  const layoutId = React.useId()
  return (
    <div className="relative grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-muted/30 p-1">
      {tabs.map((tab) => (
        <motion.button
          key={tab.id}
          type="button"
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative min-w-0 rounded-md px-2.5 py-1.5 text-[12px] font-medium leading-tight transition-colors duration-150",
            tab.disabled && "opacity-40 cursor-not-allowed",
            value === tab.id
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          whileHover={tab.disabled ? undefined : { scale: 1.02 }}
          whileTap={tab.disabled ? undefined : { scale: 0.98 }}
          transition={springConfig}
        >
          <AnimatePresence>
            {value === tab.id && (
              <motion.div
                className="absolute inset-0 rounded-md bg-background shadow-sm"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={springConfig}
                layoutId={`subtab-pill-${layoutId}`}
              />
            )}
          </AnimatePresence>
          <span className="relative z-10 truncate whitespace-nowrap">{tab.label}</span>
        </motion.button>
      ))}
    </div>
  )
}

const tabVariants = {
  initial: { opacity: 0, y: 3 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.15,
      ease: [0.25, 0.1, 0.25, 1]
    }
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.1,
      ease: "easeOut"
    }
  }
}

export function EffectsSidebar({
  className,
  selectedClip,
  effects,
  selectedEffectLayer,
  onEffectChange,
  onZoomBlockUpdate,
  onBulkToggleKeystrokes,
  onAddCrop,
  onRemoveCrop,
  onUpdateCrop,
  onStartEditCrop,
  isEditingCrop,
  selectedTrackType,
}: EffectsSidebarProps) {
  const selectEffectLayer = useProjectStore((s) => s.selectEffectLayer)
  const [activeTab, setActiveTab] = useState<SidebarTabId>(() =>
    selectedClip ? SidebarTabId.Clip : SidebarTabId.Style
  )
  const [styleSubTab, setStyleSubTab] = useState<StyleSubTabId>('background')
  const [pointerSubTab, setPointerSubTab] = useState<PointerSubTabId>('cursor')
  const [framingSubTab, setFramingSubTab] = useState<FramingSubTabId>('zoom')
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const lastAutoOpenedCropClipRef = useRef<string | null>(null)

  // Check if webcam/annotation tracks have content
  const { hasWebcamTrack } = useTrackExistence()
  const effectTrackExistence = useEffectTrackExistence()
  const hasAnnotationTrack = effectTrackExistence[EffectType.Annotation] ?? false

  // Extract current effects from the array using effect-filters helpers
  const backgroundEffect = effects ? getBackgroundEffect(effects) : undefined
  const cursorEffect = effects ? getCursorEffect(effects) : undefined
  const keystrokeEffect = effects ? getKeystrokeEffect(effects) : undefined
  const webcamEffects = effects ? getWebcamEffects(effects) : []
  const webcamEffectId = resolveEffectIdForType(webcamEffects, selectedEffectLayer, EffectType.Webcam)
  const webcamEffect = webcamEffectId
    ? webcamEffects.find(effect => effect.id === webcamEffectId)
    : undefined

  // Track last selected clip id and previous effect layer type to control auto-tab switching
  const lastClipIdRef = React.useRef<string | null>(null)
  const prevEffectTypeRef = React.useRef<EffectLayerType | undefined>(undefined)

  const isVideoClipSelected = !!selectedClip && selectedTrackType === TrackType.Video

  useEffect(() => {
    const isInCropTab =
      activeTab === SidebarTabId.Framing &&
      framingSubTab === 'crop'

    if (!isInCropTab || !isVideoClipSelected) {
      lastAutoOpenedCropClipRef.current = null
      return
    }

    const clipId = selectedClip?.id ?? null
    if (!clipId || lastAutoOpenedCropClipRef.current === clipId) {
      return
    }

    if (isEditingCrop) {
      lastAutoOpenedCropClipRef.current = clipId
      return
    }

    const cropEffect = selectedClip && effects
      ? getCropEffectForClip(effects, selectedClip)
      : undefined

    if (cropEffect && onStartEditCrop) {
      onStartEditCrop()
      lastAutoOpenedCropClipRef.current = clipId
      return
    }

    if (!cropEffect && onAddCrop) {
      onAddCrop()
      lastAutoOpenedCropClipRef.current = clipId
    }
  }, [
    activeTab,
    framingSubTab,
    isVideoClipSelected,
    isEditingCrop,
    effects,
    selectedClip,
    onAddCrop,
    onStartEditCrop,
  ])

  const routeToEffect = useCallback((type: EffectLayerType) => {
    switch (type) {
      case EffectLayerType.Background:
        setActiveTab(SidebarTabId.Style)
        setStyleSubTab('background')
        return
      case EffectLayerType.Screen:
        setActiveTab(SidebarTabId.Style)
        setStyleSubTab('screen')
        return
      case EffectLayerType.Webcam:
        setActiveTab(SidebarTabId.Webcam)
        return
      case EffectLayerType.Cursor:
        setActiveTab(SidebarTabId.Pointer)
        setPointerSubTab('cursor')
        return
      case EffectLayerType.Keystroke:
        setActiveTab(SidebarTabId.Pointer)
        setPointerSubTab('keystrokes')
        return
      case EffectLayerType.Zoom:
        setActiveTab(SidebarTabId.Framing)
        setFramingSubTab('zoom')
        return
      case EffectLayerType.Crop:
        setActiveTab(SidebarTabId.Framing)
        setFramingSubTab('crop')
        return
      case EffectLayerType.Plugin:
        setActiveTab(SidebarTabId.Advanced)
        return
      case EffectLayerType.Annotation:
        setActiveTab(SidebarTabId.Annotation)
        return
      default:
        setActiveTab(SidebarTabId.Advanced)
    }
  }, [])

  // Update active tab based on selection changes (without overriding manual tab clicks)
  useEffect(() => {
    const currentEffectType = selectedEffectLayer?.type as any | undefined

    // If an effect layer is explicitly selected, always show its tab
    if (currentEffectType) {
      routeToEffect(currentEffectType as EffectLayerType)
    } else {
      // If effect selection was cleared (transition from some type to none), go to clip tab once
      if (prevEffectTypeRef.current) {
        if (selectedClip) setActiveTab(SidebarTabId.Clip)
      }

      // If a new clip was selected, go to clip tab once
      const currentClipId = selectedClip?.id || null
      if (currentClipId !== lastClipIdRef.current) {
        lastClipIdRef.current = currentClipId
        if (currentClipId) setActiveTab(SidebarTabId.Clip)
      }
    }

    // Remember last effect type
    prevEffectTypeRef.current = currentEffectType
  }, [routeToEffect, selectedEffectLayer, selectedClip])

  const updateEffect = useCallback((category: EffectType.Cursor | EffectType.Keystroke, updates: any) => {
    const effect = category === EffectType.Cursor ? cursorEffect : keystrokeEffect
    const effectType = category
    if (effect) {
      const currentData = effect.data as CursorEffectData | KeystrokeEffectData
      onEffectChange(effectType, { ...currentData, ...updates })
    } else {
      onEffectChange(effectType, updates)
    }
  }, [cursorEffect, keystrokeEffect, onEffectChange])

  const visibleTabs = React.useMemo(() => {
    return SIDEBAR_TABS.filter((tab) => {
      // Only show Clip tab when a clip is selected
      if (tab.id === SidebarTabId.Clip) return !!selectedClip
      // Only show Webcam tab when there's webcam content on the timeline
      if (tab.id === SidebarTabId.Webcam) return hasWebcamTrack
      // Only show Annotation tab when there are annotations
      if (tab.id === SidebarTabId.Annotation) return hasAnnotationTrack
      return true
    })
  }, [selectedClip, hasWebcamTrack, hasAnnotationTrack])

  useEffect(() => {
    if (!selectedClip && activeTab === SidebarTabId.Clip) {
      setActiveTab(SidebarTabId.Style)
    }
    // Switch away from Webcam tab if webcam content is removed
    if (!hasWebcamTrack && activeTab === SidebarTabId.Webcam) {
      setActiveTab(SidebarTabId.Style)
    }
    // Switch away from Annotation tab if annotation content is removed
    if (!hasAnnotationTrack && activeTab === SidebarTabId.Annotation) {
      setActiveTab(SidebarTabId.Style)
    }
  }, [activeTab, selectedClip, hasWebcamTrack, hasAnnotationTrack])

  useEffect(() => {
    if (activeTab !== SidebarTabId.Webcam) return
    if (selectedEffectLayer && selectedEffectLayer.type !== EffectLayerType.Webcam) return
    if (selectedEffectLayer?.type === EffectLayerType.Webcam && selectedEffectLayer?.id) return
    if (!webcamEffectId) return
    selectEffectLayer(EffectLayerType.Webcam, webcamEffectId)
  }, [activeTab, selectedEffectLayer, webcamEffectId, selectEffectLayer])

  // Update background while preserving existing properties
  const updateBackgroundEffect = useCallback((updates: any) => {
    // If no background effect exists, create it with sensible defaults
    if (!backgroundEffect) {
      onEffectChange(EffectType.Background, {
        ...DEFAULT_BACKGROUND_DATA,
        type: updates.type || BackgroundType.Gradient,
        ...updates
      })
      return
    }

    const currentBg = backgroundEffect.data as BackgroundEffectData

    onEffectChange(EffectType.Background, {
      ...currentBg,
      ...updates
    })
  }, [backgroundEffect, onEffectChange])

  const scheduleBackgroundUpdate = updateBackgroundEffect

  return (
    <TooltipProvider>
      <div ref={tooltipRef} className={cn("flex h-full bg-transparent border-l border-border/30", className)}>
        {/* Left sidebar with section tabs */}
        <div className="w-[56px] flex-shrink-0 flex flex-col items-center py-3 border-r border-border/30 bg-transparent">
          <div className="flex flex-col gap-1.5 w-full px-1.5">
            {visibleTabs.map((tab) => (
              <Tooltip key={tab.id} delayDuration={200}>
                <TooltipTrigger asChild>
                  <motion.button
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "group relative flex w-full items-center justify-center p-2 rounded-lg transition-colors duration-150",
                      activeTab === tab.id
                        ? "text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground active:scale-[0.97]"
                    )}
                    aria-label={tab.label}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={springConfig}
                  >
                    <AnimatePresence>
                      {activeTab === tab.id && (
                        <motion.div
                          className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={springConfig}
                          layoutId="effects-sidebar-tab-active"
                        />
                      )}
                    </AnimatePresence>
                    <tab.icon className="relative z-10 w-[18px] h-[18px]" />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="right" align="center" sideOffset={8} className="text-xs">
                  {tab.label}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Right content area */}
        <div className="flex-1 min-w-0 flex flex-col bg-transparent">
          {/* Header */}
          <div className="h-12 flex items-center px-4 border-b border-border/30 bg-transparent sticky top-0 z-10">
            <AnimatePresence mode="wait">
              <motion.h2
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
                className="text-[13px] font-semibold tracking-tight font-[var(--font-display)]"
              >
                {SIDEBAR_TABS.find(t => t.id === activeTab)?.label}
              </motion.h2>
            </AnimatePresence>
            {selectedEffectLayer && (
              <div className="ml-auto max-w-[55%] truncate whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                {`Editing ${EFFECT_LABELS[selectedEffectLayer.type] ?? 'Layer'}`}
              </div>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 custom-scrollbar">
            <div className="w-full relative">
              <AnimatePresence mode="wait" initial={false}>
                {activeTab === SidebarTabId.Clip && (
                  <motion.div
                    key="clip"
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-3"
                  >
                    <ClipTab selectedClip={selectedClip} />
                  </motion.div>
                )}

                {activeTab === SidebarTabId.Style && (
                  <motion.div
                    key="style"
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-3"
                  >
                    <SubTabs
                      value={styleSubTab}
                      onChange={setStyleSubTab}
                      tabs={[
                        { id: 'background', label: 'Backdrop' },
                        { id: 'frame', label: 'Window' },
                        { id: 'screen', label: 'Depth' },
                      ]}
                    />

                    <AnimatePresence mode="wait">
                      {styleSubTab === 'background' && (
                        <motion.div
                          key="background"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                        >
                          <BackgroundTab
                            backgroundEffect={backgroundEffect}
                            onUpdateBackground={scheduleBackgroundUpdate}
                          />
                        </motion.div>
                      )}

                      {styleSubTab === 'frame' && (
                        <motion.div
                          key="frame"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                        >
                          <ShapeTab
                            backgroundEffect={backgroundEffect}
                            onUpdateBackground={scheduleBackgroundUpdate}
                          />
                        </motion.div>
                      )}

                      {styleSubTab === 'screen' && (
                        <motion.div
                          key="screen"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                        >
                          <ScreenTab
                            selectedClip={selectedClip}
                            selectedEffectLayer={selectedEffectLayer}
                            onEffectChange={(_type, data) => onEffectChange(EffectType.Screen, data)}
                          />
                        </motion.div>
                      )}

                    </AnimatePresence>
                  </motion.div>
                )}

                {activeTab === SidebarTabId.Pointer && (
                  <motion.div
                    key="pointer"
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-3"
                  >
                    <SubTabs
                      value={pointerSubTab}
                      onChange={setPointerSubTab}
                      tabs={[
                        { id: 'cursor', label: 'Pointer' },
                        { id: 'keystrokes', label: 'Typing' },
                      ]}
                    />

                    <AnimatePresence mode="wait">
                      {pointerSubTab === 'cursor' && (
                        <motion.div
                          key="cursor"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                        >
                          <CursorTab
                            cursorEffect={cursorEffect}
                            onUpdateCursor={(updates) => updateEffect(EffectType.Cursor, updates)}
                            onEffectChange={onEffectChange}
                          />
                        </motion.div>
                      )}

                      {pointerSubTab === 'keystrokes' && (
                        <motion.div
                          key="keystrokes"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                        >
                          <KeystrokeTab
                            keystrokeEffect={keystrokeEffect}
                            onUpdateKeystroke={(updates) => updateEffect(EffectType.Keystroke, updates)}
                            onEffectChange={onEffectChange}
                            onBulkToggleKeystrokes={onBulkToggleKeystrokes}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {activeTab === SidebarTabId.Framing && (
                  <motion.div
                    key="framing"
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-3"
                  >
                    <SubTabs
                      value={framingSubTab}
                      onChange={setFramingSubTab}
                      tabs={[
                        { id: 'zoom', label: 'Focus' },
                        { id: 'crop', label: 'Frame', disabled: !isVideoClipSelected },
                      ]}
                    />

                    <AnimatePresence mode="wait">
                      {framingSubTab === 'zoom' && (
                        <motion.div
                          key="zoom"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                        >
                          <ZoomTab
                            effects={effects}
                            selectedEffectLayer={selectedEffectLayer}
                            selectedClip={selectedClip}
                            onUpdateZoom={(updates) => onEffectChange(EffectType.Zoom, updates)}
                            onEffectChange={onEffectChange}
                            onZoomBlockUpdate={onZoomBlockUpdate}
                          />
                        </motion.div>
                      )}

                      {framingSubTab === 'crop' && isVideoClipSelected && (
                        <motion.div
                          key="crop"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                        >
                          <CropTab
                            effects={effects}
                            selectedClip={selectedClip}
                            onAddCrop={onAddCrop ?? (() => { })}
                            onRemoveCrop={onRemoveCrop ?? (() => { })}
                            onUpdateCrop={onUpdateCrop ?? (() => { })}
                            onStartEditCrop={onStartEditCrop ?? (() => { })}
                            isEditingCrop={isEditingCrop}
                          />
                        </motion.div>
                      )}

                      {framingSubTab === 'crop' && !isVideoClipSelected && (
                        <motion.div
                          key="crop-disabled"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                        >
                          <div className="p-4 bg-background/40 rounded-xl text-xs text-muted-foreground">
                            Select a clip to adjust the frame.
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {activeTab === SidebarTabId.Webcam && (
                  <motion.div
                    key="webcam"
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-3"
                  >
                    <WebcamTab
                      webcamEffect={webcamEffect}
                      onUpdateWebcam={(updates) => {
                        const current = webcamEffect?.data as WebcamEffectData | undefined
                        if (current) {
                          onEffectChange(EffectType.Webcam, { ...current, ...updates })
                        }
                      }}
                      onEffectChange={onEffectChange}
                    />
                  </motion.div>
                )}

                {activeTab === SidebarTabId.Annotation && (
                  <motion.div
                    key="annotation"
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-3"
                  >
                    <AnnotationsTab />
                  </motion.div>
                )}

                {activeTab === SidebarTabId.Canvas && (
                  <motion.div
                    key="canvas"
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-3"
                  >
                    <CanvasTab
                      backgroundData={backgroundEffect?.data as BackgroundEffectData | undefined}
                      onBackgroundChange={scheduleBackgroundUpdate}
                    />
                  </motion.div>
                )}

                {activeTab === SidebarTabId.Advanced && (
                  <motion.div
                    key="advanced"
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-4"
                  >
                    <AdvancedTab
                      effects={effects}
                      onEffectChange={onEffectChange}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
