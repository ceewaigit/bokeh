import React from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { formatTimecode } from '@/lib/utils/time'
import { useTimelineLayout } from './timeline-layout-provider'
import { TimelineTrackType } from '@/types/project'
import { useProjectStore } from '@/stores/project-store'
import {
  Scissors,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Trash2,
  Copy,
  Clipboard,
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
  [TimelineTrackType.Annotation]: 'Notes',
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
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97]"
            >
              <Eye className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          <span>Visible tracks</span>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground font-medium">
          Tracks
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableTracks.map((track) => (
          <DropdownMenuCheckboxItem
            key={track}
            checked={visibleTracks.has(track)}
            onCheckedChange={() => toggleTrackVisibility(track)}
            className="text-[12px]"
          >
            {TRACK_LABELS[track]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface TimelineControlsProps {
  isPlaying: boolean
  currentTime: number
  maxDuration: number
  zoom: number
  minZoom?: number // Dynamic minimum zoom (default: 0.05)
  maxZoom?: number // Dynamic maximum zoom (default: 5)
  selectedClips: string[]
  copiedClip?: any
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onZoomChange: (zoom: number) => void
  onSplit: () => void
  onTrimStart: () => void
  onTrimEnd: () => void
  onDelete: () => void
  onCopy?: () => void
  onPaste?: () => void
  onDuplicate: () => void
  previewScale?: number
  onPreviewScaleChange?: (scale: number) => void
  fps?: number
}

export const TimelineControls = React.memo(({
  isPlaying,
  currentTime,
  maxDuration,
  zoom,
  minZoom = 0.05,
  maxZoom = 5,
  selectedClips,
  copiedClip,
  onPlay,
  onPause,
  onSeek,
  onZoomChange,
  onSplit,
  onTrimStart,
  onTrimEnd,
  onDelete,
  onCopy,
  onPaste,
  onDuplicate,
  previewScale = 1,
  onPreviewScaleChange,
  fps = 60
}: TimelineControlsProps) => {
  const hasSelection = selectedClips.length > 0
  const hasSingleSelection = selectedClips.length === 1
  const audio = useProjectStore((s) => s.settings.audio)
  const updateSettings = useProjectStore((s) => s.updateSettings)
  const { volume, muted } = audio
  const [lastChangedControl, setLastChangedControl] = React.useState<'volume' | 'preview' | 'zoom'>('zoom')
  const [hoveredControl, setHoveredControl] = React.useState<'volume' | 'preview' | 'zoom' | null>(null)
  const expandedControl = hoveredControl ?? lastChangedControl

  const getSliderWrapperStyle = (id: 'volume' | 'preview' | 'zoom') => {
    const isExpanded = expandedControl === id
    return {
      opacity: isExpanded ? 1 : 0,
      transform: isExpanded ? 'translateX(0)' : 'translateX(-6px)',
      pointerEvents: isExpanded ? 'auto' : 'none',
      transition: 'opacity 140ms ease-out, transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
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
    <TooltipProvider delayDuration={300}>
      <div className="timeline-controls flex items-center justify-between px-3 py-1.5 border-b border-border/40">
        <div className="flex items-center gap-1">
          {/* Track Visibility Dropdown */}
          <TrackVisibilityDropdown />

          <div className="w-px h-4 bg-border/40 mx-1" />
          {/* Playback Controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onSeek(Math.max(0, currentTime - 1000))}
                className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97]"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span>Jump back 1s</span>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => isPlaying ? onPause() : onPlay()}
                className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97]"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span>{isPlaying ? 'Pause' : 'Play'} (Space)</span>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onSeek(Math.min(maxDuration, currentTime + 1000))}
                className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97]"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span>Jump forward 1s</span>
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border/40 mx-1.5" />

          {/* Single-clip Edit Controls - Hidden when no selection */}
          {hasSingleSelection && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onSplit}
                    className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97]"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  <span>Split at playhead (S)</span>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onTrimStart}
                    className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97]"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  <span>Trim start to playhead (Q)</span>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onTrimEnd}
                    className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97]"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  <span>Trim end to playhead (W)</span>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onDuplicate}
                    className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97]"
                  >
                    <Layers className="w-3.5 h-3.5" />
                  </Button>
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
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                disabled={!hasSelection}
                className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97] disabled:hover:scale-100 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span>Delete selected (Del)</span>
            </TooltipContent>
          </Tooltip>

          {onCopy && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCopy}
                  disabled={!hasSingleSelection}
                  className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97] disabled:hover:scale-100 disabled:opacity-50"
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <span>Copy clip (⌘C)</span>
              </TooltipContent>
            </Tooltip>
          )}

          {onPaste && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onPaste}
                  disabled={!copiedClip}
                  className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97] disabled:hover:scale-100 disabled:opacity-50"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <span>Paste clip (⌘V)</span>
              </TooltipContent>
            </Tooltip>
          )}


        </div>

        {/* Timecode Display */}
        <div className="timeline-controls-timecode absolute left-1/2 -translate-x-1/2 flex items-center gap-2 px-2.5 py-0.5 rounded-lg font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatTimecode(currentTime, fps)}
        </div>

        {/* Preview Size + Zoom Controls */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-full bg-muted/40 px-2 py-1"
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
                    setLastChangedControl('volume')
                    updateSettings({ audio: { ...audio, muted: !muted } })
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
            <div style={getSliderWrapperStyle('volume')} aria-hidden={expandedControl !== 'volume'}>
              <Slider
                value={[volume]}
                onValueChange={([value]) => {
                  setLastChangedControl('volume')
                  updateSettings({ audio: { ...audio, volume: value } })
                }}
                min={0}
                max={200}
                step={1}
                className="w-20"
              />
            </div>
          </div>
          {onPreviewScaleChange && (
            <div
              className="flex items-center gap-1 rounded-full bg-muted/40 px-2 py-1"
              onMouseEnter={() => setHoveredControl('preview')}
              onMouseLeave={() => setHoveredControl(null)}
              onFocusCapture={() => handleControlFocus('preview')}
              onBlurCapture={handleControlBlur}
            >
              <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
              <div style={getSliderWrapperStyle('preview')} aria-hidden={expandedControl !== 'preview'}>
                <Slider
                  value={[previewScale]}
                  onValueChange={([value]) => {
                    setLastChangedControl('preview')
                    onPreviewScaleChange(value)
                  }}
                  min={0.8}
                  max={1.3}
                  step={0.05}
                  className="w-20"
                />
              </div>
            </div>
          )}
          <div
            className="flex items-center gap-2"
            onMouseEnter={() => setHoveredControl('zoom')}
            onMouseLeave={() => setHoveredControl(null)}
            onFocusCapture={() => handleControlFocus('zoom')}
            onBlurCapture={handleControlBlur}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setLastChangedControl('zoom')
                  }}
                  className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97]"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <span>Zoom (Cmd+Scroll)</span>
              </TooltipContent>
            </Tooltip>
            <div style={getSliderWrapperStyle('zoom')} aria-hidden={expandedControl !== 'zoom'}>
              <Slider
                value={[zoom]}
                onValueChange={([value]) => {
                  setLastChangedControl('zoom')
                  onZoomChange(value)
                }}
                min={effectiveMinZoom}
                max={effectiveMaxZoom}
                step={0.05}
                className="w-24"
              />
            </div>

          </div>
        </div>
      </div>
    </TooltipProvider>
  )
})
