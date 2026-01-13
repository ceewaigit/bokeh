/**
 * Camera Calculator (Orchestrator)
 *
 * Pure camera follow + zoom-center algorithm used by both preview and export.
 * All logic is in normalized source space (0-1).
 * 
 * Core algorithms are extracted to @/lib/core/camera for reuse.
 */

import type { CursorEffectData, Effect, MouseEvent, Recording, RecordingMetadata, CameraDynamics, CropEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import { getActiveCropEffect, getDataOfType } from '@/features/effects/core/filters'
import { interpolateMousePosition } from '@/features/effects/utils/mouse-interpolation'
import { calculateZoomScale } from '@/features/rendering/canvas/math/transforms/zoom-transform'
import { getCursorDimensions, getCursorHotspot, electronToCustomCursor } from '@/features/effects/cursor/store/cursor-types'
import { DEFAULT_CURSOR_DATA } from '@/features/effects/cursor/config'
import { clamp01, lerp } from '@/features/rendering/canvas/math'
import { getSourceDimensions } from '@/features/rendering/canvas/math/coordinates'
import { CAMERA_CONFIG, CURSOR_STOP_CONFIG } from '@/shared/config/physics-config'

// Import from core camera modules
import {
  parseZoomBlocks,
  getZoomBlockAtTime,
} from '../zoom-blocks'
import {
  getHalfWindows,
  calculateFollowTargetNormalized,
} from '../dead-zone'
import {
  clampCenterToContentBounds,
  projectCenterToKeepCursorVisible,
} from '../visibility'
import {
  calculateCursorVelocity,
  getExponentiallySmoothedCursorNorm,
} from '../cursor-velocity'
import {
  normalizeSmoothingAmount,
  calculateAttractor,
} from '../smoothing'

// Re-export types for backwards compatibility
export type { ParsedZoomBlock, OutputOverscan } from '@/features/ui/editor/logic/viewport'

// Re-export functions that consumers may use directly
export { parseZoomBlocks, getZoomBlockAtTime }

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
  lastZoomBlockId?: string
  introAnchorX?: number
  introAnchorY?: number
  introAnchorVX?: number
  introAnchorVY?: number
  cursorStoppedAtMs?: number
  frozenTargetX?: number
  frozenTargetY?: number
  scale?: number
  vScale?: number
  attractorLock?: {
    x: number
    y: number
  }
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
  /** Cameraman style smoothness (0-100) from ProjectSettings.camera */
  cameraSmoothness?: number
  /** Physics-based camera dynamics configuration */
  cameraDynamics?: CameraDynamics
}

export interface CameraComputeOutput {
  activeZoomBlock?: ReturnType<typeof getZoomBlockAtTime>
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
  cameraSmoothness,
  cameraDynamics,
}: CameraComputeInput): CameraComputeOutput {
  const effectiveMetadata = metadata ?? recording?.metadata
  const isDeterministic = Boolean(deterministic)

  const dtTimelineFromState = timelineMs - (physics.lastTimeMs ?? timelineMs)
  const isSeek = !isDeterministic && (Math.abs(dtTimelineFromState) > SEEK_THRESHOLD_MS)

  const zoomBlocks = parseZoomBlocks(effects)
  const activeZoomBlock = getZoomBlockAtTime(zoomBlocks, timelineMs)

  const safeOverscan = overscan || { left: 0, right: 0, top: 0, bottom: 0 }
  const denomX = 1 + safeOverscan.left + safeOverscan.right
  const denomY = 1 + safeOverscan.top + safeOverscan.bottom
  const fillScale = Math.max(denomX, denomY)

  const zoomTargetScale = activeZoomBlock
    ? (activeZoomBlock.autoScale === 'fill' ? fillScale : activeZoomBlock.scale)
    : 1

  const commandedScale = activeZoomBlock
    ? calculateZoomScale(
      timelineMs - activeZoomBlock.startTime,
      activeZoomBlock.endTime - activeZoomBlock.startTime,
      zoomTargetScale,
      activeZoomBlock.introMs,
      activeZoomBlock.outroMs,
      (activeZoomBlock as any).transitionStyle
    )
    : 1

  // If deterministic (or first run), use commanded scale directly.
  // Otherwise, use physics state or fall back to commanded scale.
  // On seek, we must use the new commanded scale immediately to avoid stale physics state.
  let currentScale = (isDeterministic || isSeek) ? commandedScale : (physics.scale ?? commandedScale)

  const mouseEvents = ((effectiveMetadata as any)?.mouseEvents || []) as MouseEvent[]
  const { sourceWidth, sourceHeight } = getSourceDimensionsAtTime(
    mouseEvents, sourceTimeMs, recording, effectiveMetadata ?? undefined
  )

  const rawCursorPosForAnchor = interpolateMousePosition(mouseEvents, sourceTimeMs)
  const rawCursorNormForAnchor = rawCursorPosForAnchor
    ? { x: rawCursorPosForAnchor.x / sourceWidth, y: rawCursorPosForAnchor.y / sourceHeight }
    : null

  const { halfWindowX, halfWindowY } = getHalfWindows(
    currentScale, sourceWidth, sourceHeight, outputWidth, outputHeight
  )
  const { halfWindowX: halfWindowAimX, halfWindowY: halfWindowAimY } = getHalfWindows(
    zoomTargetScale, sourceWidth, sourceHeight, outputWidth, outputHeight
  )

  const hasOverscan = safeOverscan.left > 0 || safeOverscan.right > 0 || safeOverscan.top > 0 || safeOverscan.bottom > 0

  const cursorClampBounds = hasOverscan
    ? { minX: -safeOverscan.left, maxX: 1 + safeOverscan.right, minY: -safeOverscan.top, maxY: 1 + safeOverscan.bottom }
    : { minX: 0, maxX: 1, minY: 0, maxY: 1 }

  const clampCursorX = (x: number) => Math.max(cursorClampBounds.minX, Math.min(cursorClampBounds.maxX, x))
  const clampCursorY = (y: number) => Math.max(cursorClampBounds.minY, Math.min(cursorClampBounds.maxY, y))

  // Use cameraSmoothness from ProjectSettings.camera (if provided)
  // Disable legacy cinematic smoothing if physics dynamics are used, to avoid double-smoothing.
  const cinematicSmoothing = (cameraDynamics || cameraSmoothness == null)
    ? 0
    : normalizeSmoothingAmount(cameraSmoothness)
  const zoomSmoothing = normalizeSmoothingAmount(activeZoomBlock?.smoothing)
  // Scale baseline smoothing with zoom to prevent high-zoom micro-jitter.
  const zoomSmoothingBoost = activeZoomBlock
    ? clamp01((currentScale - 1) / 1.5)
    : 0
  // Disable base pan smoothing if using physics dynamics
  const basePanSmoothing = (activeZoomBlock && !cameraDynamics)
    ? lerp(8, 22, zoomSmoothingBoost)
    : 0
  const smoothingAmount = Math.max(cinematicSmoothing, zoomSmoothing, basePanSmoothing)

  // const dtTimelineFromState = timelineMs - (physics.lastTimeMs ?? timelineMs)
  // const isSeek = !isDeterministic && (Math.abs(dtTimelineFromState) > SEEK_THRESHOLD_MS)

  // Estimate playback rate for predictive tracking
  // const dtSource = sourceTimeMs - (physics.lastSourceTimeMs ?? sourceTimeMs)
  // const playbackRateEstimate = dtTimelineFromState > 1 ? dtSource / dtTimelineFromState : 1
  // const rate = Math.max(0.5, Math.min(3, playbackRateEstimate || 1))

  const activeAttractor = calculateAttractor(mouseEvents, sourceTimeMs, sourceWidth, sourceHeight, smoothingAmount)

  let cursorNormX = 0.5, cursorNormY = 0.5

  if (activeAttractor) {
    // Normalize attractor position
    const attractorNormX = activeAttractor.x / sourceWidth
    const attractorNormY = activeAttractor.y / sourceHeight

    // SIMPLIFIED: Just use the attractor position directly
    // - When dwelling: calculateAttractor returns averaged dwell position
    // - When moving: calculateAttractor returns raw cursor position
    // Spring physics will handle all the smoothing/easing
    cursorNormX = attractorNormX
    cursorNormY = attractorNormY
  }


  if (mockupScreenPosition && outputWidth && outputHeight) {
    const screenX = Math.max(0, Math.min(1, mockupScreenPosition.x / outputWidth))
    const screenY = Math.max(0, Math.min(1, mockupScreenPosition.y / outputHeight))
    const screenW = Math.max(0, Math.min(1, mockupScreenPosition.width / outputWidth))
    const screenH = Math.max(0, Math.min(1, mockupScreenPosition.height / outputHeight))
    // Remap the normalized cursor/attractor from video space to screen space
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
  const isManualFocus = followStrategy === 'manual'
  const mouseFollowAlgorithm = (activeZoomBlock as any)?.mouseFollowAlgorithm as
    | 'deadzone'
    | 'direct'
    | 'smooth'
    | 'thirds'
    | undefined
  const zoomIntoCursorMode = (activeZoomBlock as any)?.zoomIntoCursorMode as
    | 'center'
    | 'cursor'
    | 'snap'
    | 'lead'
    | undefined

  let targetCenter = isDeterministic ? { x: 0.5, y: 0.5 } : { x: physics.x, y: physics.y }
  const followCursor = cursorIsFrozen && frozenTarget ? frozenTarget : { x: cursorNormX, y: cursorNormY }
  const baseCenterForFollow = (() => {
    if (isDeterministic) return { x: 0.5, y: 0.5 }
    if (isSeek) return followCursor
    return { x: physics.x, y: physics.y }
  })()

  const cursorVelocityVec = (() => {
    const lookbackMs = 80
    const prev = interpolateMousePosition(mouseEvents, sourceTimeMs - lookbackMs)
    const curr = interpolateMousePosition(mouseEvents, sourceTimeMs)
    if (!prev || !curr) return { vx: 0, vy: 0 }
    const dt = Math.max(0.001, lookbackMs / 1000)
    return {
      vx: (curr.x - prev.x) / sourceWidth / dt,
      vy: (curr.y - prev.y) / sourceHeight / dt
    }
  })()

  const leadCursor = (cursor: { x: number; y: number }) => {
    const sx = cursorVelocityVec.vx > 0.001 ? 1 : cursorVelocityVec.vx < -0.001 ? -1 : 0
    const sy = cursorVelocityVec.vy > 0.001 ? 1 : cursorVelocityVec.vy < -0.001 ? -1 : 0
    const zoomAmt = clamp01((currentScale - 1) / 2)
    const offX = sx * (halfWindowX * 0.33) * zoomAmt
    const offY = sy * (halfWindowY * 0.33) * zoomAmt
    return { x: cursor.x + offX, y: cursor.y + offY }
  }

  // Capture an intro "anchor" on block entry so zoom-in doesn't chase live cursor.
  const enteringZoomBlock = Boolean(activeZoomBlock && activeZoomBlock.id !== physics.lastZoomBlockId)
  if (enteringZoomBlock && activeZoomBlock) {
    physics.lastZoomBlockId = activeZoomBlock.id
    const anchor = rawCursorNormForAnchor ?? { x: cursorNormX, y: cursorNormY }
    physics.introAnchorX = anchor.x
    physics.introAnchorY = anchor.y
    physics.introAnchorVX = cursorVelocityVec.vx
    physics.introAnchorVY = cursorVelocityVec.vy
  } else if (!activeZoomBlock) {
    physics.lastZoomBlockId = undefined
    physics.introAnchorX = undefined
    physics.introAnchorY = undefined
    physics.introAnchorVX = undefined
    physics.introAnchorVY = undefined
  }

  const applyMouseAlgorithm = (
    cursor: { x: number; y: number },
    baseCenter: { x: number; y: number },
    overscanMode: boolean,
    algorithmOverride?: 'deadzone' | 'direct' | 'smooth' | 'thirds'
  ): { x: number; y: number } => {
    const algo = algorithmOverride ?? mouseFollowAlgorithm ?? 'deadzone'
    if (overscanMode) {
      const cursorOut = { x: (safeOverscan.left + cursor.x) / denomX, y: (safeOverscan.top + cursor.y) / denomY }
      const centerOut = { x: (safeOverscan.left + baseCenter.x) / denomX, y: (safeOverscan.top + baseCenter.y) / denomY }
      const halfWindowOutX = halfWindowX / denomX, halfWindowOutY = halfWindowY / denomY

      let targetOut: { x: number; y: number }
      if (algo === 'direct') {
        targetOut = cursorOut
      } else if (algo === 'thirds') {
        const sx = cursorVelocityVec.vx > 0.001 ? 1 : cursorVelocityVec.vx < -0.001 ? -1 : 0
        const sy = cursorVelocityVec.vy > 0.001 ? 1 : cursorVelocityVec.vy < -0.001 ? -1 : 0
        const zoomAmt = clamp01((currentScale - 1) / 2)
        const offX = sx * (halfWindowOutX * 0.33) * zoomAmt
        const offY = sy * (halfWindowOutY * 0.33) * zoomAmt
        targetOut = { x: cursorOut.x + offX, y: cursorOut.y + offY }
      } else {
        targetOut = calculateFollowTargetNormalized(
          cursorOut,
          centerOut,
          halfWindowOutX,
          halfWindowOutY,
          currentScale,
          { left: 0, right: 0, top: 0, bottom: 0 }
        )
      }

      return { x: targetOut.x * denomX - safeOverscan.left, y: targetOut.y * denomY - safeOverscan.top }
    }

    if (algo === 'direct') {
      return cursor
    }
    if (algo === 'thirds') {
      const sx = cursorVelocityVec.vx > 0.001 ? 1 : cursorVelocityVec.vx < -0.001 ? -1 : 0
      const sy = cursorVelocityVec.vy > 0.001 ? 1 : cursorVelocityVec.vy < -0.001 ? -1 : 0
      const zoomAmt = clamp01((currentScale - 1) / 2)
      const offX = sx * (halfWindowX * 0.33) * zoomAmt
      const offY = sy * (halfWindowY * 0.33) * zoomAmt
      return { x: cursor.x + offX, y: cursor.y + offY }
    }
    return calculateFollowTargetNormalized(cursor, baseCenter, halfWindowX, halfWindowY, currentScale, safeOverscan)
  }

  if (activeZoomBlock && (shouldCenterLock || activeZoomBlock.autoScale === 'fill')) {
    targetCenter = { x: 0.5, y: 0.5 }
  } else if (activeZoomBlock && isManualFocus && (activeZoomBlock.targetX == null || activeZoomBlock.targetY == null)) {
    targetCenter = { x: 0.5, y: 0.5 }
  } else if (activeZoomBlock && !shouldFollowMouse && activeZoomBlock.targetX != null && activeZoomBlock.targetY != null) {
    const sw = activeZoomBlock.screenWidth || sourceWidth
    const sh = activeZoomBlock.screenHeight || sourceHeight
    targetCenter = { x: activeZoomBlock.targetX / sw, y: activeZoomBlock.targetY / sh }
    targetCenter = clampCenterToContentBounds(targetCenter, halfWindowX, halfWindowY, safeOverscan)
  } else {
    const algo = mouseFollowAlgorithm ?? 'deadzone'
    const cursorInput = (algo === 'smooth' && !cursorIsFrozen)
      ? getExponentiallySmoothedCursorNorm(mouseEvents, sourceTimeMs, sourceWidth, sourceHeight)
      : followCursor
    targetCenter = applyMouseAlgorithm(cursorInput, baseCenterForFollow, shouldFollowMouse && hasOverscan)
  }

  const isIntroPhase = Boolean(
    activeZoomBlock
    && shouldFollowMouse
    && !shouldCenterLock
    && activeZoomBlock.autoScale !== 'fill'
    && timelineMs < activeZoomBlock.startTime + activeZoomBlock.introMs
  )

  // Detect outro phase to apply special physics (crane-like deceleration)
  const isOutroPhase = Boolean(
    activeZoomBlock
    && timelineMs > activeZoomBlock.endTime - (activeZoomBlock.outroMs ?? 0)
  )

  const useFixedIntroWindow = Boolean(
    activeZoomBlock
    && shouldFollowMouse
    && isIntroPhase
    && (zoomIntoCursorMode ?? 'cursor') !== 'snap'
  )
  if (isIntroPhase) {
    // "Zoom into cursor" - set target directly to cursor position.
    // The transform formula pan = (0.5 - cursor) * (scale - 1) handles the zoom-in animation.
    // This creates ONE smooth motion where the cursor stays fixed on screen.
    const mode = zoomIntoCursorMode ?? 'cursor'

    const anchor = (() => {
      if (mode === 'center') return { x: 0.5, y: 0.5 }
      if (mode === 'snap') return followCursor

      const ax = physics.introAnchorX ?? followCursor.x
      const ay = physics.introAnchorY ?? followCursor.y
      if (mode !== 'lead') return { x: ax, y: ay }

      const vx = physics.introAnchorVX ?? cursorVelocityVec.vx
      const vy = physics.introAnchorVY ?? cursorVelocityVec.vy
      const predictSeconds = Math.min(0.35, Math.max(0.05, (activeZoomBlock?.introMs ?? 250) / 1000 * 0.4))
      return { x: ax + vx * predictSeconds, y: ay + vy * predictSeconds }
    })()

    // Clamp to content bounds
    const zoomTarget = clampCenterToContentBounds(anchor, halfWindowAimX, halfWindowAimY, safeOverscan)
    
    // Set target such that the cursor (or target point) remains fixed on screen during the zoom.
    // At scale=1, center is 0.5. At scale=S, center approaches the target.
    // Formula: Center = Target - (Target - 0.5) / Scale
    const intendedTarget = mode === 'lead' ? leadCursor(zoomTarget) : zoomTarget
    // Pass raw target position - the transform's pan formula handles keeping it fixed
    targetCenter = intendedTarget
  }

  // Deterministic export with mouse follow uses exponential smoothing
  if (isDeterministic && shouldFollowMouse && activeZoomBlock) {
    const algo = mouseFollowAlgorithm ?? 'deadzone'
    const smoothedCursor = cursorIsFrozen && frozenTarget ? frozenTarget : getExponentiallySmoothedCursorNorm(mouseEvents, sourceTimeMs, sourceWidth, sourceHeight)
    const cursorInput = algo === 'smooth' ? smoothedCursor : followCursor
    const baseCenter = { x: 0.5, y: 0.5 }
    targetCenter = applyMouseAlgorithm(cursorInput, baseCenter, hasOverscan)
    if (timelineMs < activeZoomBlock.startTime + activeZoomBlock.introMs) {
      // Set target directly to cursor - no lerp! Transform handles the zoom animation.
      const cursorTarget = clampCenterToContentBounds(cursorInput, halfWindowAimX, halfWindowAimY, safeOverscan)
      const mode = zoomIntoCursorMode ?? 'cursor'
      targetCenter = mode === 'center' ? { x: 0.5, y: 0.5 } : (mode === 'lead' ? leadCursor(cursorTarget) : cursorTarget)
    }
  }

  if (forceFollowCursor) targetCenter = followCursor

  let nextPhysics: CameraPhysicsState
  if (isDeterministic) {
    nextPhysics = { x: targetCenter.x, y: targetCenter.y, vx: 0, vy: 0, lastTimeMs: timelineMs, lastSourceTimeMs: sourceTimeMs }
  } else if (isSeek) {
    nextPhysics = { x: targetCenter.x, y: targetCenter.y, vx: 0, vy: 0, lastTimeMs: timelineMs, lastSourceTimeMs: sourceTimeMs }
  } else if (shouldFollowMouse && isIntroPhase && (zoomIntoCursorMode ?? 'cursor') !== 'center') {
    // Make the zoom-in feel like it aims at the cursor immediately (no spring lag during intro).
    nextPhysics = { x: targetCenter.x, y: targetCenter.y, vx: 0, vy: 0, scale: commandedScale, vScale: 0, lastTimeMs: timelineMs, lastSourceTimeMs: sourceTimeMs }
  } else if (shouldFollowMouse && (mouseFollowAlgorithm ?? 'deadzone') === 'smooth' && !isOutroPhase) {
    nextPhysics = { x: targetCenter.x, y: targetCenter.y, vx: 0, vy: 0, scale: commandedScale, vScale: 0, lastTimeMs: timelineMs, lastSourceTimeMs: sourceTimeMs }
  } else if (shouldFollowMouse && (mouseFollowAlgorithm ?? 'deadzone') === 'direct' && !isOutroPhase) {
    // Direct tracking should feel immediate; bypass spring lag.
    nextPhysics = { x: targetCenter.x, y: targetCenter.y, vx: 0, vy: 0, scale: commandedScale, vScale: 0, lastTimeMs: timelineMs, lastSourceTimeMs: sourceTimeMs }
  } else {
    const dtSeconds = Math.max(0, dtTimelineFromState / 1000)

    // Default spring parameters (cinematic)
    let stiffness = 60
    let damping = 15
    let mass = 1

    if (cameraDynamics) {
      stiffness = cameraDynamics.stiffness
      damping = cameraDynamics.damping
      mass = cameraDynamics.mass || 1
    } else if (isOutroPhase) {
      // Outro phase: Use softer spring and higher damping for "crane-like" settling
      stiffness = 30
      damping = 25
    } else if (cameraSmoothness != null) {
      // Legacy mapping if dynamics not provided
      const t = clamp01(cameraSmoothness / 100)
      stiffness = lerp(300, 40, t)
      damping = lerp(20, 35, t)
    }

    // Freeze logic dampens velocity significantly
    if (cursorIsFrozen) {
      stiffness = 600 // snap effectively
      damping = 80
    }

    // Semi-Implicit Euler Integration
    // F = -k*(x - target) - c*v
    let currentX = physics.x
    let currentY = physics.y
    let currentVX = physics.vx
    let currentVY = physics.vy

    // Simulation steps for stability if dt is large
    const MAX_STEP = 0.016 // ~60fps
    let remainingDt = dtSeconds

    // Cap extremely large time steps (e.g. resume from background)
    if (remainingDt > 0.5) {
      currentX = targetCenter.x
      currentY = targetCenter.y
      currentVX = 0
      currentVY = 0
      remainingDt = 0
    }

    const snapToCenter = activeZoomBlock && (shouldCenterLock || activeZoomBlock.autoScale === 'fill')

    while (remainingDt > 0) {
      const dt = Math.min(remainingDt, MAX_STEP)

      // Position Physics - apply spring simulation for smooth camera pan
      if (snapToCenter) {
        // Hard lock to center (instantaneous, no physics)
        currentX = 0.5
        currentY = 0.5
        currentVX = 0
        currentVY = 0
      } else {
        const fx = -stiffness * (currentX - targetCenter.x) - damping * currentVX
        const fy = -stiffness * (currentY - targetCenter.y) - damping * currentVY
        const ax = fx / mass
        const ay = fy / mass
        currentVX += ax * dt
        currentVY += ay * dt
        currentX += currentVX * dt
        currentY += currentVY * dt
      }

      // NO PHYSICS FOR SCALE - use deterministic eased value directly.
      // Scale uses mathematical easing (smootherStep) which already provides smooth transitions.
      // Adding physics on top creates "double-smoothing" and causes mid-transition jank.
      // The commandedScale from calculateZoomScale() is our source of truth.

      remainingDt -= dt
    }

    // Snap to zero velocity if very small to prevent micro-jitter
    if (Math.abs(currentVX) < 0.0001) currentVX = 0
    if (Math.abs(currentVY) < 0.0001) currentVY = 0

    // Snap position if very close
    const dist = Math.sqrt(Math.pow(currentX - targetCenter.x, 2) + Math.pow(currentY - targetCenter.y, 2))
    if (dist < 0.0001 && Math.abs(currentVX) < 0.001 && Math.abs(currentVY) < 0.001) {
      currentX = targetCenter.x
      currentY = targetCenter.y
      currentVX = 0
      currentVY = 0
    }

    // Use commandedScale directly (deterministic, no physics simulation)
    currentScale = commandedScale

    nextPhysics = {
      x: currentX,
      y: currentY,
      vx: currentVX,
      vy: currentVY,
      scale: currentScale,
      vScale: 0, // No velocity tracking for scale anymore
      lastTimeMs: timelineMs,
      lastSourceTimeMs: sourceTimeMs
    }
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
    const cursorTheme = cursorData?.theme
    const baseDim = getCursorDimensions(cursorType, cursorTheme), hotspot = getCursorHotspot(cursorType, cursorTheme)
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
  if (shouldSkipVisibilityProjection) {
    nextPhysics.x = followCursor.x
    nextPhysics.y = followCursor.y
    return { activeZoomBlock, zoomCenter: followCursor, physics: nextPhysics }
  }

  // Define the base center before visibility adjustments to track anchor slides 
  const centerBeforeAdjustments = { x: finalCenter.x, y: finalCenter.y }

  // 1. Resolve Content Constraints (Wallpaper fix/Clamping)
  const activeCrop = getActiveCropEffect(effects, timelineMs)
  const activeCropData = activeCrop ? getDataOfType<CropEffectData>(activeCrop, EffectType.Crop) : null
  const contentBounds = activeCropData ? {
    minX: activeCropData.x, maxX: activeCropData.x + activeCropData.width,
    minY: activeCropData.y, maxY: activeCropData.y + activeCropData.height
  } : undefined
  const ignoreOverscan = currentScale > 1.01

  // Apply clamping
  if (hasOverscan) {
    const clampHalfX = useFixedIntroWindow ? halfWindowAimX : halfWindowX
    const clampHalfY = useFixedIntroWindow ? halfWindowAimY : halfWindowY
    const halfWindowOutX = clampHalfX / denomX, halfWindowOutY = clampHalfY / denomY
    const finalOut = { x: (safeOverscan.left + finalCenter.x) / denomX, y: (safeOverscan.top + finalCenter.y) / denomY }
    const clampedOut = clampCenterToContentBounds(finalOut, halfWindowOutX, halfWindowOutY, { left: 0, right: 0, top: 0, bottom: 0 }, true, ignoreOverscan, contentBounds)
    finalCenter = { x: clampedOut.x * denomX - safeOverscan.left, y: clampedOut.y * denomY - safeOverscan.top }
  } else {
    const clampHalfX = useFixedIntroWindow ? halfWindowAimX : halfWindowX
    const clampHalfY = useFixedIntroWindow ? halfWindowAimY : halfWindowY
    finalCenter = clampCenterToContentBounds(finalCenter, clampHalfX, clampHalfY, safeOverscan, false, ignoreOverscan, contentBounds)
  }

  // 2. Resolve Visibility (Screen Studio fix / "Push" logic)
  // This OVERRIDES clamping because seeing the cursor is more important than black bars.
  const shouldSkipVisibilityDuringIntro = useFixedIntroWindow // only "Live" should chase/push during intro
  if (shouldFollowMouse && !shouldSkipVisibilityDuringIntro) {
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

    // 3. Anchor Sliding (Physics update)
    // If visibility push moved the camera, we must update the frozen anchor path.
    if (cursorIsFrozen) {
      const dx = finalCenter.x - centerBeforeAdjustments.x
      const dy = finalCenter.y - centerBeforeAdjustments.y
      if (Math.abs(dx) > 0.000001 || Math.abs(dy) > 0.000001) {
        if (nextPhysics.frozenTargetX !== undefined) nextPhysics.frozenTargetX = finalCenter.x
        if (nextPhysics.frozenTargetY !== undefined) nextPhysics.frozenTargetY = finalCenter.y
      }
    }
  }

  nextPhysics.x = finalCenter.x
  nextPhysics.y = finalCenter.y

  return { activeZoomBlock, zoomCenter: finalCenter, physics: nextPhysics }
}

/**
 * Pre-warm camera caches during project load to eliminate first-frame lag.
 */
//   parseZoomBlocks(effects)
// }
