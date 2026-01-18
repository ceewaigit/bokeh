/**
 * Large Video Dialog
 *
 * Native macOS-style prompt when a large video is detected.
 * Clean, minimal, Apple-esque design with subtle animations.
 */

import React, { useEffect, useCallback } from 'react'
import { Check } from 'lucide-react'
import {
    Dialog,
    DialogContent,
} from '@/components/ui/dialog'
import { cn } from '@/shared/utils/utils'
import type { Recording } from '@/types/project'
import type { UserProxyChoice } from '../types'
import { useProxyStore, useProxyProgress } from '../store/proxy-store'

interface LargeVideoDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** The recording being processed */
    recording: Recording | null
    /** Callback when user makes a choice */
    onChoice: (choice: UserProxyChoice) => void
    /** Callback when dialog is closed */
    onClose: () => void
}

/** Native macOS-style progress bar */
function ProgressBar({ value }: { value: number }) {
    return (
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
                className="h-full rounded-full bg-muted-foreground transition-all duration-300 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            />
        </div>
    )
}

/** Resolution icon - clean, geometric, SF Symbols-inspired */
function ResolutionIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M7 15V9l3 3 2-2 5 5" />
            <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
        </svg>
    )
}

export function LargeVideoDialog({
    open,
    recording,
    onChoice,
    onClose
}: LargeVideoDialogProps) {
    const status = useProxyStore((s) => recording ? s.status[recording.id] : undefined)
    const progress = useProxyProgress(recording?.id)
    const isGenerating = status === 'generating'
    const isComplete = status === 'ready'

    // Auto-close dialog after completion
    useEffect(() => {
        if (isComplete && open) {
            const timeoutId = setTimeout(onClose, 800)
            return () => clearTimeout(timeoutId)
        }
    }, [isComplete, open, onClose])

    const getResolutionLabel = useCallback((width?: number) => {
        if (!width) return 'High-Resolution'
        if (width >= 3840) return '4K'
        if (width >= 2560) return '1440p'
        if (width >= 1920) return '1080p'
        return 'High-Resolution'
    }, [])

    const handleOptimize = useCallback(() => {
        onChoice('background')
    }, [onChoice])

    const handleSkip = useCallback(() => {
        onChoice('dismiss')
    }, [onChoice])

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="max-w-[280px] p-0 gap-0 overflow-hidden" hideCloseButton>
                {/* Header with icon */}
                <div className="flex flex-col items-center pt-5 pb-3 px-5">
                    <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center mb-3",
                        "bg-gradient-to-b from-muted to-muted/50",
                        "shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.1)]",
                        isComplete && "from-accent/20 to-accent/10"
                    )}>
                        {isComplete ? (
                            <Check className="w-5 h-5 text-accent" strokeWidth={2.5} />
                        ) : (
                            <ResolutionIcon className={cn(
                                "w-5 h-5 text-muted-foreground",
                                isGenerating && "animate-pulse"
                            )} />
                        )}
                    </div>

                    {/* Title */}
                    <h2 className="text-[13px] font-semibold text-foreground tracking-[-0.01em] text-center">
                        {isComplete ? 'Optimized' : `${getResolutionLabel(recording?.width)} Video`}
                    </h2>

                    {/* Description */}
                    <p className="text-[11px] text-muted-foreground text-center mt-1 leading-snug max-w-[200px]">
                        {isComplete
                            ? 'Ready for smooth editing'
                            : isGenerating
                                ? 'Creating preview for editing...'
                                : 'Create an optimized preview for smoother editing?'
                        }
                    </p>
                </div>

                {/* Progress section */}
                {isGenerating && (
                    <div className="px-5 pb-4">
                        <ProgressBar value={progress ?? 0} />
                        <p className="text-[10px] text-muted-foreground/70 text-center mt-2 tabular-nums">
                            {progress !== undefined ? `${Math.round(progress)}%` : 'Starting...'}
                        </p>
                    </div>
                )}

                {/* Info text when not generating */}
                {!isGenerating && !isComplete && (
                    <p className="text-[10px] text-muted-foreground/70 text-center px-5 pb-4 leading-relaxed">
                        Original quality preserved for export
                    </p>
                )}

                {/* Buttons - macOS style */}
                {!isComplete && (
                    <div className="flex border-t border-border">
                        <button
                            onClick={handleSkip}
                            disabled={isGenerating}
                            className={cn(
                                "flex-1 py-2.5 text-[13px] text-muted-foreground",
                                "border-r border-border",
                                "transition-colors duration-100",
                                "hover:bg-muted/50 active:bg-muted",
                                "disabled:opacity-40 disabled:pointer-events-none"
                            )}
                        >
                            Skip
                        </button>
                        <button
                            onClick={handleOptimize}
                            disabled={isGenerating}
                            className={cn(
                                "flex-1 py-2.5 text-[13px] font-medium text-primary",
                                "transition-colors duration-100",
                                "hover:bg-muted/50 active:bg-muted",
                                "disabled:opacity-40 disabled:pointer-events-none"
                            )}
                        >
                            Optimize
                        </button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
