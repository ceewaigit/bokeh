import { Film } from 'lucide-react'
import { Toolbar } from '@/components/toolbar'
import { LibrarySidebarSkeleton } from './library-sidebar'

export const LibraryLoadingState = () => (
  <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
    <Toolbar
      mode="library"
      libraryProps={{
        totalRecordings: 0,
        searchQuery: '',
        onSearchChange: () => { },
        onNewRecording: () => { },
      }}
    />

    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar area - horizontally centered */}
      <div className="flex-shrink-0 min-w-[240px] w-[25%] flex items-center justify-center">
        <LibrarySidebarSkeleton />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent">
        {/* Top padding to start content toward vertical center */}
        <div className="pt-[15vh]" />

        <div className="w-full max-w-4xl mx-auto px-8">
          {/* Grid skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="group relative"
                style={{ opacity: 1 - i * 0.06 }}
              >
                <div className="relative rounded-xl overflow-hidden bg-muted/5 border border-border/20">
                  <div className="aspect-video relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Film className="w-6 h-6 text-muted-foreground/10" />
                    </div>
                  </div>
                  <div className="p-3 space-y-2.5">
                    <div className="h-3.5 w-3/4 bg-muted/20 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-muted/15 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom padding */}
        <div className="pb-[15vh]" />
      </div>
    </div>
  </div>
)
