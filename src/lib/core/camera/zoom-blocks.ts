/**
 * Zoom Blocks Module
 * 
 * Parse and query zoom effects for the camera system.
 */

import type { Effect, ZoomEffectData, ZoomFollowStrategy } from '@/types/project'
import { EffectType } from '@/types/project'

export interface ParsedZoomBlock {
    id: string
    startTime: number
    endTime: number
    scale: number
    targetX?: number
    targetY?: number
    screenWidth?: number
    screenHeight?: number
    introMs: number
    outroMs: number
    smoothing?: number
    followStrategy?: ZoomFollowStrategy
    autoScale?: 'fill'
    mouseIdlePx?: number
}

// Cache parsed zoom blocks per effects array reference.
// Important: Do NOT sort/reorder blocks here, since overlapping blocks rely on original ordering.
const zoomBlocksCache = new WeakMap<Effect[], ParsedZoomBlock[]>()

const ZOOM_BLOCK_END_EPSILON_MS = 40
const ZOOM_BLOCK_START_EPSILON_MS = 40

/**
 * Parse zoom effects into structured blocks.
 */
export function parseZoomBlocks(effects: Effect[]): ParsedZoomBlock[] {
    const cached = zoomBlocksCache.get(effects)
    if (cached) return cached

    const parsed = effects
        .filter(e => e.type === EffectType.Zoom && e.enabled)
        .map(e => {
            const data = e.data as ZoomEffectData
            return {
                id: e.id,
                startTime: e.startTime,
                endTime: e.endTime,
                scale: data?.scale ?? 2,
                targetX: data?.targetX,
                targetY: data?.targetY,
                screenWidth: data?.screenWidth,
                screenHeight: data?.screenHeight,
                introMs: data?.introMs ?? 300,
                outroMs: data?.outroMs ?? 300,
                smoothing: data?.smoothing,
                followStrategy: data?.followStrategy,
                autoScale: data?.autoScale,
                mouseIdlePx: data?.mouseIdlePx,
            }
        })

    zoomBlocksCache.set(effects, parsed)
    return parsed
}

/**
 * Find the active zoom block at a given timeline position.
 * Supports fuzzy matching for gaps/rounding at block boundaries.
 */
export function getZoomBlockAtTime(zoomBlocks: ParsedZoomBlock[], timelineMs: number): ParsedZoomBlock | undefined {
    // 1. Strict match (preferred)
    const exact = zoomBlocks.find(b => timelineMs >= b.startTime && timelineMs <= b.endTime)
    if (exact) return exact

    // 2. Fuzzy match (gaps/rounding)
    // Find block with smallest distance to timelineMs
    let best: ParsedZoomBlock | undefined
    let minDist = Infinity

    for (const b of zoomBlocks) {
        // Check post-roll (timelineMs > endTime)
        const distEnd = timelineMs - b.endTime
        if (distEnd > 0 && distEnd <= ZOOM_BLOCK_END_EPSILON_MS) {
            if (distEnd < minDist) {
                minDist = distEnd
                best = b
            }
        }

        // Check pre-roll (timelineMs < startTime)
        const distStart = b.startTime - timelineMs
        if (distStart > 0 && distStart <= ZOOM_BLOCK_START_EPSILON_MS) {
            if (distStart < minDist) {
                minDist = distStart
                best = b
            }
        }
    }
    return best
}
