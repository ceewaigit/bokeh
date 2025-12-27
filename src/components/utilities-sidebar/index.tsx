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

const springConfig = { type: "spring", stiffness: 380, damping: 28 } as const

const UTILITY_TABS: { id: UtilityTabId; label: string; icon: React.ElementType }[] = [
    { id: 'import', label: 'Media', icon: Upload },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'guides', label: 'Guides', icon: Grid },
    { id: 'plugins', label: 'Plugins', icon: Puzzle },
    { id: 'advanced', label: 'Editing', icon: Settings },
]

const tabVariants = {
    initial: { opacity: 0, y: 3 },
    animate: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.15,
            ease: [0.25, 0.1, 0.25, 1]
        }
    },
    exit: {
        opacity: 0,
        transition: {
            duration: 0.1,
            ease: "easeOut"
        }
    }
}

export function UtilitiesSidebar({ className }: { className?: string }) {
    const activeUtilityTab = useWorkspaceStore((s) => s.activeUtilityTab)
    const setActiveUtilityTab = useWorkspaceStore((s) => s.setActiveUtilityTab)

    return (
        <TooltipProvider>
            <div className={cn("flex h-full border-r border-border/30 bg-transparent", className)}>
                {/* Left icon strip */}
                <div className="w-[52px] flex-shrink-0 flex flex-col items-center py-2.5 border-r border-border/30 bg-transparent">
                    <div className="flex flex-col gap-1.5 w-full px-1.5">
                        {UTILITY_TABS.map((tab) => (
                            <Tooltip key={tab.id} delayDuration={200}>
                                <TooltipTrigger asChild>
                                    <motion.button
                                        onClick={() => setActiveUtilityTab(tab.id)}
                                        className={cn(
                                            "group relative flex w-full items-center justify-center rounded-md p-2 transition-colors duration-150",
                                            activeUtilityTab === tab.id
                                                ? "text-primary-foreground"
                                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground active:scale-[0.97]"
                                        )}
                                        aria-label={tab.label}
                                        whileHover={{ scale: 1.04 }}
                                        whileTap={{ scale: 0.96 }}
                                        transition={springConfig}
                                    >
                                        <AnimatePresence>
                                            {activeUtilityTab === tab.id && (
                                                <motion.div
                                                    className="absolute inset-0 rounded-md bg-primary shadow-sm"
                                                    initial={{ opacity: 0, scale: 0.98 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.98 }}
                                                    transition={springConfig}
                                                    layoutId="utilities-sidebar-tab-active"
                                                />
                                            )}
                                        </AnimatePresence>
                                        <tab.icon className="relative z-10 w-4 h-4" />
                                    </motion.button>
                                </TooltipTrigger>
                                <TooltipContent side="right" align="center" sideOffset={8} className="text-xs">
                                    {tab.label}
                                </TooltipContent>
                            </Tooltip>
                        ))}
                    </div>
                </div>

                {/* Right content area */}
                <div className="flex-1 min-w-0 flex flex-col bg-transparent">
                    {/* Header */}
                    <div className="h-11 flex items-center px-3.5 border-b border-border/30 bg-transparent sticky top-0 z-10">
                        <AnimatePresence mode="wait">
                            <motion.h2
                                key={activeUtilityTab}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
                                className="text-[12px] font-semibold tracking-tight"
                            >
                                {UTILITY_TABS.find(t => t.id === activeUtilityTab)?.label}
                            </motion.h2>
                        </AnimatePresence>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-2">
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
