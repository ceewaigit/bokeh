/**
 * Zoom Blocks Module
 * 
 * Parse and query zoom effects for the camera system.
 */

import type { Effect, ZoomBlockOrigin, ZoomEffectData, ZoomFollowStrategy, ZoomMode } from '@/types/project'
import { EffectType, ZoomFollowStrategy as ZoomFollowStrategyEnum } from '@/types/project'

export interface ParsedZoomBlock {
    id: string
    origin: ZoomBlockOrigin
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
    zoomMode?: ZoomMode
    followStrategy?: ZoomFollowStrategy
    autoScale?: 'fill'
    mouseIdlePx?: number
    transitionStyle?: NonNullable<ZoomEffectData['transitionStyle']>
    mouseFollowAlgorithm?: NonNullable<ZoomEffectData['mouseFollowAlgorithm']>
    zoomIntoCursorMode?: NonNullable<ZoomEffectData['zoomIntoCursorMode']>
}

// Cache parsed zoom blocks per effects array reference.
// Important: Do NOT sort/reorder blocks here, since overlapping blocks rely on original ordering.
const zoomBlocksCache = new WeakMap<Effect[], ParsedZoomBlock[]>()
let lastLookup: { blocks: ParsedZoomBlock[]; result: ParsedZoomBlock | undefined } | null = null

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
            const data = requireZoomEffectData(e)
            return {
                id: e.id,
                origin: data.origin,
                startTime: e.startTime,
                endTime: e.endTime,
                scale: data.scale,
                targetX: data.targetX,
                targetY: data.targetY,
                screenWidth: data.screenWidth,
                screenHeight: data.screenHeight,
                introMs: data.introMs,
                outroMs: data.outroMs,
                smoothing: data.smoothing,
                zoomMode: data.zoomMode,
                followStrategy: data.followStrategy,
                autoScale: data.autoScale,
                mouseIdlePx: data.mouseIdlePx,
                transitionStyle: normalizeZoomTransitionStyle(data.transitionStyle),
                mouseFollowAlgorithm: normalizeMouseFollowAlgorithm(data.mouseFollowAlgorithm),
                zoomIntoCursorMode: normalizeZoomIntoCursorMode(data.zoomIntoCursorMode),
            }
        })

    zoomBlocksCache.set(effects, parsed)
    return parsed
}

export function areEffectsEqual(a: Effect[], b: Effect[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

function requireZoomEffectData(effect: Effect): ZoomEffectData {
    const data = effect.data as ZoomEffectData | undefined
    if (!data) {
        throw new Error(`[ZoomBlocks] Missing data for zoom effect ${effect.id}`)
    }
    if (typeof effect.startTime !== 'number' || typeof effect.endTime !== 'number') {
        throw new Error(`[ZoomBlocks] Invalid zoom timing for ${effect.id}`)
    }
    if (effect.startTime >= effect.endTime) {
        throw new Error(`[ZoomBlocks] Zoom effect ${effect.id} has non-positive duration`)
    }
    if (data.origin !== 'auto' && data.origin !== 'manual') {
        throw new Error(`[ZoomBlocks] Invalid zoom origin for ${effect.id}`)
    }
    assertFiniteNumber('scale', data.scale, effect.id)
    assertFiniteNumber('introMs', data.introMs, effect.id)
    assertFiniteNumber('outroMs', data.outroMs, effect.id)
    assertFiniteNumber('smoothing', data.smoothing, effect.id)
    if (data.scale <= 0) {
        throw new Error(`[ZoomBlocks] Zoom effect ${effect.id} has invalid scale`)
    }
    if (data.introMs < 0 || data.outroMs < 0 || data.smoothing < 0) {
        throw new Error(`[ZoomBlocks] Zoom effect ${effect.id} has negative timing values`)
    }
    if (data.targetX !== undefined) assertFiniteNumber('targetX', data.targetX, effect.id)
    if (data.targetY !== undefined) assertFiniteNumber('targetY', data.targetY, effect.id)
    if (data.screenWidth !== undefined) {
        assertFiniteNumber('screenWidth', data.screenWidth, effect.id)
        if (data.screenWidth <= 0) throw new Error(`[ZoomBlocks] Zoom effect ${effect.id} has invalid screenWidth`)
    }
    if (data.screenHeight !== undefined) {
        assertFiniteNumber('screenHeight', data.screenHeight, effect.id)
        if (data.screenHeight <= 0) throw new Error(`[ZoomBlocks] Zoom effect ${effect.id} has invalid screenHeight`)
    }
    if (data.mouseIdlePx !== undefined) {
        assertFiniteNumber('mouseIdlePx', data.mouseIdlePx, effect.id)
        if (data.mouseIdlePx < 0) throw new Error(`[ZoomBlocks] Zoom effect ${effect.id} has invalid mouseIdlePx`)
    }
    if (data.followStrategy !== undefined && !isValidFollowStrategy(data.followStrategy)) {
        throw new Error(`[ZoomBlocks] Invalid followStrategy for ${effect.id}`)
    }
    if (data.transitionStyle !== undefined && !isValidTransitionStyle(data.transitionStyle)) {
        throw new Error(`[ZoomBlocks] Invalid transitionStyle for ${effect.id}`)
    }
    if (data.mouseFollowAlgorithm !== undefined && !isValidMouseFollowAlgorithm(data.mouseFollowAlgorithm)) {
        throw new Error(`[ZoomBlocks] Invalid mouseFollowAlgorithm for ${effect.id}`)
    }
    if (data.zoomIntoCursorMode !== undefined && !isValidZoomIntoCursorMode(data.zoomIntoCursorMode)) {
        throw new Error(`[ZoomBlocks] Invalid zoomIntoCursorMode for ${effect.id}`)
    }
    return data
}

function assertFiniteNumber(field: string, value: number, effectId: string): void {
    if (!Number.isFinite(value)) {
        throw new Error(`[ZoomBlocks] ${field} is not a finite number for ${effectId}`)
    }
}

function isValidFollowStrategy(strategy: ZoomFollowStrategy): boolean {
    return strategy === ZoomFollowStrategyEnum.Mouse
        || strategy === ZoomFollowStrategyEnum.Center
        || strategy === ZoomFollowStrategyEnum.Manual
}

function isValidTransitionStyle(style: NonNullable<ZoomEffectData['transitionStyle']>): boolean {
    // Accept legacy values too; they are normalized during parsing.
    return style === 'linear'
        || style === 'cubic'
        || style === 'sine'
        || style === 'expo'
        || style === 'sigmoid'
        || style === 'smoother'
        || (style as any) === 'cinematic'
        || (style as any) === 'smooth'
        || (style as any) === 'spring'
}

function normalizeZoomTransitionStyle(
    style: ZoomEffectData['transitionStyle'] | undefined
): NonNullable<ZoomEffectData['transitionStyle']> {
    if (style === 'linear' || style === 'cubic' || style === 'sine' || style === 'expo' || style === 'sigmoid' || style === 'smoother') {
        return style
    }
    // Legacy ids from earlier iterations
    if ((style as any) === 'cinematic') return 'cubic'
    if ((style as any) === 'smooth') return 'sine'
    if ((style as any) === 'spring') return 'expo'
    return 'smoother'  // Default to smoother
}

function isValidMouseFollowAlgorithm(algo: NonNullable<ZoomEffectData['mouseFollowAlgorithm']>): boolean {
    return algo === 'deadzone'
        || algo === 'direct'
        || algo === 'smooth'
        || algo === 'thirds'
}

function normalizeMouseFollowAlgorithm(
    algo: ZoomEffectData['mouseFollowAlgorithm'] | undefined
): NonNullable<ZoomEffectData['mouseFollowAlgorithm']> {
    if (algo === 'deadzone' || algo === 'direct' || algo === 'smooth' || algo === 'thirds') return algo
    return 'deadzone'
}

function isValidZoomIntoCursorMode(mode: NonNullable<ZoomEffectData['zoomIntoCursorMode']>): boolean {
    return mode === 'center'
        || mode === 'cursor'
        || mode === 'snap'
        || mode === 'lead'
}

function normalizeZoomIntoCursorMode(
    mode: ZoomEffectData['zoomIntoCursorMode'] | undefined
): NonNullable<ZoomEffectData['zoomIntoCursorMode']> {
    if (mode === 'center' || mode === 'cursor' || mode === 'snap' || mode === 'lead') return mode
    return 'cursor'
}

/**
 * Find the active zoom block at a given timeline position.
 * Supports fuzzy matching for gaps/rounding at block boundaries.
 */
export function getZoomBlockAtTime(zoomBlocks: ParsedZoomBlock[], timelineMs: number): ParsedZoomBlock | undefined {
    if (lastLookup?.blocks === zoomBlocks && lastLookup.result) {
        const block = lastLookup.result
        if (timelineMs >= block.startTime && timelineMs <= block.endTime) {
            return block
        }
    }

    // 1. Strict match (preferred)
    const exact = zoomBlocks.find(b => timelineMs >= b.startTime && timelineMs <= b.endTime)
    if (exact) {
        lastLookup = { blocks: zoomBlocks, result: exact }
        return exact
    }

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
    lastLookup = { blocks: zoomBlocks, result: best }
    return best
}
