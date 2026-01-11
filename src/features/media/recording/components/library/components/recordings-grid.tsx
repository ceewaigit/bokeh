import { useMemo } from 'react'
import Image from 'next/image'
import { Copy, Film, Info, PencilLine, Play, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/shared/utils/utils'
import { formatTime } from '@/shared/utils/time'
import { type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { PROJECT_EXTENSION_REGEX } from '@/features/core/storage/project-paths'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatBytes } from '../utils/format-bytes'

interface RecordingsGridProps {
  recordings: LibraryRecordingView[]
  gridCapacity: number
  isExpandedLayout: boolean
  gridRef?: (el: HTMLDivElement | null) => void
  onSelect: (recording: LibraryRecordingView) => void
  onRequestDelete?: (recording: LibraryRecordingView) => void
  onRequestRename?: (recording: LibraryRecordingView) => void
  onRequestDuplicate?: (recording: LibraryRecordingView) => void
  showDeleteAction?: boolean
}

export const RecordingsGrid = ({
  recordings,
  gridCapacity,
  isExpandedLayout,
  gridRef,
  onSelect,
  onRequestDelete,
  onRequestRename,
  onRequestDuplicate,
  showDeleteAction = true
}: RecordingsGridProps) => {
  const placeholders = useMemo(() => {
    return Array.from({
      length: Math.max(0, Math.min(12, gridCapacity - recordings.length))
    })
  }, [gridCapacity, recordings.length])
  const showActions = showDeleteAction || onRequestRename || onRequestDuplicate

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5"
    >
      {recordings.map((recording) => {
        const displayName = recording.projectInfo?.name || recording.name.replace(/^Recording_/, '').replace(PROJECT_EXTENSION_REGEX, '')
        const relativeTime = formatDistanceToNow(recording.timestamp, { addSuffix: true })
          .replace('about ', '')
          .replace('less than ', '<')
        const hasDuration = (recording.projectInfo?.duration || 0) > 0
        const resolutionLabel =
          recording.projectInfo?.width && recording.projectInfo?.height
            ? `${recording.projectInfo.width}x${recording.projectInfo.height} `
            : null

        const detailsButton = (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center justify-center rounded-md p-1',
                  isExpandedLayout
                    ? 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/30'
                    : 'bg-black/35 border border-white/10 text-white/80 backdrop-blur-md hover:bg-black/50 hover:text-white',
                  'transition-colors',
                  'focus-visible:outline-none'
                )}
                aria-label="Recording details"
                onClick={(e) => e.stopPropagation()}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="end" className="text-xs">
              <div className="space-y-1">
                <div className="font-medium text-foreground">
                  {recording.projectInfo?.name || recording.name.replace(PROJECT_EXTENSION_REGEX, '')}
                </div>
                <div className="text-muted-foreground">
                  Created: {recording.timestamp.toLocaleString()}
                </div>
                {recording.projectInfo?.width && recording.projectInfo?.height && (
                  <div className="text-muted-foreground">
                    Resolution: <span className="font-mono">{recording.projectInfo.width}×{recording.projectInfo.height}</span>
                  </div>
                )}
                {hasDuration && (
                  <div className="text-muted-foreground">
                    Duration: <span className="font-mono">{formatTime(recording.projectInfo?.duration || 0)}</span>
                  </div>
                )}
                {recording.mediaFileSize && (
                  <div className="text-muted-foreground">
                    Metadata: <span className="font-mono">{formatBytes(recording.mediaFileSize)}</span>
                  </div>
                )}
                {recording.projectFileSize && (
                  <div className="text-muted-foreground">
                    Project: <span className="font-mono">{formatBytes(recording.projectFileSize)}</span>
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )

        return (
          <div
            key={recording.path}
            className="group relative motion-safe:animate-in motion-safe:fade-in duration-150"
            data-library-card="true"
          >
            <div
              className={cn(
                'relative rounded-xl overflow-hidden cursor-pointer',
                'bg-muted/10 border border-border/30',
                'transition-[box-shadow,border-color] duration-150 ease-out',
                'hover:shadow-md hover:border-border/55',
                'active:shadow-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
              )}
              onClick={() => onSelect(recording)}
              role="button"
              tabIndex={0}
              aria-label={`Open ${displayName}`}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(recording)
                }
              }}
            >
              <div className="aspect-video relative bg-muted/10 overflow-hidden">
                {recording.thumbnailUrl ? (
                  <>
                    <Image
                      src={recording.thumbnailUrl}
                      alt={recording.name}
                      className="object-cover"
                      fill
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      <Film className="w-8 h-8 text-muted-foreground/20" />
                    </div>
                  </div>
                )}

                <div
                  className={cn(
                    'absolute inset-0 flex items-center justify-center',
                    'opacity-0 bg-black/10 backdrop-blur-[1px] transition-opacity duration-150',
                    'group-hover:opacity-100'
                  )}
                >
                  <div className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-pill flex items-center justify-center shadow-md transition-transform duration-150 ease-out group-hover:scale-105">
                    <Play className="w-4 h-4 text-black ml-0.5" fill="currentColor" />
                  </div>
                </div>

                {!isExpandedLayout && (
                  <div className="absolute inset-x-0 bottom-0">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                    <div className="relative p-2.5">
                      <div className="flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold tracking-tight text-xs text-white truncate drop-shadow-sm">
                            {displayName}
                          </h3>
                          <div className="mt-1 flex items-center gap-1.5 text-3xs text-white/70">
                            {hasDuration && (
                              <span className="font-mono px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-white/80">
                                {formatTime(recording.projectInfo?.duration || 0)}
                              </span>
                            )}
                            <span className="truncate">{relativeTime}</span>
                            {recording.mediaFileSize && (
                              <span className="ml-auto font-mono px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-white/70 whitespace-nowrap">
                                {formatBytes(recording.mediaFileSize)}
                              </span>
                            )}
                          </div>
                        </div>

                        {detailsButton}
                      </div>
                    </div>
                  </div>
                )}

                {isExpandedLayout && hasDuration && (
                  <div className="absolute bottom-2 right-2">
                    <span className="font-mono px-1.5 py-0.5 rounded-md bg-black/60 border border-white/10 text-3xs text-white/85">
                      {formatTime(recording.projectInfo?.duration || 0)}
                    </span>
                  </div>
                )}
              </div>

              {isExpandedLayout && (
                <div className="flex items-start justify-between gap-3 px-3 pt-2.5 pb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold tracking-tight text-ui-sm text-foreground truncate">
                      {displayName}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
                      <span className="truncate">{relativeTime}</span>
                      {resolutionLabel && (
                        <span className="font-mono text-muted-foreground/80">{resolutionLabel}</span>
                      )}
                      {recording.mediaFileSize && (
                        <span className="font-mono text-muted-foreground/80 whitespace-nowrap">
                          {formatBytes(recording.mediaFileSize)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-muted-foreground">
                    {detailsButton}
                  </div>
                </div>
              )}

              <div
                className={cn(
                  'absolute top-2 right-2',
                  'opacity-0 -translate-y-1 transition-all duration-150 ease-out',
                  'group-hover:opacity-100 group-hover:translate-y-0'
                )}
              >
                {showActions && (
                  <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-md p-0.5 shadow-sm border border-white/10">
                    {onRequestRename && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-5 h-5 p-0 hover:bg-white/10 hover:text-white text-white/80 rounded focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRequestRename(recording)
                        }}
                        title="Rename"
                      >
                        <PencilLine className="w-3 h-3" />
                      </Button>
                    )}
                    {onRequestDuplicate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-5 h-5 p-0 hover:bg-white/10 hover:text-white text-white/80 rounded focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRequestDuplicate(recording)
                        }}
                        title="Duplicate"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    )}
                    {showDeleteAction && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-5 h-5 p-0 hover:bg-red-500/80 hover:text-white text-white/80 rounded focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRequestDelete?.(recording)
                        }}
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {placeholders.map((_, i) => (
        <div
          key={`placeholder - ${i} `}
          aria-hidden="true"
          className="relative rounded-lg overflow-hidden bg-muted/5 border border-border/20"
        >
          <div className="aspect-video relative">
            <div className="absolute inset-0 bg-gradient-to-br from-muted/10 via-transparent to-muted/5" />
          </div>
          {isExpandedLayout && (
            <div className="min-h-[72px] px-3 pt-2.5 pb-3">
              <div className="h-3.5 w-2/3 bg-muted/15 rounded" />
              <div className="mt-2 h-2.5 w-3/5 bg-muted/10 rounded" />
            </div>
          )}
        </div>
      ))}
    </div >
  )
}
