import { Film, Layers, Sparkles, Video } from 'lucide-react'
import { HeaderButton } from '@/components/ui/header-button'
import { AppearanceControls } from '@/components/topbar/appearance-controls'
import { WindowHeader } from '@/components/ui/window-header'

interface LibraryEmptyStateProps {
  onNewRecording: () => void
}

export const LibraryEmptyState = ({ onNewRecording }: LibraryEmptyStateProps) => (
  <div className="flex-1 overflow-hidden bg-transparent">
    <WindowHeader customDragRegions className="sticky top-0 z-20">
      <div className="flex items-center gap-3 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-md">
          <Film className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="font-bold text-3xs text-primary uppercase tracking-wider whitespace-nowrap">
            Library
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-3xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full border border-border/20">
          <Layers className="w-3 h-3" />
          <span className="font-mono">0</span>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <HeaderButton
          variant="default"
          className="relative rounded-full bg-gradient-to-b from-primary to-primary/85 text-primary-foreground font-[var(--font-display)] font-semibold tracking-tight shadow-[0_6px_16px_-10px_hsl(var(--primary)/0.7)] ring-1 ring-white/20 border border-primary/30 hover:from-primary/95 hover:to-primary/75 hover:shadow-[0_8px_20px_-12px_hsl(var(--primary)/0.75)] active:translate-y-[1px]"
          onClick={onNewRecording}
          icon={Video}
        >
          New Recording
        </HeaderButton>
        <AppearanceControls className="flex items-center gap-1 ml-1" />
      </div>
    </WindowHeader>

    <div className="flex-1 flex items-center justify-center p-8 min-h-[calc(100vh-48px)]">
      <div className="text-center max-w-md animate-in fade-in zoom-in-95 duration-500 fill-mode-forwards">
        <div className="relative inline-flex items-center justify-center mb-10 group">
          <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full opacity-50 group-hover:opacity-75 transition-opacity duration-1000" />

          <div className="relative z-10 w-24 h-24 rounded-[2rem] bg-gradient-to-b from-muted/20 to-muted/5 border border-white/10 backdrop-blur-xl flex items-center justify-center shadow-2xl ring-1 ring-white/5 group-hover:scale-105 transition-transform duration-500 ease-out">
            <Film className="w-10 h-10 text-white/80 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" strokeWidth={1.5} />
            <Sparkles className="absolute -top-3 -right-3 w-6 h-6 text-primary animate-pulse duration-3000" strokeWidth={2} />
          </div>
        </div>

        <div className="space-y-4 mb-10">
          <h2 className="text-2xl font-bold bg-gradient-to-br from-white via-white/90 to-white/70 bg-clip-text text-transparent tracking-tight">
            Your library is empty
          </h2>
          <p className="text-sm text-muted-foreground/80 leading-relaxed font-medium">
            Start creating amazing screen recordings.<br />
            Your recordings will appear here automatically.
          </p>
        </div>

        <div className="flex flex-col gap-4 max-w-[200px] mx-auto">
          <HeaderButton
            variant="default"
            className="w-full h-11 text-sm font-[var(--font-display)] font-semibold tracking-tight rounded-full bg-gradient-to-b from-primary to-primary/85 text-primary-foreground shadow-[0_10px_30px_-18px_hsl(var(--primary)/0.65)] ring-1 ring-white/20 border border-primary/30 hover:from-primary/95 hover:to-primary/75 hover:shadow-[0_12px_34px_-20px_hsl(var(--primary)/0.7)] active:translate-y-[1px]"
            onClick={onNewRecording}
            icon={Video}
          >
            Start Recording
          </HeaderButton>
        </div>
      </div>
    </div>
  </div>
)
