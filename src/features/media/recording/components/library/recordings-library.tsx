"use client"

import { useMemo, useState } from 'react'
import { Loader2, SearchX } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Toolbar } from '@/components/toolbar'
import { useProjectStore } from '@/features/core/stores/project-store'
import { type LibraryRecording, type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { PROJECT_EXTENSION_REGEX } from '@/features/core/storage/project-paths'
import { LibraryEmptyState } from './components/library-empty-state'
import { LibraryLoadingState } from './components/library-loading-state'
import { MasonryGrid } from './components/masonry-grid'
import { DeleteRecordingDialog } from './components/delete-recording-dialog'
import { RecordingNameDialog } from './components/recording-name-dialog'
import { LibrarySort } from './components/library-sort'
import { useRecordingsLibraryData } from './hooks/use-recordings-library-data'
import { useInfiniteScroll } from './hooks/use-infinite-scroll'

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
    sortDirection,
    setSort,
    totalRecordingsCount
  } = useRecordingsLibraryData()

  // Infinite scroll hook
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading: isLoadingMore,
    onLoadMore: loadMore,
    threshold: 300,
  })

  const [pendingRename, setPendingRename] = useState<LibraryRecordingView | null>(null)
  const [pendingDuplicate, setPendingDuplicate] = useState<LibraryRecordingView | null>(null)

  const sortLabel = useMemo(() => {
    switch (sortKey) {
      case 'name':
        return sortDirection === 'asc' ? 'Name (A–Z)' : 'Name (Z–A)'
      case 'size':
        return sortDirection === 'asc' ? 'Smallest first' : 'Largest first'
      case 'duration':
        return sortDirection === 'asc' ? 'Shortest first' : 'Longest first'
      case 'date':
      default:
        return sortDirection === 'asc' ? 'Oldest first' : 'Newest first'
    }
  }, [sortKey, sortDirection])

  const handleSelect = async (rec: LibraryRecordingView) => {
    onSelectRecording(rec)
  }

  const handleNewRecording = () => {
    window.electronAPI?.showRecordButton?.(showRecordButtonOptions)
  }

  if (loading) {
    return <LibraryLoadingState />
  }

  if (totalRecordingsCount === 0 && !loading) {
    return <LibraryEmptyState onNewRecording={handleNewRecording} />
  }

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

      {/* Main scrollable area - full page scroll */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scroll-smooth">
        <div className="mx-auto w-full max-w-[85vw] px-5 py-4 sm:px-6 lg:px-8">
          {displayedRecordings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground motion-safe:animate-in motion-safe:fade-in duration-300">
              <div className="mb-4 h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center ring-1 ring-border/50">
                <SearchX className="h-8 w-8 opacity-70" />
              </div>
              <p className="text-sm font-medium">No recordings found</p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs text-center">
                We couldn&apos;t find any recordings matching &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-4">
                <div className="space-y-0.5">
                  <h1 className="text-xs font-medium tracking-[0.08em] uppercase text-muted-foreground/80">
                    Recordings
                  </h1>
                  <p className="text-xs text-muted-foreground/60">
                    {searchQuery ? 'Filtered results based on your search.' : 'Browse and manage your projects.'}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                    <span className="uppercase tracking-[0.08em] text-muted-foreground/70">Sorted</span>
                    <span>{sortLabel}</span>
                  </div>
                  <LibrarySort sortKey={sortKey} sortDirection={sortDirection} onSortChange={setSort} />
                </div>
              </div>

              {/* Grid */}
              <MasonryGrid
                recordings={displayedRecordings}
                onSelect={handleSelect}
                onRequestRename={setPendingRename}
                onRequestDuplicate={setPendingDuplicate}
                onRequestDelete={setPendingDelete}
              />

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
                      <span className="text-[11px] font-medium text-muted-foreground">Loading...</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* End of list indicator */}
              {!hasMore && displayedRecordings.length > 24 && (
                <div className="flex justify-center py-6">
                  <span className="text-[11px] text-muted-foreground/50">
                    {displayedRecordings.length} recordings
                  </span>
                </div>
              )}
            </>
          )}
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
