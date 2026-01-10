'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'

import { cn } from '@/shared/utils/utils'
import type { BackgroundEffectData, CursorEffectData, KeystrokeEffectData, Effect } from '@/types/project'
import { EffectType, BackgroundType } from '@/types/project'
import { EffectLayerType } from '@/features/effects/types'
import { getBackgroundEffect, getEffectByType } from '@/features/effects/core/filters'
import { DEFAULT_BACKGROUND_DATA } from '@/features/effects/background/config'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config'

import { SIDEBAR_TABS, SidebarTabId } from './constants'
import { TrackType } from '@/types/project'
import { useTrackExistence } from '@/features/core/stores/selectors/timeline-selectors'

import { BackgroundTab } from '@/features/effects/background'
import { CursorTab } from '@/features/effects/cursor/ui/CursorTab'
import { KeystrokeTab } from '@/features/effects/keystroke'
import { ZoomTab } from '@/features/ui/editor/logic/viewport/zoom'
import { CanvasTab } from './canvas-tab'
import { WebcamTab } from '@/features/media/webcam'
import { AnnotationsTab } from '@/features/effects/annotation'
import { TranscriptTab } from '@/features/ui/transcript/components/TranscriptTab'
import { AnimatePresence, motion } from 'framer-motion'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useSelectedClip } from '@/features/core/stores/selectors/clip-selectors'
import { useEffectsSidebarContext } from './EffectsSidebarContext'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'
import { ScreenTab as DepthTab } from '@/features/effects/screen'
import { ScreenTab } from './screen-tab'

const tabMotion = { type: "tween", duration: 0.12, ease: [0.2, 0.8, 0.2, 1] } as const

interface EffectsSidebarProps {
  className?: string
}

type BackdropSubTabId = 'background' | 'depth'
type PointerSubTabId = 'cursor' | 'keystrokes'

const EFFECT_LABELS: Partial<Record<EffectLayerType, string>> = {
  [EffectLayerType.Background]: 'Backdrop',
  [EffectLayerType.Screen]: 'Screen',
  [EffectLayerType.Cursor]: 'Pointer',
  [EffectLayerType.Keystroke]: 'Typing',
  [EffectLayerType.Zoom]: 'Camera',
  [EffectLayerType.Crop]: 'Screen',
  [EffectLayerType.Plugin]: 'Tools',
  [EffectLayerType.Annotation]: 'Overlay',
  [EffectLayerType.Frame]: 'Screen',
  [EffectLayerType.Video]: 'Video',
  [EffectLayerType.Subtitle]: 'Subtitle',
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
            "relative min-w-0 rounded-md px-2.5 py-1.5 text-xs font-medium leading-tight transition-colors duration-150",
            tab.disabled && "opacity-40 cursor-not-allowed",
            value === tab.id
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          transition={tabMotion}
        >
          <AnimatePresence>
            {value === tab.id && (
              <motion.div
                className="absolute inset-0 rounded-md bg-background shadow-sm"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={tabMotion}
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
  className
}: EffectsSidebarProps) {
  const {
    onEffectChange,
    onZoomBlockUpdate,
    onBulkToggleKeystrokes,
  } = useEffectsSidebarContext()
  const selectEffectLayer = useProjectStore((s) => s.selectEffectLayer)
  const clearEffectSelection = useProjectStore((s) => s.clearEffectSelection)
  const startEditingOverlay = useProjectStore((s) => s.startEditingOverlay)
  const stopEditingOverlay = useProjectStore((s) => s.stopEditingOverlay)
  const selectedEffectLayer = useProjectStore((s) => s.selectedEffectLayer)
  const isEditingCrop = useProjectStore((s) => s.isEditingCrop)
  const timelineEffects = useProjectStore((s) => s.currentProject?.timeline?.effects)
  const effects = React.useMemo(() => timelineEffects ?? [], [timelineEffects])
  const selectedClipResult = useSelectedClip()
  const selectedClip = selectedClipResult?.clip ?? null
  const selectedTrackType = selectedClipResult?.track.type

  const activeTab = useWorkspaceStore((s) => s.activeSidebarTab)
  const setActiveTab = useWorkspaceStore((s) => s.setActiveSidebarTab)

  const [backdropSubTab, setBackdropSubTab] = useState<BackdropSubTabId>('background')
  const [pointerSubTab, setPointerSubTab] = useState<PointerSubTabId>('cursor')

  const tooltipRef = useRef<HTMLDivElement | null>(null)

  // Check if webcam/annotation tracks have content
  const { hasWebcamContent } = useTrackExistence()

  // Extract current effects from the array using effect-filters helpers
  const backgroundEffect = effects ? getBackgroundEffect(effects) : undefined
  const cursorEffect = effects ? getEffectByType(effects, EffectType.Cursor) : undefined
  const keystrokeEffect = effects
    ? effects.find(effect => effect.type === EffectType.Keystroke && effect.id === KEYSTROKE_STYLE_EFFECT_ID)
    : undefined
  const selectedAnnotation = React.useMemo(() => {
    if (selectedEffectLayer?.type !== EffectLayerType.Annotation || !selectedEffectLayer.id) {
      return null
    }
    return effects.find(effect => effect.id === selectedEffectLayer.id) ?? null
  }, [effects, selectedEffectLayer])
  const handleSelectAnnotation = useCallback((effect: Effect | null) => {
    if (effect) {
      selectEffectLayer(EffectLayerType.Annotation, effect.id)
      startEditingOverlay(effect.id)
      return
    }
    clearEffectSelection()
    stopEditingOverlay()
  }, [clearEffectSelection, selectEffectLayer, startEditingOverlay, stopEditingOverlay])

  // Track last selected clip id and previous effect layer type to control auto-tab switching

  const prevEffectTypeRef = React.useRef<EffectLayerType | undefined>(undefined)

  const isVideoClipSelected = !!selectedClip && selectedTrackType === TrackType.Video

  // Cleanup crop editing when leaving Screen tab or when clip deselects
  useEffect(() => {
    const shouldStopEditing = activeTab !== SidebarTabId.Screen || !isVideoClipSelected
    if (shouldStopEditing && isEditingCrop) {
      // Stop editing crop via store directly
      useProjectStore.getState().stopEditingCrop()
    }
  }, [activeTab, isVideoClipSelected, isEditingCrop])

  // Handle Escape key to close crop editing
  useEffect(() => {
    if (!isEditingCrop) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        useProjectStore.getState().stopEditingCrop()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isEditingCrop])


  const routeToEffect = useCallback((type: EffectLayerType) => {
    switch (type) {
      case EffectLayerType.Background:
        setActiveTab(SidebarTabId.Backdrop)
        setBackdropSubTab('background')
        return
      case EffectLayerType.Screen:
        setActiveTab(SidebarTabId.Backdrop)
        setBackdropSubTab('depth')
        return
      case EffectLayerType.Frame:
      case EffectLayerType.Crop:
        setActiveTab(SidebarTabId.Screen)
        return
      // NOTE: Webcam case removed - webcam is now handled via clip selection
      case EffectLayerType.Cursor:
        setActiveTab(SidebarTabId.Pointer)
        setPointerSubTab('cursor')
        return
      case EffectLayerType.Keystroke:
        setActiveTab(SidebarTabId.Pointer)
        setPointerSubTab('keystrokes')
        return
      case EffectLayerType.Zoom:
      case EffectLayerType.Video:
      case EffectLayerType.Plugin:
        setActiveTab(SidebarTabId.Camera)
        return
      case EffectLayerType.Annotation:
        setActiveTab(SidebarTabId.Annotation)
        return
      case EffectLayerType.Subtitle:
        setActiveTab(SidebarTabId.Transcript)
        return
      default:
        setActiveTab(SidebarTabId.Screen)
    }
  }, [setActiveTab])

  // Update active tab based on selection changes (without overriding manual tab clicks)
  useEffect(() => {
    const currentEffectType = selectedEffectLayer?.type as EffectLayerType | undefined

    // If an effect layer is explicitly selected, always show its tab
    if (currentEffectType) {
      routeToEffect(currentEffectType)
    } else if (selectedClip) {
      // Auto-switch tab based on clip type when no effect is selected
      if (selectedTrackType === TrackType.Webcam) {
        setActiveTab(SidebarTabId.Webcam)
      } else if (selectedTrackType === TrackType.Video) {
        setActiveTab(SidebarTabId.Screen)
      }
    }

    // Remember last effect type
    prevEffectTypeRef.current = currentEffectType
  }, [routeToEffect, selectedEffectLayer, selectedClip, selectedTrackType, setActiveTab])

  const updateEffect = useCallback((category: EffectType.Cursor | EffectType.Keystroke, updates: Partial<CursorEffectData | KeystrokeEffectData>) => {
    const effect = category === EffectType.Cursor ? cursorEffect : keystrokeEffect
    const effectType = category
    if (effect) {
      const currentData = effect.data as CursorEffectData | KeystrokeEffectData
      onEffectChange(effectType, { ...currentData, ...updates })
    } else {
      onEffectChange(effectType, updates)
    }
  }, [cursorEffect, keystrokeEffect, onEffectChange])

  // Map tabs to include disabled state instead of filtering
  const visibleTabs = React.useMemo(() => {
    return SIDEBAR_TABS.map((tab) => {
      // Disable Webcam tab when there's no webcam content instead of hiding it
      if (tab.id === SidebarTabId.Webcam) {
        return {
          ...tab,
          disabled: !hasWebcamContent,
          tooltip: !hasWebcamContent ? "No webcam clips on the timeline" : tab.label
        }
      }

      // Disable Transcript tab when there's no webcam content (since it depends on webcam recording)
      if (tab.id === SidebarTabId.Transcript) {
        return {
          ...tab,
          disabled: !hasWebcamContent,
          tooltip: !hasWebcamContent ? "No webcam recordings to transcribe" : tab.label
        }
      }

      return {
        ...tab,
        disabled: false,
        tooltip: tab.label
      }
    })
  }, [hasWebcamContent])

  useEffect(() => {
    // Switch away from Webcam tab if webcam content is removed
    if (!hasWebcamContent && activeTab === SidebarTabId.Webcam) {
      setActiveTab(SidebarTabId.Screen)
    }
    // Switch away from Transcript tab if webcam content is removed
    if (!hasWebcamContent && activeTab === SidebarTabId.Transcript) {
      setActiveTab(SidebarTabId.Screen)
    }
  }, [activeTab, hasWebcamContent, setActiveTab])

  // Update background while preserving existing properties
  const updateBackgroundEffect = useCallback((updates: Partial<BackgroundEffectData>) => {
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
      <div ref={tooltipRef} className={cn("flex h-full", className)}>
        {/* Left sidebar with section tabs */}
        <div className="w-14 flex-shrink-0 flex flex-col items-center py-3 border-r border-border/30 bg-transparent relative z-50">
          <div className="flex flex-col gap-1.5 w-full px-1.5">
            {visibleTabs.map((tab) => (
              <Tooltip key={tab.id} delayDuration={200}>
                <TooltipTrigger asChild>
                  <motion.button
                    onClick={tab.disabled ? undefined : () => setActiveTab(tab.id as SidebarTabId)}
                    disabled={tab.disabled}
                    className={cn(
                      "group relative flex w-full aspect-square items-center justify-center p-2 rounded-xl transition-colors duration-150",
                      activeTab === tab.id
                        ? "text-primary-foreground"
                        : tab.disabled
                          ? "text-muted-foreground/30 cursor-not-allowed"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground active:scale-[0.97]"
                    )}
                    aria-label={tab.label}
                    transition={tabMotion}
                  >
                    <AnimatePresence>
                      {activeTab === tab.id && (
                        <motion.div
                          className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={tabMotion}
                          layoutId="effects-sidebar-tab-active"
                        />
                      )}
                    </AnimatePresence>
                    <tab.icon className="relative z-10 w-4.5 h-4.5" />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="right" align="center" sideOffset={8} className="text-xs">
                  {tab.tooltip}
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
                className="text-ui-sm font-semibold tracking-tight font-[var(--font-display)]"
              >
                {SIDEBAR_TABS.find(t => t.id === activeTab)?.label}
              </motion.h2>
            </AnimatePresence>
            {selectedEffectLayer && (
              <div className="ml-auto max-w-[55%] truncate whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-0.5 text-2xs font-medium text-primary">
                {`Editing ${EFFECT_LABELS[selectedEffectLayer.type] ?? 'Layer'}`}
              </div>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3">
            <div className="w-full relative">
              <AnimatePresence mode="wait" initial={false}>
                {activeTab === SidebarTabId.Screen && (
                  <motion.div
                    key="screen"
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-3"
                  >
                    <ScreenTab
                      backgroundEffect={backgroundEffect}
                      effects={effects}
                      onUpdateBackground={scheduleBackgroundUpdate}
                    />
                  </motion.div>
                )}

                {activeTab === SidebarTabId.Backdrop && (
                  <motion.div
                    key="backdrop"
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-3"
                  >
                    <SubTabs
                      value={backdropSubTab}
                      onChange={setBackdropSubTab}
                      tabs={[
                        { id: 'background', label: 'Background' },
                        { id: 'depth', label: 'Depth' },
                      ]}
                    />

                    <AnimatePresence mode="wait">
                      {backdropSubTab === 'background' && (
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

                      {backdropSubTab === 'depth' && (
                        <motion.div
                          key="depth"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                        >
                          <DepthTab
                            selectedClip={selectedClip}
                            selectedEffectLayer={selectedEffectLayer}
                            onEffectChange={onEffectChange}
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

                {activeTab === SidebarTabId.Camera && (
                  <motion.div
                    key="camera"
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-3"
                  >
                    <ZoomTab
                      effects={effects}
                      selectedEffectLayer={selectedEffectLayer}
                      selectedClip={selectedClip}
                      onZoomBlockUpdate={onZoomBlockUpdate}
                    />
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
                    <WebcamTab />
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
                    <AnnotationsTab
                      selectedAnnotation={selectedAnnotation ?? undefined}
                      onSelectAnnotation={handleSelectAnnotation}
                    />
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

                {activeTab === SidebarTabId.Transcript && (
                  <motion.div
                    key={SidebarTabId.Transcript}
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-3"
                  >
                    <TranscriptTab />
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
