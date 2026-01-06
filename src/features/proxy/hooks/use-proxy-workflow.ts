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
        // Check if proxy already exists or is being generated
        if (!ProxyService.needsUserPrompt(recording)) {
            return false
        }

        // Check if there's a cached proxy
        if (recording.filePath) {
            const cached = await ProxyService.getCachedProxy(recording.filePath)
            if (cached) {
                // Cached proxy exists - use it silently
                useProxyStore.getState().setUrl(recording.id, 'preview', cached)
                useProxyStore.getState().setStatus(recording.id, 'ready')
                return false
            }
        }

        // Large video without cache - show dialog
        setPendingRecording(recording)
        setDialogOpen(true)
        return true
    }, [])

    const handleUserChoice = useCallback(async (choice: UserProxyChoice): Promise<void> => {
        if (!pendingRecording) return

        setDialogOpen(false)

        switch (choice) {
            case 'dismiss':
                // User chose to use original - mark as idle
                useProxyStore.getState().setStatus(pendingRecording.id, 'idle')
                break

            case 'background':
                // Generate in background (non-blocking)
                void ProxyService.generatePreviewProxy(pendingRecording)
                void ProxyService.generateGlowProxy(pendingRecording)
                break

            case 'now':
                // Generate now (blocking)
                await ProxyService.generatePreviewProxy(pendingRecording)
                await ProxyService.generateGlowProxy(pendingRecording)
                break
        }

        setPendingRecording(null)
    }, [pendingRecording])

    const closeDialog = useCallback(() => {
        setDialogOpen(false)
        if (pendingRecording) {
            // Treat closing as dismiss
            useProxyStore.getState().setStatus(pendingRecording.id, 'idle')
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
