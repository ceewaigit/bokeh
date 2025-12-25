import { Film } from 'lucide-react'
import { WindowHeader } from '@/components/ui/window-header'

export const LibraryLoadingState = () => (
  <div className="flex-1 overflow-hidden bg-transparent">
    <div className="h-full overflow-y-scroll scrollbar-thin scrollbar-track-transparent">
      <WindowHeader className="sticky top-0 z-30">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="h-5 w-24 bg-muted/40 rounded-md animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 bg-muted/40 rounded-md animate-pulse" />
          </div>
        </div>
      </WindowHeader>

      <div className="p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="group relative"
              style={{ opacity: 1 - i * 0.05 }}
            >
              <div className="relative rounded-2xl overflow-hidden bg-muted/5 border border-border/40">
                <div className="aspect-video relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Film className="w-6 h-6 text-muted-foreground/10" />
                  </div>
                </div>
                <div className="p-3 space-y-2.5">
                  <div className="h-3.5 w-3/4 bg-muted/40 rounded animate-pulse" />
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-12 bg-muted/20 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
)
