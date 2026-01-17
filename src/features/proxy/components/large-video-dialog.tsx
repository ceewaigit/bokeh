/**
 * Large Video Dialog
 * 
 * Simple, friendly prompt when a large video is detected.
 * Offers a single CTA to optimize for editing, with dismiss option.
 */

import React, { useEffect } from 'react'
import { Loader2, Gauge, Check } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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

    // Auto-close dialog after completion with brief delay to show success message
    useEffect(() => {
        if (isComplete && open) {
            const timeoutId = setTimeout(() => {
                onClose()
            }, 1200)
            return () => clearTimeout(timeoutId)
        }
    }, [isComplete, open, onClose])

    const getResolutionLabel = (width?: number) => {
        if (!width) return 'high-resolution'
        if (width >= 3840) return '4K'
        if (width >= 2560) return '1440p'
        if (width >= 1920) return '1080p'
        return 'high-resolution'
    }

    const handleOptimize = () => {
        // Always use background generation for better UX
        onChoice('background')
    }

    const handleSkip = () => {
        onChoice('dismiss')
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-pill bg-primary/10 text-primary">
                            <Gauge className="h-4 w-4" />
                        </div>
                        {getResolutionLabel(recording?.width)} Video
                    </DialogTitle>
                    <DialogDescription className="text-base">
                        Your video is quite large! Would you like to optimize it for smoother editing?
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                    {isComplete ? (
                        <div className="flex items-center gap-3 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
                            <Check className="h-5 w-5 text-green-500" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-green-600 dark:text-green-400">Optimized!</p>
                                <p className="text-xs text-muted-foreground">Ready for smooth editing</p>
                            </div>
                        </div>
                    ) : isGenerating ? (
                        <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            <div className="flex-1">
                                <p className="text-sm font-medium">Optimizing...</p>
                                <p className="text-xs text-muted-foreground">
                                    {progress !== undefined ? `${Math.round(progress)}% complete` : 'Starting up...'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            This creates a preview copy for editing. Your original quality is preserved for export.
                        </p>
                    )}

                    <div className="flex gap-2">
                        <Button
                            onClick={handleOptimize}
                            className="flex-1"
                            disabled={isGenerating || isComplete}
                        >
                            <Gauge className="h-4 w-4 mr-2" />
                            Optimize
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handleSkip}
                            disabled={isGenerating || isComplete}
                        >
                            Skip
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
