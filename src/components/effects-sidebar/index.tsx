'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'

import { cn } from '@/lib/utils'
import type { Clip, Effect, BackgroundEffectData, CursorEffectData, KeystrokeEffectData } from '@/types/project'
import { EffectType, BackgroundType } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'
import { EffectLayerType } from '@/types/effects'
import { getBackgroundEffect, getCropEffectForClip, getCursorEffect, getKeystrokeEffect } from '@/lib/effects/effect-filters'
import { DEFAULT_BACKGROUND_DATA } from '@/lib/constants/default-effects'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { SIDEBAR_TABS, SidebarTabId } from './constants'
import { TrackType } from '@/types/project'

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
import { AnimatePresence, motion } from 'framer-motion'

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

function SubTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T
  onChange: (next: T) => void
  tabs: { id: T; label: string; disabled?: boolean }[]
}) {
  return (
    <div className="relative flex p-0.5 bg-muted/30 rounded-lg gap-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative z-10 flex-1 px-3 py-1.5 text-[11px] font-medium rounded-md transition-all duration-150 ease-out",
            tab.disabled && "opacity-40 cursor-not-allowed",
            value === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </button>
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
  const [activeTab, setActiveTab] = useState<SidebarTabId>(() =>
    selectedClip ? SidebarTabId.Clip : SidebarTabId.Style
  )
  const [styleSubTab, setStyleSubTab] = useState<StyleSubTabId>('background')
  const [pointerSubTab, setPointerSubTab] = useState<PointerSubTabId>('cursor')
  const [framingSubTab, setFramingSubTab] = useState<FramingSubTabId>('zoom')
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const lastAutoOpenedCropClipRef = useRef<string | null>(null)

  // Extract current effects from the array using effect-filters helpers
  const backgroundEffect = effects ? getBackgroundEffect(effects) : undefined
  const cursorEffect = effects ? getCursorEffect(effects) : undefined
  const keystrokeEffect = effects ? getKeystrokeEffect(effects) : undefined

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
    return SIDEBAR_TABS.filter((tab) => tab.id !== SidebarTabId.Clip || !!selectedClip)
  }, [selectedClip])

  useEffect(() => {
    if (!selectedClip && activeTab === SidebarTabId.Clip) {
      setActiveTab(SidebarTabId.Style)
    }
  }, [activeTab, selectedClip])

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
                  <button
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "group relative flex w-full items-center justify-center p-2 rounded-lg transition-all duration-150 ease-out",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground active:scale-[0.97]"
                    )}
                    aria-label={tab.label}
                  >
                    <tab.icon className="w-[18px] h-[18px]" />
                  </button>
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
                className="text-[13px] font-semibold tracking-tight"
              >
                {SIDEBAR_TABS.find(t => t.id === activeTab)?.label}
              </motion.h2>
            </AnimatePresence>
            {selectedEffectLayer && (
              <div className="ml-auto px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-medium leading-tight rounded-full">
                {selectedEffectLayer.type === EffectLayerType.Zoom && selectedEffectLayer.id ?
                  `Editing Zoom` :
                  (() => {
                    const t = String(selectedEffectLayer.type)
                    return `Editing ${t.charAt(0).toUpperCase() + t.slice(1)}`
                  })()}
              </div>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 custom-scrollbar">
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
                        { id: 'background', label: 'Background' },
                        { id: 'frame', label: 'Frame' },
                        { id: 'screen', label: '3D Screen' },
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
                        { id: 'cursor', label: 'Cursor' },
                        { id: 'keystrokes', label: 'Keystrokes' },
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
                        { id: 'zoom', label: 'Zoom' },
                        { id: 'crop', label: 'Crop', disabled: !isVideoClipSelected },
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
                            Select a video clip to crop.
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
                    className="space-y-3"
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
