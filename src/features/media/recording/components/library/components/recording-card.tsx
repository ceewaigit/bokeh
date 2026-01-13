"use client"

import Image from 'next/image'
import { Copy, PencilLine, Play, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { motion, useReducedMotion } from 'framer-motion'
import { type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { formatTime } from '@/shared/utils/time'
import { cn } from '@/shared/utils/utils'
import { PROJECT_EXTENSION_REGEX } from '@/features/core/storage/project-paths'

// Snappy, Apple-esque spring config
const cardSpring = { type: 'spring', stiffness: 400, damping: 25 } as const

interface RecordingCardProps {
  recording: LibraryRecordingView
  onSelect: (recording: LibraryRecordingView) => void
  onRequestRename?: (recording: LibraryRecordingView) => void
  onRequestDuplicate?: (recording: LibraryRecordingView) => void
  onRequestDelete?: (recording: LibraryRecordingView) => void
}

// Extract display name from recording
const getDisplayName = (recording: LibraryRecordingView) =>
  recording.projectInfo?.name ||
  recording.name.replace(/^Recording_/, '').replace(PROJECT_EXTENSION_REGEX, '')

// Format relative time
const getRelativeTime = (timestamp: Date) =>
  formatDistanceToNow(timestamp, { addSuffix: true })
    .replace('about ', '')
    .replace('less than ', '<')

// Action pill component for rename/duplicate/delete actions
function ActionPill({
  onRename,
  onDuplicate,
  onDelete,
  alwaysVisible = false,
}: {
  onRename?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  alwaysVisible?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg bg-black/40 p-1 text-white/90 backdrop-blur-md",
        "transition-all duration-150 ease-out",
        alwaysVisible
          ? "opacity-100"
          : "opacity-0 -translate-y-1 group-hover:opacity-100 group-hover:translate-y-0"
      )}
    >
      {onRename && (
        <button
          type="button"
          className="h-7 w-7 rounded-md hover:bg-white/15 flex items-center justify-center transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onRename()
          }}
          aria-label="Rename"
        >
          <PencilLine className="h-3.5 w-3.5" />
        </button>
      )}
      {onDuplicate && (
        <button
          type="button"
          className="h-7 w-7 rounded-md hover:bg-white/15 flex items-center justify-center transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate()
          }}
          aria-label="Duplicate"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="h-7 w-7 rounded-md hover:bg-red-500/60 flex items-center justify-center transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export function RecordingCard({
  recording,
  onSelect,
  onRequestRename,
  onRequestDuplicate,
  onRequestDelete,
}: RecordingCardProps) {
  const reduceMotion = useReducedMotion()
  const displayName = getDisplayName(recording)
  const relativeTime = getRelativeTime(recording.timestamp)
  const duration = recording.projectInfo?.duration || 0

  // Get natural aspect ratio from recording dimensions
  const width = recording.projectInfo?.width || 1920
  const height = recording.projectInfo?.height || 1080
  const aspectRatio = width / height

  return (
    <motion.article
      role="button"
      tabIndex={0}
      aria-label={`Open ${displayName}`}
      onClick={() => onSelect(recording)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(recording)
        }
      }}
      whileHover={reduceMotion ? undefined : { y: -2, scale: 1.002 }}
      whileTap={reduceMotion ? undefined : { scale: 0.998 }}
      transition={reduceMotion ? { duration: 0 } : cardSpring}
      className={cn(
        "group relative overflow-hidden rounded-xl",
        "bg-card/50 backdrop-blur-sm border border-border/30",
        "shadow-sm hover:shadow-md hover:border-border/50",
        "transition-shadow duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {/* Thumbnail container - natural aspect ratio */}
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio }}
      >
        {recording.thumbnailUrl ? (
          <Image
            src={recording.thumbnailUrl}
            alt={displayName}
            fill
            className="object-cover"
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 bg-muted/30 flex items-center justify-center">
            <Play className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}

        {/* Hover overlay with play button */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-150 flex items-center justify-center">
          <div className={cn(
            "w-11 h-11 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center",
            "shadow-lg",
            "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100",
            "transition-all duration-150 ease-out"
          )}>
            <Play className="h-4.5 w-4.5 text-black ml-0.5" fill="currentColor" />
          </div>
        </div>

        {/* Duration badge - bottom left */}
        {duration > 0 && (
          <div className="absolute bottom-2 left-2">
            <span className="px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-md text-white/90 text-[10px] font-mono tracking-wide">
              {formatTime(duration)}
            </span>
          </div>
        )}

        {/* Action pill - top right */}
        <div className="absolute top-2 right-2">
          <ActionPill
            onRename={onRequestRename ? () => onRequestRename(recording) : undefined}
            onDuplicate={onRequestDuplicate ? () => onRequestDuplicate(recording) : undefined}
            onDelete={onRequestDelete ? () => onRequestDelete(recording) : undefined}
            alwaysVisible={false}
          />
        </div>
      </div>

      {/* Metadata below thumbnail - refined typography */}
      <div className="p-3">
        <h3 className="font-medium text-foreground truncate text-[13px] tracking-[-0.008em]">
          {displayName}
        </h3>
        <p className="text-muted-foreground/70 mt-1 text-[11px] tracking-normal">
          {relativeTime}
        </p>
      </div>
    </motion.article>
  )
}
