"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Toolbar } from '../toolbar'
import { PreviewAreaRemotion } from '../preview-area-remotion'
import dynamic from 'next/dynamic'

const TimelineCanvas = dynamic(
  () => import('../timeline/timeline-canvas').then(mod => mod.TimelineCanvas),
  { ssr: false }
)
const PluginCreator = dynamic(
  () => import('../plugin-creator/page').then(mod => mod.PluginCreator),
  { ssr: false }
)
import { EffectsSidebar } from '../effects-sidebar'
import { EffectsSidebarProvider } from '../effects-sidebar/EffectsSidebarContext'
import { ExportDialog } from '../export-dialog'
import { RecordingsLibrary } from '../recordings-library'
import { UtilitiesSidebar } from '../utilities-sidebar'
import { useProjectStore } from '@/stores/project-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useShallow } from 'zustand/react/shallow'
import type { ZoomBlock, ZoomEffectData } from '@/types/project'
import { useCropManager } from '@/hooks/useCropManager'
import { useCommandExecutor } from '@/hooks/useCommandExecutor'
import { usePlayheadState } from '@/hooks/use-playhead-state'
import { useTimelineMetadata } from '@/hooks/useTimelineMetadata'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import { TimeConverter, timelineToSource, getSourceDuration } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
import { useCommandKeyboard } from '@/hooks/use-command-keyboard'
import { TimelineDataService } from '@/lib/timeline/timeline-data-service'
import { calculateFullCameraPath } from '@/lib/effects/utils/camera-path-calculator'
import { initializeDefaultWallpaper } from '@/lib/constants/default-effects'
import { EffectLayerType } from '@/types/effects'
import { getZoomEffects } from '@/lib/effects/effect-filters'
import { EffectStore } from '@/lib/core/effects'
import { applyEffectChange } from '@/lib/effects/effect-change'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { ProjectIOService } from '@/lib/storage/project-io-service'
import { useRecordingsLibraryStore } from '@/stores/recordings-library-store'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import { UpdateZoomBlockCommand } from '@/lib/commands'
import { toast } from 'sonner'
import { useSelectedClip } from '@/stores/selectors/clip-selectors'
import { useProjectLoader } from '@/hooks/use-project-loader'
import { usePanelResizer } from '@/hooks/use-panel-resizer'



export function WorkspaceManager() {
  // Store hooks - using reactive state from single source of truth
  // NOTE: currentTime and isPlaying are NOT subscribed here - children (PreviewAreaRemotion,
  // TimelineCanvas) subscribe directly to avoid re-rendering entire workspace every frame
  const {
    currentProject,
    newProject,
    setProject,
    setCameraPathCache,
    selectedEffectLayer,
    play: storePlay,
    pause: storePause,
    seek: storeSeek,
    saveCurrentProject,
    setZoom,
    setAutoZoom,
    zoom,
    cleanupProject,
  } = useProjectStore(
    useShallow((s) => ({
      currentProject: s.currentProject,
      newProject: s.newProject,
      setProject: s.setProject,
      setCameraPathCache: s.setCameraPathCache,
      selectedEffectLayer: s.selectedEffectLayer,
      play: s.play,
      pause: s.pause,
      seek: s.seek,
      saveCurrentProject: s.saveCurrentProject,
      setZoom: s.setZoom,
      setAutoZoom: s.setAutoZoom,
      zoom: s.zoom,
      cleanupProject: s.cleanupProject,
    }))
  )

  const selectedClipResult = useSelectedClip()
  const selectedClip = selectedClipResult?.clip ?? null
  const timelineMetadata = useTimelineMetadata(currentProject)

  // Computed playhead state (SSOT - derived from currentTime and clips)
  const { playheadClip, playheadRecording } = usePlayheadState()

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
    timelineHeight,
    toggleProperties,
    setPropertiesPanelWidth,
    setUtilitiesPanelWidth,
    setTimelineHeight,
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
      timelineHeight: s.timelineHeight,
      toggleProperties: s.toggleProperties,
      setPropertiesPanelWidth: s.setPropertiesPanelWidth,
      setUtilitiesPanelWidth: s.setUtilitiesPanelWidth,
      setTimelineHeight: s.setTimelineHeight,
      setExportOpen: s.setExportOpen,
      currentView: s.currentView,
      setCurrentView: s.setCurrentView,
      resetWorkspace: s.resetWorkspace
    }))
  )

  const isExporting = useProjectStore((s) => s.progress.isProcessing)
  const previewReady = useProjectStore((s) => s.previewReady)
  const setPreviewReady = useProjectStore((s) => s.setPreviewReady)

  // Custom hooks
  const { isLoading, loadingMessage, loadRecording } = useProjectLoader()
  const {
    panelMaxWidth,
    dragUtilitiesWidth,
    dragPropertiesWidth,
    startResizingUtilities,
    startResizingProperties,
    startResizingTimeline
  } = usePanelResizer()

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Command executor for undo/redo support
  const executorRef = useCommandExecutor()

  useEffect(() => {
    if (!currentProject) {
      setPreviewReady(false)
      return
    }
  }, [currentProject, setPreviewReady])

  // Subscribe to cache invalidation to trigger recalculation
  const cameraPathCache = useProjectStore((s) => s.cameraPathCache)
  const timelineMutationCounter = useProjectStore((s) => s.timelineMutationCounter)

  // Recalculate camera path when cache is invalidated (effects changed)
  useEffect(() => {
    // Skip if no project or cache exists (initial load handles this)
    if (!currentProject || cameraPathCache !== null) return

    // Debounce to avoid recalculating on every keystroke during rapid edits
    const timeoutId = setTimeout(() => {
      const fps = TimelineDataService.getFps(currentProject)
      const recordingsMap = TimelineDataService.getRecordingsMap(currentProject)
      const frameLayout = TimelineDataService.getFrameLayout(currentProject, fps)

      const newCameraPath = calculateFullCameraPath({
        frameLayout,
        fps,
        videoWidth: currentProject.settings.resolution.width,
        videoHeight: currentProject.settings.resolution.height,
        effects: EffectStore.getAll(currentProject),
        getRecording: (id) => recordingsMap.get(id),
        loadedMetadata: undefined
      })

      if (newCameraPath) {
        setCameraPathCache(newCameraPath)
      }
    }, 50) // 50ms debounce

    return () => clearTimeout(timeoutId)
  }, [currentProject, cameraPathCache, timelineMutationCounter, setCameraPathCache])



  const timelineEffects = useProjectStore((s) => s.currentProject?.timeline?.effects)
  const contextEffects = timelineEffects ?? []

  const selectedZoomEffect = useMemo(() => {
    if (!selectedEffectLayer || selectedEffectLayer.type !== EffectLayerType.Zoom) return null
    return contextEffects.find(effect => effect.id === selectedEffectLayer.id) ?? null
  }, [contextEffects, selectedEffectLayer])

  const selectedZoomData = selectedZoomEffect?.data as ZoomEffectData | undefined
  const isManualZoom = selectedZoomData?.followStrategy === ZoomFollowStrategy.Manual

  // Playback control ref
  const playbackIntervalRef = useRef<NodeJS.Timeout>()

  // Track unsaved changes by comparing saved timestamp with current
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  // Simple check: if project modifiedAt differs from lastSavedAt, we have unsaved changes
  useEffect(() => {
    if (currentProject?.modifiedAt && lastSavedAt) {
      setHasUnsavedChanges(currentProject.modifiedAt !== lastSavedAt)
    }
  }, [currentProject?.modifiedAt, lastSavedAt])

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

  // Monitor clip boundaries during playback - use reactive playhead clip from store
  useEffect(() => {
    if (!playheadClip || !isPlaying || isExporting) return

    const syncInterval = setInterval(() => {
      if (!isPlaying || !playheadClip) return

      // Get fresh currentTime from store to avoid stale closure
      const freshCurrentTime = useProjectStore.getState().currentTime

      // Convert timeline time to source time using the shared converter (respects playbackRate + remaps).
      const sourceTimeMs = timelineToSource(freshCurrentTime, playheadClip)
      const sourceOutMs =
        playheadClip.sourceOut ??
        ((playheadClip.sourceIn || 0) + getSourceDuration(playheadClip))

      if (sourceTimeMs > sourceOutMs) {
        handlePause()
      }
    }, 250)

    playbackIntervalRef.current = syncInterval

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
      }
    }
  }, [isPlaying, playheadClip, handlePause, isExporting])

  // Centralized playback control - no selection required for playback
  const handlePlay = useCallback(() => {
    storePlay()
  }, [storePlay])

  const handleSeek = useCallback((time: number) => {
    storeSeek(time)
  }, [storeSeek])

  const handleClipSelect = useCallback(() => {
    setHasUnsavedChanges(false)
  }, [])

  const handleEffectChange = useCallback((type: EffectType, data: any) => {
    const executor = executorRef.current

    if (!executor) return

    void applyEffectChange(type, data, {
      effects: contextEffects,
      selectedEffectLayer,
      currentProject,
      selectedClip,
      playheadRecording,
      currentTime: useProjectStore.getState().currentTime,
      executeCommand: (commandName: string, ...args: any[]) => {
        executor.executeByName(commandName, ...args)
      }
    })
  }, [currentProject, selectedEffectLayer, playheadRecording, selectedClip, contextEffects])

  // Bulk toggle all keystroke effects
  const handleBulkToggleKeystrokes = useCallback((enabled: boolean) => {
    if (!executorRef.current) return

    const keystrokeEffects = contextEffects.filter(e => e.type === EffectType.Keystroke)
    keystrokeEffects.forEach(effect => {
      executorRef.current?.executeByName('UpdateEffect', effect.id, { enabled })
    })
  }, [contextEffects])

  // Crop editing state managed by hook
  const {
    isEditingCrop,
    editingCropData,
    handleAddCrop,
    handleRemoveCrop,
    handleUpdateCrop,
    handleStartEditCrop,
    handleCropConfirm,
    handleCropReset,
    handleCropChange
  } = useCropManager(selectedClip)

  const handleZoomBlockUpdate = useCallback((blockId: string, updates: Partial<ZoomBlock>) => {
    executorRef.current?.execute(UpdateZoomBlockCommand, blockId, updates)
  }, [])

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
  const loadingOverlayMessage = loadingMessage || 'Loading...'
  const loadingOverlay = showLoadingOverlay ? (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-50 bg-background/90 backdrop-blur-sm">
      <div className="text-center space-y-6">
        {/* Single animated spinner */}
        <div className="w-16 h-16 mx-auto border-4 border-primary/20 rounded-full border-t-primary animate-spin" />

        {/* Loading message */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium">{loadingOverlayMessage}</h3>
        </div>
      </div>
    </div>
  ) : null

  let content: React.ReactNode
  if (currentView === 'plugin-creator') {
    content = (
      <div className="fixed inset-0 flex flex-col bg-zinc-950 z-50">
        <div className="flex-shrink-0">
          <Toolbar
            project={currentProject}
            onToggleProperties={toggleProperties}
            onExport={() => setExportOpen(true)}
            onSaveProject={handleSaveProject}
            onBackToLibrary={() => {
              setCurrentView('editor')
            }}
            hasUnsavedChanges={hasUnsavedChanges}
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
        {/* Top Toolbar - Hide during export to save resources */}
        {!isExporting && (
          <div className="flex-shrink-0">
            <Toolbar
              project={currentProject}
              onToggleProperties={toggleProperties}
              onExport={() => setExportOpen(true)}
              onSaveProject={handleSaveProject}
              onBackToLibrary={() => {
                // Clean up resources and navigate back to library
                const cleanupAndReturn = () => {
                  // Clean up local state
                  setHasUnsavedChanges(false)

                  // Memory cleanup: clear HEAVY data only (not thumbnails - those are small and should persist)
                  RecordingStorage.clearMetadataCache()

                  // Clean up stores
                  cleanupProject()
                  resetWorkspace()

                  // Clear all rendering caches to free memory
                  import('@/lib/audio/waveform-analyzer').then(m => m.WaveformAnalyzer.clearCache())
                  import('@/lib/effects/utils/cursor-calculator').then(m => m.clearCursorCalculatorCache())
                  import('@/lib/utils/video-metadata').then(m => m.clearDurationCache())

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
              }}
              hasUnsavedChanges={hasUnsavedChanges}
            />
          </div>
        )}

        {/* Main Content Area */}
        {!isExporting ? (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="flex flex-col h-full">
              {/* Top Section - Preview and Sidebars (flexible height) */}
              <div className="flex flex-1 min-h-0">
                {/* Left Sidebar - Utilities (closed by default) */}
                {isUtilitiesOpen && (
                  <div
                    className="bg-transparent overflow-hidden flex-shrink-0"
                    style={{
                      width: `${Math.min(
                        dragUtilitiesWidth ?? utilitiesPanelWidth,
                        panelMaxWidth || Number.POSITIVE_INFINITY
                      )}px`
                    }}
                  >
                    <UtilitiesSidebar className="h-full w-full" />
                  </div>
                )}
                {isUtilitiesOpen && (
                  <div
                    className="w-4 cursor-col-resize bg-transparent hover:bg-border/30 transition-colors flex items-center justify-center group"
                    onMouseDown={startResizingUtilities}
                  >
                    <div className="h-10 w-2 rounded-full bg-foreground/20 shadow-sm group-hover:bg-foreground/30 transition-colors" />
                  </div>
                )}

                {/* Preview Area */}
                <div className="flex-1 overflow-hidden relative min-w-0">
                  {/* DEBUGPROP: Check WorkspaceManager state */}
                  {(() => {
                    return null;
                  })()}
                  {timelineMetadata ? (
                    <PreviewAreaRemotion
                      isEditingCrop={isEditingCrop}
                      cropData={editingCropData}
                      onCropChange={handleCropChange}
                      onCropConfirm={handleCropConfirm}
                      onCropReset={handleCropReset}
                      zoomSettings={zoomSettings}
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
                {isPropertiesOpen && (
                  <>
                    <div
                      className="w-4 cursor-col-resize bg-transparent hover:bg-border/30 transition-colors flex items-center justify-center group"
                      onMouseDown={startResizingProperties}
                    >
                      <div className="h-10 w-2 rounded-full bg-foreground/20 shadow-sm group-hover:bg-foreground/30 transition-colors" />
                    </div>
                    <div
                      className="bg-transparent overflow-hidden flex-shrink-0"
                      style={{
                        width: `${Math.min(
                          dragPropertiesWidth ?? propertiesPanelWidth,
                          panelMaxWidth || Number.POSITIVE_INFINITY
                        )}px`
                      }}
                    >
                      <EffectsSidebarProvider
                        value={{
                          onEffectChange: handleEffectChange,
                          onZoomBlockUpdate: handleZoomBlockUpdate,
                          onBulkToggleKeystrokes: handleBulkToggleKeystrokes,
                          onAddCrop: handleAddCrop,
                          onRemoveCrop: handleRemoveCrop,
                          onUpdateCrop: handleUpdateCrop,
                          onStartEditCrop: handleStartEditCrop
                        }}
                      >
                        <EffectsSidebar className="h-full w-full" />
                      </EffectsSidebarProvider>
                    </div>
                  </>
                )}
              </div>

              {/* Timeline Resize Divider */}
              <div
                className="h-2 cursor-row-resize bg-transparent hover:bg-border/30 transition-all duration-150 flex-shrink-0 flex items-center justify-center group"
                onMouseDown={startResizingTimeline}
              >
                {/* Subtle resize handle indicator */}
                <div className="w-8 h-1 rounded-full bg-border/40 group-hover:bg-border/60 transition-colors" />
              </div>

              {/* Timeline Section - Full width at bottom */}
              <div
                className="bg-transparent overflow-hidden flex-shrink-0"
                style={{ height: `${timelineHeight}px`, minHeight: '20vh', width: '100vw' }}
              >
                <TimelineCanvas
                  className="h-full w-full"
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
      {loadingOverlay}
    </>
  )
}
