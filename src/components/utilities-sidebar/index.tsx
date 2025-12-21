import React from 'react'
import { cn } from '@/lib/utils'
import { Upload, Volume2, Grid, Settings, Puzzle } from 'lucide-react'
import { ImportMediaSection } from './import-media-section'
import { AudioSection } from './audio-section'
import { GuidesSection } from './guides-section'
import { EditingSection } from './editing-section'
import { PluginsTab } from './plugins-tab'
import { useWorkspaceStore, type UtilityTabId } from '@/stores/workspace-store'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AnimatePresence, motion } from 'framer-motion'

const UTILITY_TABS: { id: UtilityTabId; label: string; icon: React.ElementType }[] = [
    { id: 'import', label: 'Media', icon: Upload },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'guides', label: 'Guides', icon: Grid },
    { id: 'plugins', label: 'Plugins', icon: Puzzle },
    { id: 'advanced', label: 'Advanced', icon: Settings },
]

const tabVariants = {
    initial: { opacity: 0, y: 4, scale: 0.99 },
    animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
            duration: 0.2,
            ease: [0.2, 0, 0, 1]
        }
    },
    exit: {
        opacity: 0,
        scale: 0.99,
        transition: {
            duration: 0.1,
            ease: "easeIn"
        }
    }
}

export function UtilitiesSidebar({ className }: { className?: string }) {
    const activeUtilityTab = useWorkspaceStore((s) => s.activeUtilityTab)
    const setActiveUtilityTab = useWorkspaceStore((s) => s.setActiveUtilityTab)

    return (
        <TooltipProvider>
            <div className={cn("flex h-full bg-transparent border-r border-border/40", className)}>
                {/* Left icon strip */}
                <div className="w-[60px] flex-shrink-0 flex flex-col items-center py-4 border-r border-border/40 bg-transparent">
                    <div className="flex flex-col gap-3 w-full px-2">
                        {UTILITY_TABS.map((tab) => (
                            <Tooltip key={tab.id} delayDuration={150}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => setActiveUtilityTab(tab.id)}
                                        className={cn(
                                            "group relative flex w-full items-center justify-center p-2.5 rounded-xl transition-all duration-200",
                                            activeUtilityTab === tab.id
                                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}
                                        aria-label={tab.label}
                                    >
                                        <tab.icon className={cn("w-5 h-5 transition-transform duration-200", activeUtilityTab === tab.id ? "scale-100" : "group-hover:scale-110")} />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" align="center" sideOffset={12}>
                                    {tab.label}
                                </TooltipContent>
                            </Tooltip>
                        ))}
                    </div>
                </div>

                {/* Right content area */}
                <div className="flex-1 min-w-0 flex flex-col bg-transparent">
                    {/* Header */}
                    <div className="h-14 flex items-center px-5 border-b border-border/40 bg-transparent sticky top-0 z-10">
                        <AnimatePresence mode="wait">
                            <motion.h2
                                key={activeUtilityTab}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                transition={{ duration: 0.15 }}
                                className="text-sm font-medium tracking-tight"
                            >
                                {UTILITY_TABS.find(t => t.id === activeUtilityTab)?.label}
                            </motion.h2>
                        </AnimatePresence>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                        <div className="w-full relative">
                            <AnimatePresence mode="wait" initial={false}>
                                {activeUtilityTab === 'import' && (
                                    <motion.div key="import" variants={tabVariants} initial="initial" animate="animate" exit="exit">
                                        <ImportMediaSection />
                                    </motion.div>
                                )}
                                {activeUtilityTab === 'audio' && (
                                    <motion.div key="audio" variants={tabVariants} initial="initial" animate="animate" exit="exit">
                                        <AudioSection />
                                    </motion.div>
                                )}
                                {activeUtilityTab === 'guides' && (
                                    <motion.div key="guides" variants={tabVariants} initial="initial" animate="animate" exit="exit">
                                        <GuidesSection />
                                    </motion.div>
                                )}
                                {activeUtilityTab === 'plugins' && (
                                    <motion.div key="plugins" variants={tabVariants} initial="initial" animate="animate" exit="exit">
                                        <PluginsTab />
                                    </motion.div>
                                )}
                                {activeUtilityTab === 'advanced' && (
                                    <motion.div key="advanced" variants={tabVariants} initial="initial" animate="animate" exit="exit">
                                        <EditingSection />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    )
}
