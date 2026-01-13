"use client"

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toolbar } from '@/components/toolbar'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'
import { type LibraryRecording, type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { PROJECT_EXTENSION_REGEX } from '@/features/core/storage/project-paths'
import { LibraryEmptyState } from './components/library-empty-state'
import { LibraryLoadingState } from './components/library-loading-state'
import { RecordingsGrid } from './components/recordings-grid'
import { DeleteRecordingDialog } from './components/delete-recording-dialog'
import { RecordingNameDialog } from './components/recording-name-dialog'
import { RecentRecordingsMosaic } from './components/recent-recordings-mosaic'
import { LibrarySort } from './components/library-sort'
import { useRecordingsLibraryData } from './hooks/use-recordings-library-data'
import { useLibraryGridCapacity } from './hooks/use-library-grid-capacity'

interface RecordingsLibraryProps {
  onSelectRecording: (recording: LibraryRecording) => void | Promise<void>
}

export function RecordingsLibrary({ onSelectRecording }: RecordingsLibraryProps) {
  const PAGE_SIZE = 24
  const GRID_GAP_PX = 20

  const setSettingsOpen = useWorkspaceStore((s) => s.setSettingsOpen)
  const includeAppWindows = useProjectStore((state) => state.settings.recording?.includeAppWindows ?? false)
  const showRecordButtonOptions = includeAppWindows ? { hideMainWindow: false } : undefined

  const {
    recordings,
    displayedRecordings,
    currentPage,
    totalPages,
    loading,
    loadRecordings,
    showHydrationIndicator,
    handlePrevPage,
    handleNextPage,
    canPrev,
    canNext,
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
  } = useRecordingsLibraryData(PAGE_SIZE)

  const {
    gridCapacity,
    isExpandedLayout,
    setScrollEl,
    setGridEl
  } = useLibraryGridCapacity(GRID_GAP_PX)

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

  const { recentHighlights, gridRecordings, showRecentSection } = useMemo(() => {
    const showRecent = !searchQuery
      && currentPage === 1
      && displayedRecordings.length > 0
      && sortKey === 'date'
      && sortDirection === 'desc'
    const highlights = showRecent ? displayedRecordings.slice(0, 4) : []
    const highlightPaths = new Set(highlights.map((rec) => rec.path))
    const rest = showRecent
      ? displayedRecordings.filter((rec) => !highlightPaths.has(rec.path))
      : displayedRecordings
    return {
      recentHighlights: highlights,
      gridRecordings: rest,
      showRecentSection: showRecent
    }
  }, [searchQuery, currentPage, displayedRecordings, sortKey, sortDirection])

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

      <div
        ref={setScrollEl}
        className="flex-1 overflow-y-scroll scrollbar-none"
      >
        <div className="mx-auto w-full max-w-[70vw] px-5 py-4 sm:px-6 lg:px-8">
          {recordings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground motion-safe:animate-in motion-safe:fade-in duration-300">
              <div className="mb-4 h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center ring-1 ring-border/50">
                <SearchX className="h-8 w-8 opacity-70" />
              </div>
              <p className="text-sm font-medium">No such recording exists</p>
              <p className="text-2xs text-muted-foreground/60 mt-1 max-w-xs text-center">
                We couldn&apos;t find any recordings matching &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground/80">
                    {showRecentSection ? 'All recordings' : 'Recordings'}
                  </p>
                  <p className="text-2xs text-muted-foreground/60">
                    {searchQuery ? 'Filtered results based on your search.' : 'Browse and manage your projects.'}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <div className="hidden sm:flex items-center gap-2 text-2xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-primary/70" />
                    <span className="uppercase tracking-[0.2em] text-muted-foreground/70">Sorted</span>
                    <span>{sortLabel}</span>
                  </div>
                  <LibrarySort sortKey={sortKey} sortDirection={sortDirection} onSortChange={setSort} />
                </div>
              </div>

              {showRecentSection && recentHighlights.length > 0 && (
                <RecentRecordingsMosaic
                  recordings={recentHighlights}
                  onSelect={handleSelect}
                  onRequestRename={setPendingRename}
                  onRequestDuplicate={setPendingDuplicate}
                  onRequestDelete={setPendingDelete}
                />
              )}

              <RecordingsGrid
                recordings={gridRecordings}
                gridCapacity={gridCapacity}
                isExpandedLayout={isExpandedLayout}
                gridRef={setGridEl}
                onSelect={handleSelect}
                onRequestDelete={setPendingDelete}
                onRequestRename={setPendingRename}
                onRequestDuplicate={setPendingDuplicate}
              />

              {/* Pagination Controls - Now in content area */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4 pb-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:bg-muted/50 rounded-lg"
                    onClick={handlePrevPage}
                    disabled={!canPrev}
                    title="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground font-mono px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:bg-muted/50 rounded-lg"
                    onClick={handleNextPage}
                    disabled={!canNext}
                    title="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {showHydrationIndicator && (
            <div className="mt-4 flex justify-center">
              <div className="bg-muted/60 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm border border-border/50">
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                <span className="text-3xs font-medium text-muted-foreground">Loading page…</span>
              </div>
            </div>
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
