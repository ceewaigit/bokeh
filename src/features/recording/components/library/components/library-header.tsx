import { forwardRef } from 'react'
import { ChevronLeft, ChevronRight, Film, Layers, RefreshCw, Settings2, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HeaderButton } from '@/components/ui/header-button'
import { AppearanceControls } from '@/components/topbar/appearance-controls'
import { WindowHeader } from '@/components/ui/window-header'
import { type SortKey, type SortDirection } from '@/features/recording/store/library-store'
import { LibrarySearch } from './library-search'
import { LibrarySort } from './library-sort'

interface LibraryHeaderProps {
  totalRecordings: number
  currentPage: number
  totalPages: number
  canPrev: boolean
  canNext: boolean
  onPrevPage: () => void
  onNextPage: () => void
  onRefresh: () => void
  onNewRecording: () => void
  onOpenSettings: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  sortKey: SortKey
  sortDirection: SortDirection
  onSortChange: (key: SortKey, direction: SortDirection) => void
}

export const LibraryHeader = forwardRef<HTMLDivElement, LibraryHeaderProps>(({
  totalRecordings,
  currentPage,
  totalPages,
  canPrev,
  canNext,
  onPrevPage,
  onNextPage,
  onRefresh,
  onNewRecording,
  onOpenSettings,
  searchQuery,
  onSearchChange,
  sortKey,
  sortDirection,
  onSortChange
}, ref) => (
  <WindowHeader ref={ref} customDragRegions className="sticky top-0 z-30 relative">
    <div className="flex items-center gap-3 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <div className="flex items-center gap-2 px-2.5 h-6 bg-accent/15 rounded-xl">
        <Film className="w-3.5 h-3.5 text-accent flex-shrink-0" />
        <span className="font-bold text-xs text-accent uppercase tracking-[0.1em] whitespace-nowrap">
          Library
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/80 backdrop-blur-md px-2.5 h-8 rounded-full border border-border/60 shadow-sm">
        <Layers className="w-3 h-3 opacity-70" />
        <span className="font-mono font-bold">{totalRecordings}</span>
      </div>
    </div>

    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <LibrarySearch query={searchQuery} onQueryChange={onSearchChange} />
      </div>
    </div>

    <div className="flex-1" />

    <div className="flex items-center gap-2 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <div className="flex items-center gap-1 mr-2">
        <LibrarySort sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
        <div className="w-px h-4 bg-border/50 mx-2" />
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 hover:bg-muted/50"
          onClick={onPrevPage}
          disabled={!canPrev}
          title="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-3xs text-muted-foreground font-mono w-12 text-center">
          {currentPage} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 hover:bg-muted/50"
          onClick={onNextPage}
          disabled={!canNext}
          title="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <HeaderButton
        variant="outline"
        className="shadow-sm"
        onClick={onRefresh}
        tooltip="Refresh Library"
        icon={RefreshCw}
      >
        Refresh
      </HeaderButton>
      <HeaderButton
        variant="default"
        className="relative rounded-full bg-gradient-to-b from-primary to-primary/85 text-primary-foreground font-[var(--font-display)] font-semibold tracking-tight shadow-[0_6px_16px_-10px_hsl(var(--primary)/0.7)] ring-1 ring-white/20 border border-primary/30 hover:from-primary/95 hover:to-primary/75 hover:shadow-[0_8px_20px_-12px_hsl(var(--primary)/0.75)] active:translate-y-[1px]"
        onClick={onNewRecording}
        tooltip="New Recording"
        icon={Video}
      >
        New Recording
      </HeaderButton>
      <HeaderButton
        variant="outline"
        className="shadow-sm"
        onClick={onOpenSettings}
        tooltip="Settings"
        icon={Settings2}
      >
        Settings
      </HeaderButton>
      <AppearanceControls className="flex items-center gap-1 ml-1" />
    </div>
  </WindowHeader>
))

LibraryHeader.displayName = 'LibraryHeader'
