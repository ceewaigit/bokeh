/**
 * Proxy Progress Indicator
 * 
 * Floating indicator that shows when proxy generation is in progress.
 */

import React from 'react'
import { Loader2, X, Check } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { useProxyStore } from '../store/proxy-store'

interface ProxyProgressProps {
    /** Recording ID to show progress for */
    recordingId: string
    /** Optional recording name for display */
    name?: string
    /** Callback when dismissed */
    onDismiss?: () => void
    /** Additional CSS classes */
    className?: string
}

export function ProxyProgress({
    recordingId,
    name,
    onDismiss,
    className
}: ProxyProgressProps) {
    const status = useProxyStore((s) => s.status[recordingId])
    const progress = useProxyStore((s) => s.progress[recordingId])

    // Don't render if not generating or already ready
    if (status !== 'generating' && status !== 'ready') {
        return null
    }

    const isComplete = status === 'ready'
    const percentage = progress ?? 0

    return (
        <div
            className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5",
                "bg-background/80 backdrop-blur-md border border-border/50 shadow-lg",
                "text-sm",
                isComplete && "border-green-500/30 bg-green-500/5",
                className
            )}
        >
            {isComplete ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            )}

            <span className="text-xs text-muted-foreground max-w-32 truncate">
                {name || 'Video'}
            </span>

            {!isComplete && (
                <span className="text-xs font-mono text-muted-foreground">
                    {Math.round(percentage)}%
                </span>
            )}

            {onDismiss && isComplete && (
                <button
                    onClick={onDismiss}
                    className="ml-1 rounded-full p-0.5 hover:bg-muted/50 transition-colors"
                >
                    <X className="h-3 w-3 text-muted-foreground" />
                </button>
            )}
        </div>
    )
}

/**
 * Container for multiple proxy progress indicators
 */
export function ProxyProgressContainer() {
    const status = useProxyStore((s) => s.status)
    const clearRecording = useProxyStore((s) => s.clearRecording)

    // Get all recordings that are generating
    const generatingIds = Object.entries(status)
        .filter(([, s]) => s === 'generating' || s === 'ready')
        .map(([id]) => id)

    if (generatingIds.length === 0) {
        return null
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            {generatingIds.map((id) => (
                <ProxyProgress
                    key={id}
                    recordingId={id}
                    onDismiss={() => clearRecording(id)}
                />
            ))}
        </div>
    )
}
