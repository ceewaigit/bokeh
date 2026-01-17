/**
 * useProxyWorkflow Hook
 * 
 * React hook for managing the proxy workflow in components.
 * Provides status tracking and generation controls.
 */

import { useCallback, useState } from 'react'
import type { Recording } from '@/types/project'
import type { UserProxyChoice, ProxyStatus } from '../types'
import { ProxyService } from '../services/proxy-service'
import { useProxyStore } from '../store/proxy-store'

interface ProxyWorkflowState {
    /** Recording pending user choice */
    pendingRecording: Recording | null
    /** Whether the dialog is open */
    dialogOpen: boolean
}

interface ProxyWorkflowActions {
    /** Check if video needs proxy and show dialog if needed */
    promptIfNeeded: (recording: Recording) => Promise<boolean>
    /** Handle user choice from dialog */
    handleUserChoice: (choice: UserProxyChoice) => Promise<void>
    /** Close the dialog */
    closeDialog: () => void
    /** Generate proxy in background */
    generateInBackground: (recording: Recording) => void
    /** Generate proxy now (blocking) */
    generateNow: (recording: Recording) => Promise<void>
}

export interface UseProxyWorkflowReturn extends ProxyWorkflowState, ProxyWorkflowActions {
    /** Get status for a recording */
    getStatus: (recordingId: string) => ProxyStatus | undefined
    /** Get progress for a recording */
    getProgress: (recordingId: string) => number | undefined
}

export function useProxyWorkflow(): UseProxyWorkflowReturn {
    const [pendingRecording, setPendingRecording] = useState<Recording | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)

    // Store selectors
    const status = useProxyStore((s) => s.status)
    const progress = useProxyStore((s) => s.progress)

    const getStatus = useCallback((recordingId: string): ProxyStatus | undefined => {
        return status[recordingId]
    }, [status])

    const getProgress = useCallback((recordingId: string): number | undefined => {
        return progress[recordingId]
    }, [progress])

    const promptIfNeeded = useCallback(async (recording: Recording): Promise<boolean> => {
        // First check store - if proxy URL already set or status is ready, no prompt needed
        const store = useProxyStore.getState()
        const existingUrl = store.urls[recording.id]?.previewProxyUrl
        const existingStatus = store.status[recording.id]

        if (existingUrl || existingStatus === 'ready' || existingStatus === 'generating' || existingStatus === 'dismissed') {
            // Proxy already exists or is being generated - no prompt needed
            return false
        }

        // Check if video is large enough to need a proxy
        if (!ProxyService.needsUserPrompt(recording)) {
            return false
        }

        // Large video without proxy - show dialog
        setPendingRecording(recording)
        setDialogOpen(true)
        return true
    }, [])

    const handleUserChoice = useCallback(async (choice: UserProxyChoice): Promise<void> => {
        if (!pendingRecording) return

        switch (choice) {
            case 'dismiss':
                // User chose to use original - close dialog and mark as dismissed
                setDialogOpen(false)
                useProxyStore.getState().setStatus(pendingRecording.id, 'dismissed')
                setPendingRecording(null)
                break

            case 'background':
                // DON'T close dialog - let it show progress
                // Generation will run, dialog watches store for status updates
                // Dialog auto-closes when status becomes 'ready'
                void ProxyService.generatePreviewProxy(pendingRecording)
                void ProxyService.generateGlowProxy(pendingRecording)
                break

            case 'now':
                // Blocking generation - await completion then close
                await ProxyService.generatePreviewProxy(pendingRecording)
                await ProxyService.generateGlowProxy(pendingRecording)
                setDialogOpen(false)
                setPendingRecording(null)
                break
        }
    }, [pendingRecording])

    const closeDialog = useCallback(() => {
        setDialogOpen(false)
        if (pendingRecording) {
            const currentStatus = useProxyStore.getState().status[pendingRecording.id]
            // Don't mark as dismissed if already generating - let it finish in background
            if (currentStatus !== 'generating' && currentStatus !== 'ready') {
                useProxyStore.getState().setStatus(pendingRecording.id, 'dismissed')
            }
        }
        setPendingRecording(null)
    }, [pendingRecording])

    const generateInBackground = useCallback((recording: Recording) => {
        void ProxyService.generatePreviewProxy(recording)
        void ProxyService.generateGlowProxy(recording)
    }, [])

    const generateNow = useCallback(async (recording: Recording) => {
        await ProxyService.generatePreviewProxy(recording)
        await ProxyService.generateGlowProxy(recording)
    }, [])

    return {
        // State
        pendingRecording,
        dialogOpen,

        // Actions
        promptIfNeeded,
        handleUserChoice,
        closeDialog,
        generateInBackground,
        generateNow,

        // Selectors
        getStatus,
        getProgress
    }
}
