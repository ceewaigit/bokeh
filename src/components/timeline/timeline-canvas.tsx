'use client'

import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { Stage, Layer, Rect, Group, Text } from 'react-konva'
import { useProjectStore } from '@/stores/project-store'
import { useShallow } from 'zustand/react/shallow'
import { cn, clamp } from '@/lib/utils'
import type { Project, ZoomBlock, ZoomEffectData, Effect } from '@/types/project'
import { EffectType, TrackType, TimelineTrackType } from '@/types/project'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { PluginRegistry } from '@/lib/effects/config/plugin-registry'

// Sub-components
import { TimelineRuler } from './timeline-ruler'
import { TimelineClip } from './timeline-clip'
import { TimelineTrack } from './timeline-track'
import { TimelinePlayhead } from './timeline-playhead'
import { SpeedUpSuggestionPopover } from './speed-up-suggestion-popover'
import { TimelineControls } from './timeline-controls'
import { TimelineContextMenu } from './timeline-context-menu'
import { TimelineEffectBlock } from './timeline-effect-block'
import { EffectLayerType, type SelectedEffectLayer } from '@/types/effects'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { ActivityDetectionService } from '@/lib/timeline/activity-detection/detection-service'
import { useWindowAppearanceStore } from '@/stores/window-appearance-store'
import { ApplySpeedUpCommand } from '@/lib/commands/timeline/ApplySpeedUpCommand'
import { ApplyAllSpeedUpsCommand } from '@/lib/commands/timeline/ApplyAllSpeedUpsCommand'

// Utilities
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { useCommandKeyboard } from '@/hooks/use-command-keyboard'
import { useTimelinePlayback } from '@/hooks/use-timeline-playback'
import { useTimelineColors } from '@/lib/timeline/colors'
import { useTimelineMetadata } from '@/hooks/useTimelineMetadata'

// Commands
import {
  CommandManager,
  DefaultCommandContext,
  UpdateClipCommand,
  RemoveClipCommand,
  SplitClipCommand,
  DuplicateClipCommand,
  TrimCommand,
  CopyCommand,
  CutCommand,
  PasteCommand,
  ChangePlaybackRateCommand
} from '@/lib/commands'

interface TimelineCanvasProps {
  className?: string
  currentProject: Project | null
  zoom: number
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onClipSelect?: (clipId: string) => void
  onZoomChange: (zoom: number) => void
  onZoomBlockUpdate?: (blockId: string, updates: Partial<ZoomBlock>) => void
}

export function TimelineCanvas({
  className = "h-full w-full",
  currentProject,
  zoom,
  onPlay,
  onPause,
  onSeek,
  onClipSelect,
  onZoomChange,
  onZoomBlockUpdate
}: TimelineCanvasProps) {
  // PERFORMANCE: Subscribe directly to avoid WorkspaceManager re-renders every frame
  const currentTime = useProjectStore((s) => s.currentTime)
  const isPlaying = useProjectStore((s) => s.isPlaying)

  const {
    selectedClips,
    selectedEffectLayer,
    selectClip,
    selectEffectLayer,
    clearEffectSelection,
    removeClip,
    updateClip,
    updateEffect,
    clearSelection,
    splitClip,
    duplicateClip,
  } = useProjectStore(
    useShallow((s) => ({
      selectedClips: s.selectedClips,
      selectedEffectLayer: s.selectedEffectLayer,
      selectClip: s.selectClip,
      selectEffectLayer: s.selectEffectLayer,
      clearEffectSelection: s.clearEffectSelection,
      removeClip: s.removeClip,
      updateClip: s.updateClip,
      updateEffect: s.updateEffect,
      clearSelection: s.clearSelection,
      splitClip: s.splitClip,
      duplicateClip: s.duplicateClip,
    }))
  )
  const showTypingSuggestions = useProjectStore((s) => s.settings.showTypingSuggestions)

  const [stageSize, setStageSize] = useState({ width: 800, height: 400 })
  const [scrollLeft, setScrollLeft] = useState(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null)
  const [speedUpPopover, setSpeedUpPopover] = useState<{
    x: number
    y: number
    period: SpeedUpPeriod
    allTypingPeriods: SpeedUpPeriod[]
    allIdlePeriods: SpeedUpPeriod[]
    clipId: string
  } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const colors = useTimelineColors()
  const windowSurfaceMode = useWindowAppearanceStore((s) => s.mode)
  const windowSurfaceOpacity = useWindowAppearanceStore((s) => s.opacity)

  // Force re-render when theme changes by using colors as part of key
  const themeKey = React.useMemo(() => {
    // Create a simple hash from primary color to detect theme changes
    return colors.primary + colors.background + windowSurfaceMode + windowSurfaceOpacity
  }, [colors.primary, colors.background, windowSurfaceMode, windowSurfaceOpacity])

  // Calculate timeline dimensions
  const duration = currentProject?.timeline?.duration || 10000
  const pixelsPerMs = TimeConverter.calculatePixelsPerMs(stageSize.width, zoom)
  const timelineWidth = TimeConverter.calculateTimelineWidth(duration, pixelsPerMs, stageSize.width)

  const timelineEffects = currentProject?.timeline.effects || []

  const allZoomEffects = useMemo(
    () => EffectsFactory.getZoomEffects(timelineEffects),
    [timelineEffects]
  )

  const allScreenEffects = useMemo(
    () => EffectsFactory.getScreenEffects(timelineEffects),
    [timelineEffects]
  )

  const allKeystrokeEffects = useMemo(
    () => timelineEffects.filter((e) => e.type === EffectType.Keystroke),
    [timelineEffects]
  )

  const allPluginEffects = useMemo(
    () => EffectsFactory.getAllPluginEffects(timelineEffects),
    [timelineEffects]
  )

  // Show individual effect tracks based on their effects
  const hasZoomEffects = allZoomEffects.length > 0
  const hasScreenEffects = allScreenEffects.length > 0
  const zoomTrackExists = hasZoomEffects
  const screenTrackExists = hasScreenEffects

  // Determine if any zoom block is enabled
  const isZoomEnabled = useMemo(
    () => allZoomEffects.some(e => e.enabled),
    [allZoomEffects]
  )

  // Calculate adaptive zoom limits based on zoom blocks and timeline duration
  const adaptiveZoomLimits = React.useMemo(() => {
    const zoomBlocks = allZoomEffects.map(e => ({
      startTime: e.startTime,
      endTime: e.endTime
    }))
    return TimeConverter.calculateAdaptiveZoomLimits(
      duration,
      stageSize.width,
      zoomBlocks,
      TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX
    )
  }, [allZoomEffects, duration, stageSize.width])

  // Show keystroke track if keystrokes exist in metadata OR any keystroke effect exists.
  // This ensures the UI exposes the keystroke lane/toggle even if the effect is disabled or missing.
  const hasAnyKeyboardEvents = useMemo(
    () => (currentProject?.recordings || []).some((r) => (r.metadata?.keyboardEvents?.length ?? 0) > 0),
    [currentProject?.recordings]
  )
  const hasAnyKeystrokeEffect = allKeystrokeEffects.length > 0
  const hasKeystrokeTrack = hasAnyKeystrokeEffect || hasAnyKeyboardEvents

  // Show plugin track if any plugin effects exist
  const hasPluginTrack = allPluginEffects.length > 0

  // Memoize video/audio tracks lookup
  const videoTrack = useMemo(
    () => currentProject?.timeline.tracks.find(t => t.type === TrackType.Video),
    [currentProject?.timeline.tracks]
  )
  const audioTrack = useMemo(
    () => currentProject?.timeline.tracks.find(t => t.type === TrackType.Audio),
    [currentProject?.timeline.tracks]
  )
  const videoClips = useMemo(() => videoTrack?.clips || [], [videoTrack])
  const audioClips = useMemo(() => audioTrack?.clips || [], [audioTrack])

  // Memoize block arrays for snapping/overlap detection
  const allZoomBlocksInTimelineSpace = useMemo(
    () => allZoomEffects.map(e => ({
      id: e.id,
      startTime: e.startTime,
      endTime: e.endTime,
      scale: (e.data as ZoomEffectData).scale,
      targetX: (e.data as ZoomEffectData).targetX,
      targetY: (e.data as ZoomEffectData).targetY,
      introMs: (e.data as ZoomEffectData).introMs,
      outroMs: (e.data as ZoomEffectData).outroMs,
    })),
    [allZoomEffects]
  )

  const allScreenBlocksData = useMemo(
    () => allScreenEffects.map((e) => ({
      id: e.id,
      startTime: e.startTime,
      endTime: e.endTime,
    })),
    [allScreenEffects]
  )

  const allKeystrokeBlocksData = useMemo(
    () => allKeystrokeEffects.map((e) => {
      const startTime = Math.max(0, e.startTime)
      const endTime = Math.min(duration, e.endTime)
      return { id: e.id, startTime, endTime }
    }),
    [allKeystrokeEffects, duration]
  )

  const allPluginBlocksData = useMemo(
    () => allPluginEffects.map((e) => {
      const startTime = Math.max(0, e.startTime)
      const endTime = Math.min(duration, e.endTime)
      return { id: e.id, startTime, endTime }
    }),
    [allPluginEffects, duration]
  )

  // Check if any clips have ACTUAL speed-up suggestions to display
  // Uses the detection service to get real suggestion counts (not just events existing)
  const hasSpeedUpSuggestions = React.useMemo(() => {
    if (!currentProject) return { typing: false, idle: false }

    const videoTrack = currentProject.timeline.tracks.find(t => t.type === TrackType.Video)
    if (!videoTrack) return { typing: false, idle: false }

    let hasTyping = false
    let hasIdle = false

    for (const clip of videoTrack.clips) {
      const recording = currentProject.recordings.find(r => r.id === clip.recordingId)
      if (!recording) continue

      // Use the detection service to get actual suggestions (respects thresholds)
      const suggestions = ActivityDetectionService.getSuggestionsForClip(recording, clip)

      if (suggestions.typing.length > 0) hasTyping = true
      if (suggestions.idle.length > 0) hasIdle = true

      if (hasTyping && hasIdle) break // Found both, no need to continue
    }

    return { typing: hasTyping, idle: hasIdle }
  }, [currentProject])

  // Calculate track heights based on number of tracks - memoized to avoid recalculation on every render
  const trackHeights = useMemo(() => {
    const rulerHeight = TimelineConfig.RULER_HEIGHT

    // Calculate space needed for speed-up bars (single row layout - always 32px)
    const hasSuggestions = hasSpeedUpSuggestions.typing || hasSpeedUpSuggestions.idle
    const speedUpBarSpace = (showTypingSuggestions && hasSuggestions) ? 32 : 0

    const remainingHeight = stageSize.height - rulerHeight
    const totalTracks = 2 + (zoomTrackExists ? 1 : 0) + (screenTrackExists ? 1 : 0) + (hasKeystrokeTrack ? 1 : 0) + (hasPluginTrack ? 1 : 0)

    // Define height ratios for different track configurations
    const heightRatios: Record<number, { video: number; audio: number; zoom?: number; screen?: number; keystroke?: number; plugin?: number }> = {
      2: { video: 0.45, audio: 0.55 },
      3: { video: 0.35, audio: 0.35, zoom: 0.3, screen: 0.3, keystroke: 0.3, plugin: 0.3 },
      4: { video: 0.3, audio: 0.3, zoom: 0.2, screen: 0.2, keystroke: 0.2, plugin: 0.2 },
      5: { video: 0.25, audio: 0.25, zoom: 0.18, screen: 0.18, keystroke: 0.14, plugin: 0.14 },
      6: { video: 0.22, audio: 0.22, zoom: 0.15, screen: 0.15, keystroke: 0.13, plugin: 0.13 }
    }

    const ratios = heightRatios[totalTracks] || heightRatios[2]

    // Calculate raw heights based on ratios
    const rawVideoHeight = Math.floor(remainingHeight * ratios.video)
    const rawAudioHeight = Math.floor(remainingHeight * ratios.audio)
    const rawZoomHeight = zoomTrackExists ? Math.floor(remainingHeight * (ratios.zoom || 0)) : 0
    const rawScreenHeight = screenTrackExists ? Math.floor(remainingHeight * (ratios.screen || 0)) : 0
    const rawKeystrokeHeight = hasKeystrokeTrack ? Math.floor(remainingHeight * (ratios.keystroke || 0)) : 0
    const rawPluginHeight = hasPluginTrack ? Math.floor(remainingHeight * (ratios.plugin || 0)) : 0

    // Cap heights at MAX_TRACK_HEIGHT
    return {
      ruler: rulerHeight,
      speedUpBarSpace, // Export this for clip positioning
      video: Math.min(rawVideoHeight, TimelineConfig.MAX_TRACK_HEIGHT),
      audio: Math.min(rawAudioHeight, TimelineConfig.MAX_TRACK_HEIGHT),
      zoom: Math.min(rawZoomHeight, TimelineConfig.MAX_TRACK_HEIGHT),
      screen: Math.min(rawScreenHeight, TimelineConfig.MAX_TRACK_HEIGHT),
      keystroke: Math.min(rawKeystrokeHeight, TimelineConfig.MAX_TRACK_HEIGHT),
      plugin: Math.min(rawPluginHeight, TimelineConfig.MAX_TRACK_HEIGHT)
    }
  }, [stageSize.height, zoomTrackExists, screenTrackExists, hasKeystrokeTrack, hasPluginTrack, showTypingSuggestions, hasSpeedUpSuggestions.typing, hasSpeedUpSuggestions.idle])
  const rulerHeight = trackHeights.ruler
  const speedUpBarSpace = trackHeights.speedUpBarSpace
  const videoTrackHeight = trackHeights.video
  const audioTrackHeight = trackHeights.audio
  const zoomTrackHeight = trackHeights.zoom
  const screenTrackHeight = trackHeights.screen
  const keystrokeTrackHeight = trackHeights.keystroke
  const pluginTrackHeight = trackHeights.plugin
  const stageWidth = Math.max(timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH, stageSize.width)

  // Initialize command manager
  const commandManagerRef = useRef<CommandManager | null>(null)

  useEffect(() => {
    const ctx = new DefaultCommandContext(useProjectStore)
    commandManagerRef.current = CommandManager.getInstance(ctx)
  }, [])

  // Use command-based keyboard shortcuts for editing operations (copy, cut, paste, delete, etc.)
  useCommandKeyboard({ enabled: true })

  // Use playback-specific keyboard shortcuts (play, pause, seek, shuttle, etc.)
  useTimelinePlayback({ enabled: true })

  // Handle window resize with debouncing to prevent excessive re-renders
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setStageSize({ width: rect.width, height: rect.height })
      }
    }

    const debouncedUpdateSize = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(updateSize, 100) // 100ms debounce
    }

    updateSize() // Initial size
    window.addEventListener('resize', debouncedUpdateSize)

    return () => {
      window.removeEventListener('resize', debouncedUpdateSize)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  // Auto-scroll during playback
  useEffect(() => {
    if (!isPlaying || !containerRef.current) return
    const playheadX = TimeConverter.msToPixels(currentTime, pixelsPerMs)
    const container = containerRef.current
    const scrollWidth = container.scrollWidth - container.clientWidth

    if (playheadX > scrollLeft + stageSize.width - 100) {
      const newScroll = Math.min(scrollWidth, playheadX - 100)
      container.scrollLeft = newScroll
      setScrollLeft(newScroll)
    }
  }, [currentTime, isPlaying, pixelsPerMs, scrollLeft, stageSize.width])

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

  const handleReorderClip = useCallback((clipId: string, newIndex: number) => {
    useProjectStore.getState().reorderClip(clipId, newIndex)
  }, [])

  // Handle popover actions for speed-up suggestions
  const handleApplySpeedUp = useCallback(async (period: SpeedUpPeriod, clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return

    const context = new DefaultCommandContext(useProjectStore)
    const command = new ApplySpeedUpCommand(context, clipId, [period], [period.type])
    await manager.execute(command)
    setSpeedUpPopover(null)
  }, [])

  const handleApplyAllSpeedUps = useCallback(async () => {
    const manager = commandManagerRef.current
    if (!manager) return

    const context = new DefaultCommandContext(useProjectStore)
    const command = new ApplyAllSpeedUpsCommand(context, { applyTyping: true, applyIdle: true })
    await manager.execute(command)
    setSpeedUpPopover(null)
  }, [])

  // Handle clip drag using command pattern
  const handleClipDragEnd = useCallback(async (clipId: string, newStartTime: number) => {
    const manager = commandManagerRef.current
    if (!manager) return

    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new UpdateClipCommand(
      freshContext,
      clipId,
      { startTime: newStartTime }
    )
    await manager.execute(command)

    // Keep selection on the moved clip so UI/playhead stay in sync
    selectClip(clipId)
  }, [selectClip])

  // Handle control actions using command pattern
  const handleSplit = useCallback(async () => {
    const manager = commandManagerRef.current
    if (selectedClips.length === 1 && manager) {
      const freshContext = new DefaultCommandContext(useProjectStore)
      const command = new SplitClipCommand(
        freshContext,
        selectedClips[0],
        currentTime
      )
      await manager.execute(command)
    }
  }, [selectedClips, currentTime])

  const handleTrimStart = useCallback(async () => {
    const manager = commandManagerRef.current
    if (selectedClips.length === 1 && manager) {
      const freshContext = new DefaultCommandContext(useProjectStore)
      const command = new TrimCommand(
        freshContext,
        selectedClips[0],
        currentTime,
        'start'
      )
      await manager.execute(command)
    }
  }, [selectedClips, currentTime])

  const handleTrimEnd = useCallback(async () => {
    const manager = commandManagerRef.current
    if (selectedClips.length === 1 && manager) {
      const freshContext = new DefaultCommandContext(useProjectStore)
      const command = new TrimCommand(
        freshContext,
        selectedClips[0],
        currentTime,
        'end'
      )
      await manager.execute(command)
    }
  }, [selectedClips, currentTime])

  const handleDelete = useCallback(async () => {
    const manager = commandManagerRef.current
    if (!manager) return

    // Begin group for multiple deletions
    if (selectedClips.length > 1) {
      manager.beginGroup(`delete-${Date.now()}`)
    }

    for (const clipId of selectedClips) {
      const freshContext = new DefaultCommandContext(useProjectStore)
      const command = new RemoveClipCommand(freshContext, clipId)
      await manager.execute(command)
    }

    if (selectedClips.length > 1) {
      await manager.endGroup()
    }

    clearSelection()
  }, [selectedClips, clearSelection])

  const handleDuplicate = useCallback(async () => {
    const manager = commandManagerRef.current
    if (selectedClips.length === 1 && manager) {
      const freshContext = new DefaultCommandContext(useProjectStore)
      const command = new DuplicateClipCommand(
        freshContext,
        selectedClips[0]
      )
      await manager.execute(command)
    }
  }, [selectedClips])

  // Context menu wrappers - reuse existing handlers
  const handleClipSplit = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new SplitClipCommand(freshContext, clipId, currentTime)
    await manager.execute(command)
  }, [currentTime])

  const handleClipTrimStart = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new TrimCommand(freshContext, clipId, currentTime, 'start')
    await manager.execute(command)
  }, [currentTime])

  const handleClipTrimEnd = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new TrimCommand(freshContext, clipId, currentTime, 'end')
    await manager.execute(command)
  }, [currentTime])

  const handleClipDuplicate = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new DuplicateClipCommand(freshContext, clipId)
    await manager.execute(command)
  }, [])

  const handleClipCopy = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new CopyCommand(freshContext, clipId)
    await manager.execute(command)
  }, [])

  const handleClipCut = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new CutCommand(freshContext, clipId)
    await manager.execute(command)
  }, [])

  const handlePaste = useCallback(async () => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new PasteCommand(freshContext, currentTime)
    await manager.execute(command)
  }, [currentTime])

  const handleClipDelete = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new RemoveClipCommand(freshContext, clipId)
    await manager.execute(command)
  }, [])

  const handleClipSpeedUp = useCallback(async (clipId: string) => {
    selectClip(clipId) // Ensure UI syncs
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new ChangePlaybackRateCommand(freshContext, clipId, 2.0)
    await manager.execute(command)
  }, [selectClip])

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

  // The timeline panel already sits on a `.window-surface`; avoid painting an extra opaque canvas layer in glass modes.
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
        fps={useTimelineMetadata(currentProject)?.fps || 60}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden relative bg-transparent select-none outline-none focus:outline-none"
        tabIndex={0}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        onWheel={(e) => {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            const zoomDelta = -e.deltaY * 0.001 // Invert direction and scale
            const newZoom = Math.min(Math.max(zoom + zoomDelta, adaptiveZoomLimits.min), adaptiveZoomLimits.max)
            onZoomChange(newZoom)
          }
        }}
        onMouseDown={() => {
          // Ensure container maintains focus for keyboard events
          containerRef.current?.focus()
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
          height={stageSize.height}
          onMouseDown={handleStageClick}
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
              height={stageSize.height}
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
              y={rulerHeight}
              width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
              height={videoTrackHeight}
            />

            {zoomTrackExists && (
              <TimelineTrack
                type={TimelineTrackType.Zoom}
                y={rulerHeight + videoTrackHeight}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={zoomTrackHeight}
                muted={!isZoomEnabled}
              />
            )}

            {screenTrackExists && (
              <TimelineTrack
                type={TimelineTrackType.Screen}
                y={rulerHeight + videoTrackHeight + zoomTrackHeight}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={screenTrackHeight}
              />
            )}

            {hasKeystrokeTrack && (
              <TimelineTrack
                type={TimelineTrackType.Keystroke}
                y={rulerHeight + videoTrackHeight + zoomTrackHeight + screenTrackHeight}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={keystrokeTrackHeight}
              />
            )}

            {hasPluginTrack && (
              <TimelineTrack
                type={TimelineTrackType.Plugin}
                y={rulerHeight + videoTrackHeight + zoomTrackHeight + screenTrackHeight + keystrokeTrackHeight}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={pluginTrackHeight}
              />
            )}

            <TimelineTrack
              type={TimelineTrackType.Audio}
              y={rulerHeight + videoTrackHeight + zoomTrackHeight + screenTrackHeight + keystrokeTrackHeight + pluginTrackHeight}
              width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
              height={audioTrackHeight}
            />
          </Layer>

          {/* Ruler Layer */}
          <Layer>
            <TimelineRuler
              duration={currentProject.timeline.duration}
              stageWidth={stageWidth}
              zoom={zoom}
              pixelsPerMs={pixelsPerMs}
              onSeek={onSeek}
            />
          </Layer>

          {/* Clips Layer */}
          <Layer>
            {/* Video clips - Uses memoized videoClips */}
            {videoClips.map((clip, index) => {
              const recording = currentProject.recordings.find(r => r.id === clip.recordingId)
              // Merge effects from recording (zoom) and timeline (global)
              const recordingEffects = recording?.effects || []
              const clipEffects = [...recordingEffects, ...timelineEffects]

              return (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  recording={recording}
                  trackType={TrackType.Video}
                  trackY={rulerHeight}
                  trackHeight={videoTrackHeight}
                  speedUpBarSpace={speedUpBarSpace}
                  pixelsPerMs={pixelsPerMs}
                  isSelected={selectedClips.includes(clip.id)}
                  selectedEffectType={selectedClips.includes(clip.id) ? (selectedEffectLayer?.type === EffectLayerType.Screen ? null : selectedEffectLayer?.type) : null}
                  otherClipsInTrack={videoClips}
                  clipEffects={clipEffects}
                  onSelect={handleClipSelect}
                  onReorderClip={handleReorderClip}
                  onSelectEffect={(type) => {
                    selectEffectLayer(type)
                  }}
                  onDragEnd={handleClipDragEnd}
                  onContextMenu={handleClipContextMenu}
                  onOpenSpeedUpSuggestion={(opts) => setSpeedUpPopover({ ...opts, clipId: clip.id })}
                />
              )
            })}

            {/* Zoom blocks - SIMPLIFIED: All zoom effects are now in timeline-space */}
            {zoomTrackExists && (() => {
              // Render each zoom effect as a block on the timeline
              const zoomBlocks = allZoomEffects.map((effect) => {
                const isBlockSelected = selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer?.id === effect.id
                const zoomData = effect.data as ZoomEffectData
                const isFillZoom = zoomData.autoScale === 'fill'

                // Use effect times directly (already in timeline-space)
                const timelineStartTime = effect.startTime
                const timelineEndTime = effect.endTime

                // Calculate width with minimum visual constraint
                const calculatedWidth = TimeConverter.msToPixels(timelineEndTime - timelineStartTime, pixelsPerMs)
                const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
                const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

                const blockElement = (
                  <TimelineEffectBlock
                    key={effect.id}
                    blockId={effect.id}
                    x={TimeConverter.msToPixels(timelineStartTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                    y={rulerHeight + videoTrackHeight + TimelineConfig.TRACK_PADDING}
                    width={visualWidth}
                    height={zoomTrackHeight - TimelineConfig.TRACK_PADDING * 2}
                    isCompact={isCompact}
                    startTime={timelineStartTime}
                    endTime={timelineEndTime}
                    label={isFillZoom ? 'Fill' : `${zoomData.scale.toFixed(1)}×`}
                    fillColor={colors.zoomBlock}
                    scale={isFillZoom ? undefined : zoomData.scale}
                    introMs={zoomData.introMs}
                    outroMs={zoomData.outroMs}
                    isSelected={isBlockSelected}
                    isEnabled={effect.enabled}
                    allBlocks={allZoomBlocksInTimelineSpace}
                    pixelsPerMs={pixelsPerMs}
                    onSelect={() => {
                      if (isBlockSelected) {
                        clearEffectSelection()
                      } else {
                        selectEffectLayer(EffectLayerType.Zoom, effect.id)
                      }
                      setTimeout(() => {
                        containerRef.current?.focus()
                      }, 0)
                    }}
                    onUpdate={(updates) => {
                      // All updates are in timeline-space, pass through directly
                      onZoomBlockUpdate?.(effect.id, updates)
                    }}
                  />
                )
                return blockElement
              })

              return (
                <>
                  {zoomBlocks}
                </>
              )
            })()}

            {/* Screen Effects blocks - rendered in dedicated Screen track */}
            {screenTrackExists && (() => {
              if (allScreenEffects.length === 0) return null

              // Render in the dedicated Screen track (below zoom track)
              const yBase = rulerHeight + videoTrackHeight + zoomTrackHeight + TimelineConfig.TRACK_PADDING

              const screenBlocks = allScreenEffects.map((effect) => {
                const isBlockSelected =
                  selectedEffectLayer?.type === EffectLayerType.Screen && selectedEffectLayer?.id === effect.id

                const calculatedWidth = TimeConverter.msToPixels(effect.endTime - effect.startTime, pixelsPerMs)
                const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
                const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

                // Get screen effect data for intro/outro
                const screenData = EffectsFactory.getScreenData(effect)

                const blockElement = (
                  <TimelineEffectBlock
                    key={effect.id}
                    blockId={effect.id}
                    x={TimeConverter.msToPixels(effect.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                    y={yBase}
                    width={visualWidth}
                    height={screenTrackHeight - TimelineConfig.TRACK_PADDING * 2}
                    isCompact={isCompact}
                    startTime={effect.startTime}
                    endTime={effect.endTime}
                    label={'3D'}
                    fillColor={colors.screenBlock}
                    scale={1.3}  // Use a fixed scale to show the intro/outro curve
                    introMs={screenData?.introMs ?? 400}
                    outroMs={screenData?.outroMs ?? 400}
                    isSelected={isBlockSelected}
                    isEnabled={effect.enabled}
                    allBlocks={allScreenBlocksData}
                    pixelsPerMs={pixelsPerMs}
                    onSelect={() => {
                      if (isBlockSelected) {
                        clearEffectSelection()
                      } else {
                        selectEffectLayer(EffectLayerType.Screen, effect.id)
                      }
                      setTimeout(() => {
                        containerRef.current?.focus()
                      }, 0)
                    }}
                    onUpdate={(updates) => updateEffect(effect.id, updates)}
                  />
                )
                return blockElement
              })

              return (
                <>
                  {screenBlocks}
                </>
              )
            })()}

            {/* Keystroke blocks - rendered in dedicated Keystroke track */}
            {hasKeystrokeTrack && (() => {
              if (allKeystrokeEffects.length === 0) return null

              const yBase = rulerHeight + videoTrackHeight + zoomTrackHeight + screenTrackHeight + TimelineConfig.TRACK_PADDING

              const blocks = allKeystrokeEffects.map((effect) => {
                const isBlockSelected =
                  selectedEffectLayer?.type === EffectLayerType.Keystroke && selectedEffectLayer?.id === effect.id

                const startTime = Math.max(0, effect.startTime)
                const endTime = Math.min(currentProject.timeline.duration, effect.endTime)

                const calculatedWidth = TimeConverter.msToPixels(endTime - startTime, pixelsPerMs)
                const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
                const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

                const blockElement = (
                  <TimelineEffectBlock
                    key={effect.id}
                    blockId={effect.id}
                    x={TimeConverter.msToPixels(startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                    y={yBase}
                    width={visualWidth}
                    height={keystrokeTrackHeight - TimelineConfig.TRACK_PADDING * 2}
                    isCompact={isCompact}
                    startTime={startTime}
                    endTime={endTime}
                    label={'Keys'}
                    fillColor={colors.warning}
                    isSelected={isBlockSelected}
                    isEnabled={effect.enabled}
                    allBlocks={allKeystrokeBlocksData}
                    pixelsPerMs={pixelsPerMs}
                    onSelect={() => {
                      if (isBlockSelected) {
                        clearEffectSelection()
                      } else {
                        selectEffectLayer(EffectLayerType.Keystroke, effect.id)
                      }
                      setTimeout(() => {
                        containerRef.current?.focus()
                      }, 0)
                    }}
                    onUpdate={(updates) => updateEffect(effect.id, updates)}
                  />
                )
                return blockElement
              })

              return (
                <>
                  {blocks}
                </>
              )
            })()}

            {/* Plugin blocks - rendered in dedicated Plugin track */}
            {hasPluginTrack && (() => {
              if (allPluginEffects.length === 0) return null

              const yBase = rulerHeight + videoTrackHeight + zoomTrackHeight + screenTrackHeight + keystrokeTrackHeight + TimelineConfig.TRACK_PADDING

              const blocks = allPluginEffects.map((effect) => {
                const isBlockSelected =
                  selectedEffectLayer?.type === EffectLayerType.Plugin && selectedEffectLayer?.id === effect.id

                const startTime = Math.max(0, effect.startTime)
                const endTime = Math.min(currentProject.timeline.duration, effect.endTime)

                const calculatedWidth = TimeConverter.msToPixels(endTime - startTime, pixelsPerMs)
                const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
                const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

                // Get plugin name from registry for label
                const pluginData = EffectsFactory.getPluginData(effect)
                const plugin = pluginData ? PluginRegistry.get(pluginData.pluginId) : null
                const label = plugin?.name?.slice(0, 8) || 'Plugin'

                const blockElement = (
                  <TimelineEffectBlock
                    key={effect.id}
                    blockId={effect.id}
                    x={TimeConverter.msToPixels(startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                    y={yBase}
                    width={visualWidth}
                    height={pluginTrackHeight - TimelineConfig.TRACK_PADDING * 2}
                    isCompact={isCompact}
                    startTime={startTime}
                    endTime={endTime}
                    label={label}
                    fillColor={colors.primary}
                    isSelected={isBlockSelected}
                    isEnabled={effect.enabled}
                    allBlocks={allPluginBlocksData}
                    pixelsPerMs={pixelsPerMs}
                    onSelect={() => {
                      if (isBlockSelected) {
                        clearEffectSelection()
                      } else {
                        selectEffectLayer(EffectLayerType.Plugin, effect.id)
                      }
                      setTimeout(() => {
                        containerRef.current?.focus()
                      }, 0)
                    }}
                    onUpdate={(updates) => updateEffect(effect.id, updates)}
                  />
                )
                return blockElement
              })

              return (
                <>
                  {blocks}
                </>
              )
            })()}

            {audioClips.map(clip => (
              <TimelineClip
                key={clip.id}
                clip={clip}
                trackType={TrackType.Audio}
                trackY={rulerHeight + videoTrackHeight + zoomTrackHeight + screenTrackHeight + keystrokeTrackHeight + pluginTrackHeight}
                trackHeight={audioTrackHeight}
                pixelsPerMs={pixelsPerMs}
                isSelected={selectedClips.includes(clip.id)}
                otherClipsInTrack={audioClips}
                onSelect={handleClipSelect}
                onReorderClip={handleReorderClip}
                onDragEnd={handleClipDragEnd}
                onContextMenu={handleClipContextMenu}
              />
            ))}
          </Layer>

          {/* Playhead Layer */}
          <Layer>
            <TimelinePlayhead
              currentTime={currentTime}
              totalHeight={stageSize.height}
              pixelsPerMs={pixelsPerMs}
              timelineWidth={timelineWidth}
              maxTime={currentProject.timeline.duration}
              onSeek={onSeek}
              isPlaying={isPlaying}
              onPause={onPause}
              onPlay={onPlay}
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
  )
}
