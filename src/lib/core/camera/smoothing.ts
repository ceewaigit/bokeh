/**
 * Smoothing Module
 * 
 * Cinematic smoothing and motion cluster analysis for camera movement.
 */

import type { MouseEvent } from '@/types/project'
import { interpolateMousePosition } from '@/lib/effects/utils/mouse-interpolation'
import { CAMERA_CONFIG } from '@/lib/effects/config/physics-config'
import { CameraDataService, type Cluster } from './camera-data-service'

const {
    clusterRadiusRatio: CLUSTER_RADIUS_RATIO,
    minClusterDurationMs: MIN_CLUSTER_DURATION_MS,
    clusterHoldBufferMs: CLUSTER_HOLD_BUFFER_MS,
    cinematicSamples: CINEMATIC_SAMPLES,
} = CAMERA_CONFIG

// Re-export Cluster type from centralized service
export type { Cluster }

/**
 * Analyze mouse events to find clusters of activity.
 */
function analyzeMotionClusters(
    mouseEvents: MouseEvent[],
    videoWidth: number,
    videoHeight: number
): Cluster[] {
    const clusters: Cluster[] = []
    if (mouseEvents.length === 0) return clusters

    const screenDiag = Math.sqrt(videoWidth * videoWidth + videoHeight * videoHeight)
    const maxClusterRadius = screenDiag * CLUSTER_RADIUS_RATIO
    const minClusterDuration = MIN_CLUSTER_DURATION_MS

    let currentCluster: {
        events: MouseEvent[]
        startTime: number
        sumX: number
        sumY: number
    } | null = null

    for (const event of mouseEvents) {
        if (!currentCluster) {
            currentCluster = {
                events: [event],
                startTime: event.timestamp,
                sumX: event.x,
                sumY: event.y,
            }
            continue
        }

        const count = currentCluster.events.length
        const centroidX = currentCluster.sumX / count
        const centroidY = currentCluster.sumY / count

        const dist = Math.sqrt(
            Math.pow(event.x - centroidX, 2) + Math.pow(event.y - centroidY, 2)
        )

        if (dist <= maxClusterRadius) {
            currentCluster.events.push(event)
            currentCluster.sumX += event.x
            currentCluster.sumY += event.y
        } else {
            const duration =
                currentCluster.events[currentCluster.events.length - 1].timestamp -
                currentCluster.startTime

            if (duration >= minClusterDuration) {
                clusters.push({
                    startTime: currentCluster.startTime,
                    endTime: currentCluster.events[currentCluster.events.length - 1].timestamp,
                    centroidX: currentCluster.sumX / currentCluster.events.length,
                    centroidY: currentCluster.sumY / currentCluster.events.length,
                })
            }

            currentCluster = {
                events: [event],
                startTime: event.timestamp,
                sumX: event.x,
                sumY: event.y,
            }
        }
    }

    if (currentCluster) {
        const duration =
            currentCluster.events[currentCluster.events.length - 1].timestamp -
            currentCluster.startTime
        if (duration >= minClusterDuration) {
            clusters.push({
                startTime: currentCluster.startTime,
                endTime: currentCluster.events[currentCluster.events.length - 1].timestamp,
                centroidX: currentCluster.sumX / currentCluster.events.length,
                centroidY: currentCluster.sumY / currentCluster.events.length,
            })
        }
    }

    return clusters
}

/**
 * Find the active cluster at a given time using binary search.
 */
function findActiveCluster(
    clusters: Cluster[],
    timeMs: number,
    holdBufferMs: number
): Cluster | null {
    if (!clusters || clusters.length === 0) return null

    let low = 0
    let high = clusters.length - 1
    let candidateIdx = -1

    while (low <= high) {
        const mid = (low + high) >> 1
        const extendedEnd = clusters[mid].endTime + holdBufferMs
        if (extendedEnd >= timeMs) {
            candidateIdx = mid
            high = mid - 1
        } else {
            low = mid + 1
        }
    }

    if (candidateIdx < 0) return null
    const c = clusters[candidateIdx]
    if (timeMs >= c.startTime && timeMs <= c.endTime + holdBufferMs) {
        return c
    }
    return null
}

/**
 * Get motion clusters (cached via CameraDataService).
 */
export function getMotionClusters(
    mouseEvents: MouseEvent[],
    videoWidth: number,
    videoHeight: number
): Cluster[] {
    if (!mouseEvents || mouseEvents.length === 0) return []

    const cacheKey = CameraDataService.getMotionClusterCacheKey(mouseEvents, videoWidth, videoHeight)
    const cached = CameraDataService.getMotionClusters(cacheKey)

    if (cached) {
        return cached
    }

    const clusters = analyzeMotionClusters(mouseEvents, videoWidth, videoHeight)
    CameraDataService.setMotionClusters(cacheKey, clusters)
    return clusters
}

/**
 * Get cinematic (window-averaged) mouse position.
 */
export function getCinematicMousePosition(
    mouseEvents: MouseEvent[],
    timeMs: number,
    windowMs: number
): { x: number; y: number } | null {
    const samples = CINEMATIC_SAMPLES

    let sumX = 0
    let sumY = 0
    let validSamples = 0

    for (let i = 0; i < samples; i++) {
        const t = timeMs - i * (windowMs / samples)
        const pos = interpolateMousePosition(mouseEvents, t)
        if (pos) {
            sumX += pos.x
            sumY += pos.y
            validSamples++
        }
    }

    if (validSamples === 0) return null
    return { x: sumX / validSamples, y: sumY / validSamples }
}

/**
 * Normalize smoothing amount from UI value to internal range.
 */
export function normalizeSmoothingAmount(value?: number): number {
    if (!Number.isFinite(value)) return 0
    const raw = value ?? 0
    // Support legacy 0-1 values by mapping to 0-100
    const normalized = raw > 0 && raw <= 1 ? raw * 100 : raw
    return Math.max(0, Math.min(100, normalized))
}

/**
 * Calculate smoothed cursor attractor position.
 */
export function calculateAttractor(
    mouseEvents: MouseEvent[],
    timeMs: number,
    videoWidth: number,
    videoHeight: number,
    smoothingAmount: number
): { x: number; y: number } | null {
    if (mouseEvents.length === 0) return null

    const clusters = getMotionClusters(mouseEvents, videoWidth, videoHeight)
    const holdBuffer = CLUSTER_HOLD_BUFFER_MS

    const activeCluster = findActiveCluster(clusters, timeMs, holdBuffer)

    if (activeCluster) {
        return { x: activeCluster.centroidX, y: activeCluster.centroidY }
    }

    if (smoothingAmount > 0) {
        // Map 0-100 to 0-1000ms window
        const windowMs = smoothingAmount * 10
        return getCinematicMousePosition(mouseEvents, timeMs, windowMs)
    }

    // Fallback to raw interpolated position if smoothing is disabled
    return interpolateMousePosition(mouseEvents, timeMs)
}
