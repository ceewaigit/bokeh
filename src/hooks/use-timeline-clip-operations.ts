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
import { useProjectStore } from '@/stores/project-store'
import { useShallow } from 'zustand/react/shallow'
import { useCommandExecutor } from '@/hooks/useCommandExecutor'
import {
    RemoveClipCommand,
    SplitClipCommand,
    DuplicateClipCommand,
    TrimCommand,
    CopyCommand,
    CutCommand,
    PasteCommand,
    ChangePlaybackRateCommand
} from '@/lib/commands'

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
    handleEdgeTrimStart: (clipId: string, newStartTime: number) => void
    handleEdgeTrimEnd: (clipId: string, newEndTime: number) => void
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

    // ─────────────────────────────────────────────────────────────────────────
    // Context menu operations (operate on specific clipId)
    // ─────────────────────────────────────────────────────────────────────────

    const handleClipSplit = useCallback(async (clipId: string) => {
        if (!executorRef.current) return
        const time = useProjectStore.getState().currentTime
        await executorRef.current.execute(SplitClipCommand, clipId, time)
    }, [executorRef])

    const handleClipTrimStart = useCallback(async (clipId: string) => {
        if (!executorRef.current) return
        const time = useProjectStore.getState().currentTime
        await executorRef.current.execute(TrimCommand, clipId, time, 'start')
    }, [executorRef])

    const handleClipTrimEnd = useCallback(async (clipId: string) => {
        if (!executorRef.current) return
        const time = useProjectStore.getState().currentTime
        await executorRef.current.execute(TrimCommand, clipId, time, 'end')
    }, [executorRef])

    const handleClipDuplicate = useCallback(async (clipId: string) => {
        if (!executorRef.current) return
        await executorRef.current.execute(DuplicateClipCommand, clipId)
    }, [executorRef])

    const handleClipCopy = useCallback(async (clipId: string) => {
        if (!executorRef.current) return
        await executorRef.current.execute(CopyCommand, clipId)
    }, [executorRef])

    const handleClipCut = useCallback(async (clipId: string) => {
        if (!executorRef.current) return
        await executorRef.current.execute(CutCommand, clipId)
    }, [executorRef])

    const handleClipDelete = useCallback(async (clipId: string) => {
        if (!executorRef.current) return
        await executorRef.current.execute(RemoveClipCommand, clipId)
    }, [executorRef])

    const handleClipSpeedUp = useCallback(async (clipId: string) => {
        selectClip(clipId)
        if (!executorRef.current) return
        await executorRef.current.execute(ChangePlaybackRateCommand, clipId, 2.0)
    }, [executorRef, selectClip])

    // ─────────────────────────────────────────────────────────────────────────
    // Selection-based operations (operate on selectedClips)
    // ─────────────────────────────────────────────────────────────────────────

    const handleSplit = useCallback(async () => {
        if (selectedClips.length === 1 && executorRef.current) {
            const time = useProjectStore.getState().currentTime
            await executorRef.current.execute(SplitClipCommand, selectedClips[0], time)
        }
    }, [selectedClips, executorRef])

    const handleTrimStart = useCallback(async () => {
        if (selectedClips.length === 1 && executorRef.current) {
            const time = useProjectStore.getState().currentTime
            await executorRef.current.execute(TrimCommand, selectedClips[0], time, 'start')
        }
    }, [selectedClips, executorRef])

    const handleTrimEnd = useCallback(async () => {
        if (selectedClips.length === 1 && executorRef.current) {
            const time = useProjectStore.getState().currentTime
            await executorRef.current.execute(TrimCommand, selectedClips[0], time, 'end')
        }
    }, [selectedClips, executorRef])

    const handleDelete = useCallback(async () => {
        if (!executorRef.current) return
        const executor = executorRef.current

        if (selectedClips.length > 1) executor.beginGroup(`delete-${Date.now()}`)
        for (const clipId of selectedClips) {
            await executor.execute(RemoveClipCommand, clipId)
        }
        if (selectedClips.length > 1) await executor.endGroup()

        clearSelection()
    }, [selectedClips, clearSelection, executorRef])

    const handleDuplicate = useCallback(async () => {
        if (selectedClips.length === 1 && executorRef.current) {
            await executorRef.current.execute(DuplicateClipCommand, selectedClips[0])
        }
    }, [selectedClips, executorRef])

    const handlePaste = useCallback(async () => {
        if (!executorRef.current) return
        const time = useProjectStore.getState().currentTime
        await executorRef.current.execute(PasteCommand, time)
    }, [executorRef])

    // ─────────────────────────────────────────────────────────────────────────
    // Edge trim handlers (direct store mutations, not commands)
    // ─────────────────────────────────────────────────────────────────────────

    const handleEdgeTrimStart = useCallback((clipId: string, newStartTime: number) => {
        useProjectStore.getState().trimClipStart(clipId, newStartTime)
    }, [])

    const handleEdgeTrimEnd = useCallback((clipId: string, newEndTime: number) => {
        useProjectStore.getState().trimClipEnd(clipId, newEndTime)
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
