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
import type { Effect, ZoomBlock, ZoomEffectData } from '@/types/project'
import { useCropManager } from '@/hooks/useCropManager'
import { useCommandExecutor } from '@/hooks/useCommandExecutor'
import { usePlayheadState } from '@/hooks/use-playhead-state'
import { useTimelineMetadata } from '@/hooks/useTimelineMetadata'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import { TimeConverter, timelineToSource, getSourceDuration } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
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

// Simplified project loading - delegates to ProjectIOService for all heavy lifting
async function loadProjectRecording(
  recording: any,
  setLoadingMessage: (message: string) => void,
  newProject: (name: string) => void,
  setLastSavedAt: (timestamp: string | null) => void,
  setProject: (project: any) => void,
  setCameraPathCache: (cache: any) => void,
  setAutoZoom: (zoom: number) => void
) {
  try {
    // Initialize wallpaper if not already done
    await initializeDefaultWallpaper()

    // Use centralized ProjectIOService for project loading
    // This handles: file reading, migrations, path resolution, file validation,
    // video property detection/repair, metadata loading, and effects initialization
    const project = await ProjectIOService.loadProjectFromRecording(recording, {
      onProgress: setLoadingMessage
    })

    // Create project in store
    setLoadingMessage('Creating project...')
    newProject(project.name)

    // Set last saved timestamp to the project's modified time
    setLastSavedAt(project.modifiedAt || new Date().toISOString())

    // Set the project ONCE after all recordings are processed
    setProject(project)

    // Pre-compute camera path for smooth playback
    setLoadingMessage('Optimizing playback...')

    // Build frame layout once using centralized service
    const fps = TimelineDataService.getFps(project)
    const recordingsMap = TimelineDataService.getRecordingsMap(project)
    const frameLayout = TimelineDataService.getFrameLayout(project, fps)

    // Run the heavy calculation
    const cameraPath = calculateFullCameraPath({
      frameLayout,
      fps,
      videoWidth: project.settings.resolution.width,
      videoHeight: project.settings.resolution.height,
      effects: EffectStore.getAll(project),
      getRecording: (id) => recordingsMap.get(id),
      loadedMetadata: undefined
    })

    // Store in cache
    if (cameraPath) {
      setCameraPathCache(cameraPath)
    }

    const viewportWidth = window.innerWidth
    const allZoomEffects = getZoomEffects(EffectStore.getAll(project))
    const zoomBlocks = allZoomEffects.map((e: any) => ({
      startTime: e.startTime,
      endTime: e.endTime
    }))
    const adaptiveLimits = TimeConverter.calculateAdaptiveZoomLimits(
      project.timeline.duration,
      viewportWidth,
      zoomBlocks,
      TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX
    )

    // Calculate optimal zoom and clamp to adaptive limits
    const optimalZoom = TimeConverter.calculateOptimalZoom(project.timeline.duration, viewportWidth)
    const clampedZoom = Math.max(adaptiveLimits.min, Math.min(adaptiveLimits.max, optimalZoom))
    setAutoZoom(clampedZoom)

    return true
  } catch (error) {
    console.error('Failed to load project:', error)
    alert(error instanceof Error ? error.message : 'Failed to load project')
    return false
  }
}

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
    toggleUtilities,
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
      toggleUtilities: s.toggleUtilities,
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
  const clearLibrary = useRecordingsLibraryStore((s) => s.clearLibrary)


  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Loading...')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const isResizingUtilitiesRef = useRef(false)
  const isResizingPropertiesRef = useRef(false)
  const isResizingTimelineRef = useRef(false)
  const [dragUtilitiesWidth, setDragUtilitiesWidth] = useState<number | null>(null)
  const [dragPropertiesWidth, setDragPropertiesWidth] = useState<number | null>(null)
  const lastUtilitiesRawRef = useRef<number | null>(null)
  const lastPropertiesRawRef = useRef<number | null>(null)
  const utilitiesOverdragRef = useRef(0)
  const propertiesOverdragRef = useRef(0)
  const utilitiesCollapsedRef = useRef(false)
  const propertiesCollapsedRef = useRef(false)

  // Command executor for undo/redo support
  const executorRef = useCommandExecutor()

  useEffect(() => {
    const UTIL_MIN = 200
    const UTIL_COLLAPSE_OVERDRAG = 80
    const UTIL_REOPEN_OVERDRAG = 30
    const PROPS_MIN = 300
    const PROPS_COLLAPSE_OVERDRAG = 100
    const PROPS_REOPEN_OVERDRAG = 40

    const handleMouseMove = (event: MouseEvent) => {
      if (isResizingUtilitiesRef.current) {
        const rawWidth = Math.max(0, event.clientX)
        const prevRaw = lastUtilitiesRawRef.current ?? rawWidth
        const delta = rawWidth - prevRaw

        if (rawWidth >= UTIL_MIN) {
          utilitiesOverdragRef.current = 0
          utilitiesCollapsedRef.current = false
          setDragUtilitiesWidth(rawWidth)
        } else {
          if (delta < 0) {
            utilitiesOverdragRef.current += Math.abs(delta)
          } else if (delta > 0) {
            utilitiesOverdragRef.current = Math.max(0, utilitiesOverdragRef.current - delta)
          }

          if (utilitiesCollapsedRef.current) {
            if (utilitiesOverdragRef.current < UTIL_REOPEN_OVERDRAG) {
              utilitiesCollapsedRef.current = false
              setDragUtilitiesWidth(UTIL_MIN)
            } else {
              setDragUtilitiesWidth(0)
            }
          } else {
            if (utilitiesOverdragRef.current >= UTIL_COLLAPSE_OVERDRAG) {
              utilitiesCollapsedRef.current = true
              setDragUtilitiesWidth(0)
            } else {
              setDragUtilitiesWidth(UTIL_MIN)
            }
          }
        }

        lastUtilitiesRawRef.current = rawWidth
      }
      if (isResizingPropertiesRef.current) {
        const rawWidth = Math.max(0, window.innerWidth - event.clientX)
        const prevRaw = lastPropertiesRawRef.current ?? rawWidth
        const delta = rawWidth - prevRaw

        if (rawWidth >= PROPS_MIN) {
          propertiesOverdragRef.current = 0
          propertiesCollapsedRef.current = false
          setDragPropertiesWidth(rawWidth)
        } else {
          if (delta < 0) {
            propertiesOverdragRef.current += Math.abs(delta)
          } else if (delta > 0) {
            propertiesOverdragRef.current = Math.max(0, propertiesOverdragRef.current - delta)
          }

          if (propertiesCollapsedRef.current) {
            if (propertiesOverdragRef.current < PROPS_REOPEN_OVERDRAG) {
              propertiesCollapsedRef.current = false
              setDragPropertiesWidth(PROPS_MIN)
            } else {
              setDragPropertiesWidth(0)
            }
          } else {
            if (propertiesOverdragRef.current >= PROPS_COLLAPSE_OVERDRAG) {
              propertiesCollapsedRef.current = true
              setDragPropertiesWidth(0)
            } else {
              setDragPropertiesWidth(PROPS_MIN)
            }
          }
        }

        lastPropertiesRawRef.current = rawWidth
      }
      if (isResizingTimelineRef.current) {
        // Calculate height from bottom of viewport
        const newHeight = window.innerHeight - event.clientY
        setTimelineHeight(newHeight)
      }
    }

    const handleMouseUp = () => {
      if (isResizingUtilitiesRef.current || isResizingPropertiesRef.current || isResizingTimelineRef.current) {
        const utilitiesWidth = lastUtilitiesRawRef.current ?? dragUtilitiesWidth ?? utilitiesPanelWidth
        const propertiesWidth = lastPropertiesRawRef.current ?? dragPropertiesWidth ?? propertiesPanelWidth
        const shouldCollapseUtilities = isResizingUtilitiesRef.current && isUtilitiesOpen && utilitiesCollapsedRef.current
        const shouldCollapseProperties = isResizingPropertiesRef.current && isPropertiesOpen && propertiesCollapsedRef.current
        isResizingUtilitiesRef.current = false
        isResizingPropertiesRef.current = false
        isResizingTimelineRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        lastUtilitiesRawRef.current = null
        lastPropertiesRawRef.current = null
        utilitiesOverdragRef.current = 0
        propertiesOverdragRef.current = 0
        setDragUtilitiesWidth(null)
        setDragPropertiesWidth(null)
        if (isUtilitiesOpen && !shouldCollapseUtilities) {
          setUtilitiesPanelWidth(Math.max(UTIL_MIN, utilitiesWidth))
        }
        if (isPropertiesOpen && !shouldCollapseProperties) {
          setPropertiesPanelWidth(Math.max(PROPS_MIN, propertiesWidth))
        }
        if (shouldCollapseUtilities) {
          toggleUtilities()
        }
        if (shouldCollapseProperties) {
          toggleProperties()
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [setUtilitiesPanelWidth, setPropertiesPanelWidth, setTimelineHeight, utilitiesPanelWidth, propertiesPanelWidth, toggleUtilities, toggleProperties, isUtilitiesOpen, isPropertiesOpen, dragUtilitiesWidth, dragPropertiesWidth])

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
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Cmd+S or Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        await handleSaveProject()
      }

      // Cmd+Z or Ctrl+Z for Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (executorRef.current?.canUndo()) {
          await executorRef.current.undo()
        }
      }

      // Cmd+Shift+Z or Ctrl+Shift+Z (or Ctrl+Y) for Redo
      if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') ||
        ((e.metaKey || e.ctrlKey) && e.key === 'y')) {
        e.preventDefault()
        if (executorRef.current?.canRedo()) {
          await executorRef.current.redo()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSaveProject])

  // Playhead recording now comes directly from store's reactive state
  // No need to calculate - store maintains this

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

  const handleClipSelect = useCallback((_clipId: string) => {
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



  // Show loading screen when processing
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center z-50">
        <div className="text-center space-y-6">
          {/* Single animated spinner */}
          <div className="w-16 h-16 mx-auto border-4 border-primary/20 rounded-full border-t-primary animate-spin" />

          {/* Loading message */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium">{loadingMessage}</h3>
          </div>
        </div>
      </div>
    )
  }

  // Check if we should show Plugin Creator (accessible even without project)
  if (currentView === 'plugin-creator') {
    return (
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
  }

  // Show recordings library when no active project
  if (!currentProject) {
    return (
      <>
        <div className="fixed inset-0 flex flex-col">
          <RecordingsLibrary
            onSelectRecording={async (recording) => {
              setIsLoading(true)
              setLoadingMessage('Loading recording...')

              try {
                // Clear library data to free memory before loading project
                clearLibrary()
                ThumbnailGenerator.clearAllCache()

                const success = await loadProjectRecording(
                  recording,
                  setLoadingMessage,
                  newProject,
                  setLastSavedAt,
                  setProject,
                  setCameraPathCache,
                  setAutoZoom
                )

                if (!success) {
                  setIsLoading(false)
                  setLoadingMessage('')
                  return
                }

                // Hide record button when entering workspace
                if (window.electronAPI?.minimizeRecordButton) {
                  window.electronAPI.minimizeRecordButton()
                }

                setIsLoading(false)
              } catch (error) {
                console.error('Failed to load recording:', error)
                setIsLoading(false)
              }
            }}
          />
        </div>
      </>
    )
  }

  return (
    <>
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
                    style={{ width: `min(${dragUtilitiesWidth ?? utilitiesPanelWidth}px, 40vw)` }}
                  >
                    <UtilitiesSidebar className="h-full w-full" />
                  </div>
                )}
                {isUtilitiesOpen && (
                  <div
                    className="w-4 cursor-col-resize bg-transparent hover:bg-border/30 transition-colors flex items-center justify-center group"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      isResizingUtilitiesRef.current = true
                      document.body.style.cursor = 'col-resize'
                      document.body.style.userSelect = 'none'
                    }}
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
                      onMouseDown={(event) => {
                        event.preventDefault()
                        isResizingPropertiesRef.current = true
                        document.body.style.cursor = 'col-resize'
                        document.body.style.userSelect = 'none'
                      }}
                    >
                      <div className="h-10 w-2 rounded-full bg-foreground/20 shadow-sm group-hover:bg-foreground/30 transition-colors" />
                    </div>
                  <div
                    className="bg-transparent overflow-hidden flex-shrink-0"
                    style={{ width: `${dragPropertiesWidth ?? propertiesPanelWidth}px` }}
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
                onMouseDown={(event) => {
                  event.preventDefault()
                  isResizingTimelineRef.current = true
                  document.body.style.cursor = 'row-resize'
                  document.body.style.userSelect = 'none'
                }}
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

    </>
  )
}
