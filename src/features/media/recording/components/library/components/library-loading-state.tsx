"use client"

import { motion } from 'framer-motion'
import { Toolbar } from '@/components/toolbar'
import { LibrarySidebarSkeleton } from './library-sidebar'
import { cn } from '@/shared/utils/utils'

// Shimmer animation for skeleton elements
const shimmer = {
  initial: { backgroundPosition: '-200% 0' },
  animate: {
    backgroundPosition: '200% 0',
    transition: {
      repeat: Infinity,
      duration: 1.5,
      ease: 'linear',
    },
  },
}

function SkeletonCard({ index }: { index: number }) {
  // Vary aspect ratios for realistic masonry effect
  const aspectRatios = [16/9, 4/3, 16/10, 3/2, 16/9]
  const aspectRatio = aspectRatios[index % aspectRatios.length]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.05,
        ease: [0.23, 1, 0.32, 1]
      }}
      className="mb-5"
    >
      <div className="relative rounded-xl overflow-hidden bg-muted/5 border border-border/10">
        {/* Thumbnail area */}
        <div
          className="relative overflow-hidden"
          style={{ aspectRatio }}
        >
          <motion.div
            variants={shimmer}
            initial="initial"
            animate="animate"
            className={cn(
              "absolute inset-0",
              "bg-gradient-to-r from-transparent via-muted/10 to-transparent",
              "bg-[length:200%_100%]"
            )}
          />
        </div>

        {/* Metadata area */}
        <div className="p-3 space-y-2">
          <motion.div
            variants={shimmer}
            initial="initial"
            animate="animate"
            className={cn(
              "h-3.5 rounded-md w-3/4",
              "bg-gradient-to-r from-muted/15 via-muted/25 to-muted/15",
              "bg-[length:200%_100%]"
            )}
          />
          <motion.div
            variants={shimmer}
            initial="initial"
            animate="animate"
            className={cn(
              "h-3 rounded-md w-16",
              "bg-gradient-to-r from-muted/10 via-muted/20 to-muted/10",
              "bg-[length:200%_100%]"
            )}
          />
        </div>
      </div>
    </motion.div>
  )
}

export function LibraryLoadingState() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
      <Toolbar
        mode="library"
        libraryProps={{
          totalRecordings: 0,
          searchQuery: '',
          onSearchChange: () => {},
          onNewRecording: () => {},
        }}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar area */}
        <div className="flex-shrink-0 min-w-[240px] w-[25%] flex items-center justify-center">
          <LibrarySidebarSkeleton />
        </div>

        {/* Content skeleton */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent">
          {/* Top padding */}
          <div className="pt-[12vh]" />

          <div className="w-full max-w-5xl mx-auto px-8">
            {/* Controls bar skeleton */}
            <div className="flex items-center justify-between mb-6">
              <motion.div
                variants={shimmer}
                initial="initial"
                animate="animate"
                className={cn(
                  "h-8 w-20 rounded-lg",
                  "bg-gradient-to-r from-muted/10 via-muted/20 to-muted/10",
                  "bg-[length:200%_100%]"
                )}
              />
              <div className="flex items-center gap-2">
                <motion.div
                  variants={shimmer}
                  initial="initial"
                  animate="animate"
                  className={cn(
                    "h-7 w-24 rounded-lg",
                    "bg-gradient-to-r from-muted/10 via-muted/20 to-muted/10",
                    "bg-[length:200%_100%]"
                  )}
                />
                <motion.div
                  variants={shimmer}
                  initial="initial"
                  animate="animate"
                  className={cn(
                    "h-7 w-20 rounded-lg",
                    "bg-gradient-to-r from-muted/10 via-muted/20 to-muted/10",
                    "bg-[length:200%_100%]"
                  )}
                />
              </div>
            </div>

            {/* Masonry grid skeleton */}
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-5">
              {Array.from({ length: 12 }).map((_, i) => (
                <SkeletonCard key={i} index={i} />
              ))}
            </div>
          </div>

          {/* Bottom padding */}
          <div className="pb-[15vh]" />
        </div>
      </div>
    </div>
  )
}
