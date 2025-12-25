import { forwardRef } from 'react'
import { ChevronLeft, ChevronRight, Film, Layers, RefreshCw, Settings2, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HeaderButton } from '@/components/ui/header-button'
import { AppearanceControls } from '@/components/topbar/appearance-controls'
import { WindowHeader } from '@/components/ui/window-header'

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
  onOpenSettings
}, ref) => (
  <WindowHeader ref={ref} customDragRegions className="sticky top-0 z-30">
    <div className="flex items-center gap-3 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-md">
        <Film className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="font-bold text-[10px] text-primary uppercase tracking-wider whitespace-nowrap">
          Library
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background backdrop-blur-xl px-2 py-0.5 rounded-full ring-1 ring-border/20">
        <Layers className="w-3 h-3" />
        <span className="font-mono">{totalRecordings}</span>
      </div>
    </div>

    <div className="flex-1" />

    <div className="flex items-center gap-2 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <div className="flex items-center gap-1 mr-2">
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
        <span className="text-[10px] text-muted-foreground font-mono w-12 text-center">
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
        className="shadow-sm hover:shadow"
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
