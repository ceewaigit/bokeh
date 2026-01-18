"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Toolbar } from '../toolbar'
import { PreviewAreaRemotion } from '../preview-area-remotion'
import dynamic from 'next/dynamic'

const TimelineCanvas = dynamic(
  () => import('@/features/ui/timeline/components/timeline-canvas').then(mod => mod.TimelineCanvas),
  { ssr: false }
)
const PluginCreator = dynamic(
  () => import('../plugin-creator/page').then(mod => mod.PluginCreator),
  { ssr: false }
)
import { EffectsSidebar } from '@/features/effects/components'
import { EffectsSidebarProvider } from '@/features/effects/components/EffectsSidebarContext'
import { ExportDialog } from '@/features/core/export/components/export-dialog'
import { RecordingsLibrary } from '@/features/media/recording/components/library/recordings-library'
import type { LibraryRecording } from '@/features/media/recording/store/library-store'
import { UtilitiesSidebar } from '@/features/ui/editor/components/utilities'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'
import { useProgressStore } from '@/features/core/stores/progress-store'
import { useShallow } from 'zustand/react/shallow'
import type { ZoomBlock, ZoomEffectData } from '@/types/project'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'
import { PlayheadService, type PlayheadState } from '@/features/playback'
import { useTimelineMetadata } from '@/features/ui/timeline/hooks/use-timeline-metadata'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import { KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config'
import { timelineToSource, getSourceDuration } from '@/features/ui/timeline/time/time-space-converter'
import { useCommandKeyboard } from '@/features/core/commands/hooks/use-command-keyboard'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { calculateFullCameraPath } from '@/features/ui/editor/logic/viewport/logic/path-calculator'
import { initializeDefaultWallpaper } from '@/features/effects/background'
import { EffectLayerType } from '@/features/effects/types'
import { EffectStore } from '@/features/effects/core/effects-store'
import { applyEffectChange } from '@/features/effects/services/effect-change'
import { ProjectStorage } from '@/features/core/storage/project-storage'
import { UpdateZoomBlockCommand } from '@/features/core/commands'
import { toast } from 'sonner'
import { useSelectedClip } from '@/features/core/stores/selectors/clip-selectors'
import { useProjectLoader } from '@/features/core/storage/hooks/use-project-loader'
import { usePanelResizer } from '@/features/ui/editor/hooks/use-panel-resizer'
import { useTimelineAutoHeight } from '@/features/ui/timeline/hooks/use-timeline-auto-height'
import { LargeVideoDialog, ProxyProgressContainer, useProxyWorkflow } from '@/features/proxy'
import { WorkspaceLoadingOverlay } from './workspace-loading-overlay'

export function WorkspaceManager() {
  // Store hooks - using reactive state from single source of truth
  const {
    currentProject,
    setCameraPathCache,
    selectedEffectLayer,
    play: storePlay,
    pause: storePause,
    seek: storeSeek,
    saveCurrentProject,
    setZoom,
    zoom,
    cleanupProject,
  } = useProjectStore(
    useShallow((s) => ({
      currentProject: s.currentProject,
      setCameraPathCache: s.setCameraPathCache,
      selectedEffectLayer: s.selectedEffectLayer,
      play: s.play,
      pause: s.pause,
      seek: s.seek,
      saveCurrentProject: s.saveCurrentProject,
      setZoom: s.setZoom,
      zoom: s.zoom,
      cleanupProject: s.cleanupProject,
    }))
  )

  const selectedClipResult = useSelectedClip()
  const selectedClip = selectedClipResult?.clip ?? null
  const timelineMetadata = useTimelineMetadata(currentProject)

  // Keep playhead state in a ref to avoid 30fps re-renders in WorkspaceManager.
  const playheadStateRef = useRef<PlayheadState | undefined>(undefined)
  useEffect(() => {
    playheadStateRef.current = undefined
  }, [currentProject?.id])

  // Initialize default wallpaper once on mount
  useEffect(() => {
    initializeDefaultWallpaper()
  }, [])


  const {
    isPropertiesOpen,
    isUtilitiesOpen,
    isExportOpen,
    propertiesPanelWidth,
    utilitiesPanelWidth,
    toggleProperties,
    setExportOpen,
    currentView,
    setCurrentView,
    resetWorkspace
  } = useWorkspaceStore(
    useShallow((s) => ({
      isPropertiesOpen: s.isPropertiesOpen,
      isUtilitiesOpen: s.isUtilitiesOpen,
      isExportOpen: s.isExportOpen,
      propertiesPanelWidth: s.propertiesPanelWidth,
      utilitiesPanelWidth: s.utilitiesPanelWidth,
      toggleProperties: s.toggleProperties,
      setExportOpen: s.setExportOpen,
      currentView: s.currentView,
      setCurrentView: s.setCurrentView,
      resetWorkspace: s.resetWorkspace
    }))
  )

  // Auto-fit timeline height based on visible tracks
  const { height: autoTimelineHeight } = useTimelineAutoHeight()

  const isExporting = useProgressStore((s) => s.isProcessing)
  const previewReady = useProjectStore((s) => s.previewReady)
  const setPreviewReady = useProjectStore((s) => s.setPreviewReady)

  // Custom hooks
  const { isLoading, loadingMessage, loadRecording } = useProjectLoader()
  const {
    pendingRecording: pendingProxyRecording,
    dialogOpen: proxyDialogOpen,
    promptIfNeeded: promptProxyIfNeeded,
    handleUserChoice: handleProxyUserChoice,
    closeDialog: closeProxyDialog,
  } = useProxyWorkflow()
  const {
    panelMaxWidth,
    dragUtilitiesWidth,
    dragPropertiesWidth,
    dragTimelineHeight,
    startResizingUtilities,
    startResizingProperties,
    startResizingTimeline
  } = usePanelResizer()

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Command executor for undo/redo support
  const executorRef = useCommandExecutor()

  const prioritizedProxyPromptRecordings = useMemo(() => {
    if (!currentProject) return []

    const byId = new Map(currentProject.recordings.map(r => [r.id, r]))
    const prioritized: typeof currentProject.recordings = []
    const addById = (recordingId: string | undefined) => {
      if (!recordingId) return
      const rec = byId.get(recordingId)
      if (!rec || rec.sourceType === 'image') return
      if (prioritized.some(p => p.id === rec.id)) return
      prioritized.push(rec)
    }

    addById(selectedClip?.recordingId)

    // Fallback: first clip on the timeline
    const firstClip = currentProject.timeline.tracks
      .flatMap(t => t.clips)
      .sort((a, b) => a.startTime - b.startTime)[0]
    addById(firstClip?.recordingId)

    // Fallback: any other recording in the project
    currentProject.recordings.forEach(r => addById(r.id))

    return prioritized
  }, [currentProject, selectedClip?.recordingId])

  // Prompt before generating preview proxies for large videos.
  useEffect(() => {
    if (!currentProject || isLoading || proxyDialogOpen) return

    let cancelled = false
    void (async () => {
      for (const recording of prioritizedProxyPromptRecordings) {
        if (cancelled) return
        const didPrompt = await promptProxyIfNeeded(recording)
        if (didPrompt) return
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    currentProject,
    isLoading,
    proxyDialogOpen,
    prioritizedProxyPromptRecordings,
    promptProxyIfNeeded,
  ])

  // Reset preview state when project changes, safety timeout for edge cases
  useEffect(() => {
    if (!currentProject) {
      setPreviewReady(false)
      return
    }

    // Safety timeout: if somehow video doesn't fire ready after 10s, proceed anyway
    if (!previewReady && !isLoading) {
      const timeout = setTimeout(() => {
        console.log('[WorkspaceManager] Preview ready timeout (10s) - forcing ready state')
        setPreviewReady(true)
      }, 10000)

      return () => clearTimeout(timeout)
    }
  }, [currentProject, previewReady, isLoading, setPreviewReady])

  // Subscribe to cache invalidation to trigger recalculation
  const cameraPathCache = useProjectStore((s) => s.cameraPathCache)
  const cameraPathCacheDimensions = useProjectStore((s) => s.cameraPathCacheDimensions)
  const timelineMutationCounter = useProjectStore((s) => s.timelineMutationCounter)

  // Recalculate camera path when cache is invalidated (effects changed)
  useEffect(() => {
    if (!currentProject || !timelineMetadata) return

    const targetWidth = timelineMetadata.width
    const targetHeight = timelineMetadata.height

    // If cache exists but was computed at a different resolution, invalidate it to avoid drift.
    if (
      cameraPathCache &&
      cameraPathCacheDimensions &&
      (cameraPathCacheDimensions.width !== targetWidth || cameraPathCacheDimensions.height !== targetHeight)
    ) {
      setCameraPathCache(null, null)
      return
    }

    // Skip if cache exists (initial load handles this)
    if (cameraPathCache !== null) return

    // Debounce to avoid recalculating on every keystroke during rapid edits
    const timeoutId = setTimeout(() => {
      const fps = TimelineDataService.getFps(currentProject)
      const recordingsMap = TimelineDataService.getRecordingsMap(currentProject)
      // Timeline-Centric: use raw video clips (no slicing)
      const videoClips = TimelineDataService.getVideoClips(currentProject)
      const frameLayout = TimelineDataService.getFrameLayout(
        currentProject,
        fps,
        videoClips
      )

      const newCameraPath = calculateFullCameraPath({
        frameLayout,
        fps,
        videoWidth: targetWidth,
        videoHeight: targetHeight,
        effects: EffectStore.getAll(currentProject),
        getRecording: (id) => recordingsMap.get(id),
        loadedMetadata: undefined,
        cameraSettings: currentProject.settings.camera
      })

      if (newCameraPath) {
        setCameraPathCache(newCameraPath, { width: targetWidth, height: targetHeight })
      }
    }, 50) // 50ms debounce

    return () => clearTimeout(timeoutId)
  }, [
    currentProject,
    timelineMetadata,
    cameraPathCache,
    cameraPathCacheDimensions,
    timelineMutationCounter,
    setCameraPathCache
  ])

  const timelineEffects = useProjectStore((s) => s.currentProject?.timeline?.effects)
  const contextEffects = useMemo(() => timelineEffects ?? [], [timelineEffects])

  const selectedZoomEffect = useMemo(() => {
    if (!selectedEffectLayer || selectedEffectLayer.type !== EffectLayerType.Zoom) return null
    return contextEffects.find(effect => effect.id === selectedEffectLayer.id) ?? null
  }, [contextEffects, selectedEffectLayer])

  const selectedZoomData = selectedZoomEffect?.data as ZoomEffectData | undefined
  const isManualZoom = selectedZoomData?.followStrategy === ZoomFollowStrategy.Manual

  // Playback control ref
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const glowPortalRef = useRef<HTMLDivElement>(null)
  // Track mounted state to prevent interval leak during rapid unmount/remount
  const isMountedRef = useRef(true)

  // Track unsaved changes by comparing saved timestamp with current
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  // Simple check: if project modifiedAt differs from lastSavedAt, we have unsaved changes
  useEffect(() => {
    if (currentProject?.modifiedAt && lastSavedAt) {
      setHasUnsavedChanges(currentProject.modifiedAt !== lastSavedAt)
    }
  }, [currentProject?.modifiedAt, lastSavedAt])

  // Listen for open-project-from-path IPC event (file association / double-click .bokeh)
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onOpenProjectFromPath?.(async (projectPath) => {
      console.log('[WorkspaceManager] Opening project from path:', projectPath)

      // Create a minimal LibraryRecording object for the loader
      const recording: LibraryRecording = {
        name: projectPath.split('/').pop()?.replace('.bokeh', '') || 'Untitled',
        path: projectPath,
        timestamp: new Date(),
      }

      const success = await loadRecording(recording, setLastSavedAt)
      if (!success) {
        console.error('[WorkspaceManager] Failed to load project from path:', projectPath)
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [loadRecording])

  // Consolidated save function
  const handleSaveProject = useCallback(async () => {
    // All changes are now stored directly in Zustand store
    // No need to sync local effects since we removed that state

    await saveCurrentProject()

    // Use the project's modifiedAt timestamp after saving
    const savedProject = useProjectStore.getState().currentProject
    if (savedProject?.modifiedAt) {
      setLastSavedAt(savedProject.modifiedAt)
    }
    toast.success('Project saved')
    setHasUnsavedChanges(false)
  }, [saveCurrentProject])

  // Handle keyboard shortcuts
  useCommandKeyboard({
    enabled: !isExporting,
    onSave: handleSaveProject
  })

  // Subscribe to isPlaying only where needed (e.g., clip boundary monitoring)
  // This is a "hot" subscription but only causes re-render when isPlaying changes (rare)
  const isPlaying = useProjectStore((s) => s.isPlaying)

  // Define handlePause first since it's used in useEffect
  const handlePause = useCallback(() => {
    storePause()
  }, [storePause])

  // Track mounted state for cleanup
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      // Clear any lingering interval on unmount
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
        playbackIntervalRef.current = null
      }
    }
  }, [])

  // Monitor clip boundaries during playback - use reactive playhead clip from store
  useEffect(() => {
    if (!isPlaying || isExporting) return

    // Clear any existing interval first to prevent accumulation
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current)
      playbackIntervalRef.current = null
    }

    const syncInterval = setInterval(() => {
      // Skip if unmounted to prevent state updates on unmounted component
      if (!isMountedRef.current) return

      const state = useProjectStore.getState()
      if (!state.isPlaying || !state.currentProject) return

      const nextPlayheadState = PlayheadService.updatePlayheadState(
        state.currentProject,
        state.currentTime,
        playheadStateRef.current
      )
      playheadStateRef.current = nextPlayheadState

      const activeClip = nextPlayheadState.playheadClip
      if (!activeClip) return

      // Convert timeline time to source time using the shared converter (respects playbackRate + remaps).
      const sourceTimeMs = timelineToSource(state.currentTime, activeClip)
      const sourceOutMs =
        activeClip.sourceOut ??
        ((activeClip.sourceIn || 0) + getSourceDuration(activeClip))

      if (sourceTimeMs > sourceOutMs) {
        handlePause()
      }
    }, 250)

    playbackIntervalRef.current = syncInterval

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
        playbackIntervalRef.current = null
      }
    }
  }, [isPlaying, handlePause, isExporting])

  // Centralized playback control - no selection required for playback
  const handlePlay = useCallback(() => {
    storePlay()
  }, [storePlay])

  const handleSeek = useCallback((time: number) => {
    // Single source of truth - update project store
    storeSeek(time)
  }, [storeSeek])

  const handleClipSelect = useCallback(() => {
    setHasUnsavedChanges(false)
  }, [])

  // PERF: Access effects via getState() inside callback to avoid recreating on every effect change.
  // This prevents cascade re-renders to EffectsSidebarProvider and all effect UI components.
  const handleEffectChange = useCallback((type: EffectType, data: Record<string, unknown>) => {
    const executor = executorRef.current

    if (!executor) return
    const state = useProjectStore.getState()
    const effects = state.currentProject?.timeline?.effects ?? []
    const nextPlayheadState = state.currentProject
      ? PlayheadService.updatePlayheadState(
        state.currentProject,
        state.currentTime,
        playheadStateRef.current
      )
      : null
    if (nextPlayheadState) {
      playheadStateRef.current = nextPlayheadState
    }

    void applyEffectChange(type, data, {
      effects,
      selectedEffectLayer,
      currentProject,
      selectedClip,
      playheadRecording: nextPlayheadState?.playheadRecording ?? null,
      currentTime: state.currentTime,
      executeCommand: (commandName: string, ...args: any[]) => {
        executor.executeByName(commandName as any, ...args)
      }
    })
  }, [currentProject, selectedEffectLayer, selectedClip, executorRef])

  // Bulk toggle all keystroke effects
  // PERF: Access effects via getState() to avoid callback recreation on effect changes
  const handleBulkToggleKeystrokes = useCallback((enabled: boolean) => {
    if (!executorRef.current) return

    const effects = useProjectStore.getState().currentProject?.timeline?.effects ?? []
    const keystrokeEffects = effects.filter(e => e.type === EffectType.Keystroke && e.id !== KEYSTROKE_STYLE_EFFECT_ID)
    keystrokeEffects.forEach(effect => {
      executorRef.current?.executeByName('UpdateEffect', effect.id, { enabled })
    })
  }, [executorRef])

  // Track crop editing state for preview interactions
  const isEditingCrop = useProjectStore((s) => s.isEditingCrop)

  const handleZoomBlockUpdate = useCallback((blockId: string, updates: Partial<ZoomBlock>) => {
    executorRef.current?.execute(UpdateZoomBlockCommand, blockId, updates)
  }, [executorRef])

  const zoomSettings = useMemo(() => {
    if (!selectedZoomEffect || !isManualZoom || isEditingCrop) {
      return { isEditing: false, zoomData: null }
    }

    return {
      isEditing: true,
      zoomData: selectedZoomData ?? null,
    }
  }, [selectedZoomEffect, selectedZoomData, isManualZoom, isEditingCrop])

  const shouldWaitForPreview = Boolean(currentProject && timelineMetadata) && !previewReady
  const showLoadingOverlay = isLoading || shouldWaitForPreview
  const loadingOverlayMessage = shouldWaitForPreview
    ? (loadingMessage && loadingMessage !== 'Loading...' ? loadingMessage : 'Preparing preview…')
    : (loadingMessage && loadingMessage !== 'Loading...' ? loadingMessage : 'Loading…')

  let content: React.ReactNode
  if (currentView === 'plugin-creator') {
    content = (
      <div className="fixed inset-0 flex flex-col bg-zinc-950 z-50">
        <div className="flex-shrink-0">
          <Toolbar
            mode="editor"
            editorProps={{
              project: currentProject!,
              hasUnsavedChanges,
              onSaveProject: handleSaveProject,
              onExport: () => setExportOpen(true),
              onToggleProperties: toggleProperties,
              onBackToLibrary: () => {
                setCurrentView('editor')
              }
            }}
          />
        </div>
        <div className="flex-1 overflow-hidden relative">
          <PluginCreator />
        </div>
      </div>
    )
  } else if (!currentProject) {
    content = (
      <div className="fixed inset-0 flex flex-col">
        <RecordingsLibrary
          onSelectRecording={async (recording) => {
            const success = await loadRecording(recording, setLastSavedAt)
            if (!success) {
              return
            }
          }}
        />
      </div>
    )
  } else {
    content = (
      <div className="fixed inset-0 flex flex-col bg-transparent" style={{ width: '100vw', height: '100vh' }}>
        {/* Top Toolbar - Absolutely positioned to allow glow bleed-through */}
        {!isExporting && (
          <div className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
            <Toolbar
              mode="editor"
              editorProps={{
                project: currentProject,
                hasUnsavedChanges,
                onSaveProject: handleSaveProject,
                onExport: () => setExportOpen(true),
                onToggleProperties: toggleProperties,
                onBackToLibrary: () => {
                  // Clean up resources and navigate back to library
                  const cleanupAndReturn = () => {
                    // Clean up local state
                    setHasUnsavedChanges(false)

                    // Memory cleanup: clear HEAVY data only (not thumbnails - those are small and should persist)
                    ProjectStorage.clearMetadataCache()

                    // Clean up stores
                    cleanupProject()
                    resetWorkspace()

                    // Clear all rendering caches to free memory
                    import('@/features/media/audio/waveform-analyzer').then(m => m.WaveformAnalyzer.clearCache())
                    import('@/features/effects/cursor/logic/cursor-logic').then(m => m.clearCursorCalculatorCache())
                    import('@/shared/utils/video-metadata').then(m => m.clearDurationCache())

                    // Hide record button when returning to library (main window visible)
                    if (window.electronAPI?.minimizeRecordButton) {
                      window.electronAPI.minimizeRecordButton()
                    }
                  }

                  // If there are unsaved changes, confirm before leaving
                  if (hasUnsavedChanges) {
                    if (confirm('You have unsaved changes. Do you want to leave without saving?')) {
                      cleanupAndReturn()
                    }
                  } else {
                    cleanupAndReturn()
                  }
                }
              }}
            />
          </div>
        )}

        {/* Main Content Area */}
        {!isExporting ? (
          <div className="flex-1 flex flex-col overflow-hidden relative pt-14">
            <div className="flex flex-col h-full">
              {/* Top Section - Preview and Sidebars (flexible height) */}
              <div className="flex flex-1 min-h-0 relative">
                <div
                  ref={glowPortalRef}
                  className="absolute inset-0 pointer-events-none z-[-1] overflow-visible"
                />
                <div className="relative z-10 flex flex-1 min-h-0">
                  {/* Left Sidebar - Utilities (closed by default) */}
                  <AnimatePresence mode="wait">
                    {isUtilitiesOpen && (
                      <motion.div
                        key="utilities-panel"
                        initial={{ opacity: 0, x: -20, width: 0 }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          width: Math.min(
                            dragUtilitiesWidth ?? utilitiesPanelWidth,
                            panelMaxWidth || Number.POSITIVE_INFINITY
                          )
                        }}
                        exit={{ opacity: 0, x: -20, width: 0 }}
                        transition={
                          dragUtilitiesWidth
                            ? { duration: 0 } // Instant updates during drag
                            : { type: 'spring', stiffness: 520, damping: 28 } // Smooth spring for toggle
                        }
                        className="relative z-20 flex flex-shrink-0 h-full overflow-visible"
                      >
                        <div
                          className="flex flex-col flex-shrink-0 h-full pt-3 pb-1 pl-4"
                          style={{
                            // Keep inner width fixed to target width to create "reveal" effect instead of squish
                            width: `${Math.min(
                              dragUtilitiesWidth ?? utilitiesPanelWidth,
                              panelMaxWidth || Number.POSITIVE_INFINITY
                            )}px`
                          }}
                        >
                          <div className="flex-1 overflow-hidden rounded-xl border border-border/40 bg-background/50 shadow-sm">
                            <UtilitiesSidebar className="h-full w-full" />
                          </div>
                        </div>
                        <div
                          className="flex-shrink-0 w-1.5 cursor-col-resize bg-transparent hover:bg-transparent transition-colors flex items-center justify-center group z-20 mx-1"
                          onMouseDown={startResizingUtilities}
                        >
                          <div className="h-8 w-1 rounded-pill bg-foreground/10 group-hover:bg-foreground/30 transition-all duration-300 ease-out" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Preview Area */}
                  <div className="flex-1 overflow-hidden relative min-w-0">
                    {timelineMetadata ? (
                      <PreviewAreaRemotion
                        isEditingCrop={isEditingCrop}
                        zoomSettings={zoomSettings}
                        glowPortalRootRef={glowPortalRef}
                      />
                    ) : (
                      <div className="relative w-full h-full overflow-hidden bg-transparent">
                        <div className="absolute inset-0 flex items-center justify-center p-8">
                          <div className="text-gray-500 text-center">
                            <p className="text-lg font-medium mb-2">No timeline data</p>
                            <p className="text-sm">Create or select a project to preview</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Properties Panel - Fixed width when open, same height as preview */}
                  <AnimatePresence mode="wait">
                    {isPropertiesOpen && (
                      <motion.div
                        key="properties-panel"
                        initial={{ opacity: 0, x: 20, width: 0 }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          width: Math.min(
                            dragPropertiesWidth ?? propertiesPanelWidth,
                            panelMaxWidth || Number.POSITIVE_INFINITY
                          )
                        }}
                        exit={{ opacity: 0, x: 20, width: 0 }}
                        transition={
                          dragPropertiesWidth
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 520, damping: 28 }
                        }
                        className="relative z-20 flex flex-shrink-0 h-full overflow-visible"
                      >
                        <div
                          className="flex-shrink-0 w-1.5 cursor-col-resize bg-transparent hover:bg-transparent transition-colors flex items-center justify-center group z-20 mx-1"
                          onMouseDown={startResizingProperties}
                        >
                          <div className="h-8 w-1 rounded-pill bg-foreground/10 group-hover:bg-foreground/30 transition-all duration-300 ease-out" />
                        </div>
                        <div
                          className="flex flex-col flex-shrink-0 h-full pt-3 pb-1 pr-4 flex-1 min-w-0"
                        >
                          <div className="flex-1 overflow-hidden rounded-xl border border-border/40 bg-background/50 shadow-sm">
                            <EffectsSidebarProvider
                              value={{
                                onEffectChange: handleEffectChange,
                                onZoomBlockUpdate: handleZoomBlockUpdate,
                                onBulkToggleKeystrokes: handleBulkToggleKeystrokes,
                              }}
                            >
                              <EffectsSidebar className="h-full w-full" />
                            </EffectsSidebarProvider>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Timeline Resize Divider */}
              <div
                className="relative z-30 h-2 cursor-row-resize bg-border/10 hover:bg-border/30 transition-all duration-150 flex-shrink-0 flex items-center justify-center group"
                onMouseDown={startResizingTimeline}
              >
                {/* Subtle resize handle indicator */}
                <div className="w-14 h-1.5 rounded-pill bg-foreground/15 group-hover:bg-foreground/35 shadow-sm transition-colors" />
              </div>

              {/* Timeline Section - Full width at bottom, auto-fit height */}
              <div
                className="bg-transparent overflow-hidden flex-shrink-0"
                style={{ height: `${dragTimelineHeight ?? autoTimelineHeight}px`, minHeight: '100px', width: '100vw' }}
              >
                <TimelineCanvas
                  className="h-full w-full pt-1 px-4 pb-3"
                  currentProject={currentProject}
                  zoom={zoom}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSeek={handleSeek}
                  onClipSelect={handleClipSelect}
                  onZoomChange={setZoom}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
            {/* Placeholder to keep layout stable-ish if needed, or just empty space behind dialog */}
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-40" />
          </div>
        )}

        {/* Dialogs and Modals */}
        <ExportDialog
          isOpen={isExportOpen}
          onClose={() => setExportOpen(false)}
        />
      </div>
    )
  }

  return (
    <>
      {content}
      <WorkspaceLoadingOverlay open={showLoadingOverlay} message={loadingOverlayMessage} />

      {/* Proxy progress indicator - shows during background generation */}
      <ProxyProgressContainer />

      {/* Large video prompt (asks before generating preview proxies) */}
      <LargeVideoDialog
        open={proxyDialogOpen}
        recording={pendingProxyRecording}
        onChoice={handleProxyUserChoice}
        onClose={closeProxyDialog}
      />
    </>
  )
}
