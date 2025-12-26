import React from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatTimecode } from '@/lib/utils/time'
import {
  Scissors,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Trash2,
  Copy,
  Clipboard,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  Monitor,

} from 'lucide-react'

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

  // Ensure zoom limits are valid
  const effectiveMinZoom = Math.max(0.01, minZoom)
  const effectiveMaxZoom = Math.min(10, maxZoom)

  return (
    <TooltipProvider delayDuration={300}>
      <div className="timeline-controls flex items-center justify-between px-3 py-1.5 border-b border-border/40">
        <div className="flex items-center gap-1">
          <div className="w-px h-4 bg-border/40 mr-1" />
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
          {onPreviewScaleChange && (
            <div className="flex items-center gap-1 rounded-full bg-muted/40 px-2 py-1">
              <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
              <Slider
                value={[previewScale]}
                onValueChange={([value]) => onPreviewScaleChange(value)}
                min={0.8}
                max={1.3}
                step={0.05}
                className="w-20"
              />
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onZoomChange(Math.max(effectiveMinZoom, zoom - 0.1))}
                className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97] disabled:hover:scale-100 disabled:opacity-50"
                disabled={zoom <= effectiveMinZoom}
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span>Zoom out (Cmd+Scroll)</span>
            </TooltipContent>
          </Tooltip>

          <Slider
            value={[zoom]}
            onValueChange={([value]) => onZoomChange(value)}
            min={effectiveMinZoom}
            max={effectiveMaxZoom}
            step={0.05}
            className="w-24"
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onZoomChange(Math.min(effectiveMaxZoom, zoom + 0.1))}
                className="h-7 w-7 p-0 transition-all duration-150 ease-out hover:scale-[1.03] active:scale-[0.97] disabled:hover:scale-100 disabled:opacity-50"
                disabled={zoom >= effectiveMaxZoom}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span>Zoom in (Cmd+Scroll)</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
})
