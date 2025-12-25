/**
 * Camera Calculator (Orchestrator)
 *
 * Pure camera follow + zoom-center algorithm used by both preview and export.
 * All logic is in normalized source space (0-1).
 * 
 * Core algorithms are extracted to @/lib/core/camera for reuse.
 */

import type { CursorEffectData, Effect, MouseEvent, Recording, RecordingMetadata } from '@/types/project'
import { EffectType } from '@/types/project'
import { interpolateMousePosition } from './mouse-interpolation'
import { calculateZoomScale } from '@/remotion/compositions/utils/transforms/zoom-transform'
import { CURSOR_DIMENSIONS, CURSOR_HOTSPOTS, electronToCustomCursor } from '@/lib/effects/cursor-types'
import { DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects'
import { lerp, smootherStep } from '@/lib/core/math'
import { getSourceDimensions } from '@/lib/core/coordinates'
import { CAMERA_CONFIG, CURSOR_STOP_CONFIG } from '@/lib/effects/config/physics-config'

// Import from core camera modules
import {
  parseZoomBlocks,
  getZoomBlockAtTime,
  getHalfWindows,
  calculateFollowTargetNormalized,
  clampCenterToContentBounds,
  projectCenterToKeepCursorVisible,
  calculateCursorVelocity,
  getExponentiallySmoothedCursorNorm,
  normalizeSmoothingAmount,
  calculateAttractor,
  getMotionClusters,
} from '@/lib/core/camera'

// Re-export types for backwards compatibility
export type { ParsedZoomBlock, OutputOverscan } from '@/lib/core/camera'

// Re-export functions that consumers may use directly
export { parseZoomBlocks, getZoomBlockAtTime, getMotionClusters }

const { seekThresholdMs: SEEK_THRESHOLD_MS } = CAMERA_CONFIG
const {
  velocityThreshold: CURSOR_STOP_VELOCITY_THRESHOLD,
  dwellMs: CURSOR_STOP_DWELL_MS,
  minZoom: CURSOR_STOP_MIN_ZOOM,
} = CURSOR_STOP_CONFIG

export interface CameraPhysicsState {
  x: number
  y: number
  vx: number
  vy: number
  lastTimeMs: number
  lastSourceTimeMs?: number
  cursorStoppedAtMs?: number
  frozenTargetX?: number
  frozenTargetY?: number
}

export interface CameraComputeInput {
  effects: Effect[]
  timelineMs: number
  sourceTimeMs: number
  recording?: Recording | null
  metadata?: RecordingMetadata | null
  outputWidth?: number
  outputHeight?: number
  overscan?: { left: number; right: number; top: number; bottom: number }
  mockupScreenPosition?: { x: number; y: number; width: number; height: number }
  forceFollowCursor?: boolean
  physics: CameraPhysicsState
  deterministic?: boolean
}

export interface CameraComputeOutput {
  activeZoomBlock?: ReturnType<typeof getZoomBlockAtTime>
  zoomScale: number
  zoomCenter: { x: number; y: number }
  physics: CameraPhysicsState
}

function getSourceDimensionsAtTime(
  mouseEvents: MouseEvent[],
  timeMs: number,
  recording?: Recording | null,
  metadata?: RecordingMetadata | null
): { sourceWidth: number; sourceHeight: number } {
  const dims = getSourceDimensions(timeMs, recording, metadata, mouseEvents)
  return { sourceWidth: dims.width, sourceHeight: dims.height }
}

export function computeCameraState({
  effects,
  timelineMs,
  sourceTimeMs,
  recording,
  metadata,
  outputWidth,
  outputHeight,
  overscan,
  mockupScreenPosition,
  forceFollowCursor,
  physics,
  deterministic,
}: CameraComputeInput): CameraComputeOutput {
  const effectiveMetadata = metadata ?? recording?.metadata
  const isDeterministic = Boolean(deterministic)
  const zoomBlocks = parseZoomBlocks(effects)
  const activeZoomBlock = getZoomBlockAtTime(zoomBlocks, timelineMs)

  const safeOverscan = overscan || { left: 0, right: 0, top: 0, bottom: 0 }
  const denomX = 1 + safeOverscan.left + safeOverscan.right
  const denomY = 1 + safeOverscan.top + safeOverscan.bottom
  const fillScale = Math.max(denomX, denomY)

  const zoomTargetScale = activeZoomBlock
    ? (activeZoomBlock.autoScale === 'fill' ? fillScale : (activeZoomBlock.scale ?? 2))
    : 1

  const currentScale = activeZoomBlock
    ? calculateZoomScale(
      timelineMs - activeZoomBlock.startTime,
      activeZoomBlock.endTime - activeZoomBlock.startTime,
      zoomTargetScale,
      activeZoomBlock.introMs,
      activeZoomBlock.outroMs
    )
    : 1

  const mouseEvents = ((effectiveMetadata as any)?.mouseEvents || []) as MouseEvent[]
  const { sourceWidth, sourceHeight } = getSourceDimensionsAtTime(
    mouseEvents, sourceTimeMs, recording, effectiveMetadata ?? undefined
  )

  const { halfWindowX, halfWindowY } = getHalfWindows(
    currentScale, sourceWidth, sourceHeight, outputWidth, outputHeight
  )

  const hasOverscan = safeOverscan.left > 0 || safeOverscan.right > 0 || safeOverscan.top > 0 || safeOverscan.bottom > 0

  const cursorClampBounds = hasOverscan
    ? { minX: -safeOverscan.left, maxX: 1 + safeOverscan.right, minY: -safeOverscan.top, maxY: 1 + safeOverscan.bottom }
    : { minX: 0, maxX: 1, minY: 0, maxY: 1 }

  const clampCursorX = (x: number) => Math.max(cursorClampBounds.minX, Math.min(cursorClampBounds.maxX, x))
  const clampCursorY = (y: number) => Math.max(cursorClampBounds.minY, Math.min(cursorClampBounds.maxY, y))

  // Check for Cinematic Scroll effect
  const cinematicScrollEffect = effects.find(e =>
    e.type === EffectType.Annotation && e.startTime <= timelineMs && e.endTime > timelineMs
  )
  const isCinematicScrollEnabled = (cinematicScrollEffect?.data as any)?.kind === 'scrollCinematic' && cinematicScrollEffect?.enabled
  const cinematicSmoothing = isCinematicScrollEnabled ? normalizeSmoothingAmount((cinematicScrollEffect?.data as any)?.smoothing ?? 20) : 0
  const zoomSmoothing = normalizeSmoothingAmount(activeZoomBlock?.smoothing)
  const smoothingAmount = Math.max(cinematicSmoothing, zoomSmoothing)

  const dtTimelineFromState = timelineMs - (physics.lastTimeMs ?? timelineMs)
  const isSeek = !isDeterministic && (Math.abs(dtTimelineFromState) > SEEK_THRESHOLD_MS)

  const introBlend = (() => {
    if (!activeZoomBlock) return 1
    const introMs = Math.max(0, activeZoomBlock.introMs ?? 0)
    if (introMs <= 0) return 1
    if (timelineMs <= activeZoomBlock.startTime) return 0
    if (timelineMs >= activeZoomBlock.startTime + introMs) return 1
    if (zoomTargetScale <= 1.001) return smootherStep((timelineMs - activeZoomBlock.startTime) / introMs)
    const scaleProgress = (currentScale - 1) / (zoomTargetScale - 1)
    return smootherStep(scaleProgress)
  })()

  // Estimate playback rate for predictive tracking
  const dtSource = sourceTimeMs - (physics.lastSourceTimeMs ?? sourceTimeMs)
  const playbackRateEstimate = dtTimelineFromState > 1 ? dtSource / dtTimelineFromState : 1
  const rate = Math.max(0.5, Math.min(3, playbackRateEstimate || 1))

  // Predictive Tracking during zoom-in
  let effectiveSourceTimeMs = sourceTimeMs
  if (activeZoomBlock && timelineMs < activeZoomBlock.startTime + activeZoomBlock.introMs) {
    const timeUntilIntroEnd = (activeZoomBlock.startTime + activeZoomBlock.introMs) - timelineMs
    const sourceTimeUntilIntroEnd = timeUntilIntroEnd * rate
    effectiveSourceTimeMs = sourceTimeMs + sourceTimeUntilIntroEnd * introBlend
  }

  const attractor = calculateAttractor(mouseEvents, effectiveSourceTimeMs, sourceWidth, sourceHeight, smoothingAmount)

  let cursorNormX = 0.5, cursorNormY = 0.5
  if (attractor) { cursorNormX = attractor.x / sourceWidth; cursorNormY = attractor.y / sourceHeight }
  if (mockupScreenPosition && outputWidth && outputHeight) {
    const screenX = Math.max(0, Math.min(1, mockupScreenPosition.x / outputWidth))
    const screenY = Math.max(0, Math.min(1, mockupScreenPosition.y / outputHeight))
    const screenW = Math.max(0, Math.min(1, mockupScreenPosition.width / outputWidth))
    const screenH = Math.max(0, Math.min(1, mockupScreenPosition.height / outputHeight))
    cursorNormX = screenX + cursorNormX * screenW
    cursorNormY = screenY + cursorNormY * screenH
  }
  cursorNormX = clampCursorX(cursorNormX)
  cursorNormY = clampCursorY(cursorNormY)

  // Cursor velocity for stop detection
  const jitterThresholdPx = activeZoomBlock?.mouseIdlePx ?? 2
  const cursorVelocity = calculateCursorVelocity(mouseEvents, sourceTimeMs, sourceWidth, sourceHeight, jitterThresholdPx)

  // Determine if cursor is frozen (stopped while zoomed)
  const shouldApplyStopDetection = currentScale >= CURSOR_STOP_MIN_ZOOM
  let cursorIsFrozen = false
  let frozenTarget: { x: number; y: number } | null = null

  if (isDeterministic) {
    if (shouldApplyStopDetection && cursorVelocity.velocity < CURSOR_STOP_VELOCITY_THRESHOLD) {
      const stoppedAt = cursorVelocity.stoppedSinceMs ?? sourceTimeMs
      if (sourceTimeMs - stoppedAt >= CURSOR_STOP_DWELL_MS) {
        cursorIsFrozen = true
        frozenTarget = { x: cursorNormX, y: cursorNormY }
      }
    }
  } else {
    const unfreezeVelocityThreshold = CURSOR_STOP_VELOCITY_THRESHOLD * 1.5
    if (shouldApplyStopDetection && cursorVelocity.velocity < CURSOR_STOP_VELOCITY_THRESHOLD) {
      const stoppedAt = physics.cursorStoppedAtMs ?? cursorVelocity.stoppedSinceMs ?? sourceTimeMs
      if (sourceTimeMs - stoppedAt >= CURSOR_STOP_DWELL_MS) {
        cursorIsFrozen = true
        frozenTarget = { x: physics.frozenTargetX ?? cursorNormX, y: physics.frozenTargetY ?? cursorNormY }
      }
      physics.cursorStoppedAtMs = stoppedAt
    } else if (physics.frozenTargetX != null && physics.frozenTargetY != null && cursorVelocity.velocity < unfreezeVelocityThreshold) {
      cursorIsFrozen = true
      frozenTarget = { x: physics.frozenTargetX, y: physics.frozenTargetY }
    } else {
      physics.cursorStoppedAtMs = undefined
      physics.frozenTargetX = undefined
      physics.frozenTargetY = undefined
    }
  }

  const followStrategy = activeZoomBlock?.followStrategy
  const shouldFollowMouse = followStrategy === 'mouse' || followStrategy == null
  const shouldCenterLock = followStrategy === 'center'

  let targetCenter = isDeterministic ? { x: 0.5, y: 0.5 } : { x: physics.x, y: physics.y }
  const followCursor = cursorIsFrozen && frozenTarget ? frozenTarget : { x: cursorNormX, y: cursorNormY }
  const baseCenterForFollow = (() => {
    if (isDeterministic) return { x: 0.5, y: 0.5 }
    if (isSeek) return followCursor
    return { x: physics.x, y: physics.y }
  })()

  if (activeZoomBlock && (shouldCenterLock || activeZoomBlock.autoScale === 'fill')) {
    targetCenter = { x: 0.5, y: 0.5 }
  } else if (activeZoomBlock && !shouldFollowMouse && activeZoomBlock.targetX != null && activeZoomBlock.targetY != null) {
    const sw = activeZoomBlock.screenWidth || sourceWidth
    const sh = activeZoomBlock.screenHeight || sourceHeight
    targetCenter = { x: activeZoomBlock.targetX / sw, y: activeZoomBlock.targetY / sh }
    targetCenter = clampCenterToContentBounds(targetCenter, halfWindowX, halfWindowY, safeOverscan)
  } else {
    if (shouldFollowMouse && hasOverscan) {
      const cursorOut = { x: (safeOverscan.left + followCursor.x) / denomX, y: (safeOverscan.top + followCursor.y) / denomY }
      const centerOut = { x: (safeOverscan.left + baseCenterForFollow.x) / denomX, y: (safeOverscan.top + baseCenterForFollow.y) / denomY }
      const halfWindowOutX = halfWindowX / denomX, halfWindowOutY = halfWindowY / denomY
      const targetOut = calculateFollowTargetNormalized(cursorOut, centerOut, halfWindowOutX, halfWindowOutY, currentScale, { left: 0, right: 0, top: 0, bottom: 0 })
      targetCenter = { x: targetOut.x * denomX - safeOverscan.left, y: targetOut.y * denomY - safeOverscan.top }
    } else {
      targetCenter = calculateFollowTargetNormalized(followCursor, baseCenterForFollow, halfWindowX, halfWindowY, currentScale, safeOverscan)
    }
  }

  if (activeZoomBlock && shouldFollowMouse && !shouldCenterLock && activeZoomBlock.autoScale !== 'fill' && timelineMs < activeZoomBlock.startTime + activeZoomBlock.introMs) {
    targetCenter = { x: lerp(baseCenterForFollow.x, targetCenter.x, introBlend), y: lerp(baseCenterForFollow.y, targetCenter.y, introBlend) }
  }

  // Deterministic export with mouse follow uses exponential smoothing
  if (isDeterministic && shouldFollowMouse && activeZoomBlock) {
    const smoothedCursor = cursorIsFrozen && frozenTarget ? frozenTarget : getExponentiallySmoothedCursorNorm(mouseEvents, sourceTimeMs, sourceWidth, sourceHeight)
    const baseCenter = { x: 0.5, y: 0.5 }
    if (hasOverscan) {
      const cursorOut = { x: (safeOverscan.left + smoothedCursor.x) / denomX, y: (safeOverscan.top + smoothedCursor.y) / denomY }
      const centerOut = { x: (safeOverscan.left + baseCenter.x) / denomX, y: (safeOverscan.top + baseCenter.y) / denomY }
      const halfWindowOutX = halfWindowX / denomX, halfWindowOutY = halfWindowY / denomY
      const targetOut = calculateFollowTargetNormalized(cursorOut, centerOut, halfWindowOutX, halfWindowOutY, currentScale, { left: 0, right: 0, top: 0, bottom: 0 })
      targetCenter = { x: targetOut.x * denomX - safeOverscan.left, y: targetOut.y * denomY - safeOverscan.top }
    } else {
      targetCenter = calculateFollowTargetNormalized(smoothedCursor, baseCenter, halfWindowX, halfWindowY, currentScale, safeOverscan)
    }
    if (timelineMs < activeZoomBlock.startTime + activeZoomBlock.introMs) {
      targetCenter = { x: lerp(0.5, targetCenter.x, introBlend), y: lerp(0.5, targetCenter.y, introBlend) }
    }
  }

  if (forceFollowCursor) targetCenter = followCursor

  let nextPhysics: CameraPhysicsState
  if (isDeterministic) {
    nextPhysics = { x: targetCenter.x, y: targetCenter.y, vx: 0, vy: 0, lastTimeMs: timelineMs, lastSourceTimeMs: sourceTimeMs }
  } else if (isSeek) {
    nextPhysics = { x: targetCenter.x, y: targetCenter.y, vx: 0, vy: 0, lastTimeMs: timelineMs, lastSourceTimeMs: sourceTimeMs }
  } else {
    const dtSeconds = Math.max(0, dtTimelineFromState / 1000)
    const baseTau = lerp(0.08, 0.5, smoothingAmount / 100)
    const effectiveTau = baseTau / rate
    const tau = cursorIsFrozen ? effectiveTau * 3 : effectiveTau
    const alpha = dtSeconds > 0 ? Math.min(1, Math.max(0.001, 1 - Math.exp(-dtSeconds / tau))) : 0

    let x = physics.x, y = physics.y
    if (activeZoomBlock && (shouldCenterLock || activeZoomBlock.autoScale === 'fill')) {
      x = 0.5; y = 0.5
    } else {
      x = lerp(x, targetCenter.x, alpha)
      y = lerp(y, targetCenter.y, alpha)
    }
    const distToTarget = Math.sqrt(Math.pow(x - targetCenter.x, 2) + Math.pow(y - targetCenter.y, 2))
    if (distToTarget < 0.0001) { x = targetCenter.x; y = targetCenter.y }
    nextPhysics = { x, y, vx: 0, vy: 0, lastTimeMs: timelineMs, lastSourceTimeMs: sourceTimeMs }
  }

  let finalCenter = { x: nextPhysics.x, y: nextPhysics.y }

  // RAW cursor position for visibility projection
  const rawCursorPos = interpolateMousePosition(mouseEvents, sourceTimeMs)
  const rawCursorNormX = rawCursorPos ? clampCursorX(rawCursorPos.x / sourceWidth) : cursorNormX
  const rawCursorNormY = rawCursorPos ? clampCursorY(rawCursorPos.y / sourceHeight) : cursorNormY

  const mappedRawCursorNorm = (() => {
    if (!mockupScreenPosition || !outputWidth || !outputHeight) return { x: rawCursorNormX, y: rawCursorNormY }
    const screenX = Math.max(0, Math.min(1, mockupScreenPosition.x / outputWidth))
    const screenY = Math.max(0, Math.min(1, mockupScreenPosition.y / outputHeight))
    const screenW = Math.max(0, Math.min(1, mockupScreenPosition.width / outputWidth))
    const screenH = Math.max(0, Math.min(1, mockupScreenPosition.height / outputHeight))
    return { x: screenX + rawCursorNormX * screenW, y: screenY + rawCursorNormY * screenH }
  })()

  const cursorMarginsNorm = (() => {
    const cursorEffect = effects.find(e => e.type === EffectType.Cursor && e.enabled)
    if (!cursorEffect) return null
    const cursorData = cursorEffect.data as CursorEffectData | undefined
    const cursorScale = cursorData?.size ?? DEFAULT_CURSOR_DATA.size
    let cursorEventIndex = -1, low = 0, high = mouseEvents.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      if (mouseEvents[mid].timestamp <= sourceTimeMs) { cursorEventIndex = mid; low = mid + 1 } else { high = mid - 1 }
    }
    const cursorTypeRaw = (mouseEvents[cursorEventIndex] ?? mouseEvents[0])?.cursorType ?? 'default'
    const cursorType = electronToCustomCursor(cursorTypeRaw)
    const baseDim = CURSOR_DIMENSIONS[cursorType], hotspot = CURSOR_HOTSPOTS[cursorType]
    const widthPx = baseDim.width * cursorScale, heightPx = baseDim.height * cursorScale
    const leftPx = hotspot.x * widthPx, rightPx = (1 - hotspot.x) * widthPx
    const topPx = hotspot.y * heightPx, bottomPx = (1 - hotspot.y) * heightPx
    const outW = outputWidth || sourceWidth, outH = outputHeight || sourceHeight
    const drawW = outW / (hasOverscan ? denomX : 1), drawH = outH / (hasOverscan ? denomY : 1)
    const windowWidthNorm = halfWindowX * 2, windowHeightNorm = halfWindowY * 2
    return {
      left: (leftPx / drawW) * windowWidthNorm, right: (rightPx / drawW) * windowWidthNorm,
      top: (topPx / drawH) * windowHeightNorm, bottom: (bottomPx / drawH) * windowHeightNorm,
    }
  })()

  const shouldSkipVisibilityProjection = Boolean(forceFollowCursor)
  if (shouldSkipVisibilityProjection) finalCenter = followCursor

  if (shouldFollowMouse && !cursorIsFrozen && !shouldSkipVisibilityProjection) {
    if (hasOverscan) {
      const finalOut = { x: (safeOverscan.left + finalCenter.x) / denomX, y: (safeOverscan.top + finalCenter.y) / denomY }
      const cursorOut = { x: (safeOverscan.left + mappedRawCursorNorm.x) / denomX, y: (safeOverscan.top + mappedRawCursorNorm.y) / denomY }
      const cursorMarginsOut = cursorMarginsNorm ? { left: cursorMarginsNorm.left / denomX, right: cursorMarginsNorm.right / denomX, top: cursorMarginsNorm.top / denomY, bottom: cursorMarginsNorm.bottom / denomY } : undefined
      const halfWindowOutX = halfWindowX / denomX, halfWindowOutY = halfWindowY / denomY
      const projectedOut = projectCenterToKeepCursorVisible(finalOut, cursorOut, halfWindowOutX, halfWindowOutY, { left: 0, right: 0, top: 0, bottom: 0 }, cursorMarginsOut, true)
      finalCenter = { x: projectedOut.x * denomX - safeOverscan.left, y: projectedOut.y * denomY - safeOverscan.top }
    } else {
      finalCenter = projectCenterToKeepCursorVisible(finalCenter, { x: mappedRawCursorNorm.x, y: mappedRawCursorNorm.y }, halfWindowX, halfWindowY, safeOverscan, cursorMarginsNorm ?? undefined)
    }
  }

  if (shouldFollowMouse && hasOverscan && !shouldSkipVisibilityProjection) {
    const halfWindowOutX = halfWindowX / denomX, halfWindowOutY = halfWindowY / denomY
    const finalOut = { x: (safeOverscan.left + finalCenter.x) / denomX, y: (safeOverscan.top + finalCenter.y) / denomY }
    const clampedOut = clampCenterToContentBounds(finalOut, halfWindowOutX, halfWindowOutY, { left: 0, right: 0, top: 0, bottom: 0 }, true)
    finalCenter = { x: clampedOut.x * denomX - safeOverscan.left, y: clampedOut.y * denomY - safeOverscan.top }
  } else if (!shouldSkipVisibilityProjection) {
    finalCenter = clampCenterToContentBounds(finalCenter, halfWindowX, halfWindowY, safeOverscan)
  }

  nextPhysics.x = finalCenter.x
  nextPhysics.y = finalCenter.y

  return { activeZoomBlock, zoomScale: currentScale, zoomCenter: finalCenter, physics: nextPhysics }
}

/**
 * Pre-warm camera caches during project load to eliminate first-frame lag.
 */
export function precomputeCameraCaches(
  mouseEvents: MouseEvent[],
  effects: Effect[],
  videoWidth: number,
  videoHeight: number
): void {
  parseZoomBlocks(effects)
  if (mouseEvents && mouseEvents.length > 0 && videoWidth > 0 && videoHeight > 0) {
    getMotionClusters(mouseEvents, videoWidth, videoHeight)
  }
}
