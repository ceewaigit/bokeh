"use client"

import React, { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Film, HardDrive, Info, PencilLine, Play, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { formatTime } from '@/shared/utils/time'
import { cn } from '@/shared/utils/utils'
import { PROJECT_EXTENSION_REGEX } from '@/features/core/storage/project-paths'
import { useTheme } from '@/shared/contexts/theme-context'
import { springSnappy, scaleInteraction } from '@/shared/constants/animations'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// Module-level cache for dominant colors
const dominantColorCache = new Map<string, { r: number; g: number; b: number }>()

/**
 * Extract dominant color from thumbnail for subtle hover glow.
 * Returns RGB values for use in box-shadow.
 */
function useDominantColor(imageUrl: string | undefined): { r: number; g: number; b: number } | null {
  const [color, setColor] = useState<{ r: number; g: number; b: number } | null>(() => {
    if (!imageUrl) return null
    return dominantColorCache.get(imageUrl) || null
  })

  useEffect(() => {
    if (!imageUrl) {
      setColor(null)
      return
    }

    const cached = dominantColorCache.get(imageUrl)
    if (cached) {
      setColor(cached)
      return
    }

    const img = document.createElement('img')
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const size = 8
      canvas.width = size
      canvas.height = size
      ctx.drawImage(img, 0, 0, size, size)

      const data = ctx.getImageData(0, 0, size, size).data
      let r = 0, g = 0, b = 0, count = 0

      for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
        if (brightness < 20 || brightness > 235) continue
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        count++
      }

      if (count > 0) {
        const result = {
          r: Math.round(r / count),
          g: Math.round(g / count),
          b: Math.round(b / count),
        }
        dominantColorCache.set(imageUrl, result)
        setColor(result)
      }
    }

    img.src = imageUrl
    return () => { img.onload = null }
  }, [imageUrl])

  return color
}

interface RecordingCardProps {
  recording: LibraryRecordingView
  onSelect: (recording: LibraryRecordingView) => void
  onRequestRename?: (recording: LibraryRecordingView) => void
  onRequestDuplicate?: (recording: LibraryRecordingView) => void
  onRequestDelete?: (recording: LibraryRecordingView) => void
}

// Format file size in human readable form
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Format resolution as a human-readable string
const formatResolution = (width: number, height: number): string => {
  // Standard resolutions based on width
  if (width >= 7680) return '8K'
  if (width >= 5120) return '5K'  // Also covers 6K (5120-7680)
  if (width >= 3840) return '4K'
  if (width >= 2560) return '1440p'
  if (width >= 1920) return '1080p'
  if (width >= 1280) return '720p'
  if (width >= 854) return '480p'
  return `${width}×${height}`
}

// Get more precise resolution label with dimensions
const getDetailedResolution = (width: number, height: number): string => {
  const label = formatResolution(width, height)
  // For high resolutions, show the actual dimensions too
  if (width > 3840) {
    return `${width}×${height}`
  }
  return label
}

// Metadata row component for the info popover
function MetadataRow({ icon: Icon, label, value }: { icon: typeof Film; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2 text-muted-foreground/70">
        <Icon className="w-3 h-3" strokeWidth={1.75} />
        <span className="text-[11px] font-medium tracking-wide uppercase">{label}</span>
      </div>
      <span className="text-[12px] text-foreground/90 tabular-nums font-medium">{value}</span>
    </div>
  )
}


// Extract display name from recording
const getDisplayName = (recording: LibraryRecordingView) =>
  recording.projectInfo?.name ||
  recording.name.replace(/^Recording_/, '').replace(PROJECT_EXTENSION_REGEX, '')

// Format relative time - Apple-style concise format
const getRelativeTime = (timestamp: Date) => {
  const now = new Date()
  const diff = now.getTime() - timestamp.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return formatDistanceToNow(timestamp, { addSuffix: true })
    .replace('about ', '')
    .replace('less than ', '<')
}

// Action pill component - compact, native macOS style
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
        "flex items-center gap-0.5 rounded-md bg-black/50 p-0.5 text-white/90 backdrop-blur-sm",
        "transition-all duration-75",
        alwaysVisible
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100"
      )}
    >
      {onRename && (
        <button
          type="button"
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-white/15 active:bg-white/25 transition-colors duration-75"
          onClick={(e) => {
            e.stopPropagation()
            onRename()
          }}
          aria-label="Rename"
        >
          <PencilLine className="h-3 w-3" />
        </button>
      )}
      {onDuplicate && (
        <button
          type="button"
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-white/15 active:bg-white/25 transition-colors duration-75"
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate()
          }}
          aria-label="Duplicate"
        >
          <Copy className="h-3 w-3" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-red-500/70 active:bg-red-500/90 transition-colors duration-75"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

// BATTERY OPTIMIZATION: Memoize to prevent rerenders when parent updates but props unchanged
export const RecordingCard = React.memo(function RecordingCard({
  recording,
  onSelect,
  onRequestRename,
  onRequestDuplicate,
  onRequestDelete,
}: RecordingCardProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const displayName = getDisplayName(recording)
  const relativeTime = getRelativeTime(recording.timestamp)
  const duration = recording.projectInfo?.duration || 0

  // Get natural aspect ratio from recording dimensions for masonry grid
  const width = recording.projectInfo?.width || 1920
  const height = recording.projectInfo?.height || 1080
  const aspectRatio = width / height
  const fileSize = recording.mediaFileSize || 0

  // Extract dominant color for hover glow
  const dominantColor = useDominantColor(recording.thumbnailUrl)

  // Prevent click propagation when clicking info button
  const handleInfoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  // Compute vibrant hover color from dominant color
  const hoverBg = dominantColor
    ? (() => {
        // Boost saturation by pushing colors away from gray
        let { r, g, b } = dominantColor
        const avg = (r + g + b) / 3

        // Increase saturation by amplifying difference from average
        const satBoost = 1.5
        r = Math.min(255, Math.max(0, Math.round(avg + (r - avg) * satBoost)))
        g = Math.min(255, Math.max(0, Math.round(avg + (g - avg) * satBoost)))
        b = Math.min(255, Math.max(0, Math.round(avg + (b - avg) * satBoost)))

        return isDark
          ? `rgba(${r}, ${g}, ${b}, 0.18)`
          : `rgba(${r}, ${g}, ${b}, 0.14)`
      })()
    : isDark
      ? 'rgba(255, 255, 255, 0.06)'
      : 'rgba(0, 0, 0, 0.05)'

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
      className="group relative rounded-xl p-2 -m-2 focus-visible:outline-none"
      initial={false}
      whileHover={{
        scale: scaleInteraction.hover,
        backgroundColor: hoverBg,
      }}
      whileTap={{
        scale: scaleInteraction.tap,
      }}
      transition={springSnappy}
    >
      {/* Thumbnail container */}
      <div
        className="relative w-full overflow-hidden rounded-lg bg-foreground/[0.04]"
        style={{ aspectRatio }}
      >
        {recording.thumbnailUrl ? (
          <img
            src={recording.thumbnailUrl}
            alt={displayName}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="absolute inset-0 bg-foreground/[0.03] flex items-center justify-center">
            <Film className="h-6 w-6 text-muted-foreground/25" strokeWidth={1.5} />
          </div>
        )}

        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" />

        {/* Play button - appears on hover */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center",
              "bg-white/90 backdrop-blur-sm",
              "shadow-md shadow-black/20",
              "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100",
              "transition-all duration-100 ease-out"
            )}
          >
            <Play className="h-3.5 w-3.5 text-black/85 ml-0.5" fill="currentColor" />
          </div>
        </div>

        {/* Duration badge - native macOS style */}
        {duration > 0 && (
          <div className="absolute bottom-1.5 left-1.5">
            <span className={cn(
              "inline-flex px-1.5 py-0.5 rounded",
              "bg-black/60 backdrop-blur-sm",
              "text-white text-[10px] font-semibold",
              "tabular-nums leading-none"
            )}>
              {formatTime(duration)}
            </span>
          </div>
        )}

        {/* Action buttons - top right */}
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
          {/* Info tooltip - hover to show */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleInfoClick}
                  className={cn(
                    "h-6 w-6 rounded flex items-center justify-center",
                    "bg-black/50 backdrop-blur-sm text-white/90",
                    "opacity-0 group-hover:opacity-100",
                    "hover:bg-black/60 active:bg-black/70",
                    "transition-all duration-75"
                  )}
                  aria-label="View details"
                >
                  <Info className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="end"
                sideOffset={4}
                className={cn(
                  "w-52 p-3 rounded-xl",
                  "bg-popover/95 backdrop-blur-xl",
                  "border border-border/40",
                  "shadow-xl shadow-black/25"
                )}
              >
                <div>
                  <h4 className="text-[13px] font-semibold text-foreground truncate mb-2">
                    {displayName}
                  </h4>
                  <div className="space-y-1 border-t border-border/20 pt-2">
                    <MetadataRow icon={Film} label="Resolution" value={getDetailedResolution(width, height)} />
                    <MetadataRow icon={HardDrive} label="Size" value={formatFileSize(fileSize)} />
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <ActionPill
            onRename={onRequestRename ? () => onRequestRename(recording) : undefined}
            onDuplicate={onRequestDuplicate ? () => onRequestDuplicate(recording) : undefined}
            onDelete={onRequestDelete ? () => onRequestDelete(recording) : undefined}
            alwaysVisible={false}
          />
        </div>
      </div>

      {/* Metadata - clean Apple typography */}
      <div className="pt-2 pb-0.5 relative">
        <h3 className="font-medium text-foreground/90 truncate text-[13px] leading-tight">
          {displayName}
        </h3>
        <p className="text-muted-foreground/50 text-[11px] mt-0.5 leading-tight">
          {relativeTime}
          {fileSize > 0 && (
            <span className="text-muted-foreground/35"> · {formatFileSize(fileSize)}</span>
          )}
        </p>
      </div>
    </motion.article>
  )
})
