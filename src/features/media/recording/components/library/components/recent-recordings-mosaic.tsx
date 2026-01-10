import Image from 'next/image'
import { Copy, PencilLine, Play, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { motion, useReducedMotion } from 'framer-motion'
import { type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { formatTime } from '@/shared/utils/time'
import { formatBytes } from '../utils/format-bytes'
import { cn } from '@/shared/utils/utils'
import { Button } from '@/components/ui/button'
import { PROJECT_EXTENSION_REGEX } from '@/features/core/storage/project-paths'
import { springConfig } from '@/features/effects/components/motion-controls'

const MotionButton = motion.create(Button)

interface RecentRecordingsMosaicProps {
  recordings: LibraryRecordingView[]
  onSelect: (recording: LibraryRecordingView) => void
  onRequestRename?: (recording: LibraryRecordingView) => void
  onRequestDuplicate?: (recording: LibraryRecordingView) => void
  onRequestDelete?: (recording: LibraryRecordingView) => void
}

const buildDisplayName = (recording: LibraryRecordingView) =>
  recording.projectInfo?.name || recording.name.replace(/^Recording_/, '').replace(PROJECT_EXTENSION_REGEX, '')

const buildMetaChips = (recording: LibraryRecordingView) => {
  const chips: Array<{ label: string; mono?: boolean }> = []
  const duration = recording.projectInfo?.duration || 0
  if (duration > 0) {
    chips.push({ label: formatTime(duration), mono: true })
  }
  if (recording.projectInfo?.width && recording.projectInfo?.height) {
    chips.push({ label: `${recording.projectInfo.width}x${recording.projectInfo.height}`, mono: true })
  }
  if (recording.mediaFileSize) {
    chips.push({ label: formatBytes(recording.mediaFileSize), mono: true })
  }
  const clipCount = recording.projectInfo?.recordingCount || 0
  if (clipCount > 0) {
    chips.push({ label: `${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}` })
  }
  return chips
}

const ActionPill = ({
  onRename,
  onDuplicate,
  onDelete,
  visible = true
}: {
  onRename?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  visible?: boolean
}) => (
  <div
    className={cn(
      "flex items-center gap-1 rounded-full bg-black/35 p-1 text-white/80 backdrop-blur-md",
      "transition-opacity duration-200",
      visible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
    )}
  >
    {onRename && (
      <button
        type="button"
        className="h-7 w-7 rounded-full hover:bg-white/10 flex items-center justify-center"
        onClick={(event) => {
          event.stopPropagation()
          onRename()
        }}
        aria-label="Rename recording"
      >
        <PencilLine className="h-3.5 w-3.5" />
      </button>
    )}
    {onDuplicate && (
      <button
        type="button"
        className="h-7 w-7 rounded-full hover:bg-white/10 flex items-center justify-center"
        onClick={(event) => {
          event.stopPropagation()
          onDuplicate()
        }}
        aria-label="Duplicate recording"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    )}
    {onDelete && (
      <button
        type="button"
        className="h-7 w-7 rounded-full hover:bg-red-500/70 flex items-center justify-center"
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        aria-label="Delete recording"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
)

const HeroCard = ({
  recording,
  onSelect,
  onRequestRename,
  onRequestDuplicate,
  onRequestDelete,
  className
}: {
  recording: LibraryRecordingView
  onSelect: (recording: LibraryRecordingView) => void
  onRequestRename?: (recording: LibraryRecordingView) => void
  onRequestDuplicate?: (recording: LibraryRecordingView) => void
  onRequestDelete?: (recording: LibraryRecordingView) => void
  className?: string
}) => {
  const reduceMotion = useReducedMotion()
  const displayName = buildDisplayName(recording)
  const relativeTime = formatDistanceToNow(recording.timestamp, { addSuffix: true })
    .replace('about ', '')
    .replace('less than ', '<')
  const metaChips = buildMetaChips(recording)

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`Open ${displayName}`}
      onClick={() => onSelect(recording)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(recording)
        }
      }}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      whileTap={reduceMotion ? undefined : { y: 0 }}
      transition={reduceMotion ? { duration: 0 } : springConfig}
      className={cn(
        "group relative w-full overflow-hidden rounded-3xl border border-border/50 bg-card/70 backdrop-blur-sm",
        "shadow-[0_18px_50px_-40px_rgba(0,0,0,0.65)]",
        "text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <div className="absolute inset-0">
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
              <Play className="h-6 w-6 text-muted-foreground/60" />
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
      </div>

      <div className="absolute inset-0 p-5 sm:p-6">
        <div className="absolute left-4 top-3 flex items-center gap-2 text-3xs uppercase tracking-[0.28em] text-white/80">
          <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
          Recent
        </div>
        <div className="absolute right-2 top-2 sm:right-3 sm:top-3">
          <ActionPill
            onRename={onRequestRename ? () => onRequestRename(recording) : undefined}
            onDuplicate={onRequestDuplicate ? () => onRequestDuplicate(recording) : undefined}
            onDelete={onRequestDelete ? () => onRequestDelete(recording) : undefined}
            visible
          />
        </div>

        <div className="flex h-full items-center">
          <div className="max-w-full sm:max-w-[75%] space-y-3">
            <div className="text-3xs uppercase tracking-[0.22em] text-white/60">
              Last opened {relativeTime}
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
              {displayName}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-2xs text-white/70">
              {metaChips.map((chip) => (
                <span
                  key={chip.label}
                  className={cn(
                    "rounded-full bg-white/15 px-2.5 py-1",
                    chip.mono ? "font-mono" : "font-medium"
                  )}
                >
                  {chip.label}
                </span>
              ))}
            </div>
            <div className="pt-2">
              <MotionButton
                variant="secondary"
                className="h-9 rounded-full bg-white/90 px-4 text-sm font-semibold text-black hover:bg-white"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(recording)
                }}
                whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                transition={reduceMotion ? { duration: 0 } : springConfig}
              >
                <Play className="h-4 w-4 mr-2" />
                Open
              </MotionButton>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

const WideCard = ({
  recording,
  onSelect,
  onRequestRename,
  onRequestDuplicate,
  onRequestDelete,
  className
}: {
  recording: LibraryRecordingView
  onSelect: (recording: LibraryRecordingView) => void
  onRequestRename?: (recording: LibraryRecordingView) => void
  onRequestDuplicate?: (recording: LibraryRecordingView) => void
  onRequestDelete?: (recording: LibraryRecordingView) => void
  className?: string
}) => {
  const reduceMotion = useReducedMotion()
  const displayName = buildDisplayName(recording)
  const relativeTime = formatDistanceToNow(recording.timestamp, { addSuffix: true })
    .replace('about ', '')
    .replace('less than ', '<')
  const metaChips = buildMetaChips(recording)

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`Open ${displayName}`}
      onClick={() => onSelect(recording)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(recording)
        }
      }}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      whileTap={reduceMotion ? undefined : { y: 0 }}
      transition={reduceMotion ? { duration: 0 } : springConfig}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm",
        "text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <div className="absolute inset-0">
        {recording.thumbnailUrl ? (
          <Image
            src={recording.thumbnailUrl}
            alt={recording.name}
            className="object-cover"
            fill
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
      </div>

      <div className="absolute inset-0 p-4 sm:p-5">
        <div className="absolute right-2 top-2 sm:right-3 sm:top-3">
          <ActionPill
            onRename={onRequestRename ? () => onRequestRename(recording) : undefined}
            onDuplicate={onRequestDuplicate ? () => onRequestDuplicate(recording) : undefined}
            onDelete={onRequestDelete ? () => onRequestDelete(recording) : undefined}
            visible={false}
          />
        </div>
        <div className="flex h-full items-center">
          <div className="space-y-2">
            <div className="text-3xs uppercase tracking-[0.22em] text-white/60">
              {relativeTime}
            </div>
            <div className="text-sm font-semibold tracking-tight text-white">
              {displayName}
            </div>
            <div className="flex flex-wrap gap-2 text-3xs text-white/70">
              {metaChips.slice(0, 2).map((chip) => (
                <span
                  key={chip.label}
                  className={cn(
                    "rounded-full bg-white/15 px-2 py-0.5",
                    chip.mono ? "font-mono" : "font-medium"
                  )}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export const RecentRecordingsMosaic = ({
  recordings,
  onSelect,
  onRequestRename,
  onRequestDuplicate,
  onRequestDelete
}: RecentRecordingsMosaicProps) => {
  const hero = recordings[0]
  const secondary = recordings.slice(1, 4)

  if (!hero) return null

  const sideA = secondary[0]
  const sideB = secondary[1]
  const bottom = secondary[2]

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-12 lg:items-stretch lg:gap-4 lg:space-y-0">
      <HeroCard
        recording={hero}
        onSelect={onSelect}
        onRequestRename={onRequestRename}
        onRequestDuplicate={onRequestDuplicate}
        onRequestDelete={onRequestDelete}
        className={cn(
          "aspect-[16/9] sm:aspect-[16/8]",
          "lg:col-span-7 lg:row-span-2 lg:aspect-auto lg:min-h-[420px]"
        )}
      />
      {(sideA || sideB || bottom) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-5 lg:row-span-2 lg:h-full lg:grid-cols-1 lg:grid-rows-3 lg:content-stretch">
          {sideA && (
            <WideCard
              recording={sideA}
              onSelect={onSelect}
              onRequestRename={onRequestRename}
              onRequestDuplicate={onRequestDuplicate}
              onRequestDelete={onRequestDelete}
              className="aspect-[16/8] lg:h-full lg:aspect-auto lg:min-h-0"
            />
          )}
          {sideB && (
            <WideCard
              recording={sideB}
              onSelect={onSelect}
              onRequestRename={onRequestRename}
              onRequestDuplicate={onRequestDuplicate}
              onRequestDelete={onRequestDelete}
              className="aspect-[16/8] lg:h-full lg:aspect-auto lg:min-h-0"
            />
          )}
          {bottom && (
            <WideCard
              recording={bottom}
              onSelect={onSelect}
              onRequestRename={onRequestRename}
              onRequestDuplicate={onRequestDuplicate}
              onRequestDelete={onRequestDelete}
              className="aspect-[16/8] sm:col-span-2 lg:h-full lg:col-span-1 lg:aspect-auto lg:min-h-0"
            />
          )}
        </div>
      )}
    </div>
  )
}
