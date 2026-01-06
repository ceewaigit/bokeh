/**
 * Proxy Store
 * 
 * Dedicated Zustand store for proxy state management.
 * Tracks proxy URLs, generation status, and progress per recording.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ProxyType, ProxyStatus, ProxyUrlEntry } from '../types'

interface ProxyState {
    /** Proxy URLs per recording */
    urls: Record<string, ProxyUrlEntry>

    /** Generation status per recording */
    status: Record<string, ProxyStatus>

    /** Progress percentage per recording (0-100) */
    progress: Record<string, number>
}

interface ProxyActions {
    /** Set proxy URL for a recording */
    setUrl: (recordingId: string, type: ProxyType, url: string) => void

    /** Get proxy URL for a recording */
    getUrl: (recordingId: string, type: ProxyType) => string | undefined

    /** Set generation status */
    setStatus: (recordingId: string, status: ProxyStatus) => void

    /** Set generation progress (0-100) */
    setProgress: (recordingId: string, progress: number) => void

    /** Clear all proxy state (called on project close) */
    clear: () => void

    /** Clear state for a specific recording */
    clearRecording: (recordingId: string) => void
}

export const useProxyStore = create<ProxyState & ProxyActions>()(
    immer((set, get) => ({
        // Initial state
        urls: {},
        status: {},
        progress: {},

        // Actions
        setUrl: (recordingId, type, url) => {
            set((state) => {
                if (!state.urls[recordingId]) {
                    state.urls[recordingId] = {}
                }
                if (type === 'preview') {
                    state.urls[recordingId].previewProxyUrl = url
                } else if (type === 'glow') {
                    state.urls[recordingId].glowProxyUrl = url
                } else {
                    state.urls[recordingId].scrubProxyUrl = url
                }
            })
        },

        getUrl: (recordingId, type) => {
            const entry = get().urls[recordingId]
            if (!entry) return undefined
            if (type === 'preview') return entry.previewProxyUrl
            if (type === 'glow') return entry.glowProxyUrl
            return entry.scrubProxyUrl
        },

        setStatus: (recordingId, status) => {
            set((state) => {
                state.status[recordingId] = status
            })
        },

        setProgress: (recordingId, progress) => {
            set((state) => {
                state.progress[recordingId] = Math.min(100, Math.max(0, progress))
            })
        },

        clear: () => {
            set((state) => {
                state.urls = {}
                state.status = {}
                state.progress = {}
            })
        },

        clearRecording: (recordingId) => {
            set((state) => {
                delete state.urls[recordingId]
                delete state.status[recordingId]
                delete state.progress[recordingId]
            })
        }
    }))
)

// Selector hooks for common patterns
export const useProxyUrl = (recordingId: string | undefined, type: ProxyType) =>
    useProxyStore((s) => recordingId ? s.getUrl(recordingId, type) : undefined)

export const useProxyStatus = (recordingId: string | undefined) =>
    useProxyStore((s) => recordingId ? s.status[recordingId] : undefined)

export const useProxyProgress = (recordingId: string | undefined) =>
    useProxyStore((s) => recordingId ? s.progress[recordingId] : undefined)
