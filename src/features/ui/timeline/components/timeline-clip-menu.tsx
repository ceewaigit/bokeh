'use client'

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scissors, ChevronsLeft, ChevronsRight, Layers, Copy, Trash2, Zap,
  Video, Music, Camera, Sparkles, Clipboard
} from 'lucide-react'
import { useTimelineOperations } from './timeline-operations-context'
import { useProjectStore } from '@/features/core/stores/project-store'
import { TrackType } from '@/types/project'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '@/shared/utils/utils'

// Native macOS-style spring animation
const menuSpring = { type: 'spring', stiffness: 500, damping: 30, mass: 0.8 } as const

interface TimelineContextMenuProps {
  x: number
  y: number
  clipId: string
  trackType?: TrackType
  onClose: () => void
}

// Format duration compactly
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) return `${minutes}:${seconds.toString().padStart(2, '0')}`
  return `${seconds}s`
}

// Clip type icons and labels
const clipTypeInfo = {
  [TrackType.Video]: { icon: Video, label: 'Video' },
  [TrackType.Audio]: { icon: Music, label: 'Audio' },
  [TrackType.Webcam]: { icon: Camera, label: 'Webcam' },
  generated: { icon: Sparkles, label: 'Generated' }
} as const

// Menu item component for consistency
const MenuItem = React.memo(({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled,
  destructive,
  isHovered,
  onHover
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  isHovered: boolean
  onHover: () => void
}) => (
  <button
    className={cn(
      "relative flex items-center gap-2 w-full px-2.5 py-1.5 text-ui-sm rounded-lg outline-none",
      "transition-colors duration-80",
      "disabled:opacity-40 disabled:cursor-default",
      destructive ? "text-destructive" : "text-popover-foreground"
    )}
    disabled={disabled}
    onClick={onClick}
    onMouseEnter={onHover}
  >
    {/* Hover background */}
    <AnimatePresence>
      {isHovered && !disabled && (
        <motion.div
          className={cn(
            "absolute inset-0 rounded-lg",
            destructive ? "bg-destructive/10" : "bg-muted/40"
          )}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", duration: 0.2, bounce: 0 }}
          layoutId="menu-hover"
        />
      )}
    </AnimatePresence>

    {/* Icon */}
    <span className="relative z-10 w-4 flex justify-center shrink-0">
      {Icon && <Icon className={cn(
        "size-3.5",
        destructive ? "opacity-80" : "opacity-50"
      )} />}
    </span>

    {/* Label */}
    <span className="relative z-10 flex-1 text-left truncate">{label}</span>

    {/* Shortcut */}
    {shortcut && (
      <span className="relative z-10 text-2xs font-medium tracking-wide tabular-nums text-muted-foreground/50">
        {shortcut}
      </span>
    )}
  </button>
))
MenuItem.displayName = 'MenuItem'

// Separator component
const Separator = () => (
  <div className="h-px bg-border my-1 mx-2" />
)

export const TimelineContextMenu = React.memo(({
  x,
  y,
  clipId,
  trackType: propTrackType,
  onClose
}: TimelineContextMenuProps) => {
  const {
    onSplitClip,
    onTrimClipStart,
    onTrimClipEnd,
    onDuplicateClip,
    onCutClip,
    onCopyClip,
    onPasteClip,
    onDeleteClip,
    onSpeedUpClip
  } = useTimelineOperations()

  const menuRef = useRef<HTMLDivElement>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  // Get clip data from store
  const clipData = useProjectStore(
    useShallow((state) => {
      const project = state.currentProject
      if (!project) return { clip: null, trackType: null, recording: null }

      for (const track of project.timeline.tracks) {
        const found = track.clips.find(c => c.id === clipId)
        if (found) {
          const rec = project.recordings.find(r => r.id === found.recordingId) ?? null
          return { clip: found, trackType: track.type, recording: rec }
        }
      }
      return { clip: null, trackType: null, recording: null }
    })
  )

  const clip = clipData.clip
  const detectedTrackType = clipData.trackType
  const recording = clipData.recording
  const isGenerated = recording?.sourceType === 'generated'
  const trackType = propTrackType ?? detectedTrackType ?? TrackType.Video

  // Get type info
  const typeInfo = useMemo(() => {
    if (isGenerated) return clipTypeInfo.generated
    return clipTypeInfo[trackType as keyof typeof clipTypeInfo] ?? clipTypeInfo[TrackType.Video]
  }, [isGenerated, trackType])

  const TypeIcon = typeInfo.icon

  const handleAction = useCallback(async (action: () => void | Promise<void>) => {
    if (isBusy) return
    try {
      setIsBusy(true)
      await action()
    } finally {
      setIsBusy(false)
      onClose()
    }
  }, [isBusy, onClose])

  // Position menu within viewport - use RAF to ensure layout is complete
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return

    // Use RAF to ensure the browser has completed layout
    const raf = requestAnimationFrame(() => {
      const PADDING = 12
      const rect = el.getBoundingClientRect()
      const viewportW = window.innerWidth
      const viewportH = window.innerHeight

      // Calculate clamped position
      const clampedLeft = Math.min(
        Math.max(x, PADDING),
        viewportW - rect.width - PADDING
      )
      const clampedTop = Math.min(
        Math.max(y, PADDING),
        viewportH - rect.height - PADDING
      )

      setPosition({ left: clampedLeft, top: clampedTop })
    })

    return () => cancelAnimationFrame(raf)
  }, [x, y])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    // Small delay to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 50)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Clear hover on mouse leave
  const handleMouseLeave = useCallback(() => {
    setHoveredItem(null)
  }, [])

  // Determine which actions to show
  const showEditingActions = trackType !== TrackType.Audio
  const showSpeedAction = trackType === TrackType.Video

  const menuContent = (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={menuSpring}
      className="fixed z-floating min-w-48 max-w-64 rounded-2xl border border-glass-border bg-popover/90 backdrop-blur-xl shadow-2xl overflow-hidden"
      style={{
        left: position?.left ?? x,
        top: position?.top ?? y,
        visibility: position ? 'visible' : 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseLeave={handleMouseLeave}
    >
      {/* Compact header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border">
        <TypeIcon className="size-3.5 text-muted-foreground/70" />
        <span className="text-xs font-medium text-muted-foreground">
          {typeInfo.label}
        </span>
        {clip && (
          <>
            <span className="text-3xs text-muted-foreground/40">·</span>
            <span className="text-2xs text-muted-foreground/60 tabular-nums">
              {formatDuration(clip.duration)}
            </span>
            {clip.playbackRate && clip.playbackRate !== 1 && (
              <>
                <span className="text-3xs text-muted-foreground/40">·</span>
                <span className="text-2xs text-muted-foreground/60 tabular-nums">
                  {clip.playbackRate}×
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Menu items */}
      <div className="py-1 px-1">
        {showEditingActions && (
          <>
            <MenuItem
              icon={Scissors}
              label="Split at Playhead"
              shortcut="⌘K"
              onClick={() => void handleAction(() => onSplitClip(clipId))}
              disabled={isBusy}
              isHovered={hoveredItem === 'split'}
              onHover={() => setHoveredItem('split')}
            />
            <MenuItem
              icon={ChevronsLeft}
              label="Trim Start"
              shortcut="["
              onClick={() => void handleAction(() => onTrimClipStart(clipId))}
              disabled={isBusy}
              isHovered={hoveredItem === 'trimStart'}
              onHover={() => setHoveredItem('trimStart')}
            />
            <MenuItem
              icon={ChevronsRight}
              label="Trim End"
              shortcut="]"
              onClick={() => void handleAction(() => onTrimClipEnd(clipId))}
              disabled={isBusy}
              isHovered={hoveredItem === 'trimEnd'}
              onHover={() => setHoveredItem('trimEnd')}
            />
            <Separator />
          </>
        )}

        <MenuItem
          icon={Clipboard}
          label="Cut"
          shortcut="⌘X"
          onClick={() => void handleAction(() => onCutClip(clipId))}
          disabled={isBusy}
          isHovered={hoveredItem === 'cut'}
          onHover={() => setHoveredItem('cut')}
        />
        <MenuItem
          icon={Copy}
          label="Copy"
          shortcut="⌘C"
          onClick={() => void handleAction(() => onCopyClip(clipId))}
          disabled={isBusy}
          isHovered={hoveredItem === 'copy'}
          onHover={() => setHoveredItem('copy')}
        />
        <MenuItem
          label="Paste"
          shortcut="⌘V"
          onClick={() => void handleAction(() => onPasteClip())}
          disabled={isBusy}
          isHovered={hoveredItem === 'paste'}
          onHover={() => setHoveredItem('paste')}
        />

        <Separator />

        <MenuItem
          icon={Layers}
          label="Duplicate"
          shortcut="⌘D"
          onClick={() => void handleAction(() => onDuplicateClip(clipId))}
          disabled={isBusy}
          isHovered={hoveredItem === 'duplicate'}
          onHover={() => setHoveredItem('duplicate')}
        />

        {showSpeedAction && (
          <MenuItem
            icon={Zap}
            label="Speed Up (2×)"
            onClick={() => void handleAction(() => onSpeedUpClip(clipId))}
            disabled={isBusy}
            isHovered={hoveredItem === 'speed'}
            onHover={() => setHoveredItem('speed')}
          />
        )}

        <Separator />

        <MenuItem
          icon={Trash2}
          label="Delete"
          shortcut="⌫"
          onClick={() => void handleAction(() => onDeleteClip(clipId))}
          disabled={isBusy}
          destructive
          isHovered={hoveredItem === 'delete'}
          onHover={() => setHoveredItem('delete')}
        />
      </div>
    </motion.div>
  )

  if (typeof document !== 'undefined') {
    return ReactDOM.createPortal(menuContent, document.body)
  }

  return menuContent
})

TimelineContextMenu.displayName = 'TimelineContextMenu'
