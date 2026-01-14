"use client"

import { useMemo, useRef, useState } from 'react'
import { Loader2, SearchX } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/shared/utils/utils'
import { Toolbar } from '@/components/toolbar'
import { useProjectStore } from '@/features/core/stores/project-store'
import { type LibraryRecording, type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { PROJECT_EXTENSION_REGEX } from '@/features/core/storage/project-paths'
import { useMediaQuery } from '@/shared/hooks/use-media-query'
import { LibraryEmptyState } from './components/library-empty-state'
import { LibraryLoadingState } from './components/library-loading-state'
import { RecordingCard } from './components/recording-card'
import { DeleteRecordingDialog } from './components/delete-recording-dialog'
import { RecordingNameDialog } from './components/recording-name-dialog'
import { LibrarySidebar } from './components/library-sidebar'
import { DateGroupHeader } from './components/date-group-header'
import { useRecordingsLibraryData } from './hooks/use-recordings-library-data'
import { useInfiniteScroll } from './hooks/use-infinite-scroll'
import { useScrollSpy } from './hooks/use-scroll-spy'
import { DATE_CATEGORIES, type DateCategoryId } from './utils/date-grouping'

interface RecordingsLibraryProps {
  onSelectRecording: (recording: LibraryRecording) => void | Promise<void>
}

export function RecordingsLibrary({ onSelectRecording }: RecordingsLibraryProps) {
  const includeAppWindows = useProjectStore((state) => state.settings.recording?.includeAppWindows ?? false)
  const showRecordButtonOptions = includeAppWindows ? { hideMainWindow: false } : undefined

  const {
    recordings,
    displayedRecordings,
    loading,
    showHydrationIndicator,
    hasMore,
    isLoadingMore,
    loadMore,
    pendingDelete,
    setPendingDelete,
    handleDeleteRecording,
    handleRenameRecording,
    handleDuplicateRecording,
    searchQuery,
    setSearchQuery,
    sortKey,
    totalRecordingsCount,
    groupedRecordings,
    categoryCounts,
    nonEmptyCategories,
    totalDurationMs,
    totalStorageBytes,
    lastRecordedDate,
  } = useRecordingsLibraryData()

  // Responsive: collapse sidebar on smaller screens
  const isNarrowScreen = useMediaQuery('(max-width: 900px)')
  const sidebarCollapsed = isNarrowScreen

  // Scroll container ref for scroll-spy
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Section IDs for scroll-spy (only non-empty categories)
  const sectionIds = useMemo(
    () => nonEmptyCategories.map((cat) => cat.id),
    [nonEmptyCategories]
  )

  const { activeSection, sectionRefs, scrollToSection } = useScrollSpy({
    sectionIds,
    containerRef: scrollContainerRef,
    offset: 140,
  })

  // Infinite scroll hook
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading: isLoadingMore,
    onLoadMore: loadMore,
    threshold: 300,
  })

  const [pendingRename, setPendingRename] = useState<LibraryRecordingView | null>(null)
  const [pendingDuplicate, setPendingDuplicate] = useState<LibraryRecordingView | null>(null)

  const handleSelect = async (rec: LibraryRecordingView) => {
    onSelectRecording(rec)
  }

  const handleNewRecording = () => {
    window.electronAPI?.showRecordButton?.(showRecordButtonOptions)
  }

  const handleCategoryClick = (categoryId: DateCategoryId) => {
    scrollToSection(categoryId)
  }

  if (loading) {
    return <LibraryLoadingState />
  }

  if (totalRecordingsCount === 0 && !loading) {
    return <LibraryEmptyState onNewRecording={handleNewRecording} />
  }

  // Check if we're showing grouped view (date sort, no search)
  const showGroupedView = sortKey === 'date' && !searchQuery

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
      {/* Unified Floating Pill Toolbar */}
      <Toolbar
        mode="library"
        libraryProps={{
          totalRecordings: recordings.length,
          searchQuery,
          onSearchChange: setSearchQuery,
          onNewRecording: handleNewRecording,
        }}
      />

      {/* Main layout with sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar area - horizontally centered content */}
        <div className={cn(
          "flex-shrink-0 flex items-center justify-center",
          sidebarCollapsed
            ? "w-14"
            : "min-w-[240px] w-[25%]"
        )}>
          <LibrarySidebar
            categories={nonEmptyCategories}
            counts={categoryCounts}
            activeCategory={activeSection}
            onCategoryClick={handleCategoryClick}
            totalCount={totalRecordingsCount}
            collapsed={sidebarCollapsed}
            totalDurationMs={totalDurationMs}
            totalStorageBytes={totalStorageBytes}
            lastRecordedDate={lastRecordedDate}
          />
        </div>

        {/* Main scrollable content area */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto scrollbar-thin scroll-smooth"
        >
          {/* Top padding to start content toward vertical center */}
          <div className="pt-[15vh]" />

          <div className="w-full max-w-4xl mx-auto px-8">
            {displayedRecordings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500">
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-muted/20 blur-[40px] rounded-full opacity-50" />
                  <div className="relative w-20 h-20 rounded-[1.5rem] bg-gradient-to-b from-muted/20 to-muted/5 border border-border/30 backdrop-blur-xl flex items-center justify-center shadow-xl ring-1 ring-border/20">
                    <SearchX className="w-9 h-9 text-muted-foreground/60" strokeWidth={1.5} />
                  </div>
                </div>
                <div className="space-y-3 text-center">
                  <h3 className="text-xl font-display italic tracking-[-0.02em] text-foreground">
                    No matches
                  </h3>
                  <p className="text-sm text-muted-foreground/70 max-w-xs leading-relaxed">
                    We couldn&apos;t find any recordings matching &quot;{searchQuery}&quot;
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Content: Grouped or Flat view */}
                {showGroupedView ? (
                  // Grouped view with date sections
                  <div className="space-y-8">
                    {DATE_CATEGORIES.map((category) => {
                      const categoryRecordings = groupedRecordings.get(category.id) || []
                      if (categoryRecordings.length === 0) return null

                      return (
                        <section
                          key={category.id}
                          ref={(el) => {
                            const ref = sectionRefs[category.id]
                            if (ref && 'current' in ref) {
                              (ref as { current: HTMLElement | null }).current = el
                            }
                          }}
                        >
                          <DateGroupHeader
                            label={category.label}
                            count={categoryRecordings.length}
                          />

                          {/* Recording cards grid - max 4 columns */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {categoryRecordings.map((recording) => (
                              <RecordingCard
                                key={recording.path}
                                recording={recording}
                                onSelect={handleSelect}
                                onRequestRename={setPendingRename}
                                onRequestDuplicate={setPendingDuplicate}
                                onRequestDelete={setPendingDelete}
                              />
                            ))}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                ) : (
                  // Flat view (when searching or sorting by non-date)
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {displayedRecordings.map((recording) => (
                      <RecordingCard
                        key={recording.path}
                        recording={recording}
                        onSelect={handleSelect}
                        onRequestRename={setPendingRename}
                        onRequestDuplicate={setPendingDuplicate}
                        onRequestDelete={setPendingDelete}
                      />
                    ))}
                  </div>
                )}

                {/* Sentinel element for infinite scroll */}
                <div ref={sentinelRef} className="h-px" />

                {/* Loading indicator for infinite scroll */}
                <AnimatePresence>
                  {(isLoadingMore || showHydrationIndicator) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex justify-center py-6"
                    >
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 backdrop-blur-sm border border-border/30">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        <span className="text-2xs font-medium text-muted-foreground">Loading...</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* End of list indicator */}
                {!hasMore && displayedRecordings.length > 24 && (
                  <div className="flex justify-center py-6">
                    <span className="text-2xs text-muted-foreground/50">
                      {displayedRecordings.length} recordings
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom padding */}
          <div className="pb-[15vh]" />
        </div>
      </div>

      <DeleteRecordingDialog
        pendingDelete={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async (rec) => {
          setPendingDelete(null)
          await handleDeleteRecording(rec)
        }}
      />

      <RecordingNameDialog
        open={!!pendingRename}
        title="Rename recording"
        description="Update the name shown in your library."
        confirmLabel="Rename"
        initialValue={
          pendingRename
            ? pendingRename.projectInfo?.name || pendingRename.name.replace(/^Recording_/, '').replace(PROJECT_EXTENSION_REGEX, '')
            : ''
        }
        onConfirm={async (value) => {
          if (!pendingRename) return
          await handleRenameRecording(pendingRename, value)
          setPendingRename(null)
        }}
        onOpenChange={(open) => {
          if (!open) setPendingRename(null)
        }}
      />

      <RecordingNameDialog
        open={!!pendingDuplicate}
        title="Duplicate recording"
        description="Create a copy with a new name."
        confirmLabel="Duplicate"
        initialValue={
          pendingDuplicate
            ? `${pendingDuplicate.projectInfo?.name || pendingDuplicate.name.replace(/^Recording_/, '').replace(PROJECT_EXTENSION_REGEX, '')} Copy`
            : ''
        }
        onConfirm={async (value) => {
          if (!pendingDuplicate) return
          await handleDuplicateRecording(pendingDuplicate, value)
          setPendingDuplicate(null)
        }}
        onOpenChange={(open) => {
          if (!open) setPendingDuplicate(null)
        }}
      />
    </div>
  )
}
