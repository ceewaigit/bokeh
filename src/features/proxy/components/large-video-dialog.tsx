/**
 * Large Video Dialog
 * 
 * Prompts user when adding a large video that would benefit from proxy generation.
 */

import React from 'react'
import { Loader2, Zap, Clock, X } from 'lucide-react'
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

    const formatResolution = (width?: number, height?: number) => {
        if (!width || !height) return 'Unknown resolution'
        return `${width}×${height}`
    }

    const handleDismiss = () => {
        onChoice('dismiss')
    }

    const handleBackground = () => {
        onChoice('background')
    }

    const handleNow = () => {
        onChoice('now')
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                            <Zap className="h-4 w-4" />
                        </div>
                        Large Video Detected
                    </DialogTitle>
                    <DialogDescription>
                        This video is high-resolution ({formatResolution(recording?.width, recording?.height)})
                        and may cause playback lag on some machines.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 pt-2">
                    <p className="text-sm text-muted-foreground">
                        You can generate a lower-resolution preview for smoother editing.
                        The original quality is preserved for export.
                    </p>

                    {isGenerating && (
                        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">
                                Generating preview... {progress !== undefined ? `${Math.round(progress)}%` : ''}
                            </span>
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2">
                        <Button
                            onClick={handleBackground}
                            className="w-full justify-start gap-2"
                            disabled={isGenerating}
                        >
                            <Clock className="h-4 w-4" />
                            Generate in Background
                            <span className="ml-auto text-xs text-muted-foreground">Recommended</span>
                        </Button>

                        <Button
                            variant="secondary"
                            onClick={handleNow}
                            className="w-full justify-start gap-2"
                            disabled={isGenerating}
                        >
                            <Zap className="h-4 w-4" />
                            Generate Now
                            <span className="ml-auto text-xs text-muted-foreground">Wait for completion</span>
                        </Button>

                        <Button
                            variant="ghost"
                            onClick={handleDismiss}
                            className="w-full justify-start gap-2 text-muted-foreground"
                            disabled={isGenerating}
                        >
                            <X className="h-4 w-4" />
                            Use Original
                            <span className="ml-auto text-xs">May be laggy</span>
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
