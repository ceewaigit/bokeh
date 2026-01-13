/**
 * Proxy Service
 * 
 * Unified service for video proxy generation and management.
 * Handles checking, generating, and tracking proxy files.
 */

import type { Recording } from '@/types/project'
import type { ProxyCheckResult, ProxyGenerationResult, EnsureProxyOptions } from '../types'
import { useProxyStore } from '../store/proxy-store'
import { MIN_WIDTH_FOR_PREVIEW_PROXY } from '../constants'

// Active checks to prevent redundant concurrent calls
const activeChecks = new Map<string, Promise<void>>()

let proxyProgressListenerCleanup: (() => void) | null = null

function ensureProxyProgressListener() {
    if (proxyProgressListenerCleanup) return
    if (typeof window === 'undefined') return
    if (!window.electronAPI?.onProxyProgress) return

    proxyProgressListenerCleanup = window.electronAPI.onProxyProgress((_event, data) => {
        if (!data || typeof data !== 'object') return

        const { recordingId, type, progress } = data as { recordingId?: unknown; type?: unknown; progress?: unknown }
        if (typeof recordingId !== 'string') return
        if (type !== 'preview' && type !== 'glow') return
        if (typeof progress !== 'number' || !Number.isFinite(progress)) return

        // For now, treat the progress bar as "preview proxy progress" (glow is secondary).
        if (type !== 'preview') return

        const store = useProxyStore.getState()
        store.setProgress(recordingId, progress)

        if (progress < 100 && store.status[recordingId] !== 'generating' && store.status[recordingId] !== 'ready') {
            store.setStatus(recordingId, 'generating')
        }
    })
}

/**
 * ProxyService - Single entry point for all proxy operations
 */
export const ProxyService = {
    /**
     * Check if a video needs a proxy based on dimensions
     */
    async checkNeedsProxy(filePath: string): Promise<ProxyCheckResult> {
        if (!window.electronAPI?.checkPreviewProxy) {
            return { needsProxy: false }
        }

        try {
            const result = await window.electronAPI.checkPreviewProxy(filePath)
            return {
                needsProxy: result.needsProxy,
                existingProxyPath: result.existingProxyPath,
                existingProxyUrl: result.existingProxyUrl
            }
        } catch (error) {
            console.warn('[ProxyService] Check failed:', error)
            return { needsProxy: false }
        }
    },

    /**
     * Get cached proxy URL if exists, without generating
     */
    async getCachedProxy(filePath: string, type: 'preview' | 'glow' = 'preview'): Promise<string | null> {
        if (type === 'preview' && window.electronAPI?.checkPreviewProxy) {
            const result = await window.electronAPI.checkPreviewProxy(filePath)
            return result.existingProxyUrl || null
        }

        if (type === 'glow' && window.electronAPI?.checkGlowProxy) {
            const result = await window.electronAPI.checkGlowProxy(filePath)
            return result.existingProxyUrl || null
        }

        return null
    },

    /**
     * Generate a preview proxy for a recording
     * Note: Backend may return immediately if cached proxy exists
     */
    async generatePreviewProxy(
        recording: Recording,
        onProgress?: (message: string) => void
    ): Promise<ProxyGenerationResult> {
        if (!recording.filePath || !window.electronAPI?.generatePreviewProxy) {
            return { success: false, error: 'No file path or API unavailable' }
        }

        ensureProxyProgressListener()

        const store = useProxyStore.getState()

        // Don't set status to 'generating' yet - backend may return cached result immediately
        // Use a timer to only show loading if generation takes > 200ms
        let loadingTimerId: ReturnType<typeof setTimeout> | null = null
        loadingTimerId = setTimeout(() => {
            store.setStatus(recording.id, 'generating')
            store.setProgress(recording.id, 0)
            onProgress?.('Generating preview for faster playback...')
        }, 200)

        try {
            const result = await window.electronAPI.generatePreviewProxy(recording.filePath, recording.id)

            // Clear the loading timer if generation was fast (cached)
            if (loadingTimerId) {
                clearTimeout(loadingTimerId)
            }

            if (result.success && result.proxyUrl) {
                console.log(`[ProxyService] ✅ Setting proxy URL in store for ${recording.id}:`, result.proxyUrl)
                store.setUrl(recording.id, 'preview', result.proxyUrl)
                store.setStatus(recording.id, 'ready')
                store.setProgress(recording.id, 100)
                // NOTE: Proxy URLs are stored ONLY in the zustand store - not on recording objects

                return {
                    success: true,
                    proxyPath: result.proxyPath,
                    proxyUrl: result.proxyUrl
                }
            }

            store.setStatus(recording.id, 'error')
            return {
                success: false,
                error: result.error || 'Unknown error generating proxy'
            }
        } catch (error) {
            if (loadingTimerId) {
                clearTimeout(loadingTimerId)
            }
            console.warn('[ProxyService] Preview proxy generation failed:', error)
            store.setStatus(recording.id, 'error')
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    },

    /**
     * Generate a glow proxy for the ambient glow effect
     */
    async generateGlowProxy(recording: Recording): Promise<ProxyGenerationResult> {
        if (!recording.filePath || !window.electronAPI?.generateGlowProxy) {
            return { success: false, error: 'No file path or API unavailable' }
        }

        ensureProxyProgressListener()

        try {
            const result = await window.electronAPI.generateGlowProxy(recording.filePath, recording.id)

            if (result.success && result.proxyUrl) {
                useProxyStore.getState().setUrl(recording.id, 'glow', result.proxyUrl)
                // NOTE: Proxy URLs are stored ONLY in the zustand store - not on recording objects

                return {
                    success: true,
                    proxyPath: result.proxyPath,
                    proxyUrl: result.proxyUrl
                }
            }

            if (result.skipped) {
                return { success: true, skipped: true, reason: result.reason }
            }

            return {
                success: false,
                error: result.error || 'Unknown error generating glow proxy'
            }
        } catch (error) {
            console.warn('[ProxyService] Glow proxy generation failed:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    },

    /**
     * Ensure all needed proxies exist for a recording
     * This is the main entry point for project loading
     */
    async ensureProxiesForRecording(
        recording: Recording,
        options: EnsureProxyOptions = {}
    ): Promise<void> {
        const { onProgress, background = true, promptUser = true } = options
        const store = useProxyStore.getState()

        const filePath = recording.filePath
        if (!filePath) {
            return
        }

        // Prevent concurrent checks for the same recording
        const existingCheck = activeChecks.get(recording.id)
        if (existingCheck) {
            return existingCheck
        }

        const checkPromise = (async () => {
            const previousStatus = store.status[recording.id]

            // Set initial status
            store.setStatus(recording.id, 'checking')

            try {
                // 1. Check for existing preview proxy first
                const checkResult = await this.checkNeedsProxy(filePath)

                if (checkResult.existingProxyUrl) {
                    // CACHE HIT - immediately mark as ready and store URL
                    console.log(`[ProxyService] ✅ Using cached preview proxy for ${recording.id}:`, checkResult.existingProxyUrl)
                    store.setUrl(recording.id, 'preview', checkResult.existingProxyUrl)
                    store.setStatus(recording.id, 'ready')
                    // NOTE: Proxy URLs are stored ONLY in the zustand store - not on recording objects

                    // Still generate glow proxy in background
                    void this.generateGlowProxy(recording)
                    return
                }

                // 2. Determine if proxy is needed
                const needsProxy = checkResult.needsProxy ||
                    (typeof recording.width === 'number' && recording.width > MIN_WIDTH_FOR_PREVIEW_PROXY) ||
                    recording.capabilities?.requiresProxy

                if (!needsProxy) {
                    // Small video - no proxy needed
                    store.setStatus(recording.id, 'idle')
                    return
                }

                // 3. Large video without cached proxy: prompt user before generating unless explicitly disabled.
                if (promptUser) {
                    store.setStatus(recording.id, previousStatus === 'dismissed' ? 'dismissed' : 'idle')
                    return
                }

                // 3. Generate proxies
                if (background) {
                    // Non-blocking - fire and forget
                    void this.generatePreviewProxy(recording, onProgress)
                    void this.generateGlowProxy(recording)
                } else {
                    // Blocking - await completion
                    await this.generatePreviewProxy(recording, onProgress)
                    await this.generateGlowProxy(recording)
                }
            } catch (error) {
                console.warn('[ProxyService] ensureProxiesForRecording failed:', error)
                store.setStatus(recording.id, 'error')
            } finally {
                activeChecks.delete(recording.id)
            }
        })()

        activeChecks.set(recording.id, checkPromise)
        return checkPromise
    },

    /**
     * Check if a recording requires proxy and hasn't been processed yet
     */
    needsUserPrompt(recording: Recording): boolean {
        const status = useProxyStore.getState().status[recording.id]

        // Already processing, done, or currently checking
        if (status === 'generating' || status === 'ready' || status === 'dismissed' || status === 'checking') {
            return false
        }

        // Check dimensions
        const isLarge = typeof recording.width === 'number' && recording.width > MIN_WIDTH_FOR_PREVIEW_PROXY
        return isLarge || !!recording.capabilities?.requiresProxy
    },

    /**
     * Clear all proxy state (called on project close)
     */
    clear(): void {
        useProxyStore.getState().clear()
    }
}
