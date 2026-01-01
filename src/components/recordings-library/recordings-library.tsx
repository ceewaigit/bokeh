"use client"

import { Loader2, SearchX } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { type LibraryRecording, type LibraryRecordingView } from '@/stores/recordings-library-store'
import { LibraryEmptyState } from './components/library-empty-state'
import { LibraryHeader } from './components/library-header'
import { LibraryLoadingState } from './components/library-loading-state'
import { RecordingsGrid } from './components/recordings-grid'
import { DeleteRecordingDialog } from './components/delete-recording-dialog'
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
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={setSort}
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
                  We couldn't find any recordings matching "{searchQuery}"
                </p>
              </div>
            ) : (
              <RecordingsGrid
                recordings={displayedRecordings}
                gridCapacity={gridCapacity}
                isExpandedLayout={isExpandedLayout}
                onSelect={handleSelect}
                onRequestDelete={setPendingDelete}
              />
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

    </div>
  )
}
