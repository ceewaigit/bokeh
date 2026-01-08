'use client'

import React, { useState } from 'react'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { motion, AnimatePresence } from 'framer-motion'
import type { BackgroundEffectData, Effect } from '@/types/project'
import { TrackType } from '@/types/project'
import { ShapeTab } from './shape-tab'
import { ClipTab } from './clip-tab'
import { CropTab } from './crop-tab'
import { useSelectedClip } from '@/features/core/stores/selectors/clip-selectors'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DEFAULT_BACKGROUND_DATA } from '@/features/effects/background/config'
import { useProjectStore } from '@/features/core/stores/project-store'

interface ScreenTabProps {
    backgroundEffect: Effect | undefined
    effects: Effect[]
    onUpdateBackground: (updates: Partial<BackgroundEffectData>) => void
}

interface CollapsibleSectionProps {
    title: string
    isOpen: boolean
    onToggle: () => void
    children: React.ReactNode
    disabled?: boolean
    disabledTooltip?: string
    badge?: string
}

function CollapsibleSection({ title, isOpen, onToggle, children, disabled, disabledTooltip, badge }: CollapsibleSectionProps) {
    const content = (
        <div className="rounded-2xl bg-background/40 overflow-hidden">
            <button
                type="button"
                onClick={disabled ? undefined : onToggle}
                disabled={disabled}
                className={cn(
                    "w-full flex items-center justify-between p-3 transition-colors",
                    disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/30"
                )}
            >
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {title}
                    </span>
                    {badge && (
                        <span className="text-2xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            {badge}
                        </span>
                    )}
                </div>
                <ChevronDown
                    className={cn(
                        "w-4 h-4 text-muted-foreground transition-transform duration-200",
                        isOpen && "rotate-180"
                    )}
                />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 pt-2">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )

    if (disabled && disabledTooltip) {
        return (
            <TooltipProvider delayDuration={200}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div>{content}</div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-[200px]">
                        {disabledTooltip}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )
    }

    return content
}


export function ScreenTab({
    backgroundEffect,
    effects,
    onUpdateBackground,
}: ScreenTabProps) {
    const selectedClipResult = useSelectedClip()
    const selectedClip = selectedClipResult?.clip ?? null
    const selectedTrackType = selectedClipResult?.track.type
    const isVideoClipSelected = !!selectedClip && selectedTrackType === TrackType.Video
    const isEditingCrop = useProjectStore((s) => s.isEditingCrop)

    const [speedFadeOpen, setSpeedFadeOpen] = useState(false)
    const [cropOpen, setCropOpen] = useState(false)

    const handleResetToDefault = () => {
        // Reset padding, radius, shadow, and background to defaults
        onUpdateBackground({
            padding: DEFAULT_BACKGROUND_DATA.padding,
            cornerRadius: DEFAULT_BACKGROUND_DATA.cornerRadius,
            shadowIntensity: DEFAULT_BACKGROUND_DATA.shadowIntensity,
            gradient: DEFAULT_BACKGROUND_DATA.gradient,
            type: DEFAULT_BACKGROUND_DATA.type,
            // Reset mockup if needed
            mockup: undefined
        })
    }

    return (
        <div className="space-y-3">
            {/* Shape section - always visible */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground leading-snug">
                        Adjust the screen recording appearance.
                    </p>
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={handleResetToDefault}
                                    className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground/70 hover:text-foreground transition-colors"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">
                                Reset to default style
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                <ShapeTab
                    backgroundEffect={backgroundEffect}
                    onUpdateBackground={onUpdateBackground}
                />
            </div>

            {/* Speed & Fade section - collapsible, only when clip selected */}
            <CollapsibleSection
                title="Speed & Fade"
                isOpen={speedFadeOpen}
                onToggle={() => setSpeedFadeOpen(!speedFadeOpen)}
                disabled={!selectedClip}
                disabledTooltip="Select a clip on the timeline to adjust speed and fade settings"
                badge={selectedClip ? 'Selected' : undefined}
            >
                {selectedClip && <ClipTab selectedClip={selectedClip} />}
            </CollapsibleSection>

            {/* Crop section - collapsible, only when video clip selected */}
            <CollapsibleSection
                title="Crop"
                isOpen={cropOpen}
                onToggle={() => setCropOpen(!cropOpen)}
                disabled={!isVideoClipSelected}
                disabledTooltip="Select a video clip on the timeline to crop the frame"
                badge={isEditingCrop ? 'Editing' : undefined}
            >
                {isVideoClipSelected && (
                    <CropTab
                        selectedClip={selectedClip}
                    />
                )}
            </CollapsibleSection>
        </div>
    )
}
