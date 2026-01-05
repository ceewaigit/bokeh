import Image from 'next/image'
import { Copy, PencilLine, Play, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { motion } from 'framer-motion'
import { type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { formatTime } from '@/shared/utils/time'
import { formatBytes } from '../utils/format-bytes'
import { cn } from '@/shared/utils/utils'
import { Button } from '@/components/ui/button'
import { PROJECT_EXTENSION_REGEX } from '@/features/core/storage/recording-storage'
import { springConfig } from '@/features/effects/components/motion-controls'

const MotionButton = motion.create(Button)

interface RecentRecordingCardProps {
  recording: LibraryRecordingView
  onSelect: (recording: LibraryRecordingView) => void
  onRequestRename?: (recording: LibraryRecordingView) => void
  onRequestDuplicate?: (recording: LibraryRecordingView) => void
  onRequestDelete?: (recording: LibraryRecordingView) => void
}

export const RecentRecordingCard = ({
  recording,
  onSelect,
  onRequestRename,
  onRequestDuplicate,
  onRequestDelete
}: RecentRecordingCardProps) => {
  const displayName = recording.projectInfo?.name || recording.name.replace(/^Recording_/, '').replace(PROJECT_EXTENSION_REGEX, '')
  const relativeTime = formatDistanceToNow(recording.timestamp, { addSuffix: true })
    .replace('about ', '')
    .replace('less than ', '<')
  const hasDuration = (recording.projectInfo?.duration || 0) > 0
  const resolutionLabel =
    recording.projectInfo?.width && recording.projectInfo?.height
      ? `${recording.projectInfo.width}x${recording.projectInfo.height}`
      : null
  const clipCount = recording.projectInfo?.recordingCount || 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/50",
        "bg-card/80 backdrop-blur-sm",
        "shadow-[0_18px_45px_-36px_rgba(0,0,0,0.6)]"
      )}
    >
      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <button
          type="button"
          onClick={() => onSelect(recording)}
          className="group relative flex h-full w-full overflow-hidden focus-visible:outline-none"
        >
          <div className="relative aspect-video w-full overflow-hidden bg-muted/20 lg:aspect-auto lg:min-h-[260px]">
            {recording.thumbnailUrl ? (
              <Image
                src={recording.thumbnailUrl}
                alt={recording.name}
                className="object-cover"
                fill
                unoptimized
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center">
                  <Play className="h-5 w-5 text-muted-foreground/60" />
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-3xs font-medium text-white/90 backdrop-blur-md">
              <Play className="h-3.5 w-3.5" />
              Open
            </div>
          </div>
        </button>

        <div className="relative flex flex-col gap-4 px-6 pb-6 pt-6 lg:pr-8">
          <div className="flex items-center gap-2 text-3xs uppercase tracking-[0.28em] text-muted-foreground/70">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
            Recent
          </div>
          <div className="space-y-2">
            <p className="text-3xs font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
              Last opened {relativeTime}
            </p>
            <h2 className="text-xl font-[var(--font-display)] font-semibold tracking-tight text-foreground leading-tight">
              {displayName}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
              {hasDuration && (
                <span className="rounded-full bg-muted/45 px-2.5 py-1 font-mono text-2xs text-foreground/80">
                  {formatTime(recording.projectInfo?.duration || 0)}
                </span>
              )}
              {resolutionLabel && (
                <span className="rounded-full bg-muted/35 px-2.5 py-1 font-mono text-2xs text-muted-foreground/80">
                  {resolutionLabel}
                </span>
              )}
              {recording.mediaFileSize && (
                <span className="rounded-full bg-muted/35 px-2.5 py-1 font-mono text-2xs text-muted-foreground/80">
                  {formatBytes(recording.mediaFileSize)}
                </span>
              )}
              {clipCount > 0 && (
                <span className="rounded-full bg-muted/35 px-2.5 py-1 text-2xs font-semibold text-muted-foreground/80">
                  {clipCount} {clipCount === 1 ? 'clip' : 'clips'}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MotionButton
              variant="default"
              className="h-9 px-5 rounded-full font-[var(--font-display)] font-semibold tracking-tight"
              onClick={() => onSelect(recording)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <Play className="h-4 w-4 mr-2" />
              Open
            </MotionButton>
            <MotionButton
              variant="outline"
              className="h-9 px-4 rounded-full"
              onClick={() => onRequestRename?.(recording)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <PencilLine className="h-3.5 w-3.5 mr-2" />
              Rename
            </MotionButton>
            <MotionButton
              variant="outline"
              className="h-9 px-4 rounded-full"
              onClick={() => onRequestDuplicate?.(recording)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <Copy className="h-3.5 w-3.5 mr-2" />
              Duplicate
            </MotionButton>
            <MotionButton
              variant="ghost"
              className="h-9 px-3 rounded-full text-destructive/80 hover:text-destructive"
              onClick={() => onRequestDelete?.(recording)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </MotionButton>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
