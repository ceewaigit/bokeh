import { Film, Video } from 'lucide-react'
import { motion } from 'framer-motion'
import { HeaderButton } from '@/components/ui/header-button'
import { Toolbar } from '@/components/toolbar'

interface LibraryEmptyStateProps {
  onNewRecording: () => void
}

export const LibraryEmptyState = ({ onNewRecording }: LibraryEmptyStateProps) => (
  <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
    <Toolbar
      mode="library"
      libraryProps={{
        totalRecordings: 0,
        searchQuery: '',
        onSearchChange: () => {},
        onNewRecording,
      }}
    />

    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md animate-in fade-in zoom-in-95 duration-500 fill-mode-forwards">
        <div className="relative inline-flex items-center justify-center mb-10 group">
          <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-pill opacity-50 group-hover:opacity-75 transition-opacity duration-1000" />

          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-10 w-24 h-24 rounded-[2rem] bg-gradient-to-b from-muted/20 to-muted/5 border border-glass-border backdrop-blur-xl flex items-center justify-center shadow-2xl ring-1 ring-glass-border group-hover:scale-105 transition-transform duration-500 ease-out"
          >
            <Film className="w-10 h-10 text-white/80 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" strokeWidth={1.5} />
          </motion.div>
        </div>

        <div className="space-y-4 mb-10">
          <h2 className="text-display font-display italic tracking-[-0.02em] text-foreground leading-tight">
            Start creating
          </h2>
          <p className="text-sm text-muted-foreground/80 leading-relaxed">
            Your recordings will appear here.
          </p>
        </div>

        <div className="flex flex-col gap-4 max-w-[200px] mx-auto">
          <HeaderButton
            variant="default"
            className="w-full h-11 text-sm font-semibold tracking-tight rounded-pill bg-gradient-to-b from-primary to-primary/85 text-primary-foreground shadow-[0_10px_30px_-18px_hsl(var(--primary)/0.65)] ring-1 ring-white/20 border border-primary/30 hover:from-primary/95 hover:to-primary/75 hover:shadow-[0_12px_34px_-20px_hsl(var(--primary)/0.7)] active:translate-y-[1px]"
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
