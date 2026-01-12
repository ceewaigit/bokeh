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
import { formatClockTime } from '@/shared/utils/time'
import { useTimelineLayout } from './timeline-layout-provider'
import { useTimelineContext } from './TimelineContext'
import { TimelineTrackType } from '@/types/project'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'
import { DEFAULT_PROJECT_SETTINGS } from '@/features/core/settings/defaults'
import { useSelectedClipIds } from '@/features/core/stores/selectors/clip-selectors'
import { useTimeStore } from '@/features/ui/timeline/stores/time-store'
import { useTimelinePlayback } from '@/features/ui/timeline/hooks/use-timeline-playback'
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

// Control IDs for hover state management
const TimelineControlId = {
  Volume: 'volume',
  Preview: 'preview',
  Zoom: 'zoom'
} as const
type TimelineControlId = typeof TimelineControlId[keyof typeof TimelineControlId]

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
              className="h-8 w-8 p-0 rounded-pill"
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

// ─────────────────────────────────────────────────────────────────────────────
// Shared Hover Logic for Button Groups
// ─────────────────────────────────────────────────────────────────────────────

import { AnimatePresence } from 'framer-motion'

const ControlContext = React.createContext<{
  hoveredId: string | null
  setHoveredId: (id: string | null) => void
} | null>(null)

function ControlGroup({ children, layoutId }: { children: React.ReactNode, layoutId: string }) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  return (
    <ControlContext.Provider value={{ hoveredId, setHoveredId }}>
      <div className="flex items-center gap-0.5 relative group/controls" onMouseLeave={() => setHoveredId(null)}>
        {children}
      </div>
    </ControlContext.Provider>
  )
}

interface ControlButtonProps {
  onClick: () => void
  disabled?: boolean
  icon: React.ElementType
  label: string
  layoutId: string
  className?: string
  iconClassName?: string
  variant?: 'default' | 'destructive'
}

function ControlButton({ onClick, disabled, icon: Icon, label, layoutId, className, iconClassName, variant = 'default' }: ControlButtonProps) {
  const ReactId = React.useId()
  const context = React.useContext(ControlContext)
  const isHovered = context?.hoveredId === ReactId

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          onMouseEnter={() => context?.setHoveredId(ReactId)}
          className={cn(
            "relative flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            "h-7 w-7", // Default size, overrideable
            disabled ? "opacity-40 cursor-not-allowed" : "cursor-default",
            className
          )}
          aria-label={label}
        >
          {/* Active Background Follower */}
          <AnimatePresence>
            {isHovered && !disabled && (
              <motion.div
                className={cn(
                  "absolute inset-0 rounded-md z-0",
                  variant === 'destructive' ? "bg-destructive/10" : "bg-foreground/10"
                )}
                layoutId={`${layoutId}-hover`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", duration: 0.25, bounce: 0 }}
              />
            )}
          </AnimatePresence>

          <Icon
            className={cn(
              "relative z-10 w-4 h-4 transition-colors duration-200",
              variant === 'destructive'
                ? (isHovered && !disabled ? "text-destructive" : "text-muted-foreground")
                : (isHovered && !disabled ? "text-foreground" : "text-muted-foreground"),
              iconClassName
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4} className="text-xs font-medium px-2 py-1 bg-popover/95 backdrop-blur-sm border-border/50">
        <span>{label}</span>
      </TooltipContent>
    </Tooltip>
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

  // Use the unified playback hook (disabled because we don't want duplicate keyboard listeners here)
  const {
    playPause,
    jumpBackward1s,
    jumpForward1s
  } = useTimelinePlayback({ enabled: false })

  // DECOUPLED: Use timeStore for timecode display (updates at 60fps)
  const displayTime = useTimeStore((s) => s.currentTime)

  const isPlaying = useProjectStore((s) => s.isPlaying)
  const selectedClips = useSelectedClipIds()
  const previewScale = useWorkspaceStore((s) => s.previewScale)
  const setPreviewScale = useWorkspaceStore((s) => s.setPreviewScale)
  const hasSelection = selectedClips.length > 0
  const hasSingleSelection = selectedClips.length === 1
  const audio = useProjectStore((s) => s.currentProject?.settings.audio ?? DEFAULT_PROJECT_SETTINGS.audio)
  const setAudioSettings = useProjectStore((s) => s.setAudioSettings)
  const { volume, muted } = audio
  const [hoveredControl, setHoveredControl] = React.useState<TimelineControlId | null>(null)
  const [focusedControl, setFocusedControl] = React.useState<TimelineControlId | null>(null)
  const lastVolumeRef = React.useRef<number>(100) // Default to middle (100/200)

  // Sync ref with volume when not muted so we capture user adjustments
  React.useEffect(() => {
    if (!muted && volume > 0) {
      lastVolumeRef.current = volume
    }
  }, [volume, muted])

  const isControlActive = React.useCallback((id: TimelineControlId) => (
    hoveredControl === id || focusedControl === id
  ), [hoveredControl, focusedControl])

  const isSliderExpanded = React.useCallback((id: TimelineControlId, defaultExpanded = false) => (
    isControlActive(id) || (defaultExpanded && hoveredControl === null && focusedControl === null)
  ), [focusedControl, hoveredControl, isControlActive])

  const getSliderWrapperStyle = (id: TimelineControlId, targetWidth: string, defaultExpanded = false) => {
    const isExpanded = isSliderExpanded(id, defaultExpanded)
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

  const handleControlFocus = React.useCallback((id: TimelineControlId) => {
    setFocusedControl(id)
  }, [])

  const handleControlBlur = React.useCallback((id: TimelineControlId) => (
    event: React.FocusEvent<HTMLDivElement>,
  ) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocusedControl((prev) => (prev === id ? null : prev))
    }
  }, [])

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
            "flex items-center rounded-pill transition-all duration-300 ease-out",
            isControlActive(TimelineControlId.Volume) ? "bg-muted/40 pr-2 pl-0.5 py-0.5" : "bg-transparent px-0 py-0.5"
          )}
          onMouseEnter={() => setHoveredControl(TimelineControlId.Volume)}
          onMouseLeave={() => setHoveredControl((prev) => (prev === TimelineControlId.Volume ? null : prev))}
          onFocusCapture={() => handleControlFocus(TimelineControlId.Volume)}
          onBlurCapture={handleControlBlur(TimelineControlId.Volume)}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                type="button"
                onClick={() => {
                  if (muted) {
                    // Unmute: restore volume
                    setAudioSettings({
                      muted: false,
                      volume: lastVolumeRef.current > 0 ? lastVolumeRef.current : 100
                    })
                  } else {
                    // Mute: stash volume (handled by effect) and set to 0
                    setAudioSettings({
                      muted: true,
                      volume: 0
                    })
                  }
                }}
                className={cn(
                  "flex items-center justify-center p-1.5 rounded-full transition-colors relative text-foreground",
                  muted && "text-muted-foreground",
                  "hover:bg-foreground/10"
                )}
                aria-label={muted ? 'Unmute' : 'Mute'}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                transition={springConfig}
              >
                {muted ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span>{muted ? 'Unmute' : 'Mute'} master audio</span>
            </TooltipContent>
          </Tooltip>
          <div
            style={getSliderWrapperStyle(TimelineControlId.Volume, '7rem')}
            aria-hidden={!isSliderExpanded(TimelineControlId.Volume)}
          >
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
          <ControlGroup layoutId="edit-controls">
            <ControlButton
              onClick={onSplitSelected}
              icon={Scissors}
              label="Split at playhead (S)"
              layoutId="edit-controls"
            />
            <ControlButton
              onClick={onTrimStartSelected}
              icon={ChevronsLeft}
              label="Trim start to playhead (Q)"
              layoutId="edit-controls"
            />
            <ControlButton
              onClick={onTrimEndSelected}
              icon={ChevronsRight}
              label="Trim end to playhead (W)"
              layoutId="edit-controls"
            />
            <ControlButton
              onClick={onDuplicateSelected}
              icon={Layers}
              label="Duplicate (⌘D)"
              layoutId="edit-controls"
            />
          </ControlGroup>
        )}

        {/* Always visible but disabled when no selection */}
        <div className="ml-1">
          <ControlGroup layoutId="delete-control">
            <ControlButton
              onClick={onDeleteSelected}
              disabled={!hasSelection}
              icon={Trash2}
              label="Delete selected (Del)"
              layoutId="delete-control"
              variant="destructive"
            />
          </ControlGroup>
        </div>

      </div>

      {/* CENTER: Playback Controls & Timecode */}
      <div className="flex items-center justify-center gap-4">
        {/* Playback Controls Group */}
        <div className="flex items-center gap-4">
          {/* Current Time */}
          <div className="min-w-[4rem] text-right">
            <span className="font-mono text-xs font-medium tabular-nums text-foreground/90">
              {formatClockTime(displayTime)}
            </span>
          </div>

          {/* Controls */}
          <div className="p-1 rounded-lg border border-border/20 bg-background/40 backdrop-blur-sm shadow-sm">
            <ControlGroup layoutId="playback-controls">
              <ControlButton
                onClick={jumpBackward1s}
                icon={SkipBack}
                label="Jump back 1s"
                layoutId="playback-controls"
                className="w-8 h-8"
                iconClassName="w-3.5 h-3.5"
              />
              <ControlButton
                onClick={playPause}
                icon={isPlaying ? Pause : Play}
                label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                layoutId="playback-controls"
                className="w-8 h-8"
                iconClassName={cn("w-3.5 h-3.5", !isPlaying && "ml-0.5")}
              />
              <ControlButton
                onClick={jumpForward1s}
                icon={SkipForward}
                label="Jump forward 1s"
                layoutId="playback-controls"
                className="w-8 h-8"
                iconClassName="w-3.5 h-3.5"
              />
            </ControlGroup>
          </div>

          {/* Total Duration */}
          <div className="min-w-[4rem] text-left">
            <span className="font-mono text-xs tabular-nums text-muted-foreground/70">
              {formatClockTime(duration)}
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT: Preview Size + Zoom Controls */}
      <div className="flex items-center gap-2 justify-end">
        <div
          className={cn(
            "flex items-center rounded-pill transition-all duration-300 ease-out",
            isControlActive(TimelineControlId.Preview) ? "gap-1 bg-muted/40 px-2 py-0.5" : "gap-0 bg-transparent px-0 py-0.5"
          )}
          onMouseEnter={() => setHoveredControl(TimelineControlId.Preview)}
          onMouseLeave={() => setHoveredControl((prev) => (prev === TimelineControlId.Preview ? null : prev))}
          onFocusCapture={() => handleControlFocus(TimelineControlId.Preview)}
          onBlurCapture={handleControlBlur(TimelineControlId.Preview)}
        >
          <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
          <div
            style={getSliderWrapperStyle(TimelineControlId.Preview, '7rem')}
            aria-hidden={!isSliderExpanded(TimelineControlId.Preview)}
          >
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
            (isControlActive(TimelineControlId.Zoom) || (hoveredControl === null && focusedControl === null)) ? "gap-2" : "gap-0"
          )}
          onMouseEnter={() => setHoveredControl(TimelineControlId.Zoom)}
          onMouseLeave={() => setHoveredControl((prev) => (prev === TimelineControlId.Zoom ? null : prev))}
          onFocusCapture={() => handleControlFocus(TimelineControlId.Zoom)}
          onBlurCapture={handleControlBlur(TimelineControlId.Zoom)}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="flex items-center justify-center h-8 w-8 p-0 text-muted-foreground cursor-default"
              >
                <ZoomIn className="w-4 h-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span>Zoom (Cmd+Scroll)</span>
            </TooltipContent>
          </Tooltip>
          {/* Added padding-left to slider container to give some breathing room from the icon */}
          <div
            style={getSliderWrapperStyle(TimelineControlId.Zoom, '8rem', true)}
            aria-hidden={!isSliderExpanded(TimelineControlId.Zoom, true)}
          >
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
    </div >
  )
})

TimelineControls.displayName = 'TimelineControls'
