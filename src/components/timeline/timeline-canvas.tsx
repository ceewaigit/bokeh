'use client'

import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import { useProjectStore } from '@/stores/project-store'
import { useShallow } from 'zustand/react/shallow'
import { cn, clamp } from '@/lib/utils'
import type { Project, Clip } from '@/types/project'
import { TrackType, TimelineTrackType } from '@/types/project'
import { getZoomEffects } from '@/lib/effects/effect-filters'
import { TimelineLayoutProvider, useTimelineLayout } from './timeline-layout-provider'
import { useAssetLibraryStore } from '@/stores/asset-library-store'
import { TimelineZoomTrack } from './tracks/timeline-zoom-track'
import { TimelineScreenTrack } from './tracks/timeline-screen-track'
import { TimelineKeystrokeTrack } from './tracks/timeline-keystroke-track'
import { TimelinePluginTrack } from './tracks/timeline-plugin-track'
import { TimelineWebcamTrack } from './tracks/timeline-webcam-track'

// Sub-components
import { TimelineRuler } from './timeline-ruler'
import { TimelineClip } from './timeline-clip'
import { TimelineTrack } from './timeline-track'
import { TimelinePlayhead } from './timeline-playhead'
import { TimelineGhostPlayhead } from './timeline-ghost-playhead'
import { SpeedUpSuggestionPopover } from './speed-up-suggestion-popover'
import { TimelineControls } from './timeline-controls'
import { TimelineContextMenu } from './timeline-context-menu'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { useWindowAppearanceStore } from '@/stores/window-appearance-store'
import { ApplySpeedUpCommand } from '@/lib/commands/timeline/ApplySpeedUpCommand'
import { ApplyAllSpeedUpsCommand } from '@/lib/commands/timeline/ApplyAllSpeedUpsCommand'
import { EffectStore } from '@/lib/core/effects'

// Utilities
import { TimelineConfig } from '@/lib/timeline/config'
import { ClipPositioning } from '@/lib/timeline/clip-positioning'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { getSnappedDragX } from '@/lib/timeline/drag-positioning'
import { addAssetRecording } from '@/lib/timeline/timeline-operations'
import { useCommandKeyboard } from '@/hooks/use-command-keyboard'
import { useTimelinePlayback } from '@/hooks/use-timeline-playback'
import { useTimelineColors } from '@/lib/timeline/colors'
import { useTimelineMetadata } from '@/hooks/useTimelineMetadata'
import { useWorkspaceStore } from '@/stores/workspace-store'

// Commands
import {
  RemoveClipCommand,
  SplitClipCommand,
  DuplicateClipCommand,
  TrimCommand,
  CopyCommand,
  CutCommand,
  PasteCommand,
  ChangePlaybackRateCommand
} from '@/lib/commands'
import { useCommandExecutor } from '@/hooks/useCommandExecutor'

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

export function TimelineCanvas(props: TimelineCanvasProps) {
  return (
    <TimelineLayoutProvider>
      <TimelineCanvasContent {...props} />
    </TimelineLayoutProvider>
  )
}

function TimelineCanvasContent({
  className = "h-full w-full",
  currentProject,
  zoom,
  onPlay,
  onPause,
  onSeek,
  onClipSelect,
  onZoomChange
}: TimelineCanvasProps) {
  // PERFORMANCE: Subscribe directly to avoid WorkspaceManager re-renders every frame
  const currentTime = useProjectStore((s) => s.currentTime)
  const isPlaying = useProjectStore((s) => s.isPlaying)
  const isScrubbing = useProjectStore((s) => s.isScrubbing)
  const hoverTime = useProjectStore((s) => s.hoverTime)
  const setHoverTime = useProjectStore((s) => s.setHoverTime)
  const draggingAsset = useAssetLibraryStore((s) => s.draggingAsset)
  const [dragTime, setDragTime] = useState<number | null>(null)
  const [dragAssetTrackType, setDragAssetTrackType] = useState<TrackType.Video | TrackType.Audio | TrackType.Webcam | null>(null)

  // Use Layout Context (replaces local resizing and calculations)
  const {
    stageWidth,
    stageHeight,
    timelineWidth,
    containerWidth,
    pixelsPerMs,
    trackHeights,
    trackPositions,
    hasZoomTrack,
    hasScreenTrack,
    hasKeystrokeTrack,
    hasPluginTrack,
    containerRef,
    toggleEffectTrackExpanded,
    toggleVideoTrackExpanded,
  } = useTimelineLayout()

  const {
    selectedClips,
    selectClip,
    clearEffectSelection,
    clearSelection,
  } = useProjectStore(
    useShallow((s) => ({
      selectedClips: s.selectedClips,
      selectClip: s.selectClip,
      clearEffectSelection: s.clearEffectSelection,
      clearSelection: s.clearSelection,
    }))
  )

  // Local state for scroll and context menu (stageSize moved to context)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null)
  const [speedUpPopover, setSpeedUpPopover] = useState<{
    x: number
    y: number
    period: SpeedUpPeriod
    allTypingPeriods: SpeedUpPeriod[]
    allIdlePeriods: SpeedUpPeriod[]
    clipId: string
  } | null>(null)

  const colors = useTimelineColors()
  const windowSurfaceMode = useWindowAppearanceStore((s) => s.mode)
  const windowSurfaceOpacity = useWindowAppearanceStore((s) => s.opacity)
  const previewScale = useWorkspaceStore((s) => s.previewScale)
  const setPreviewScale = useWorkspaceStore((s) => s.setPreviewScale)

  // Force re-render when theme changes by using colors as part of key
  const themeKey = React.useMemo(() => {
    // Create a simple hash from primary color to detect theme changes
    return colors.primary + colors.background + windowSurfaceMode + windowSurfaceOpacity
  }, [colors.primary, colors.background, windowSurfaceMode, windowSurfaceOpacity])

  // Calculate timeline dimensions - MOVED TO CONTEXT
  const duration = currentProject?.timeline?.duration || 10000
  // Memoize video/audio tracks lookup
  const videoTrack = useMemo(
    () => currentProject?.timeline.tracks.find(t => t.type === TrackType.Video),
    [currentProject?.timeline.tracks]
  )
  const audioTrack = useMemo(
    () => currentProject?.timeline.tracks.find(t => t.type === TrackType.Audio),
    [currentProject?.timeline.tracks]
  )
  const webcamTrack = useMemo(
    () => currentProject?.timeline.tracks.find(t => t.type === TrackType.Webcam),
    [currentProject?.timeline.tracks]
  )
  const videoClips = useMemo(() => videoTrack?.clips || [], [videoTrack])
  const audioClips = useMemo(() => audioTrack?.clips || [], [audioTrack])
  const webcamClips = useMemo(() => webcamTrack?.clips || [], [webcamTrack])
  const videoClipBlocks = useMemo(
    () => videoClips.map((clip) => ({
      id: clip.id,
      startTime: clip.startTime,
      endTime: clip.startTime + clip.duration
    })),
    [videoClips]
  )
  const audioClipBlocks = useMemo(
    () => audioClips.map((clip) => ({
      id: clip.id,
      startTime: clip.startTime,
      endTime: clip.startTime + clip.duration
    })),
    [audioClips]
  )
  const webcamClipBlocks = useMemo(
    () => webcamClips.map((clip) => ({
      id: clip.id,
      startTime: clip.startTime,
      endTime: clip.startTime + clip.duration
    })),
    [webcamClips]
  )

  const timelineEffects = useMemo(
    () => currentProject ? EffectStore.getAll(currentProject) : [],
    [currentProject]
  )
  const allZoomEffects = useMemo(
    () => getZoomEffects(timelineEffects),
    [timelineEffects]
  )
  const adaptiveZoomLimits = React.useMemo(() => {
    const zoomBlocks = allZoomEffects.map(e => ({
      startTime: e.startTime,
      endTime: e.endTime
    }))
    return TimeConverter.calculateAdaptiveZoomLimits(
      duration,
      stageWidth,
      zoomBlocks,
      TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX
    )
  }, [allZoomEffects, duration, stageWidth])

  const rulerHeight = trackHeights.ruler
  const videoTrackHeight = trackHeights.video
  const audioTrackHeight = trackHeights.audio
  const webcamTrackHeight = trackHeights.webcam
  const zoomTrackHeight = trackHeights.zoom
  const screenTrackHeight = trackHeights.screen
  const keystrokeTrackHeight = trackHeights.keystroke
  const pluginTrackHeight = trackHeights.plugin

  // Initialize command executor
  const executorRef = useCommandExecutor()

  // Use command-based keyboard shortcuts for editing operations (copy, cut, paste, delete, etc.)
  useCommandKeyboard({ enabled: true })

  // Use playback-specific keyboard shortcuts (play, pause, seek, shuttle, etc.)
  useTimelinePlayback({ enabled: true })

  // PERFORMANCE: Auto-scroll during playback at reduced frequency (10Hz instead of 60Hz)
  // The playhead updates smoothly at 60fps, but scroll checks only need to run periodically
  useEffect(() => {
    if (!isPlaying) return

    const checkAutoScroll = () => {
      const container = containerRef.current
      if (!container) return

      // Get current time imperatively to avoid needing it as a dependency
      const time = useProjectStore.getState().currentTime
      const playheadX = TimeConverter.msToPixels(time, pixelsPerMs)
      const scrollWidth = container.scrollWidth - container.clientWidth
      const currentScrollLeft = container.scrollLeft

      if (playheadX > currentScrollLeft + stageWidth - 100) {
        const newScroll = Math.min(scrollWidth, playheadX - 100)
        container.scrollLeft = newScroll
        setScrollLeft(newScroll)
      }
    }

    // Check 10 times per second instead of 60
    const interval = setInterval(checkAutoScroll, 100)
    return () => clearInterval(interval)
  }, [isPlaying, pixelsPerMs, stageWidth, containerRef])

  const maxScrollLeft = Math.max(0, stageWidth - containerWidth)

  // Handle wheel zoom with non-passive listener to prevent default browser zooming
  const wheelDepsRef = useRef({ zoom, onZoomChange, adaptiveZoomLimits })
  useEffect(() => {
    wheelDepsRef.current = { zoom, onZoomChange, adaptiveZoomLimits }
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault()
        const { zoom, onZoomChange, adaptiveZoomLimits } = wheelDepsRef.current
        const zoomDelta = -e.deltaY * 0.001 // Invert direction and scale
        const newZoom = Math.min(Math.max(zoom + zoomDelta, adaptiveZoomLimits.min), adaptiveZoomLimits.max)
        onZoomChange(newZoom)
        return
      }

      // Allow both horizontal and vertical scrolling
      // Don't prevent default for natural scroll in both directions
    }

    // passive: false is required to use preventDefault()
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [containerRef, maxScrollLeft]) // Added containerRef dep

  // Handle clip context menu
  const handleClipContextMenu = useCallback((e: { evt: { clientX: number; clientY: number } }, clipId: string) => {
    // Match common UX: right-clicking a clip selects it so actions operate on the intended target.
    selectClip(clipId)
    setContextMenu({
      x: e.evt.clientX,
      y: e.evt.clientY,
      clipId
    })
  }, [selectClip])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft)
    setScrollTop(e.currentTarget.scrollTop)
  }

  // Handle clip selection
  const handleClipSelect = useCallback((clipId: string) => {
    // If the clip is already selected AND it's the only one selected, deselect it (toggle behavior)
    if (selectedClips.length === 1 && selectedClips[0] === clipId) {
      clearSelection()
    } else {
      selectClip(clipId)
      onClipSelect?.(clipId)
    }
  }, [selectClip, onClipSelect, selectedClips, clearSelection])

  const [dragPreview, setDragPreview] = useState<{
    clipId: string
    trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam
    startTimes: Record<string, number>
    insertIndex: number
  } | null>(null)
  const previewRafRef = useRef<number | null>(null)
  const pendingPreviewRef = useRef<{
    clipId: string
    trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam
    proposedTime: number
  } | null>(null)
  const hoverRafRef = useRef<number | null>(null)
  const pendingHoverRef = useRef<number | null>(null)

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

  const getClipsForTrack = useCallback((trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => {
    switch (trackType) {
      case TrackType.Audio:
        return audioClips
      case TrackType.Webcam:
        return webcamClips
      case TrackType.Video:
      default:
        return videoClips
    }
  }, [audioClips, videoClips, webcamClips])

  const getClipBlocksForTrack = useCallback((trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => {
    switch (trackType) {
      case TrackType.Audio:
        return audioClipBlocks
      case TrackType.Webcam:
        return webcamClipBlocks
      case TrackType.Video:
      default:
        return videoClipBlocks
    }
  }, [audioClipBlocks, videoClipBlocks, webcamClipBlocks])

  const getTrackBounds = useCallback((trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => {
    const padding = TimelineConfig.TRACK_PADDING
    switch (trackType) {
      case TrackType.Audio: {
        const y = trackPositions.audio
        const height = audioTrackHeight
        return { y, height, clipY: y + padding, clipHeight: Math.max(0, height - padding * 2) }
      }
      case TrackType.Webcam: {
        const y = trackPositions.webcam
        const height = webcamTrackHeight
        return { y, height, clipY: y + padding, clipHeight: Math.max(0, height - padding * 2) }
      }
      case TrackType.Video:
      default: {
        const y = trackPositions.video
        const height = videoTrackHeight
        return { y, height, clipY: y + padding, clipHeight: Math.max(0, height - padding * 2) }
      }
    }
  }, [trackPositions, audioTrackHeight, webcamTrackHeight, videoTrackHeight])

  const getAssetDropTrackType = useCallback((
    assetType: 'video' | 'audio' | 'image',
    stageY: number
  ): TrackType.Video | TrackType.Audio | TrackType.Webcam | null => {
    const hitSlop = TimelineConfig.TRACK_PADDING
    const boundsFor = (trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => getTrackBounds(trackType)
    const isWithin = (bounds: ReturnType<typeof boundsFor>) => (
      stageY >= bounds.y - hitSlop && stageY <= bounds.y + bounds.height + hitSlop
    )

    if (assetType === 'audio') {
      const bounds = boundsFor(TrackType.Audio)
      return isWithin(bounds) ? TrackType.Audio : null
    }

    if (assetType === 'video') {
      const webcamBounds = boundsFor(TrackType.Webcam)
      if (isWithin(webcamBounds)) return TrackType.Webcam
      const videoBounds = boundsFor(TrackType.Video)
      return isWithin(videoBounds) ? TrackType.Video : null
    }

    if (assetType === 'image') {
      const bounds = boundsFor(TrackType.Video)
      return isWithin(bounds) ? TrackType.Video : null
    }

    return null
  }, [getTrackBounds])

  const buildContiguousPreview = useCallback((
    clips: Clip[],
    clipId: string,
    proposedTime: number
  ) => {
    return ClipPositioning.computeContiguousPreview(clips, proposedTime, { clipId })
  }, [])

  const schedulePreviewUpdate = useCallback((clipId: string, trackType: TrackType.Video | TrackType.Audio, proposedTime: number) => {
    pendingPreviewRef.current = { clipId, trackType, proposedTime }
    if (previewRafRef.current !== null) return
    previewRafRef.current = requestAnimationFrame(() => {
      previewRafRef.current = null
      const pending = pendingPreviewRef.current
      if (!pending) return
      const clips = getClipsForTrack(pending.trackType)
      const preview = buildContiguousPreview(clips, pending.clipId, pending.proposedTime)
      if (preview) {
        setDragPreview({
          clipId: pending.clipId,
          trackType: pending.trackType,
          startTimes: preview.startTimes,
          insertIndex: preview.insertIndex
        })
      }
    })
  }, [buildContiguousPreview, getClipsForTrack])

  const clearPreview = useCallback(() => {
    pendingPreviewRef.current = null
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current)
      previewRafRef.current = null
    }
    setDragPreview(null)
  }, [])

  const resetAssetDragState = useCallback((clearDraggingAsset: boolean) => {
    setDragTime(null)
    setDragAssetTrackType(null)
    setDragPreview((prev) => (prev?.clipId === '__asset__' ? null : prev))
    if (clearDraggingAsset) {
      useAssetLibraryStore.getState().setDraggingAsset(null)
    }
  }, [])

  const handleDragPreview = useCallback((clipId: string, trackType: TrackType.Video | TrackType.Audio, proposedTime: number) => {
    schedulePreviewUpdate(clipId, trackType, proposedTime)
  }, [schedulePreviewUpdate])

  const handleDragCommit = useCallback((clipId: string, trackType: TrackType.Video | TrackType.Audio, proposedTime: number) => {
    const clips = getClipsForTrack(trackType)
    const preview = buildContiguousPreview(clips, clipId, proposedTime)
    if (preview) {
      useProjectStore.getState().reorderClip(clipId, preview.insertIndex)
    }
    clearPreview()
  }, [buildContiguousPreview, clearPreview, getClipsForTrack])

  useEffect(() => {
    const handleWindowDragEnd = () => resetAssetDragState(true)
    const handleWindowDrop = () => resetAssetDragState(true)
    window.addEventListener('dragend', handleWindowDragEnd)
    window.addEventListener('drop', handleWindowDrop)
    return () => {
      window.removeEventListener('dragend', handleWindowDragEnd)
      window.removeEventListener('drop', handleWindowDrop)
    }
  }, [resetAssetDragState])

  const handleVideoDragPreview = useCallback((clipId: string, proposedStartTime: number) => {
    handleDragPreview(clipId, TrackType.Video, proposedStartTime)
  }, [handleDragPreview])

  const handleVideoDragCommit = useCallback((clipId: string, proposedStartTime: number) => {
    handleDragCommit(clipId, TrackType.Video, proposedStartTime)
  }, [handleDragCommit])

  const handleAudioDragPreview = useCallback((clipId: string, proposedStartTime: number) => {
    handleDragPreview(clipId, TrackType.Audio, proposedStartTime)
  }, [handleDragPreview])

  const handleAudioDragCommit = useCallback((clipId: string, proposedStartTime: number) => {
    handleDragCommit(clipId, TrackType.Audio, proposedStartTime)
  }, [handleDragCommit])

  // Handle popover actions for speed-up suggestions
  const handleApplySpeedUp = useCallback(async (period: SpeedUpPeriod, clipId: string) => {
    if (!executorRef.current) return
    await executorRef.current.execute(ApplySpeedUpCommand, clipId, [period], [period.type])
    setSpeedUpPopover(null)
  }, [])

  const handleApplyAllSpeedUps = useCallback(async () => {
    if (!executorRef.current) return
    await executorRef.current.execute(ApplyAllSpeedUpsCommand, { applyTyping: true, applyIdle: true })
    setSpeedUpPopover(null)
  }, [])

  // Handle control actions using command pattern
  // PERFORMANCE: Use imperative store access instead of subscribed currentTime
  const handleSplit = useCallback(async () => {
    if (selectedClips.length === 1 && executorRef.current) {
      const time = useProjectStore.getState().currentTime
      await executorRef.current.execute(SplitClipCommand, selectedClips[0], time)
    }
  }, [selectedClips])

  const handleTrimStart = useCallback(async () => {
    if (selectedClips.length === 1 && executorRef.current) {
      const time = useProjectStore.getState().currentTime
      await executorRef.current.execute(TrimCommand, selectedClips[0], time, 'start')
    }
  }, [selectedClips])

  const handleTrimEnd = useCallback(async () => {
    if (selectedClips.length === 1 && executorRef.current) {
      const time = useProjectStore.getState().currentTime
      await executorRef.current.execute(TrimCommand, selectedClips[0], time, 'end')
    }
  }, [selectedClips])

  const handleDelete = useCallback(async () => {
    if (!executorRef.current) return
    const executor = executorRef.current

    if (selectedClips.length > 1) executor.beginGroup(`delete-${Date.now()}`)
    for (const clipId of selectedClips) {
      await executor.execute(RemoveClipCommand, clipId)
    }
    if (selectedClips.length > 1) await executor.endGroup()

    clearSelection()
  }, [selectedClips, clearSelection])

  const handleDuplicate = useCallback(async () => {
    if (selectedClips.length === 1 && executorRef.current) {
      await executorRef.current.execute(DuplicateClipCommand, selectedClips[0])
    }
  }, [selectedClips])

  // Context menu wrappers - reuse existing handlers
  // PERFORMANCE: Use imperative store access instead of subscribed currentTime
  const handleClipSplit = useCallback(async (clipId: string) => {
    if (!executorRef.current) return
    const time = useProjectStore.getState().currentTime
    await executorRef.current.execute(SplitClipCommand, clipId, time)
  }, [])

  const handleClipTrimStart = useCallback(async (clipId: string) => {
    if (!executorRef.current) return
    const time = useProjectStore.getState().currentTime
    await executorRef.current.execute(TrimCommand, clipId, time, 'start')
  }, [])

  const handleClipTrimEnd = useCallback(async (clipId: string) => {
    if (!executorRef.current) return
    const time = useProjectStore.getState().currentTime
    await executorRef.current.execute(TrimCommand, clipId, time, 'end')
  }, [])

  const handleClipDuplicate = useCallback(async (clipId: string) => {
    if (!executorRef.current) return
    await executorRef.current.execute(DuplicateClipCommand, clipId)
  }, [])

  const handleClipCopy = useCallback(async (clipId: string) => {
    if (!executorRef.current) return
    await executorRef.current.execute(CopyCommand, clipId)
  }, [])

  const handleClipCut = useCallback(async (clipId: string) => {
    if (!executorRef.current) return
    await executorRef.current.execute(CutCommand, clipId)
  }, [])

  const handlePaste = useCallback(async () => {
    if (!executorRef.current) return
    const time = useProjectStore.getState().currentTime
    await executorRef.current.execute(PasteCommand, time)
  }, [])

  const handleClipDelete = useCallback(async (clipId: string) => {
    if (!executorRef.current) return
    await executorRef.current.execute(RemoveClipCommand, clipId)
  }, [])

  const handleClipSpeedUp = useCallback(async (clipId: string) => {
    selectClip(clipId)
    if (!executorRef.current) return
    await executorRef.current.execute(ChangePlaybackRateCommand, clipId, 2.0)
  }, [selectClip])

  // Edge trim handlers - called when user drags clip edges
  const handleClipEdgeTrimStart = useCallback((clipId: string, newStartTime: number) => {
    useProjectStore.getState().trimClipStart(clipId, newStartTime)
  }, [])

  const handleClipEdgeTrimEnd = useCallback((clipId: string, newEndTime: number) => {
    useProjectStore.getState().trimClipEnd(clipId, newEndTime)
  }, [])

  // Stage click handler - click to seek and clear selections
  const handleStageClick = useCallback((e: { target: any; evt: { offsetX: number } }) => {
    if (e.target === e.target.getStage()) {
      clearEffectSelection()

      const x = e.evt.offsetX - TimelineConfig.TRACK_LABEL_WIDTH
      if (x > 0) {
        const time = TimeConverter.pixelsToMs(x, pixelsPerMs)
        const maxTime = currentProject?.timeline?.duration || 0
        const targetTime = clamp(time, 0, maxTime)
        onSeek(targetTime)
      }
    }
  }, [currentProject, pixelsPerMs, onSeek, clearEffectSelection])

  if (!currentProject) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/50 rounded-lg", className)}>
        <p className="text-muted-foreground">No project loaded</p>
      </div>
    )
  }

  // Glass mode: fully transparent canvas, rely on text shadows for readability. Solid mode: full opacity.
  const backgroundOpacity = windowSurfaceMode === 'solid' ? 1 : 0

  return (
    <div className={cn("flex flex-col h-full w-full", className)}>
      <TimelineControls
        isPlaying={isPlaying}
        zoom={zoom}
        currentTime={currentTime}
        maxDuration={currentProject.timeline.duration}
        minZoom={adaptiveZoomLimits.min}
        maxZoom={adaptiveZoomLimits.max}
        selectedClips={selectedClips}
        onPlay={onPlay}
        onPause={onPause}
        onSeek={onSeek}
        onZoomChange={onZoomChange}
        onSplit={handleSplit}
        onTrimStart={handleTrimStart}
        onTrimEnd={handleTrimEnd}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        previewScale={previewScale}
        onPreviewScaleChange={setPreviewScale}
        fps={useTimelineMetadata(currentProject)?.fps || 60}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative bg-transparent select-none outline-none focus:outline-none timeline-container scrollbar-auto"
        tabIndex={0}
        onScroll={handleScroll}
        onMouseLeave={() => scheduleHoverUpdate(null)}

        onMouseDown={() => {
          // Ensure container maintains focus for keyboard events
          containerRef.current?.focus()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'

          if (draggingAsset) {
            const rect = e.currentTarget.getBoundingClientRect()
            const stageX = (e.clientX - rect.left) + e.currentTarget.scrollLeft
            const stageY = (e.clientY - rect.top) + e.currentTarget.scrollTop
            const assetDuration = draggingAsset.metadata?.duration || 5000
            const targetTrack = getAssetDropTrackType(draggingAsset.type, stageY)
            if (!targetTrack) {
              setDragTime(null)
              setDragPreview((prev) => (prev?.clipId === '__asset__' ? null : prev))
              return
            }

            const snappedX = getSnappedDragX({
              proposedX: stageX,
              blockWidth: TimeConverter.msToPixels(assetDuration, pixelsPerMs),
              blocks: getClipBlocksForTrack(targetTrack),
              pixelsPerMs
            })
            const proposedTime = Math.max(
              0,
              TimeConverter.pixelsToMs(snappedX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
            )

            const preview = ClipPositioning.computeContiguousPreview(
              getClipsForTrack(targetTrack),
              proposedTime,
              { durationMs: assetDuration }
            )
            if (preview) {
              setDragPreview({
                clipId: '__asset__',
                trackType: targetTrack,
                startTimes: preview.startTimes,
                insertIndex: preview.insertIndex
              })
              setDragTime(preview.insertTime)
              setDragAssetTrackType(targetTrack)
            } else {
              setDragPreview((prev) => (prev?.clipId === '__asset__' ? null : prev))
              setDragTime(proposedTime)
              setDragAssetTrackType(targetTrack)
            }
          }
        }}
        onDragLeave={(e) => {
          const relatedTarget = e.relatedTarget as Node | null
          if (relatedTarget && e.currentTarget.contains(relatedTarget)) return
          resetAssetDragState(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          const assetData = e.dataTransfer.getData('application/x-bokeh-asset')
          if (!assetData && !draggingAsset) {
            resetAssetDragState(true)
            return
          }

          try {
            const asset = assetData ? JSON.parse(assetData) : {
              path: draggingAsset!.path,
              duration: draggingAsset!.metadata?.duration || 0,
              width: draggingAsset!.metadata?.width || 0,
              height: draggingAsset!.metadata?.height || 0,
              type: draggingAsset!.type,
              name: draggingAsset!.name
            }
            const rect = e.currentTarget.getBoundingClientRect()
            const stageX = (e.clientX - rect.left) + e.currentTarget.scrollLeft
            const stageY = (e.clientY - rect.top) + e.currentTarget.scrollTop
            const assetDuration = asset.duration || 5000
            const targetTrack = getAssetDropTrackType(asset.type, stageY) ?? dragAssetTrackType
            if (!targetTrack) {
              setDragAssetTrackType(null)
              return
            }
            const snappedX = getSnappedDragX({
              proposedX: stageX,
              blockWidth: TimeConverter.msToPixels(assetDuration, pixelsPerMs),
              blocks: getClipBlocksForTrack(targetTrack),
              pixelsPerMs
            })
            const proposedTime = Math.max(
              0,
              TimeConverter.pixelsToMs(snappedX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
            )
            const preview = ClipPositioning.computeContiguousPreview(
              getClipsForTrack(targetTrack),
              proposedTime,
              { durationMs: assetDuration }
            )

            // Use the shared helper to add the asset intelligently
            // (Creates recording, adds to project, keeps crops independent by default)
            useProjectStore.getState().updateProjectData((project: Project) => {
              const updatedProject = { ...project }
              if (preview) {
                addAssetRecording(updatedProject, asset, { insertIndex: preview.insertIndex, trackType: targetTrack })
              } else {
                addAssetRecording(updatedProject, asset, { startTime: proposedTime, trackType: targetTrack })
              }
              return updatedProject
            })
            setDragAssetTrackType(null)

          } catch (err) {
            console.error('Failed to parse asset data on drop', err)
          } finally {
            resetAssetDragState(true)
          }
        }}
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
          onMouseDown={handleStageClick}
          onMouseMove={(e) => {
            if (isScrubbing) return
            const stage = e.target.getStage()
            const pointerPos = stage?.getPointerPosition()
            if (!pointerPos) return

            const x = pointerPos.x - TimelineConfig.TRACK_LABEL_WIDTH

            // Update hover time for ghost playhead
            if (x <= 0) {
              scheduleHoverUpdate(null)
            } else {
              const time = clamp(TimeConverter.pixelsToMs(x, pixelsPerMs), 0, currentProject.timeline.duration)
              scheduleHoverUpdate(time)
            }

          }}
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
            />

            <Rect
              x={0}
              y={0}
              width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
              height={rulerHeight}
              fill={colors.background}
              opacity={backgroundOpacity}
            />

            <TimelineTrack
              type={TimelineTrackType.Video}
              y={trackPositions.video}
              width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
              height={videoTrackHeight}
              onLabelClick={toggleVideoTrackExpanded}
            />

            {/* Audio/Webcam sub-tracks directly under video */}
            {audioTrackHeight > 0 && (
              <TimelineTrack
                type={TimelineTrackType.Audio}
                y={trackPositions.audio}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={audioTrackHeight}
              />
            )}

            {webcamTrackHeight > 0 && (
              <TimelineTrack
                type={TimelineTrackType.Webcam}
                y={trackPositions.webcam}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={webcamTrackHeight}
                onLabelClick={() => toggleEffectTrackExpanded(TimelineTrackType.Webcam)}
              />
            )}

            {/* Effect tracks below sub-tracks */}
            {hasZoomTrack && (
              <TimelineTrack
                type={TimelineTrackType.Zoom}
                y={trackPositions.zoom}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={zoomTrackHeight}
                muted={!allZoomEffects.some(e => e.enabled)}
                onLabelClick={() => toggleEffectTrackExpanded(TimelineTrackType.Zoom)}
              />
            )}

            {hasScreenTrack && (
              <TimelineTrack
                type={TimelineTrackType.Screen}
                y={trackPositions.screen}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={screenTrackHeight}
                onLabelClick={() => toggleEffectTrackExpanded(TimelineTrackType.Screen)}
              />
            )}

            {hasKeystrokeTrack && (
              <TimelineTrack
                type={TimelineTrackType.Keystroke}
                y={trackPositions.keystroke}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={keystrokeTrackHeight}
                onLabelClick={() => toggleEffectTrackExpanded(TimelineTrackType.Keystroke)}
              />
            )}

            {hasPluginTrack && (
              <TimelineTrack
                type={TimelineTrackType.Plugin}
                y={trackPositions.plugin}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={pluginTrackHeight}
                onLabelClick={() => toggleEffectTrackExpanded(TimelineTrackType.Plugin)}
              />
            )}
          </Layer>

          {/* Ruler Layer - Sticky at top during vertical scroll */}
          <Layer>
            <TimelineRuler
              duration={currentProject.timeline.duration}
              stageWidth={stageWidth}
              zoom={zoom}
              pixelsPerMs={pixelsPerMs}
              onSeek={onSeek}
              offsetY={scrollTop}
            />
          </Layer>

          {/* Clips Layer */}
          <Layer>
            {/* Video clips - Uses memoized videoClips */}
            {videoClips.map((clip) => {
              const recording = currentProject.recordings.find(r => r.id === clip.recordingId)
              const previewStartTime = dragPreview?.trackType === TrackType.Video && dragPreview.clipId !== clip.id
                ? dragPreview.startTimes[clip.id]
                : undefined
              // Merge effects from recording (zoom) and timeline (global)
              return (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  recording={recording}
                  trackType={TrackType.Video}
                  trackY={trackPositions.video}
                  trackHeight={videoTrackHeight}
                  pixelsPerMs={pixelsPerMs}
                  isSelected={selectedClips.includes(clip.id)}
                  otherClipsInTrack={videoClips}
                  onSelect={handleClipSelect}
                  onDragPreview={handleVideoDragPreview}
                  onDragCommit={handleVideoDragCommit}
                  onContextMenu={handleClipContextMenu}
                  onTrimStart={handleClipEdgeTrimStart}
                  onTrimEnd={handleClipEdgeTrimEnd}
                  onOpenSpeedUpSuggestion={(opts) => setSpeedUpPopover({ ...opts, clipId: clip.id })}
                  displayStartTime={previewStartTime}
                />
              )
            })}

            {/* Zoom blocks */}
            <TimelineZoomTrack />

            {/* Screen Effects blocks */}
            <TimelineScreenTrack />

            {/* Keystroke blocks */}
            <TimelineKeystrokeTrack />

            {/* Plugin blocks */}
            <TimelinePluginTrack />

            {/* Webcam track */}
            <TimelineWebcamTrack />

            {audioClips.map(clip => (
              (() => {
                const previewStartTime = dragPreview?.trackType === TrackType.Audio && dragPreview.clipId !== clip.id
                  ? dragPreview.startTimes[clip.id]
                  : undefined
                return (
                  <TimelineClip
                    key={clip.id}
                    clip={clip}
                    trackType={TrackType.Audio}
                    trackY={trackPositions.audio}
                    trackHeight={audioTrackHeight}
                    pixelsPerMs={pixelsPerMs}
                    isSelected={selectedClips.includes(clip.id)}
                    otherClipsInTrack={audioClips}
                    onSelect={handleClipSelect}
                    onDragPreview={handleAudioDragPreview}
                    onDragCommit={handleAudioDragCommit}
                    onContextMenu={handleClipContextMenu}
                    onTrimStart={handleClipEdgeTrimStart}
                    onTrimEnd={handleClipEdgeTrimEnd}
                    displayStartTime={previewStartTime}
                  />
                )
              })()
            ))}
          </Layer>

          {/* Playhead Layer */}
          <Layer>
            {hoverTime !== null && !isScrubbing && (
              <TimelineGhostPlayhead
                hoverTime={hoverTime}
                totalHeight={stageHeight}
                pixelsPerMs={pixelsPerMs}
                maxTime={currentProject.timeline.duration}
              />
            )}
            <TimelinePlayhead
              currentTime={currentTime}
              totalHeight={stageHeight}
              pixelsPerMs={pixelsPerMs}
              timelineWidth={timelineWidth}
              maxTime={currentProject.timeline.duration}
              onSeek={onSeek}
            />
          </Layer>
        </Stage>

        {/* Context Menu */}
        {contextMenu && (
          <TimelineContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            clipId={contextMenu.clipId}
            onSplit={handleClipSplit}
            onTrimStart={handleClipTrimStart}
            onTrimEnd={handleClipTrimEnd}
            onDuplicate={handleClipDuplicate}
            onCut={handleClipCut}
            onCopy={handleClipCopy}
            onPaste={handlePaste}
            onDelete={handleClipDelete}
            onSpeedUp={handleClipSpeedUp}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Asset drop target highlight */}
        {(() => {
          if (!draggingAsset) return null
          const targetTrackType = dragAssetTrackType ?? (dragPreview?.clipId === '__asset__' ? dragPreview.trackType : null)
          if (!targetTrackType) return null
          const bounds = getTrackBounds(targetTrackType)
          return (
            <div
              className="absolute pointer-events-none z-40 timeline-drop-target"
              style={{
                left: 0,
                top: bounds.y + 'px',
                width: (timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH) + 'px',
                height: bounds.height + 'px',
              }}
            />
          )
        })()}

        {/* Drag Preview Overlay (Ghost Clip) */}
        {(() => {
          const assetTrackType = dragAssetTrackType ?? (dragPreview?.clipId === '__asset__' ? dragPreview.trackType : null)
          if (!draggingAsset || dragTime === null || !assetTrackType) return null
          const bounds = getTrackBounds(assetTrackType)
          return (
            <div
              className="absolute pointer-events-none z-50 flex flex-col justify-center overflow-hidden rounded-md border-2 border-primary bg-primary/20 backdrop-blur-[1px] timeline-asset-ghost"
              style={{
                left: (TimelineConfig.TRACK_LABEL_WIDTH + TimeConverter.msToPixels(dragTime, pixelsPerMs)) + 'px',
                top: bounds.clipY + 'px',
                width: Math.max(TimelineConfig.MIN_CLIP_WIDTH, TimeConverter.msToPixels(draggingAsset.metadata?.duration || 5000, pixelsPerMs)) + 'px',
                height: bounds.clipHeight + 'px',
              }}
            >
              {/* Thumbnail if available */}
              {draggingAsset.type === 'image' || draggingAsset.type === 'video' ? (
                <div className="w-full h-full opacity-50 relative">
                  {/* We can't easily load video thumb here synchronously, but we can try image source */}
                  {(draggingAsset.type === 'image' && draggingAsset.path) ? (
                    <img
                      src={draggingAsset.path.startsWith('/')
                        ? `video-stream://local/${encodeURIComponent(draggingAsset.path)}`
                        : draggingAsset.path}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/20">
                      <span className="text-xs text-white/70 truncate px-2">{draggingAsset.name}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-xs text-white/70 truncate px-2">{draggingAsset.name}</span>
                </div>
              )}
            </div>
          )
        })()}

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
    </div >
  )
}
