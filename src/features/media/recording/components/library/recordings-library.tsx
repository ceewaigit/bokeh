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
  default: 5,
  1536: 5,
  1280: 4,
  1024: 3,
  768: 2,
  640: 2,
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

  // Track scroll position for scroll-to-top button - throttled to avoid re-renders
  const lastScrollTopRef = useRef(false)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    let rafId: number | null = null
    const handleScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        const shouldShow = container.scrollTop > 400
        // Only update state if the value actually changed
        if (shouldShow !== lastScrollTopRef.current) {
          lastScrollTopRef.current = shouldShow
          setShowScrollTop(shouldShow)
        }
      })
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
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

        {/* Main content area - centered with max-width */}
        <div className="flex-1 flex items-center justify-center min-h-0 min-w-0 p-6">
          {/* Rounded panel container - fixed max-height, inner scroll */}
          <div
            className="w-full max-w-[1400px] h-full max-h-full rounded-2xl flex flex-col bg-foreground/[0.025] border border-foreground/[0.05]"
          >
            {/* Scrollable content inside the panel */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none p-6 min-h-full"
              style={{ transform: 'translateZ(0)' }}
            >
              {filteredByDuration.length === 0 ? (
                // No matches state - centered in container
                <div className="min-h-full flex items-center justify-center">
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
                  {/* Controls bar - native macOS segmented control style */}
                  <div className="flex items-center justify-between mb-6">
                    {/* View mode toggle - macOS segmented control */}
                    {showGroupedView ? (
                      <div className="relative inline-flex items-center rounded-lg bg-foreground/[0.05] p-0.5">
                        {/* Sliding indicator - snappy spring animation */}
                        <motion.div
                          className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-md bg-background shadow-sm border border-foreground/[0.06]"
                          animate={{ x: viewMode === 'grouped' ? 2 : 'calc(100% + 2px)' }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />

                        <TooltipProvider delayDuration={400}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => setViewMode('grouped')}
                                className={cn(
                                  "relative z-10 flex items-center justify-center w-7 h-6 rounded-md",
                                  "transition-colors duration-75",
                                  viewMode === 'grouped'
                                    ? "text-foreground"
                                    : "text-muted-foreground/60 hover:text-foreground/70"
                                )}
                              >
                                <List className="w-3.5 h-3.5" strokeWidth={2} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" sideOffset={8} className="text-[11px] font-medium px-2 py-1">
                              Grouped
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
                                  "relative z-10 flex items-center justify-center w-7 h-6 rounded-md",
                                  "transition-colors duration-75",
                                  viewMode === 'grid'
                                    ? "text-foreground"
                                    : "text-muted-foreground/60 hover:text-foreground/70"
                                )}
                              >
                                <LayoutGrid className="w-3.5 h-3.5" strokeWidth={2} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" sideOffset={8} className="text-[11px] font-medium px-2 py-1">
                              Grid
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    ) : (
                      <div />
                    )}

                    {/* Sort and filter - compact, native feel */}
                    <div className="flex items-center gap-1">
                      {/* Duration filter */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium",
                              "transition-colors duration-75",
                              "hover:bg-foreground/[0.05] active:bg-foreground/[0.08]",
                              durationFilter !== 'all'
                                ? "text-foreground bg-foreground/[0.05]"
                                : "text-muted-foreground/70"
                            )}
                          >
                            <Clock className="w-3.5 h-3.5" strokeWidth={2} />
                            <span className="hidden sm:inline">
                              {durationFilter === 'all' ? 'Duration' : currentDurationFilter.label}
                            </span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={6} className="w-44 rounded-xl p-1.5">
                          {DURATION_FILTERS.map((filter) => (
                            <DropdownMenuItem
                              key={filter.key}
                              onClick={() => setDurationFilter(filter.key)}
                              className={cn(
                                "flex flex-col items-start gap-0 rounded-lg py-2 px-2.5",
                                durationFilter === filter.key && "bg-foreground/[0.05]"
                              )}
                            >
                              <span className="text-[12px] font-medium">{filter.label}</span>
                              <span className="text-[10px] text-muted-foreground/50 leading-tight">
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
                              "flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium",
                              "transition-colors duration-75",
                              "text-muted-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground/90",
                              "active:bg-foreground/[0.08]"
                            )}
                          >
                            <ArrowUpDown className="w-3.5 h-3.5" strokeWidth={2} />
                            <span className="hidden sm:inline">{currentSortOption.label}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={6} className="w-40 rounded-xl p-1.5">
                          {SORT_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option.key}
                              onClick={() => handleSortChange(option.key)}
                              className={cn(
                                "flex items-center gap-2.5 rounded-lg py-2 px-2.5",
                                sortKey === option.key && "bg-foreground/[0.05]"
                              )}
                            >
                              <option.icon className="w-3.5 h-3.5 text-muted-foreground/60" strokeWidth={2} />
                              <span className="text-[12px] font-medium">{option.label}</span>
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

                  {/* Loading indicator for infinite scroll - subtle and refined */}
                  <AnimatePresence>
                    {(isLoadingMore || showHydrationIndicator) && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex justify-center py-10"
                      >
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/[0.03]">
                          <Loader2 className="w-3 h-3 animate-spin text-foreground/30" />
                          <span className="text-[10px] font-medium text-foreground/30 tracking-tight">
                            Loading
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* End of list indicator - subtle */}
                  {!hasMore && filteredByDuration.length > 20 && (
                    <div className="flex justify-center pt-8 pb-2">
                      <span className="text-[10px] text-muted-foreground/30 tracking-tight font-medium">
                        {filteredByDuration.length} recordings
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Scroll to top button - refined macOS style */}
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onClick={scrollToTop}
              className={cn(
                "fixed bottom-6 right-6 z-50",
                "w-9 h-9 rounded-full",
                "bg-foreground/[0.06] backdrop-blur-xl",
                "border border-foreground/[0.08]",
                "shadow-lg shadow-black/10",
                "flex items-center justify-center",
                "text-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.08]",
                "transition-all duration-150 ease-out"
              )}
            >
              <ChevronUp className="w-4 h-4" strokeWidth={2} />
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
