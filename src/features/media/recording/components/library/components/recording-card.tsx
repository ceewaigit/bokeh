"use client"

import React, { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Copy, Film, HardDrive, Info, PencilLine, Play, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { motion, useReducedMotion } from 'framer-motion'
import { type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { formatTime } from '@/shared/utils/time'
import { cn } from '@/shared/utils/utils'
import { PROJECT_EXTENSION_REGEX } from '@/features/core/storage/project-paths'
import { useTheme } from '@/shared/contexts/theme-context'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

/**
 * Extract the dominant color from an image URL using canvas sampling.
 * Returns a theme-aware, muted color suitable for hover backgrounds.
 */
function useDominantColor(imageUrl: string | undefined, isDark: boolean): string | null {
  const [color, setColor] = useState<string | null>(null)

  useEffect(() => {
    if (!imageUrl) {
      setColor(null)
      return
    }

    const img = document.createElement('img')
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Sample a small version for performance
      const sampleSize = 10
      canvas.width = sampleSize
      canvas.height = sampleSize
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize)

      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize).data

      // Aggregate colors with weighted average (center pixels weighted more)
      let r = 0, g = 0, b = 0, count = 0
      const centerX = sampleSize / 2
      const centerY = sampleSize / 2

      for (let i = 0; i < imageData.length; i += 4) {
        const pixelIndex = i / 4
        const x = pixelIndex % sampleSize
        const y = Math.floor(pixelIndex / sampleSize)

        // Weight pixels closer to center more heavily
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
        const weight = Math.max(0.5, 1 - distance / sampleSize)

        // Skip very dark or very light pixels for better color extraction
        const brightness = (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3
        if (brightness < 15 || brightness > 240) continue

        r += imageData[i] * weight
        g += imageData[i + 1] * weight
        b += imageData[i + 2] * weight
        count += weight
      }

      if (count > 0) {
        r = Math.round(r / count)
        g = Math.round(g / count)
        b = Math.round(b / count)

        // Calculate luminance (perceived brightness)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

        // Theme-aware color adjustment for contrast
        if (isDark) {
          // Dark mode: ensure color is bright enough to be visible
          // If too dark, shift toward a lighter, more saturated version
          if (luminance < 0.4) {
            // Boost brightness significantly for dark colors
            const boost = 1.8
            r = Math.min(255, Math.round(r * boost + 60))
            g = Math.min(255, Math.round(g * boost + 60))
            b = Math.min(255, Math.round(b * boost + 60))
          }
          // Use higher opacity for visibility on dark backgrounds
          setColor(`rgba(${r}, ${g}, ${b}, 0.15)`)
        } else {
          // Light mode: ensure color is dark enough to be visible
          // If too bright, shift toward a darker, richer version
          if (luminance > 0.6) {
            // Darken bright colors
            const darken = 0.5
            r = Math.round(r * darken)
            g = Math.round(g * darken)
            b = Math.round(b * darken)
          }
          // Slightly desaturate for elegance
          const avg = (r + g + b) / 3
          const satFactor = 0.7
          r = Math.round(r * satFactor + avg * (1 - satFactor))
          g = Math.round(g * satFactor + avg * (1 - satFactor))
          b = Math.round(b * satFactor + avg * (1 - satFactor))

          setColor(`rgba(${r}, ${g}, ${b}, 0.1)`)
        }
      }
    }

    img.onerror = () => setColor(null)
    img.src = imageUrl

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [imageUrl, isDark])

  return color
}

interface RecordingCardProps {
  recording: LibraryRecordingView
  onSelect: (recording: LibraryRecordingView) => void
  onRequestRename?: (recording: LibraryRecordingView) => void
  onRequestDuplicate?: (recording: LibraryRecordingView) => void
  onRequestDelete?: (recording: LibraryRecordingView) => void
  /** Whether this card is currently highlighted (hovered in the grid) */
  isHighlighted?: boolean
  /** Called when this card is hovered */
  onHover?: () => void
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

// BATTERY OPTIMIZATION: Memoize to prevent rerenders when parent updates but props unchanged
export const RecordingCard = React.memo(function RecordingCard({
  recording,
  onSelect,
  onRequestRename,
  onRequestDuplicate,
  onRequestDelete,
  isHighlighted = false,
  onHover,
}: RecordingCardProps) {
  const reduceMotion = useReducedMotion()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const dominantColor = useDominantColor(recording.thumbnailUrl, isDark)
  const [showMetadata, setShowMetadata] = useState(false)

  const displayName = getDisplayName(recording)
  const relativeTime = getRelativeTime(recording.timestamp)
  const duration = recording.projectInfo?.duration || 0

  // Get natural aspect ratio from recording dimensions for masonry grid
  const width = recording.projectInfo?.width || 1920
  const height = recording.projectInfo?.height || 1080
  const aspectRatio = width / height
  const fileSize = recording.mediaFileSize || 0

  // Prevent click propagation when clicking info button
  const handleInfoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

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
      onMouseEnter={onHover}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "group relative rounded-xl p-2 -m-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {/* Background glow based on dominant color from thumbnail */}
      <div
        className={cn(
          "absolute inset-0 rounded-xl",
          "opacity-0 group-hover:opacity-100",
          "transition-opacity duration-200 ease-out"
        )}
        style={{
          backgroundColor: dominantColor || (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'),
        }}
      />

      {/* Thumbnail container - natural aspect ratio for masonry grid */}
      <div
        className="relative w-full overflow-hidden rounded-[10px] bg-muted/20"
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
          <div className="absolute inset-0 bg-muted/20 flex items-center justify-center">
            <Film className="h-7 w-7 text-muted-foreground/30" strokeWidth={1.5} />
          </div>
        )}

        {/* Subtle vignette overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-60" />

        {/* Hover overlay with play button */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-150 flex items-center justify-center">
          <motion.div
            initial={false}
            animate={{
              opacity: isHighlighted ? 1 : 0,
              scale: isHighlighted ? 1 : 0.85
            }}
            className={cn(
              "w-10 h-10 rounded-full bg-white/95 backdrop-blur-sm flex items-center justify-center",
              "shadow-lg shadow-black/15",
              "opacity-0 scale-85 group-hover:opacity-100 group-hover:scale-100",
              "transition-all duration-150 ease-out"
            )}
          >
            <Play className="h-4 w-4 text-black/90 ml-0.5" fill="currentColor" />
          </motion.div>
        </div>

        {/* Duration badge - bottom left with improved styling */}
        {duration > 0 && (
          <div className="absolute bottom-2 left-2">
            <span className={cn(
              "px-1.5 py-[3px] rounded-md",
              "bg-black/55 backdrop-blur-md",
              "text-white/95 text-[10px] font-semibold",
              "tabular-nums tracking-tight",
              "shadow-sm"
            )}>
              {formatTime(duration)}
            </span>
          </div>
        )}

        {/* Action pill - top right */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {/* Info button with hover-triggered popover */}
          <Popover open={showMetadata} onOpenChange={setShowMetadata}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={handleInfoClick}
                onMouseEnter={() => setShowMetadata(true)}
                onMouseLeave={() => setShowMetadata(false)}
                className={cn(
                  "h-7 w-7 rounded-md flex items-center justify-center",
                  "bg-black/40 backdrop-blur-md text-white/90",
                  "opacity-0 group-hover:opacity-100",
                  "hover:bg-black/50",
                  "transition-all duration-150 ease-out"
                )}
                aria-label="View details"
              >
                <Info className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              sideOffset={6}
              className={cn(
                "w-56 p-3 rounded-xl",
                "bg-popover/95 backdrop-blur-xl",
                "border border-border/50",
                "shadow-xl shadow-black/20"
              )}
              onClick={handleInfoClick}
              onMouseEnter={() => setShowMetadata(true)}
              onMouseLeave={() => setShowMetadata(false)}
            >
              <div className="space-y-0.5">
                <h4 className="text-[13px] font-semibold text-foreground/95 truncate mb-2.5 tracking-tight">
                  {displayName}
                </h4>
                <div className="space-y-0 border-t border-border/30 pt-2">
                  <MetadataRow icon={Film} label="Resolution" value={getDetailedResolution(width, height)} />
                  <MetadataRow icon={HardDrive} label="Size" value={formatFileSize(fileSize)} />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <ActionPill
            onRename={onRequestRename ? () => onRequestRename(recording) : undefined}
            onDuplicate={onRequestDuplicate ? () => onRequestDuplicate(recording) : undefined}
            onDelete={onRequestDelete ? () => onRequestDelete(recording) : undefined}
            alwaysVisible={false}
          />
        </div>
      </div>

      {/* Metadata below thumbnail - refined typography */}
      <div className="pt-2.5 pb-1">
        <h3 className={cn(
          "font-medium text-foreground/90 truncate",
          "text-[13px] tracking-[-0.01em] leading-snug"
        )}>
          {displayName}
        </h3>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-muted-foreground/50 text-[11px] tracking-tight">
            {relativeTime}
          </p>
          {fileSize > 0 && (
            <>
              <span className="text-muted-foreground/30 text-[11px]">·</span>
              <p className="text-muted-foreground/40 text-[11px] tabular-nums tracking-tight">
                {formatFileSize(fileSize)}
              </p>
            </>
          )}
        </div>
      </div>

    </motion.article>
  )
})
