/**
 * Proxy Service
 * 
 * Unified service for video proxy generation and management.
 * Handles checking, generating, and tracking proxy files.
 */

import type { Recording } from '@/types/project'
import type { ProxyCheckResult, ProxyGenerationResult, EnsureProxyOptions } from '../types'
import { useProxyStore } from '../store/proxy-store'

const MIN_WIDTH_FOR_PREVIEW_PROXY = 2560

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
            const result = await window.electronAPI.generatePreviewProxy(recording.filePath)

            // Clear the loading timer if generation was fast (cached)
            if (loadingTimerId) {
                clearTimeout(loadingTimerId)
            }

            if (result.success && result.proxyUrl) {
                console.log(`[ProxyService] ✅ Setting proxy URL in store for ${recording.id}:`, result.proxyUrl)
                store.setUrl(recording.id, 'preview', result.proxyUrl)
                store.setStatus(recording.id, 'ready')
                store.setProgress(recording.id, 100)

                // Also set on recording object for backward compat
                try {
                    (recording as any).previewProxyUrl = result.proxyUrl
                } catch {
                    // Object may be frozen
                }

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

        try {
            const result = await window.electronAPI.generateGlowProxy(recording.filePath)

            if (result.success && result.proxyUrl) {
                useProxyStore.getState().setUrl(recording.id, 'glow', result.proxyUrl)

                // Also set on recording object for backward compat
                try {
                    (recording as any).glowProxyUrl = result.proxyUrl
                } catch {
                    // Object may be frozen
                }

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
        const { onProgress, background = true } = options
        const store = useProxyStore.getState()

        if (!recording.filePath) {
            return
        }

        // Set initial status
        store.setStatus(recording.id, 'checking')

        try {
            // 1. Check for existing preview proxy first
            const checkResult = await this.checkNeedsProxy(recording.filePath)

            if (checkResult.existingProxyUrl) {
                // CACHE HIT - immediately mark as ready (fixes loading state bug)
                console.log(`[ProxyService] Using cached preview proxy for ${recording.id}`)
                store.setUrl(recording.id, 'preview', checkResult.existingProxyUrl)
                store.setStatus(recording.id, 'ready')

                try {
                    (recording as any).previewProxyUrl = checkResult.existingProxyUrl
                } catch {
                    // Object frozen
                }

                // Still generate glow proxy in background
                void this.generateGlowProxy(recording)
                return
            }

            // 2. Determine if proxy is needed
            const needsProxy = checkResult.needsProxy ||
                (typeof recording.width === 'number' && recording.width > MIN_WIDTH_FOR_PREVIEW_PROXY)

            if (!needsProxy) {
                // Small video - no proxy needed
                store.setStatus(recording.id, 'idle')
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
        }
    },

    /**
     * Check if a recording requires proxy and hasn't been processed yet
     */
    needsUserPrompt(recording: Recording): boolean {
        const status = useProxyStore.getState().status[recording.id]

        // Already processing or done
        if (status === 'generating' || status === 'ready') {
            return false
        }

        // Check dimensions
        const isLarge = typeof recording.width === 'number' && recording.width > MIN_WIDTH_FOR_PREVIEW_PROXY
        return isLarge
    },

    /**
     * Clear all proxy state (called on project close)
     */
    clear(): void {
        useProxyStore.getState().clear()
    }
}
