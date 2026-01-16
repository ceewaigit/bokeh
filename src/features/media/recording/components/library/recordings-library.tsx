"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownAZ,
  ArrowUpDown,
  Calendar,
  ChevronUp,
  Clock,
  HardDrive,
  LayoutGrid,
  List,
  Loader2,
  SearchX,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Masonry from 'react-masonry-css'
import { cn } from '@/shared/utils/utils'
import { Toolbar } from '@/components/toolbar'
import { useProjectStore } from '@/features/core/stores/project-store'
import { type LibraryRecording, type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { PROJECT_EXTENSION_REGEX } from '@/features/core/storage/project-paths'
import { useMediaQuery } from '@/shared/hooks/use-media-query'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

// ============================================================================
// TYPES
// ============================================================================

type SortKey = 'date' | 'name' | 'duration' | 'size'
type DurationFilter = 'all' | 'short' | 'medium' | 'long'

interface RecordingsLibraryProps {
  onSelectRecording: (recording: LibraryRecording) => void | Promise<void>
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SORT_OPTIONS: { key: SortKey; label: string; icon: typeof Calendar }[] = [
  { key: 'date', label: 'Date', icon: Calendar },
  { key: 'name', label: 'Name', icon: ArrowDownAZ },
  { key: 'duration', label: 'Duration', icon: Clock },
  { key: 'size', label: 'Size', icon: HardDrive },
]

const DURATION_FILTERS: { key: DurationFilter; label: string; description: string }[] = [
  { key: 'all', label: 'All', description: 'Show all recordings' },
  { key: 'short', label: 'Short', description: 'Under 1 minute' },
  { key: 'medium', label: 'Medium', description: '1-5 minutes' },
  { key: 'long', label: 'Long', description: 'Over 5 minutes' },
]

const MASONRY_BREAKPOINTS = {
  default: 4,
  1280: 4,
  1024: 3,
  768: 2,
  640: 1,
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RecordingsLibrary({ onSelectRecording }: RecordingsLibraryProps) {
  const reduceMotion = useReducedMotion()
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
    setSort,
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

  // Scroll container ref for scroll-spy and scroll-to-top
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)

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

  // View mode: 'grouped' shows date sections, 'grid' shows flat masonry
  const [viewMode, setViewMode] = useState<'grouped' | 'grid'>('grouped')

  // Duration filter
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all')

  // Track scroll position for scroll-to-top button
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      setShowScrollTop(container.scrollTop > 400)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Filter recordings by duration
  const filteredByDuration = useMemo(() => {
    if (durationFilter === 'all') return displayedRecordings

    return displayedRecordings.filter((rec) => {
      const duration = rec.projectInfo?.duration || 0
      const minutes = duration / 60000

      switch (durationFilter) {
        case 'short':
          return minutes < 1
        case 'medium':
          return minutes >= 1 && minutes <= 5
        case 'long':
          return minutes > 5
        default:
          return true
      }
    })
  }, [displayedRecordings, durationFilter])

  const handleSelect = async (rec: LibraryRecordingView) => {
    onSelectRecording(rec)
  }

  const handleNewRecording = () => {
    window.electronAPI?.showRecordButton?.(showRecordButtonOptions)
  }

  const handleCategoryClick = (categoryId: DateCategoryId) => {
    scrollToSection(categoryId)
  }

  const handleSortChange = (key: SortKey) => {
    setSort(key, 'desc')
  }

  if (loading) {
    return <LibraryLoadingState />
  }

  if (totalRecordingsCount === 0 && !loading) {
    return <LibraryEmptyState onNewRecording={handleNewRecording} />
  }

  // Check if we're showing grouped view (date sort, no search)
  const showGroupedView = sortKey === 'date' && !searchQuery && durationFilter === 'all'
  const currentSortOption = SORT_OPTIONS.find((o) => o.key === sortKey) || SORT_OPTIONS[0]
  const currentDurationFilter = DURATION_FILTERS.find((f) => f.key === durationFilter) || DURATION_FILTERS[0]

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
          <div className="pt-[12vh]" />

          <div className="w-full max-w-5xl mx-auto px-8">
            {filteredByDuration.length === 0 ? (
              // No matches state - centered in viewport
              <div className="min-h-[60vh] flex items-center justify-center">
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-muted/15 blur-[32px] rounded-full" />
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-b from-muted/15 to-muted/5 border border-border/20 backdrop-blur-xl flex items-center justify-center">
                      <SearchX className="w-7 h-7 text-muted-foreground/50" strokeWidth={1.5} />
                    </div>
                  </div>
                  <h3 className="text-lg font-medium tracking-[-0.01em] text-foreground/90 mb-2">
                    No matches
                  </h3>
                  <p className="text-sm text-muted-foreground/60 max-w-[280px] leading-relaxed">
                    {searchQuery
                      ? `No recordings found for "${searchQuery}"`
                      : durationFilter !== 'all'
                      ? `No ${currentDurationFilter.label.toLowerCase()} recordings`
                      : 'No recordings found'}
                  </p>
                  {(searchQuery || durationFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('')
                        setDurationFilter('all')
                      }}
                      className="mt-4 text-xs font-medium text-primary/80 hover:text-primary transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                </motion.div>
              </div>
            ) : (
              <>
                {/* Controls bar - view toggle, sort, filter */}
                <div className="flex items-center justify-between mb-6">
                  {/* View mode toggle - only show when grouped view is possible */}
                  {showGroupedView ? (
                    <div className="inline-flex items-center rounded-lg bg-muted/20 p-0.5 border border-border/10">
                      <TooltipProvider delayDuration={400}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setViewMode('grouped')}
                              className={cn(
                                "flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150",
                                viewMode === 'grouped'
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground/70 hover:text-foreground/80"
                              )}
                            >
                              <List className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            Grouped by date
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider delayDuration={400}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setViewMode('grid')}
                              className={cn(
                                "flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150",
                                viewMode === 'grid'
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground/70 hover:text-foreground/80"
                              )}
                            >
                              <LayoutGrid className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            Grid view
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  ) : (
                    <div /> // Empty placeholder to maintain layout
                  )}

                  {/* Sort and filter */}
                  <div className="flex items-center gap-2">
                    {/* Duration filter */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
                            "border border-border/10 bg-muted/10 hover:bg-muted/20",
                            durationFilter !== 'all'
                              ? "text-foreground"
                              : "text-muted-foreground/70"
                          )}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">
                            {durationFilter === 'all' ? 'Duration' : currentDurationFilter.label}
                          </span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        {DURATION_FILTERS.map((filter) => (
                          <DropdownMenuItem
                            key={filter.key}
                            onClick={() => setDurationFilter(filter.key)}
                            className={cn(
                              "flex flex-col items-start gap-0.5",
                              durationFilter === filter.key && "bg-muted/50"
                            )}
                          >
                            <span className="text-xs font-medium">{filter.label}</span>
                            <span className="text-[10px] text-muted-foreground/60">
                              {filter.description}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Sort dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
                            "border border-border/10 bg-muted/10 hover:bg-muted/20 text-muted-foreground/70"
                          )}
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{currentSortOption.label}</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        {SORT_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.key}
                            onClick={() => handleSortChange(option.key)}
                            className={cn(
                              "flex items-center gap-2",
                              sortKey === option.key && "bg-muted/50"
                            )}
                          >
                            <option.icon className="w-3.5 h-3.5 text-muted-foreground/60" />
                            <span className="text-xs">{option.label}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Content based on view mode */}
                {viewMode === 'grouped' && showGroupedView ? (
                  // Grouped view with date section headers + masonry within each section
                  <div className="space-y-12">
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

                          {/* Recording cards masonry */}
                          <Masonry
                            breakpointCols={MASONRY_BREAKPOINTS}
                            className="flex w-auto -ml-5"
                            columnClassName="pl-5 bg-clip-padding"
                          >
                            {categoryRecordings.map((recording) => (
                              <div key={recording.path} className="mb-5">
                                <RecordingCard
                                  recording={recording}
                                  onSelect={handleSelect}
                                  onRequestRename={setPendingRename}
                                  onRequestDuplicate={setPendingDuplicate}
                                  onRequestDelete={setPendingDelete}
                                />
                              </div>
                            ))}
                          </Masonry>
                        </section>
                      )
                    })}
                  </div>
                ) : (
                  // Grid/list view - masonry layout (no date grouping)
                  <div className="relative">
                    <Masonry
                      breakpointCols={MASONRY_BREAKPOINTS}
                      className="flex w-auto -ml-5"
                      columnClassName="pl-5 bg-clip-padding"
                    >
                      {filteredByDuration.map((recording) => (
                        <div key={recording.path} className="mb-5 relative">
                          <RecordingCard
                            recording={recording}
                            onSelect={handleSelect}
                            onRequestRename={setPendingRename}
                            onRequestDuplicate={setPendingDuplicate}
                            onRequestDelete={setPendingDelete}
                          />
                        </div>
                      ))}
                    </Masonry>
                  </div>
                )}

                {/* Sentinel element for infinite scroll */}
                <div ref={sentinelRef} className="h-px" />

                {/* Loading indicator for infinite scroll */}
                <AnimatePresence>
                  {(isLoadingMore || showHydrationIndicator) && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex justify-center py-8"
                    >
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30 backdrop-blur-sm">
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/60" />
                        <span className="text-[11px] font-medium text-muted-foreground/60">
                          Loading
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* End of list indicator */}
                {!hasMore && filteredByDuration.length > 20 && (
                  <div className="flex justify-center py-8">
                    <span className="text-[11px] text-muted-foreground/40">
                      {filteredByDuration.length} recordings
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom padding */}
          <div className="pb-[15vh]" />
        </div>

        {/* Scroll to top button */}
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              onClick={scrollToTop}
              className={cn(
                "fixed bottom-6 right-6 z-50",
                "w-10 h-10 rounded-full",
                "bg-background/80 backdrop-blur-md border border-border/30",
                "shadow-lg shadow-black/5",
                "flex items-center justify-center",
                "text-muted-foreground hover:text-foreground",
                "transition-colors duration-150"
              )}
            >
              <ChevronUp className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>
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
