"use client"

import { motion, useReducedMotion } from 'framer-motion'
import { type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { cn } from '@/shared/utils/utils'
import { RecordingCard } from './recording-card'

interface MasonryGridProps {
  recordings: LibraryRecordingView[]
  onSelect: (recording: LibraryRecordingView) => void
  onRequestRename?: (recording: LibraryRecordingView) => void
  onRequestDuplicate?: (recording: LibraryRecordingView) => void
  onRequestDelete?: (recording: LibraryRecordingView) => void
  className?: string
}

export function MasonryGrid({
  recordings,
  onSelect,
  onRequestRename,
  onRequestDuplicate,
  onRequestDelete,
  className,
}: MasonryGridProps) {
  const reduceMotion = useReducedMotion()

  if (recordings.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        // CSS Grid - more performant than columns, no layout thrashing
        "grid gap-3",
        "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6",
        className
      )}
      style={{ transform: 'translateZ(0)' }}
    >
      {recordings.map((recording, index) => (
        <motion.div
          key={recording.path}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.2,
            delay: Math.min(index * 0.015, 0.15),
            ease: [0.25, 0.1, 0.25, 1],
          }}
        >
          <RecordingCard
            recording={recording}
            onSelect={onSelect}
            onRequestRename={onRequestRename}
            onRequestDuplicate={onRequestDuplicate}
            onRequestDelete={onRequestDelete}
          />
        </motion.div>
      ))}
    </div>
  )
}
