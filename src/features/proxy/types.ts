/**
 * Proxy Feature Types
 * 
 * Unified type definitions for proxy generation workflow.
 */

/** Proxy types that can be generated */
export type ProxyType = 'preview' | 'glow' | 'scrub'

/** Status of proxy generation for a recording */
export type ProxyStatus = 'idle' | 'checking' | 'generating' | 'ready' | 'dismissed' | 'error'

/** User choice from the large video dialog */
export type UserProxyChoice = 'dismiss' | 'background' | 'now'

/** Result from checking if a video needs a proxy */
export interface ProxyCheckResult {
    needsProxy: boolean
    existingProxyPath?: string
    existingProxyUrl?: string
    dimensions?: { width: number; height: number }
}

/** Result from generating a proxy */
export interface ProxyGenerationResult {
    success: boolean
    proxyPath?: string
    proxyUrl?: string
    error?: string
    skipped?: boolean
    reason?: string
}

/** Entry for proxy URLs per recording */
export interface ProxyUrlEntry {
    previewProxyUrl?: string
    glowProxyUrl?: string
    scrubProxyUrl?: string
}

/** Options for ensuring proxies exist */
export interface EnsureProxyOptions {
    /** Show user prompt for large videos */
    promptUser?: boolean
    /** Generate in background (non-blocking) */
    background?: boolean
    /** Progress callback */
    onProgress?: (message: string) => void
}
