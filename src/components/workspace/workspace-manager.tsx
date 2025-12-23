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
import { ExportDialog } from '../export-dialog'
import { RecordingsLibrary } from '../recordings-library'
import { UtilitiesSidebar } from '../utilities-sidebar'
import { useProjectStore } from '@/stores/project-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useShallow } from 'zustand/react/shallow'
import type { Effect, ZoomBlock, CropEffectData } from '@/types/project'
import { useCropManager } from '@/hooks/useCropManager'
import { EffectType } from '@/types/project'
import { CommandManager, DefaultCommandContext, UpdateZoomBlockCommand, registerAllCommands } from '@/lib/commands'
import { TimeConverter, timelineToSource, getSourceDuration } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
import { buildFrameLayout } from '@/lib/timeline/frame-layout'
import { calculateFullCameraPath } from '@/lib/effects/utils/camera-path-calculator'
import { initializeDefaultWallpaper } from '@/lib/constants/default-effects'
import { EffectLayerType } from '@/types/effects'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { ProjectIOService } from '@/lib/storage/project-io-service'
import { useRecordingsLibraryStore } from '@/stores/recordings-library-store'
import { useExportStore } from '@/stores/export-store'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import { toast } from 'sonner'

// Simplified project loading - delegates to ProjectIOService for all heavy lifting
async function loadProjectRecording(
  recording: any,
  setLoadingMessage: (message: string) => void,
  newProject: (name: string) => void,
  setLastSavedAt: (timestamp: string | null) => void
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
    useProjectStore.getState().setProject(project)

    // Pre-compute camera path for smooth playback
    setLoadingMessage('Optimizing playback...')

    // We need to build the frame layout first (same logic as SharedVideoController)
    // Flatten clips from all video tracks for layout building
    const videoTracks = project.timeline.tracks.filter(t => t.type === 'video')
    const allClips = videoTracks.flatMap(t => t.clips).sort((a, b) => a.startTime - b.startTime)
    const fps = project.settings.frameRate
    const frameLayout = buildFrameLayout(allClips, fps)

    // Create a lookup for recordings
    const metadataMap = new Map()
    // Pre-load metadata if available (it should be loaded by ProjectIOService above)
    // ProjectIOService loads metadata into the Recording objects themselves primarily.
    // However, the calculator expects a separate loadedMetadata map for some lookups if not on recording object.
    // The current Project structure attaches metadata to the recording object.

    const projectStore = useProjectStore.getState()

    // Run the heavy calculation
    const cameraPath = calculateFullCameraPath({
      frameLayout,
      fps,
      videoWidth: project.settings.resolution.width,
      videoHeight: project.settings.resolution.height,
      effects: project.timeline.effects || [], // Global timeline effects
      // Mock getRecording to find from project
      getRecording: (id) => project.recordings.find(r => r.id === id),
      // We can pass null for loadedMetadata map because our recordings already have per-instance metadata attached
      // by the loader (ProjectIOService).
      loadedMetadata: undefined
    })

    // Store in cache
    if (cameraPath) {
      projectStore.setCameraPathCache(cameraPath)
    }

    // Calculate adaptive zoom limits based on zoom blocks
    const viewportWidth = window.innerWidth
    const allZoomEffects = project.recordings.flatMap((r: any) =>
      EffectsFactory.getZoomEffects(r.effects || [])
    )
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
    useProjectStore.getState().setAutoZoom(clampedZoom)

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
    selectedClipId,
    selectedEffectLayer,
    playheadClip,
    playheadRecording,
    play: storePlay,
    pause: storePause,
    seek: storeSeek,
    saveCurrentProject,
    setZoom,
    zoom,
  } = useProjectStore(
    useShallow((s) => ({
      currentProject: s.currentProject,
      newProject: s.newProject,
      selectedClipId: s.selectedClipId,
      selectedEffectLayer: s.selectedEffectLayer,
      playheadClip: s.playheadClip,
      playheadRecording: s.playheadRecording,
      play: s.play,
      pause: s.pause,
      seek: s.seek,
      saveCurrentProject: s.saveCurrentProject,
      setZoom: s.setZoom,
      zoom: s.zoom,
    }))
  )

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
    setUtilitiesPanelWidth,
    setExportOpen
  } = useWorkspaceStore()

  const isExporting = useExportStore((s) => s.isExporting)


  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Loading...')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const isResizingUtilitiesRef = useRef(false)

  // Command manager for undo/redo support
  const commandManagerRef = useRef<CommandManager | null>(null)
  const commandContextRef = useRef<DefaultCommandContext | null>(null)

  // Initialize command manager
  useEffect(() => {
    commandContextRef.current = new DefaultCommandContext(useProjectStore)
    commandManagerRef.current = CommandManager.getInstance(commandContextRef.current)
    registerAllCommands(commandManagerRef.current)
  }, [])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingUtilitiesRef.current) return
      setUtilitiesPanelWidth(event.clientX)
    }

    const handleMouseUp = () => {
      if (!isResizingUtilitiesRef.current) return
      isResizingUtilitiesRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [setUtilitiesPanelWidth])

  // Get selected clip and its track type
  const selectedTrack = currentProject?.timeline.tracks.find(t => t.clips.some(c => c.id === selectedClipId))
  const selectedClip = selectedTrack?.clips.find(c => c.id === selectedClipId) || null
  const selectedTrackType = selectedTrack?.type

  // SINGLE SOURCE OF TRUTH: Get all effects for the current context
  // Merges timeline.effects (zoom, background, cursor) + recording.effects (recording-scoped non-zoom)
  const contextEffects = useMemo((): Effect[] => {
    if (!currentProject) return []

    const effects: Effect[] = []

    // Add timeline effects (background, cursor, keystroke)
    if (currentProject.timeline.effects) {
      effects.push(...currentProject.timeline.effects)
    }

    // Add recording-scoped non-zoom effects from playhead recording or selected clip's recording
    const targetRecording = playheadRecording || (selectedClip && currentProject.recordings.find(r => r.id === selectedClip.recordingId))
    if (targetRecording?.effects) {
      effects.push(...targetRecording.effects)
    }

    return effects
  }, [currentProject, playheadRecording, selectedClip])



  // Effects for preview are derived per-clip inside PreviewAreaRemotion
  const handleZoomBlockUpdate = useCallback((blockId: string, updates: Partial<ZoomBlock>) => {
    if (commandManagerRef.current) {
      const freshContext = new DefaultCommandContext(useProjectStore)
      const command = new UpdateZoomBlockCommand(freshContext, blockId, updates)
      commandManagerRef.current.execute(command)
    }
  }, [])

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
        if (commandManagerRef.current?.canUndo()) {
          await commandManagerRef.current.undo()
        }
      }

      // Cmd+Shift+Z or Ctrl+Shift+Z (or Ctrl+Y) for Redo
      if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') ||
        ((e.metaKey || e.ctrlKey) && e.key === 'y')) {
        e.preventDefault()
        if (commandManagerRef.current?.canRedo()) {
          await commandManagerRef.current.redo()
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

    // BATTERY OPTIMIZATION: Use longer interval (250ms vs 100ms) since frame-accurate 
    // boundary detection isn't critical - we just need to stop at clip end
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
    }, 250) // Increased from 100ms to 250ms for battery savings

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
    // Get effects from single source of truth
    const baseEffects = contextEffects
    const commandManager = commandManagerRef.current

    if (!commandManager) return

    // Helper to execute commands
    const executeCommand = (commandName: string, ...args: any[]) => {
      commandManager.executeByName(commandName, ...args)
    }

    // Zoom-specific handling
    if (type === EffectType.Zoom && (data.enabled !== undefined || data.regenerate)) {
      // Global zoom operations regardless of selection
      if (data.enabled !== undefined) {
        const existingZoomEffects = baseEffects.filter(e => e.type === EffectType.Zoom)

        // If enabling zoom but no zoom effects exist, generate them
        if (data.enabled && existingZoomEffects.length === 0) {
          // Generate zoom effects from recording's mouse events
          const recording = playheadRecording || currentProject?.recordings[0]
          if (recording && currentProject) {
            // Use centralized service for effect generation
            import('@/lib/effects/effect-generation-service').then(({ EffectGenerationService }) => {
              const allClips = currentProject.timeline.tracks.flatMap(t => t.clips)
              const clipForRecording = allClips.find(c => c.recordingId === recording.id)

              if (clipForRecording) {
                const { zoomEffects, screenEffects } = EffectGenerationService.generateZoomEffects(recording, clipForRecording)

                // Add all effects via command pattern
                for (const effect of [...zoomEffects, ...screenEffects]) {
                  executeCommand('AddEffect', effect)
                }
              }
            })
          }
        } else {
          // Update existing zoom effects
          baseEffects.forEach(effect => {
            if (effect.type === EffectType.Zoom) {
              executeCommand('UpdateEffect', effect.id, { enabled: data.enabled })
            }
          })
        }
      }
    } else if (type === EffectType.Zoom && selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer?.id) {
      // Update a specific zoom block
      const existingEffectIndex = baseEffects.findIndex(e => e.id === selectedEffectLayer.id)
      if (existingEffectIndex >= 0) {
        const effect = baseEffects[existingEffectIndex]
        executeCommand('UpdateEffect', effect.id, {
          data: {
            ...effect.data,
            ...data
          }
        })
      }
      return
    } else if (type === EffectType.Zoom) {
      // No specific zoom block selected, maybe just toggling?
      // Original code did nothing here: newEffects = [...baseEffects]
    } else if (type === EffectType.Screen && selectedEffectLayer?.type === EffectLayerType.Screen && selectedEffectLayer?.id) {
      // Update a specific screen block
      const existingEffectIndex = baseEffects.findIndex(e => e.id === selectedEffectLayer.id)
      if (existingEffectIndex >= 0) {
        const effect = baseEffects[existingEffectIndex]
        executeCommand('UpdateEffect', effect.id, {
          data: {
            ...effect.data,
            ...data
          }
        })
      }
      return
    } else if (type === EffectType.Annotation) {
      // Screen effects and cinematic scroll as annotations
      const kind = data?.kind
      if (!kind) return
      const existsIndex = baseEffects.findIndex(e => e.type === EffectType.Annotation && (e as any).data?.kind === kind)

      if (existsIndex >= 0) {
        const prev = baseEffects[existsIndex]
        const enabled = data.enabled !== undefined ? data.enabled : prev.enabled
        const mergedData = { ...(prev as any).data, ...(data.data || {}), kind }

        executeCommand('UpdateEffect', prev.id, {
          enabled,
          data: mergedData
        })
      } else {
        // Create new annotation spanning current clip or entire timeline fallback
        const clip = selectedClip
        const startTime = clip ? clip.startTime : 0
        const endTime = clip ? clip.startTime + clip.duration : (currentProject?.timeline.duration || Number.MAX_SAFE_INTEGER)
        const newEffect: Effect = {
          id: `anno-${kind}-${Date.now()}`,
          type: EffectType.Annotation,
          startTime,
          endTime,
          enabled: data.enabled !== undefined ? data.enabled : true,
          data: { kind, ...(data.data || {}) }
        }
        executeCommand('AddEffect', newEffect)
      }
      return
    } else {
      if (type === EffectType.Keystroke) {
        const keystrokeEffects = baseEffects.filter(e => e.type === EffectType.Keystroke)
        if (keystrokeEffects.length > 0) {
          const enabled = data.enabled !== undefined ? data.enabled : undefined
          const { enabled: _dataEnabled, ...effectData } = data

          keystrokeEffects.forEach(effect => {
            executeCommand('UpdateEffect', effect.id, {
              enabled: enabled !== undefined ? enabled : effect.enabled,
              data: {
                ...effect.data,
                ...effectData
              }
            })
          })
        } else {
          const { enabled: dataEnabled, ...effectData } = data
          const newEffect: Effect = {
            id: `keystroke-global-${Date.now()}`,
            type: EffectType.Keystroke,
            startTime: 0,
            endTime: Number.MAX_SAFE_INTEGER,
            data: effectData,
            enabled: dataEnabled !== undefined ? dataEnabled : true
          }
          executeCommand('AddEffect', newEffect)
        }
      } else {
        // Background and cursor are global effects
        const existingEffectIndex = baseEffects.findIndex(e => e.type === type)

        if (existingEffectIndex >= 0) {
          const effect = baseEffects[existingEffectIndex]
          const enabled = data.enabled !== undefined ? data.enabled : effect.enabled
          const { enabled: _dataEnabled, ...effectData } = data

          executeCommand('UpdateEffect', effect.id, {
            enabled,
            data: {
              ...effect.data,
              ...effectData
            }
          })
        } else {
          const { enabled: dataEnabled, ...effectData } = data
          const newEffect: Effect = {
            id: `${type}-global-${Date.now()}`,
            type: type as EffectType,
            startTime: 0,
            endTime: Number.MAX_SAFE_INTEGER,
            data: effectData,
            enabled: dataEnabled !== undefined ? dataEnabled : true
          }
          executeCommand('AddEffect', newEffect)
        }
      }
    }
  }, [currentProject, selectedEffectLayer, playheadRecording, selectedClip, contextEffects])

  // Bulk toggle all keystroke effects
  const handleBulkToggleKeystrokes = useCallback((enabled: boolean) => {
    const commandManager = commandManagerRef.current
    if (!commandManager) return

    const keystrokeEffects = contextEffects.filter(e => e.type === EffectType.Keystroke)
    keystrokeEffects.forEach(effect => {
      commandManager.executeByName('UpdateEffect', effect.id, { enabled })
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
  } = useCropManager(contextEffects, selectedClip)



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
  if (useWorkspaceStore.getState().currentView === 'plugin-creator') {
    return (
      <div className="fixed inset-0 flex flex-col bg-zinc-950 z-50">
        <div className="flex-shrink-0">
          <Toolbar
            project={currentProject}
            onToggleProperties={toggleProperties}
            onExport={() => setExportOpen(true)}
            onSaveProject={handleSaveProject}
            onBackToLibrary={() => {
              useWorkspaceStore.getState().setCurrentView('editor')
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
                useRecordingsLibraryStore.getState().clearLibrary()
                ThumbnailGenerator.clearAllCache()

                const success = await loadProjectRecording(
                  recording,
                  setLoadingMessage,
                  newProject,
                  setLastSavedAt
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
                  useProjectStore.getState().cleanupProject()
                  useWorkspaceStore.getState().resetWorkspace()

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
              {/* Top Section - Preview and Sidebar (70% height) */}
              <div className="flex" style={{ height: '70%' }}>
                {/* Left Sidebar - Utilities (closed by default) */}
                {isUtilitiesOpen && (
                  <div
                    className="bg-transparent overflow-hidden flex-shrink-0"
                    style={{ width: `min(${utilitiesPanelWidth}px, 40vw)` }}
                  >
                    <UtilitiesSidebar className="h-full w-full" />
                  </div>
                )}
                {isUtilitiesOpen && (
                  <div
                    className="w-1.5 cursor-col-resize bg-transparent hover:bg-border/50 transition-colors"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      isResizingUtilitiesRef.current = true
                      document.body.style.cursor = 'col-resize'
                      document.body.style.userSelect = 'none'
                    }}
                  />
                )}

                {/* Preview Area */}
                <div className="flex-1 overflow-hidden relative min-w-0">
                  {/* DEBUGPROP: Check WorkspaceManager state */}
                  {(() => {
                    return null;
                  })()}
                  <PreviewAreaRemotion
                    isEditingCrop={isEditingCrop}
                    cropData={editingCropData}
                    onCropChange={handleCropChange}
                    onCropConfirm={handleCropConfirm}
                    onCropReset={handleCropReset}
                  />
                </div>

                {/* Properties Panel - Fixed width when open, same height as preview */}
                {isPropertiesOpen && (
                  <div
                    className="bg-transparent overflow-hidden flex-shrink-0"
                    style={{ width: `${propertiesPanelWidth}px` }}
                  >
                    <EffectsSidebar
                      className="h-full w-full"
                      selectedClip={selectedClip}
                      effects={contextEffects}
                      selectedEffectLayer={selectedEffectLayer}
                      onEffectChange={handleEffectChange}
                      onZoomBlockUpdate={handleZoomBlockUpdate}
                      onBulkToggleKeystrokes={handleBulkToggleKeystrokes}
                      onAddCrop={handleAddCrop}
                      onRemoveCrop={handleRemoveCrop}
                      onUpdateCrop={handleUpdateCrop}
                      onStartEditCrop={handleStartEditCrop}
                      isEditingCrop={isEditingCrop}
                      selectedTrackType={selectedTrackType}
                    />
                  </div>
                )}
              </div>

              {/* Timeline Section - Full width at bottom (30% height) */}
              <div className="bg-transparent overflow-hidden border-t border-border/50" style={{ height: '30%', width: '100vw' }}>
                <TimelineCanvas
                  className="h-full w-full"
                  currentProject={currentProject}
                  zoom={zoom}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSeek={handleSeek}
                  onClipSelect={handleClipSelect}
                  onZoomChange={setZoom}
                  onZoomBlockUpdate={handleZoomBlockUpdate}
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
