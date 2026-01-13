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

// Snappy spring config for entrance animations
const entranceSpring = { type: 'spring', stiffness: 500, damping: 28 } as const

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
        // CSS Columns for true masonry layout - cards stack vertically in columns
        "columns-1 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5",
        // Column gap
        "gap-4",
        // Prevent card breaks and add spacing between items
        "[&>*]:break-inside-avoid [&>*]:mb-4",
        className
      )}
    >
      {recordings.map((recording, index) => (
        <motion.div
          key={recording.path}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  ...entranceSpring,
                  // Faster stagger, capped at 200ms total
                  delay: Math.min(index * 0.02, 0.2),
                }
          }
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
