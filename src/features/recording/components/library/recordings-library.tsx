"use client"

import { useMemo, useState } from 'react'
import { Loader2, SearchX } from 'lucide-react'
import { useProjectStore } from '@/features/stores/project-store'
import { useWorkspaceStore } from '@/features/stores/workspace-store'
import { type LibraryRecording, type LibraryRecordingView } from '@/features/recording/store/library-store'
import { PROJECT_EXTENSION_REGEX } from '@/features/storage/recording-storage'
import { LibraryEmptyState } from './components/library-empty-state'
import { LibraryHeader } from './components/library-header'
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
    setHeaderEl,
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
    <div className="flex-1 overflow-hidden bg-transparent">
      <div
        ref={setScrollEl}
        className="h-full overflow-y-scroll scrollbar-thin scrollbar-track-transparent"
      >
        <LibraryHeader
          ref={setHeaderEl}
          totalRecordings={recordings.length}
          currentPage={currentPage}
          totalPages={totalPages}
          canPrev={canPrev}
          canNext={canNext}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          onRefresh={() => loadRecordings(true)}
          onNewRecording={handleNewRecording}
          onOpenSettings={() => setSettingsOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="p-6">
          <div ref={setGridEl}>
            {recordings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-in fade-in duration-300">
                <div className="mb-4 h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center ring-1 ring-border/50">
                  <SearchX className="h-8 w-8 opacity-70" />
                </div>
                <p className="text-sm font-medium">No such recording exists</p>
                <p className="text-2xs text-muted-foreground/60 mt-1 max-w-xs text-center">
                  We couldn&apos;t find any recordings matching &quot;{searchQuery}&quot;
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-[var(--font-display)] font-semibold tracking-[0.18em] uppercase text-muted-foreground/80">
                      {showRecentSection ? 'All recordings' : 'Recordings'}
                    </p>
                    <p className="text-2xs text-muted-foreground/60">
                      {searchQuery ? 'Filtered results based on your search.' : 'Browse and manage your projects.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
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
                  onSelect={handleSelect}
                  onRequestDelete={setPendingDelete}
                  onRequestRename={setPendingRename}
                  onRequestDuplicate={setPendingDuplicate}
                />
              </div>
            )}
          </div>

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
