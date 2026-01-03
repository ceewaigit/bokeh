import React from 'react'
import { motion } from 'framer-motion'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

const springConfig = { type: 'spring', stiffness: 520, damping: 28 } as const

const MotionButton = motion.create(Button)
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/shared/utils/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { formatTimecode } from '@/shared/utils/time'
import { useTimelineLayout } from './timeline-layout-provider'
import { useTimelineContext } from './TimelineContext'
import { TimelineTrackType } from '@/types/project'
import { useProjectStore } from '@/features/stores/project-store'
import { useWorkspaceStore } from '@/features/stores/workspace-store'
import { DEFAULT_PROJECT_SETTINGS } from '@/features/settings/defaults'
import { useTimelineMetadata } from '@/features/timeline/hooks/use-timeline-metadata'
import { useSelectedClipIds } from '@/features/stores/selectors/clip-selectors'
import { timeObserver } from '@/features/timeline/time/time-observer'
import { useTimelinePlayback } from '@/features/timeline/hooks/use-timeline-playback'
import {
  Scissors,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Trash2,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  Monitor,
  Eye,
  Volume2,
  VolumeX,
  ZoomIn,
} from 'lucide-react'

// Track labels for dropdown display
const TRACK_LABELS: Record<TimelineTrackType, string> = {
  [TimelineTrackType.Video]: 'Video',
  [TimelineTrackType.Audio]: 'Audio',
  [TimelineTrackType.Webcam]: 'Webcam',
  [TimelineTrackType.Zoom]: 'Zoom',
  [TimelineTrackType.Screen]: 'Screen',
  [TimelineTrackType.Keystroke]: 'Keystrokes',
  [TimelineTrackType.Plugin]: 'Plugins',
  [TimelineTrackType.Annotation]: 'Overlay',
}

// Minimal visibility dropdown - Apple-esque design
function TrackVisibilityDropdown() {
  const {
    visibleTracks,
    toggleTrackVisibility,
    hasZoomTrack,
    hasScreenTrack,
    hasKeystrokeTrack,
    hasPluginTrack,
    hasAnnotationTrack
  } = useTimelineLayout()

  // Only show tracks that exist or are always available
  const availableTracks = [
    TimelineTrackType.Video,
    TimelineTrackType.Audio,
    TimelineTrackType.Webcam,
    ...(hasZoomTrack ? [TimelineTrackType.Zoom] : []),
    ...(hasScreenTrack ? [TimelineTrackType.Screen] : []),
    ...(hasKeystrokeTrack ? [TimelineTrackType.Keystroke] : []),
    ...(hasPluginTrack ? [TimelineTrackType.Plugin] : []),
    ...(hasAnnotationTrack ? [TimelineTrackType.Annotation] : []),
  ]

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <MotionButton
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 rounded-full"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={springConfig}
            >
              <Eye className="w-4 h-4" />
            </MotionButton>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          <span>Visible tracks</span>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        <DropdownMenuLabel className="text-2xs text-muted-foreground font-medium">
          Tracks
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableTracks.map((track) => (
          <DropdownMenuCheckboxItem
            key={track}
            checked={visibleTracks.has(track)}
            onCheckedChange={() => toggleTrackVisibility(track)}
            className="text-xs"
          >
            {TRACK_LABELS[track]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface TimelineControlsProps {
  minZoom: number
  maxZoom: number
}

export const TimelineControls = React.memo(({ minZoom, maxZoom }: TimelineControlsProps) => {
  const {
    onZoomChange,
    onSplitSelected,
    onTrimStartSelected,
    onTrimEndSelected,
    onDeleteSelected,
    onDuplicateSelected,
  } = useTimelineContext()
  const { zoom, duration } = useTimelineLayout()
  const currentProject = useProjectStore((s) => s.currentProject)

  // Use the unified playback hook (disabled because we don't want duplicate keyboard listeners here)
  const {
    playPause,
    jumpBackward1s,
    jumpForward1s
  } = useTimelinePlayback({ enabled: false })

  // DECOUPLED: Use timeObserver for timecode display (updates at 60fps)
  const [displayTime, setDisplayTime] = React.useState(() => timeObserver.getTime())
  React.useEffect(() => {
    return timeObserver.subscribe(setDisplayTime)
  }, [])

  const isPlaying = useProjectStore((s) => s.isPlaying)
  const selectedClips = useSelectedClipIds()
  const previewScale = useWorkspaceStore((s) => s.previewScale)
  const setPreviewScale = useWorkspaceStore((s) => s.setPreviewScale)
  const fps = useTimelineMetadata(currentProject)?.fps || 60
  const hasSelection = selectedClips.length > 0
  const hasSingleSelection = selectedClips.length === 1
  const audio = useProjectStore((s) => s.currentProject?.settings.audio ?? DEFAULT_PROJECT_SETTINGS.audio)
  const setAudioSettings = useProjectStore((s) => s.setAudioSettings)
  const { volume, muted } = audio
  const [hoveredControl, setHoveredControl] = React.useState<'volume' | 'preview' | 'zoom' | null>(null)

  const getSliderWrapperStyle = (id: 'volume' | 'preview' | 'zoom', targetWidth: string, defaultExpanded = false) => {
    const isExpanded = hoveredControl === id || (defaultExpanded && hoveredControl === null)
    return {
      width: isExpanded ? targetWidth : '0px',
      opacity: isExpanded ? 1 : 0,
      transform: isExpanded ? 'translateX(0)' : 'translateX(-5px)',
      pointerEvents: isExpanded ? 'auto' : 'none',
      overflow: 'hidden',
      paddingLeft: isExpanded ? '0.625rem' : '0px',
      paddingRight: isExpanded ? '0.625rem' : '0px',
      height: '1.5rem', // h-6 (24px) sufficient for 16px thumb + shadow
      display: 'flex',
      alignItems: 'center',
      transition: 'width 250ms cubic-bezier(0.2, 0, 0, 1), padding 250ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease-out, transform 250ms cubic-bezier(0.2, 0, 0, 1)',
    } as React.CSSProperties
  }

  const handleControlFocus = (id: 'volume' | 'preview' | 'zoom') => setHoveredControl(id)
  const handleControlBlur = (
    event: React.FocusEvent<HTMLDivElement>,
  ) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setHoveredControl(null)
    }
  }

  // Ensure zoom limits are valid
  const effectiveMinZoom = Math.max(0.01, minZoom)
  const effectiveMaxZoom = Math.min(10, maxZoom)

  return (
    <div
      className="timeline-controls grid grid-cols-3 items-center px-4 py-0.5 border-b border-border/10 bg-muted/20"
    >

      {/* LEFT: Tracks, Volume, Edit Actions */}
      <div className="flex items-center gap-1 justify-start">
        {/* Track Visibility Dropdown */}
        <TrackVisibilityDropdown />

        <div className="w-px h-4 bg-border/40 mx-1" />

        {/* Volume Control */}
        <div
          className={cn(
            "flex items-center rounded-full transition-all duration-300 ease-out",
            hoveredControl === 'volume' ? "gap-1 bg-muted/40 px-2 py-0.5" : "gap-0 bg-transparent px-0 py-0.5"
          )}
          onMouseEnter={() => setHoveredControl('volume')}
          onMouseLeave={() => setHoveredControl(null)}
          onFocusCapture={() => handleControlFocus('volume')}
          onBlurCapture={handleControlBlur}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  setAudioSettings({ muted: !muted })
                }}
                className="flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span>{muted ? 'Unmute' : 'Mute'} master audio</span>
            </TooltipContent>
          </Tooltip>
          <div style={getSliderWrapperStyle('volume', '7rem')} aria-hidden={hoveredControl !== 'volume'}>
            <Slider
              value={[volume]}
              onValueChange={([value]) => {
                setAudioSettings({ volume: value })
              }}
              min={0}
              max={200}
              step={1}
              className="w-28 pl-2"
            />
          </div>
        </div>

        <div className="w-px h-4 bg-border/40 mx-1.5" />

        {/* Single-clip Edit Controls - Hidden when no selection */}
        {hasSingleSelection && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <MotionButton
                  size="sm"
                  variant="ghost"
                  onClick={onSplitSelected}
                  className="h-8 w-8 p-0 rounded-full"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  <Scissors className="w-4 h-4" />
                </MotionButton>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <span>Split at playhead (S)</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <MotionButton
                  size="sm"
                  variant="ghost"
                  onClick={onTrimStartSelected}
                  className="h-8 w-8 p-0 rounded-full"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  <ChevronsLeft className="w-4 h-4" />
                </MotionButton>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <span>Trim start to playhead (Q)</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <MotionButton
                  size="sm"
                  variant="ghost"
                  onClick={onTrimEndSelected}
                  className="h-8 w-8 p-0 rounded-full"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  <ChevronsRight className="w-4 h-4" />
                </MotionButton>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <span>Trim end to playhead (W)</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <MotionButton
                  size="sm"
                  variant="ghost"
                  onClick={onDuplicateSelected}
                  className="h-8 w-8 p-0 rounded-full"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  <Layers className="w-4 h-4" />
                </MotionButton>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <span>Duplicate (⌘D)</span>
              </TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Always visible but disabled when no selection */}
        <Tooltip>
          <TooltipTrigger asChild>
            <MotionButton
              size="sm"
              variant="ghost"
              onClick={onDeleteSelected}
              disabled={!hasSelection}
              className="h-8 w-8 p-0 disabled:opacity-50 rounded-full"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={springConfig}
            >
              <Trash2 className="w-4 h-4" />
            </MotionButton>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            <span>Delete selected (Del)</span>
          </TooltipContent>
        </Tooltip>

      </div>

      {/* CENTER: Playback Controls & Timecode */}
      <div className="flex items-center justify-center gap-4">
        {/* Playback Controls Group */}
        <div className="flex items-center gap-3">
          {/* Current Time */}
          <div className="min-w-[4rem] text-right">
            <span className="font-mono text-xs font-medium tabular-nums text-foreground">
              {formatTimecode(displayTime, fps)}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <MotionButton
                  size="sm"
                  variant="ghost"
                  onClick={jumpBackward1s}
                  className="h-9 w-9 p-0 rounded-full"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={springConfig}
                >
                  <SkipBack className="w-4 h-4 fill-current opacity-80" />
                </MotionButton>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <span>Jump back 1s</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <MotionButton
                  size="sm"
                  variant="ghost"
                  onClick={playPause}
                  className="h-9 w-9 p-0 rounded-full"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={springConfig}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </MotionButton>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <span>{isPlaying ? 'Pause' : 'Play'} (Space)</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <MotionButton
                  size="sm"
                  variant="ghost"
                  onClick={jumpForward1s}
                  className="h-9 w-9 p-0 rounded-full"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={springConfig}
                >
                  <SkipForward className="w-4 h-4 fill-current opacity-80" />
                </MotionButton>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <span>Jump forward 1s</span>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Total Duration */}
          <div className="min-w-[4rem] text-left">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatTimecode(duration, fps)}
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT: Preview Size + Zoom Controls */}
      <div className="flex items-center gap-2 justify-end">
        <div
          className={cn(
            "flex items-center rounded-full transition-all duration-300 ease-out",
            hoveredControl === 'preview' ? "gap-1 bg-muted/40 px-2 py-0.5" : "gap-0 bg-transparent px-0 py-0.5"
          )}
          onMouseEnter={() => setHoveredControl('preview')}
          onMouseLeave={() => setHoveredControl(null)}
          onFocusCapture={() => handleControlFocus('preview')}
          onBlurCapture={handleControlBlur}
        >
          <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
          <div style={getSliderWrapperStyle('preview', '7rem')} aria-hidden={hoveredControl !== 'preview'}>
            <Slider
              value={[previewScale]}
              onValueChange={([value]) => {
                setPreviewScale(value)
              }}
              min={0.8}
              max={1.5}
              step={0.05}
              className="w-28 pl-2"
            />
          </div>
        </div>
        <div
          className={cn(
            "flex items-center transition-all duration-300 ease-out",
            (hoveredControl === 'zoom' || hoveredControl === null) ? "gap-2" : "gap-0"
          )}
          onMouseEnter={() => setHoveredControl('zoom')}
          onMouseLeave={() => setHoveredControl(null)}
          onFocusCapture={() => handleControlFocus('zoom')}
          onBlurCapture={handleControlBlur}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <MotionButton
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 rounded-full"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                transition={springConfig}
              >
                <ZoomIn className="w-4 h-4" />
              </MotionButton>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span>Zoom (Cmd+Scroll)</span>
            </TooltipContent>
          </Tooltip>
          {/* Added padding-left to slider container to give some breathing room from the icon */}
          <div style={getSliderWrapperStyle('zoom', '8rem', true)} aria-hidden={hoveredControl !== 'zoom' && hoveredControl !== null}>
            <Slider
              value={[zoom]}
              onValueChange={([value]) => {
                onZoomChange(value)
              }}
              min={effectiveMinZoom}
              max={effectiveMaxZoom}
              step={0.05}
              className="w-[calc(100%-1rem)]"
            />
          </div>

        </div>
      </div>
    </div>
  )
})

TimelineControls.displayName = 'TimelineControls'
