/**
 * Proxy Feature
 * 
 * Unified proxy generation and management for video files.
 * 
 * Usage:
 *   import { ProxyService, useProxyStore } from '@/features/proxy'
 * 
 *   // Check and generate proxy
 *   await ProxyService.ensureProxiesForRecording(recording)
 * 
 *   // Get proxy URL in component
 *   const proxyUrl = useProxyStore(s => s.getUrl(recordingId, 'preview'))
 */

// Services
export { ProxyService } from './services/proxy-service'

// Store
export { useProxyStore, useProxyUrl, useProxyStatus, useProxyProgress } from './store/proxy-store'

// Hooks
export { useProxyWorkflow } from './hooks/use-proxy-workflow'

// Components
export { LargeVideoDialog } from './components/large-video-dialog'
export { ProxyProgress } from './components/proxy-progress'

// Types
export type {
    ProxyType,
    ProxyStatus,
    UserProxyChoice,
    ProxyCheckResult,
    ProxyGenerationResult,
    ProxyUrlEntry,
    EnsureProxyOptions
} from './types'
