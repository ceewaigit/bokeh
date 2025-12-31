'use client'

/**
 * TimelineCanvas
 *
 * ARCHITECTURE:
 * - Layout concerns: useTimelineLayout() (from TimelineLayoutProvider)
 * - Clip operations: useTimelineClipOperations() hook
 * - Drag preview: useDragPreview() hook
 * - Asset drag-drop: useAssetDragDrop() hook
 *
 */

import React, { useCallback, useState, useEffect, useMemo } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import { useProjectStore } from '@/stores/project-store'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '@/shared/utils/utils'
import type { Project, Clip } from '@/types/project'
import { TrackType, TimelineTrackType } from '@/types/project'
import { getZoomEffects } from '@/features/effects/effect-filters'
import { TimelineLayoutProvider, useTimelineLayout } from './timeline-layout-provider'
import { useAssetLibraryStore } from '@/stores/asset-library-store'
import { TimelineEffectTracks } from './tracks/timeline-effect-track'
import { TimelineWebcamTrack } from './tracks/timeline-webcam-track'
import { TimelineUIProvider, useTimelineUI } from './timeline-ui-context'

// Sub-components
import { TimelineRuler } from './timeline-ruler'
import { TimelineClip } from './timeline-clip'
import { TimelineTrack } from './timeline-track'
import { TimelinePlayhead } from './timeline-playhead'
import { TimelineGhostPlayhead } from './timeline-ghost-playhead'
import { TimelineSpeedUpOverlays } from './timeline-speed-up-overlays'
import { SpeedUpSuggestionPopover } from './speed-up-suggestion-popover'
import { TimelineControls } from './timeline-controls'
import { TimelineContextMenu } from './timeline-context-menu'
import { TimelineContextProvider } from './TimelineContext'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { useWindowAppearanceStore } from '@/stores/window-appearance-store'
import { ApplySpeedUpCommand } from '@/lib/commands/timeline/ApplySpeedUpCommand'
import { timeObserver } from '@/features/timeline/time/time-observer'
import { ApplyAllSpeedUpsCommand } from '@/lib/commands/timeline/ApplyAllSpeedUpsCommand'
import { TimelineAssetGhost } from './timeline-asset-ghost'
import { TimelineDropTarget } from './timeline-drop-target'
import { useTimelineEffects } from '@/stores/selectors/timeline-selectors'

// Utilities
import { TimelineConfig } from '@/features/timeline/config'
import { ClipLookup } from '@/features/timeline/clips/clip-lookup'
import { TimeConverter } from '@/features/timeline/time/time-space-converter'
import { useTimelinePlayback } from '@/hooks/timeline/use-timeline-playback'
import { useTimelineColors } from '@/features/timeline/utils/colors'
import { useTimelineScrub } from '@/hooks/timeline/use-timeline-scrub'
import { getTimelineTimeFromX } from '@/features/timeline/playback/seek-utils'

// Hooks
import { useTimelineClipOperations } from '@/hooks/timeline/use-timeline-clip-operations'
import { useDragPreview } from '@/hooks/use-drag-preview'
import { useAssetDragDrop } from '@/hooks/use-asset-drag-drop'

import { useCommandExecutor } from '@/hooks/use-command-executor'
import { KonvaEventObject } from 'konva/lib/Node'

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Build time blocks from clips (for snapping)
// ─────────────────────────────────────────────────────────────────────────────
const buildClipBlocks = (clips: Clip[]) => clips.map((clip) => ({
  id: clip.id,
  startTime: clip.startTime,
  endTime: clip.startTime + clip.duration
}))

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
interface TimelineCanvasProps {
  className?: string
  currentProject: Project | null
  zoom: number
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onClipSelect?: (clipId: string) => void
  onZoomChange: (zoom: number) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Content Component: Uses hooks for clean separation of concerns
// ─────────────────────────────────────────────────────────────────────────────
const TimelineCanvasContent = React.memo(function TimelineCanvasContent({
  className = "h-full w-full",
  currentProject,
  zoom,
  onPlay,
  onPause,
  onSeek,
  onClipSelect,
  onZoomChange
}: TimelineCanvasProps) {
  // ─────────────────────────────────────────────────────────────────────────
  // Store subscriptions
  // ─────────────────────────────────────────────────────────────────────────
  const isPlaying = useProjectStore((s) => s.isPlaying)
  const isScrubbing = useProjectStore((s) => s.isScrubbing)
  const setHoverTime = useProjectStore((s) => s.setHoverTime)
  const draggingAsset = useAssetLibraryStore((s) => s.draggingAsset)

  const { selectedClips, selectClip, clearEffectSelection, clearSelection } = useProjectStore(
    useShallow((s) => ({
      selectedClips: s.selectedClips,
      selectClip: s.selectClip,
      clearEffectSelection: s.clearEffectSelection,
      clearSelection: s.clearSelection,
    }))
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Layout context
  // ─────────────────────────────────────────────────────────────────────────
  const {
    stageWidth,
    stageHeight,
    timelineWidth,
    containerWidth,
    duration,
    pixelsPerMs,
    trackHeights,
    trackPositions,
    hasZoomTrack,
    hasScreenTrack,
    hasKeystrokeTrack,
    hasPluginTrack,
    toggleEffectTrackExpanded,
    toggleVideoTrackExpanded,
    getTrackBounds,
  } = useTimelineLayout()

  const safeGetTrackBounds = useCallback(() => {
    return { y: 0, height: 0, clipY: 0, clipHeight: 0 }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // UI Context (Scroll State)
  // ─────────────────────────────────────────────────────────────────────────
  const {
    scrollLeft,
    onScroll,
    scrollContainerRef
  } = useTimelineUI()

  // ─────────────────────────────────────────────────────────────────────────
  // Local state
  // ─────────────────────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null)
  const [speedUpPopover, setSpeedUpPopover] = useState<{
    x: number
    y: number
    period: SpeedUpPeriod
    allTypingPeriods: SpeedUpPeriod[]
    allIdlePeriods: SpeedUpPeriod[]
    clipId: string
  } | null>(null)

  // ─────────────────────────────────────────────────────────────────────────
  // Theming
  // ─────────────────────────────────────────────────────────────────────────
  const colors = useTimelineColors()
  const windowSurfaceMode = useWindowAppearanceStore((s) => s.mode)
  const windowSurfaceOpacity = useWindowAppearanceStore((s) => s.opacity)
  const themeKey = useMemo(() =>
    colors.primary + colors.background + windowSurfaceMode + windowSurfaceOpacity,
    [colors.primary, colors.background, windowSurfaceMode, windowSurfaceOpacity]
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Derived clip data (with Viewport Culling)
  // ─────────────────────────────────────────────────────────────────────────
  const BUFFER_PIXELS = 1000 // Render extra pixels before/after to prevent popping
  const visibleStartTime = useMemo(() =>
    Math.max(0, TimeConverter.pixelsToMs(scrollLeft - BUFFER_PIXELS, pixelsPerMs)),
    [scrollLeft, pixelsPerMs]
  )
  const visibleEndTime = useMemo(() =>
    TimeConverter.pixelsToMs(scrollLeft + containerWidth + BUFFER_PIXELS, pixelsPerMs),
    [scrollLeft, containerWidth, pixelsPerMs]
  )

  const filterVisible = useCallback((clips: Clip[]) => {
    return clips.filter(c => {
      const clipEnd = c.startTime + c.duration
      return clipEnd > visibleStartTime && c.startTime < visibleEndTime
    })
  }, [visibleStartTime, visibleEndTime])

  const videoClips = useMemo(
    () => currentProject ? filterVisible(ClipLookup.videoClips(currentProject)) : [],
    [currentProject, filterVisible]
  )
  const audioClips = useMemo(
    () => currentProject ? filterVisible(ClipLookup.audioClips(currentProject)) : [],
    [currentProject, filterVisible]
  )
  const webcamClips = useMemo(
    () => currentProject ? filterVisible(ClipLookup.byTrackType(currentProject, TrackType.Webcam)) : [],
    [currentProject, filterVisible]
  )

  const clipsByTrack = useMemo(() => ({
    [TrackType.Video]: videoClips,
    [TrackType.Audio]: audioClips,
    [TrackType.Webcam]: webcamClips
  }), [videoClips, audioClips, webcamClips])

  const clipBlocksByTrack = useMemo(() => ({
    [TrackType.Video]: buildClipBlocks(videoClips),
    [TrackType.Audio]: buildClipBlocks(audioClips),
    [TrackType.Webcam]: buildClipBlocks(webcamClips)
  }), [videoClips, audioClips, webcamClips])

  const getClipsForTrack = useCallback(
    (trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => clipsByTrack[trackType] ?? [],
    [clipsByTrack]
  )

  const getClipBlocksForTrack = useCallback(
    (trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => clipBlocksByTrack[trackType] ?? [],
    [clipBlocksByTrack]
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Zoom limits (adaptive based on content)
  // ─────────────────────────────────────────────────────────────────────────
  const timelineEffects = useTimelineEffects()
  const allZoomEffects = useMemo(() => getZoomEffects(timelineEffects), [timelineEffects])
  const adaptiveZoomLimits = useMemo(() => {
    const zoomBlocks = allZoomEffects.map(e => ({ startTime: e.startTime, endTime: e.endTime }))
    return TimeConverter.calculateAdaptiveZoomLimits(
      duration,
      stageWidth,
      zoomBlocks,
      TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX
    )
  }, [allZoomEffects, duration, stageWidth])

  // ─────────────────────────────────────────────────────────────────────────
  // HOOK: Clip operations
  // ─────────────────────────────────────────────────────────────────────────
  const clipOps = useTimelineClipOperations()

  // ─────────────────────────────────────────────────────────────────────────
  // HOOK: Drag preview
  // ─────────────────────────────────────────────────────────────────────────
  const { dragPreview, handleDragPreview, handleDragCommit } = useDragPreview({
    getClipsForTrack
  })

  // ─────────────────────────────────────────────────────────────────────────
  // HOOK: Asset drag-drop
  // ─────────────────────────────────────────────────────────────────────────
  const getStagePoint = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      stageX: (e.clientX - rect.left) + e.currentTarget.scrollLeft,
      stageY: (e.clientY - rect.top) + e.currentTarget.scrollTop
    }
  }, [])

  const assetDragDrop = useAssetDragDrop({
    pixelsPerMs,
    getTrackBounds,
    getClipsForTrack,
    getClipBlocksForTrack,
    getStagePoint
  })

  // Merge drag preview from asset drop with clip drag preview
  const effectiveDragPreview = assetDragDrop.dragPreview ?? dragPreview

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard shortcuts
  // ─────────────────────────────────────────────────────────────────────────
  useTimelinePlayback({ enabled: true })

  // ─────────────────────────────────────────────────────────────────────────
  // Scrubbing
  // ─────────────────────────────────────────────────────────────────────────
  const { handleScrubStart, handleScrubMove, handleScrubEnd } = useTimelineScrub({
    duration,
    pixelsPerMs,
    onSeek
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Hover time updates (RAF-throttled)
  // ─────────────────────────────────────────────────────────────────────────
  const hoverRafRef = React.useRef<number | null>(null)
  const pendingHoverRef = React.useRef<number | null>(null)

  const scheduleHoverUpdate = useCallback((nextTime: number | null) => {
    pendingHoverRef.current = nextTime
    if (hoverRafRef.current !== null) return
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = null
      setHoverTime(pendingHoverRef.current)
    })
  }, [setHoverTime])

  useEffect(() => {
    if (!isScrubbing) return
    scheduleHoverUpdate(null)
  }, [isScrubbing, scheduleHoverUpdate])

  useEffect(() => {
    return () => {
      if (hoverRafRef.current !== null) {
        cancelAnimationFrame(hoverRafRef.current)
        hoverRafRef.current = null
      }
      setHoverTime(null)
    }
  }, [setHoverTime])

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-scroll during playback (10Hz)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return

    const checkAutoScroll = () => {
      const container = scrollContainerRef.current
      if (!container) return

      const time = timeObserver.getTime()
      const playheadX = TimeConverter.msToPixels(time, pixelsPerMs)
      const scrollWidth = container.scrollWidth - container.clientWidth
      const currentScrollLeft = container.scrollLeft

      if (playheadX > currentScrollLeft + stageWidth - 100) {
        const newScroll = Math.min(scrollWidth, playheadX - 100)
        container.scrollLeft = newScroll
      }
    }

    const interval = setInterval(checkAutoScroll, 100)
    return () => clearInterval(interval)
  }, [isPlaying, pixelsPerMs, stageWidth, scrollContainerRef])

  // ─────────────────────────────────────────────────────────────────────────
  // Wheel zoom handler
  // ─────────────────────────────────────────────────────────────────────────
  const wheelDepsRef = React.useRef({ zoom, onZoomChange, adaptiveZoomLimits })
  useEffect(() => {
    wheelDepsRef.current = { zoom, onZoomChange, adaptiveZoomLimits }
  })

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault()
        const { zoom, onZoomChange, adaptiveZoomLimits } = wheelDepsRef.current
        const zoomDelta = -e.deltaY * 0.001
        const newZoom = Math.min(Math.max(zoom + zoomDelta, adaptiveZoomLimits.min), adaptiveZoomLimits.max)
        onZoomChange(newZoom)
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [scrollContainerRef])

  // ─────────────────────────────────────────────────────────────────────────
  // Event handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleClipSelect = useCallback((clipId: string) => {
    if (selectedClips.length === 1 && selectedClips[0] === clipId) {
      clearSelection()
    } else {
      selectClip(clipId)
      onClipSelect?.(clipId)
    }
  }, [selectClip, onClipSelect, selectedClips, clearSelection])

  const handleClipContextMenu = useCallback((e: { evt: { clientX: number; clientY: number } }, clipId: string) => {
    selectClip(clipId)
    setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, clipId })
  }, [selectClip])

  const handleOpenSpeedUpSuggestion = useCallback((clipId: string, opts: {
    x: number
    y: number
    period: SpeedUpPeriod
    allTypingPeriods: SpeedUpPeriod[]
    allIdlePeriods: SpeedUpPeriod[]
  }) => {
    setSpeedUpPopover({ ...opts, clipId })
  }, [])

  const handleStageScrubStart = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const target = e.target
    if (target?.name?.() === 'timeline-ruler') return
    clearEffectSelection()
    handleScrubStart(e)
  }, [clearEffectSelection, handleScrubStart])

  // ─────────────────────────────────────────────────────────────────────────
  // Speed-up popover actions
  // ─────────────────────────────────────────────────────────────────────────
  const executorRef = useCommandExecutor()

  const handleApplySpeedUp = useCallback(async (period: SpeedUpPeriod, clipId: string) => {
    if (!executorRef.current) return
    await executorRef.current.execute(ApplySpeedUpCommand, clipId, [period], [period.type])
    setSpeedUpPopover(null)
  }, [executorRef])

  const handleApplyAllSpeedUps = useCallback(async () => {
    if (!executorRef.current) return
    await executorRef.current.execute(ApplyAllSpeedUpsCommand, { applyTyping: true, applyIdle: true })
    setSpeedUpPopover(null)
  }, [executorRef])

  // ─────────────────────────────────────────────────────────────────────────
  // CONSOLIDATED CONTEXT VALUE
  // ─────────────────────────────────────────────────────────────────────────
  const timelineContextValue = useMemo(() => ({
    // Layout values
    pixelsPerMs,
    dragPreview: effectiveDragPreview,

    // Playback controls (passed from parent)
    onPlay,
    onPause,
    onSeek,
    onZoomChange,

    // Scrubbing (from hook)
    onScrubStart: handleScrubStart,
    onScrubMove: handleScrubMove,
    onScrubEnd: handleScrubEnd,

    // Clip interactions
    onSelect: handleClipSelect,
    onDragPreview: handleDragPreview,
    onDragCommit: handleDragCommit,
    onContextMenu: handleClipContextMenu,
    onTrimStart: clipOps.handleEdgeTrimStart,
    onTrimEnd: clipOps.handleEdgeTrimEnd,
    onOpenSpeedUpSuggestion: handleOpenSpeedUpSuggestion,

    // Clip operations
    onSplitClip: clipOps.handleClipSplit,
    onTrimClipStart: clipOps.handleClipTrimStart,
    onTrimClipEnd: clipOps.handleClipTrimEnd,
    onDuplicateClip: clipOps.handleClipDuplicate,
    onCutClip: clipOps.handleClipCut,
    onCopyClip: clipOps.handleClipCopy,
    onPasteClip: clipOps.handlePaste,
    onDeleteClip: clipOps.handleClipDelete,
    onSpeedUpClip: clipOps.handleClipSpeedUp,
    onSplitSelected: clipOps.handleSplit,
    onTrimStartSelected: clipOps.handleTrimStart,
    onTrimEndSelected: clipOps.handleTrimEnd,
    onDeleteSelected: clipOps.handleDelete,
    onDuplicateSelected: clipOps.handleDuplicate
  }), [
    pixelsPerMs,
    effectiveDragPreview,
    onPlay,
    onPause,
    onSeek,
    onZoomChange,
    handleScrubStart,
    handleScrubMove,
    handleScrubEnd,
    handleClipSelect,
    handleDragPreview,
    handleDragCommit,
    handleClipContextMenu,
    handleOpenSpeedUpSuggestion,
    clipOps
  ])

  // ─────────────────────────────────────────────────────────────────────────
  // Early return for no project
  // ─────────────────────────────────────────────────────────────────────────
  if (!currentProject) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/50 rounded-lg", className)}>
        <p className="text-muted-foreground">No project loaded</p>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  const backgroundOpacity = windowSurfaceMode === 'solid' ? 1 : 0

  return (
    <TimelineContextProvider value={timelineContextValue}>
      <div className={cn("flex flex-col h-full w-full", className)}>
        <TimelineControls
          minZoom={adaptiveZoomLimits.min}
          maxZoom={adaptiveZoomLimits.max}
        />

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-auto relative bg-transparent select-none outline-none focus:outline-none timeline-container scrollbar-auto"
          tabIndex={0}
          onScroll={onScroll}
          onMouseLeave={() => scheduleHoverUpdate(null)}
          onMouseDown={() => scrollContainerRef.current?.focus()}
          onDragOver={assetDragDrop.handlers.onDragOver}
          onDragLeave={assetDragDrop.handlers.onDragLeave}
          onDrop={assetDragDrop.handlers.onDrop}
          style={{
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            outline: 'none'
          }}
        >
          <Stage
            key={themeKey}
            width={stageWidth}
            height={stageHeight}
            onMouseDown={handleStageScrubStart}
            onTouchStart={handleStageScrubStart}
            onMouseUp={handleScrubEnd}
            onTouchEnd={handleScrubEnd}
            onMouseMove={(e) => {
              if (handleScrubMove(e)) return
              const stage = e.target.getStage()
              const pointerPos = stage?.getPointerPosition()
              if (!pointerPos) return
              const time = getTimelineTimeFromX(pointerPos.x, pixelsPerMs, currentProject.timeline.duration)
              scheduleHoverUpdate(time)
            }}
            onTouchMove={(e) => handleScrubMove(e)}
            style={{
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none'
            }}
          >
            {/* Background Layer */}
            <Layer>
              <Rect
                x={0}
                y={0}
                width={stageWidth}
                height={stageHeight}
                fill={colors.background}
                opacity={backgroundOpacity}
                name="timeline-background"
              />

              {/* Ruler background removed to match main bg */}

              <TimelineTrack
                type={TimelineTrackType.Video}
                y={trackPositions.video}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={trackHeights.video}
                onLabelClick={toggleVideoTrackExpanded}
              />

              {trackHeights.audio > 0 && (
                <TimelineTrack
                  type={TimelineTrackType.Audio}
                  y={trackPositions.audio}
                  width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                  height={trackHeights.audio}
                />
              )}

              {trackHeights.webcam > 0 && (
                <TimelineTrack
                  type={TimelineTrackType.Webcam}
                  y={trackPositions.webcam}
                  width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                  height={trackHeights.webcam}
                  onLabelClick={() => toggleEffectTrackExpanded(TimelineTrackType.Webcam)}
                />
              )}

              {hasZoomTrack && (
                <TimelineTrack
                  type={TimelineTrackType.Zoom}
                  y={trackPositions.zoom}
                  width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                  height={trackHeights.zoom}
                  muted={!allZoomEffects.some(e => e.enabled)}
                  onLabelClick={() => toggleEffectTrackExpanded(TimelineTrackType.Zoom)}
                />
              )}

              {hasScreenTrack && (
                <TimelineTrack
                  type={TimelineTrackType.Screen}
                  y={trackPositions.screen}
                  width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                  height={trackHeights.screen}
                  onLabelClick={() => toggleEffectTrackExpanded(TimelineTrackType.Screen)}
                />
              )}

              {hasKeystrokeTrack && (
                <TimelineTrack
                  type={TimelineTrackType.Keystroke}
                  y={trackPositions.keystroke}
                  width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                  height={trackHeights.keystroke}
                  onLabelClick={() => toggleEffectTrackExpanded(TimelineTrackType.Keystroke)}
                />
              )}

              {hasPluginTrack && (
                <TimelineTrack
                  type={TimelineTrackType.Plugin}
                  y={trackPositions.plugin}
                  width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                  height={trackHeights.plugin}
                  onLabelClick={() => toggleEffectTrackExpanded(TimelineTrackType.Plugin)}
                />
              )}
            </Layer>

            {/* Clips Layer */}
            <Layer>
              {videoClips.map((clip) => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  trackType={TrackType.Video}
                  trackY={trackPositions.video}
                  trackHeight={trackHeights.video}
                  isSelected={selectedClips.includes(clip.id)}
                />
              ))}

              <TimelineEffectTracks />
              <TimelineWebcamTrack />

              {audioClips.map((clip) => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  trackType={TrackType.Audio}
                  trackY={trackPositions.audio}
                  trackHeight={trackHeights.audio}
                  isSelected={selectedClips.includes(clip.id)}
                />
              ))}
            </Layer>

            {/* Ruler Layer */}
            <Layer>
              <TimelineRuler />
            </Layer>

            {/* Speed-up Overlay Layer */}
            <Layer>
              <TimelineSpeedUpOverlays />
            </Layer>

            {/* Playhead Layer */}
            <Layer>
              <TimelineGhostPlayhead />
              <TimelinePlayhead />
            </Layer>
          </Stage>

          {/* Context Menu */}
          {contextMenu && (
            <TimelineContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              clipId={contextMenu.clipId}
              onClose={() => setContextMenu(null)}
            />
          )}

          {/* Asset drop target highlight */}
          <TimelineDropTarget
            visible={!!draggingAsset && !!(assetDragDrop.dragAssetTrackType ?? (assetDragDrop.dragPreview?.clipId === '__asset__' ? assetDragDrop.dragPreview.trackType : null))}
            trackType={assetDragDrop.dragAssetTrackType ?? (assetDragDrop.dragPreview?.clipId === '__asset__' ? assetDragDrop.dragPreview?.trackType : null)}
            getTrackBounds={safeGetTrackBounds}
            timelineWidth={timelineWidth}
          />

          {/* Drag Preview Overlay (Ghost Clip) */}
          <TimelineAssetGhost
            draggingAsset={draggingAsset}
            dragTime={assetDragDrop.dragTime}
            trackType={assetDragDrop.dragAssetTrackType ?? (assetDragDrop.dragPreview?.clipId === '__asset__' ? assetDragDrop.dragPreview?.trackType : null)}
            getTrackBounds={safeGetTrackBounds}
            pixelsPerMs={pixelsPerMs}
          />

          {/* Speed-up suggestion popover */}
          {speedUpPopover && (
            <SpeedUpSuggestionPopover
              x={speedUpPopover.x}
              y={speedUpPopover.y}
              period={speedUpPopover.period}
              allTypingPeriods={speedUpPopover.allTypingPeriods}
              allIdlePeriods={speedUpPopover.allIdlePeriods}
              onApply={(p) => handleApplySpeedUp(p, speedUpPopover.clipId)}
              onApplyAll={handleApplyAllSpeedUps}
              onClose={() => setSpeedUpPopover(null)}
            />
          )}
        </div>
      </div>
    </TimelineContextProvider>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Main Component: Wraps content with layout provider
// ─────────────────────────────────────────────────────────────────────────────
export const TimelineCanvas = React.memo(function TimelineCanvas(props: TimelineCanvasProps) {
  return (
    <TimelineLayoutProvider>
      <TimelineUIProvider>
        <TimelineCanvasContent {...props} />
      </TimelineUIProvider>
    </TimelineLayoutProvider>
  )
})
