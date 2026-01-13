/**
 * useTimelineClipOperations
 *
 * Centralized hook for all clip command operations.
 * Replaces ~15 scattered useCallback handlers in timeline-canvas.tsx.
 *
 * Usage:
 *   const ops = useTimelineClipOperations()
 *   ops.handleClipSplit(clipId)
 *   ops.handleSplit() // for selected clips
 */

import { useCallback } from 'react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useShallow } from 'zustand/react/shallow'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'
import {
    RemoveClipCommand,
    SplitClipCommand,
    DuplicateClipCommand,
    TrimCommand,
    CopyCommand,
    CutCommand,
    PasteCommand,
    ChangePlaybackRateCommand
} from '@/features/core/commands'

export interface TimelineClipOperations {
    // Context menu operations (take clipId)
    handleClipSplit: (clipId: string) => Promise<void>
    handleClipTrimStart: (clipId: string) => Promise<void>
    handleClipTrimEnd: (clipId: string) => Promise<void>
    handleClipDuplicate: (clipId: string) => Promise<void>
    handleClipCopy: (clipId: string) => Promise<void>
    handleClipCut: (clipId: string) => Promise<void>
    handleClipDelete: (clipId: string) => Promise<void>
    handleClipSpeedUp: (clipId: string) => Promise<void>

    // Selection-based operations
    handleSplit: () => Promise<void>
    handleTrimStart: () => Promise<void>
    handleTrimEnd: () => Promise<void>
    handleDelete: () => Promise<void>
    handleDuplicate: () => Promise<void>
    handlePaste: () => Promise<void>

    // Edge trim handlers (direct store updates, not commands)
    handleEdgeTrimStart: (clipId: string, newStartTime: number) => Promise<void>
    handleEdgeTrimEnd: (clipId: string, newEndTime: number) => Promise<void>
}

export function useTimelineClipOperations(): TimelineClipOperations {
    const executorRef = useCommandExecutor()

    const { selectedClips, selectClip, clearSelection } = useProjectStore(
        useShallow((s) => ({
            selectedClips: s.selectedClips,
            selectClip: s.selectClip,
            clearSelection: s.clearSelection
        }))
    )

    // Helper to get current time from store
    const getCurrentTime = () => useProjectStore.getState().currentTime

    // Helper to execute command if executor is available
    const withExecutor = async <R>(fn: (executor: NonNullable<typeof executorRef.current>) => Promise<R>): Promise<R | void> => {
        if (!executorRef.current) return
        return fn(executorRef.current)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Context menu operations (operate on specific clipId)
    // ─────────────────────────────────────────────────────────────────────────

    const handleClipSplit = useCallback(async (clipId: string) => {
        await withExecutor(e => e.execute(SplitClipCommand, clipId, getCurrentTime()))
    }, [])

    const handleClipTrimStart = useCallback(async (clipId: string) => {
        await withExecutor(e => e.execute(TrimCommand, clipId, getCurrentTime(), 'start'))
    }, [])

    const handleClipTrimEnd = useCallback(async (clipId: string) => {
        await withExecutor(e => e.execute(TrimCommand, clipId, getCurrentTime(), 'end'))
    }, [])

    const handleClipDuplicate = useCallback(async (clipId: string) => {
        await withExecutor(e => e.execute(DuplicateClipCommand, clipId))
    }, [])

    const handleClipCopy = useCallback(async (clipId: string) => {
        await withExecutor(e => e.execute(CopyCommand, clipId))
    }, [])

    const handleClipCut = useCallback(async (clipId: string) => {
        await withExecutor(e => e.execute(CutCommand, clipId))
    }, [])

    const handleClipDelete = useCallback(async (clipId: string) => {
        await withExecutor(e => e.execute(RemoveClipCommand, clipId))
    }, [])

    const handleClipSpeedUp = useCallback(async (clipId: string) => {
        selectClip(clipId)
        await withExecutor(e => e.execute(ChangePlaybackRateCommand, clipId, 2.0))
    }, [selectClip])

    // ─────────────────────────────────────────────────────────────────────────
    // Selection-based operations (operate on selectedClips)
    // ─────────────────────────────────────────────────────────────────────────

    const handleSplit = useCallback(async () => {
        if (selectedClips.length !== 1) return
        await withExecutor(e => e.execute(SplitClipCommand, selectedClips[0], getCurrentTime()))
    }, [selectedClips])

    const handleTrimStart = useCallback(async () => {
        if (selectedClips.length !== 1) return
        await withExecutor(e => e.execute(TrimCommand, selectedClips[0], getCurrentTime(), 'start'))
    }, [selectedClips])

    const handleTrimEnd = useCallback(async () => {
        if (selectedClips.length !== 1) return
        await withExecutor(e => e.execute(TrimCommand, selectedClips[0], getCurrentTime(), 'end'))
    }, [selectedClips])

    const handleDelete = useCallback(async () => {
        await withExecutor(async (executor) => {
            if (selectedClips.length > 1) executor.beginGroup(`delete-${Date.now()}`)
            for (const clipId of selectedClips) {
                await executor.execute(RemoveClipCommand, clipId)
            }
            if (selectedClips.length > 1) await executor.endGroup()
            clearSelection()
        })
    }, [selectedClips, clearSelection])

    const handleDuplicate = useCallback(async () => {
        if (selectedClips.length !== 1) return
        await withExecutor(e => e.execute(DuplicateClipCommand, selectedClips[0]))
    }, [selectedClips])

    const handlePaste = useCallback(async () => {
        await withExecutor(e => e.execute(PasteCommand, getCurrentTime()))
    }, [])

    // ─────────────────────────────────────────────────────────────────────────
    // Edge trim handlers (direct store mutations, not commands)
    // ─────────────────────────────────────────────────────────────────────────

    const handleEdgeTrimStart = useCallback(async (clipId: string, newStartTime: number) => {
        await withExecutor(e => e.execute(TrimCommand, clipId, newStartTime, 'start'))
    }, [])

    const handleEdgeTrimEnd = useCallback(async (clipId: string, newEndTime: number) => {
        await withExecutor(e => e.execute(TrimCommand, clipId, newEndTime, 'end'))
    }, [])

    return {
        // Context menu operations
        handleClipSplit,
        handleClipTrimStart,
        handleClipTrimEnd,
        handleClipDuplicate,
        handleClipCopy,
        handleClipCut,
        handleClipDelete,
        handleClipSpeedUp,

        // Selection-based operations
        handleSplit,
        handleTrimStart,
        handleTrimEnd,
        handleDelete,
        handleDuplicate,
        handlePaste,

        // Edge trim handlers
        handleEdgeTrimStart,
        handleEdgeTrimEnd
    }
}
