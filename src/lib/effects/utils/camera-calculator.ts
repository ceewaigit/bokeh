/**
 * Camera Calculator (SSOT)
 *
 * Pure camera follow + zoom-center algorithm used by both preview and export.
 * All logic is in normalized source space (0-1).
 */

import type { CursorEffectData, Effect, MouseEvent, Recording, RecordingMetadata, ZoomEffectData, ZoomFollowStrategy } from '@/types/project'
import { EffectType } from '@/types/project'
import { interpolateMousePosition } from './mouse-interpolation'
import { calculateZoomScale } from '@/remotion/compositions/utils/zoom-transform'
import { CURSOR_DIMENSIONS, CURSOR_HOTSPOTS, electronToCustomCursor } from '@/lib/effects/cursor-types'
import { DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { CAMERA_CONFIG, CURSOR_STOP_CONFIG } from '@/lib/effects/config/physics-config'

// Destructure for local use (keeps the rest of the code unchanged)
const {
  deadZoneRatio: CAMERA_DEAD_ZONE_RATIO,
  clusterRadiusRatio: CLUSTER_RADIUS_RATIO,
  minClusterDurationMs: MIN_CLUSTER_DURATION_MS,
  clusterHoldBufferMs: CLUSTER_HOLD_BUFFER_MS,
  cinematicSamples: CINEMATIC_SAMPLES,
  seekThresholdMs: SEEK_THRESHOLD_MS,
  springTension: SPRING_TENSION,
  springFriction: SPRING_FRICTION,
} = CAMERA_CONFIG

const {
  velocityThreshold: CURSOR_STOP_VELOCITY_THRESHOLD,
  dwellMs: CURSOR_STOP_DWELL_MS,
  minZoom: CURSOR_STOP_MIN_ZOOM,
  damping: CURSOR_STOP_DAMPING,
  snapThreshold: CURSOR_STOP_SNAP_THRESHOLD,
} = CURSOR_STOP_CONFIG


export interface CameraPhysicsState {
  x: number
  y: number
  vx: number
  vy: number
  /** Last timeline timestamp used for physics integration. */
  lastTimeMs: number
  /** Last source timestamp (used to estimate playback rate). */
  lastSourceTimeMs?: number
  // Stop detection state (prevents camera halt-shake)
  cursorStoppedAtMs?: number
  frozenTargetX?: number
  frozenTargetY?: number
}

export interface OutputOverscan {
  /** Allowed normalized overscan beyond left edge (relative to draw size). */
  left: number
  /** Allowed normalized overscan beyond right edge (relative to draw size). */
  right: number
  /** Allowed normalized overscan beyond top edge (relative to draw size). */
  top: number
  /** Allowed normalized overscan beyond bottom edge (relative to draw size). */
  bottom: number
}

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

export interface CameraComputeInput {
  effects: Effect[]
  timelineMs: number
  sourceTimeMs: number
  recording?: Recording | null
  metadata?: RecordingMetadata | null
  /** Output/composition size in pixels (for aspect/letterbox-aware bounds) */
  outputWidth?: number
  outputHeight?: number
  /** Overscan bounds to allow panning into preview padding/background. */
  overscan?: OutputOverscan
  /** Screen region within output (for mockup cursor mapping). */
  mockupScreenPosition?: { x: number; y: number; width: number; height: number }
  /** Force camera center to follow the cursor (bypass dead-zone targeting). */
  forceFollowCursor?: boolean
  physics: CameraPhysicsState
  /**
   * When true, bypass spring physics and compute a deterministic center per-frame.
   * This is important for export, where Remotion may render frames out of order.
   */
  deterministic?: boolean
}

export interface CameraComputeOutput {
  activeZoomBlock?: ParsedZoomBlock
  zoomScale: number
  zoomCenter: { x: number; y: number }
  physics: CameraPhysicsState
}

interface Cluster {
  startTime: number
  endTime: number
  centroidX: number
  centroidY: number
}

type MotionClusterCacheEntry = {
  clusters: Cluster[]
}

// Use Map with stable content-based key instead of WeakMap with array reference
// This prevents cache misses when React re-renders create new array references
const motionClusterCache = new Map<string, MotionClusterCacheEntry>()
const MAX_CACHE_ENTRIES = 50 // Limit cache size to prevent memory leaks

// Cache parsed zoom blocks per effects array reference.
// Important: Do NOT sort/reorder blocks here, since overlapping blocks rely on original ordering.
const zoomBlocksCache = new WeakMap<Effect[], ParsedZoomBlock[]>()

function getClusterCacheKey(
  mouseEvents: MouseEvent[],
  videoWidth: number,
  videoHeight: number
): string {
  const firstTs = mouseEvents[0]?.timestamp ?? 0
  const lastTs = mouseEvents[mouseEvents.length - 1]?.timestamp ?? 0
  return `${firstTs}-${mouseEvents.length}-${lastTs}-${videoWidth}-${videoHeight}`
}

const ZOOM_BLOCK_END_EPSILON_MS = 40

function parseZoomBlocks(effects: Effect[]): ParsedZoomBlock[] {
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

function findActiveCluster(
  clusters: Cluster[],
  timeMs: number,
  holdBufferMs: number
): Cluster | null {
  if (!clusters || clusters.length === 0) return null

  // We want the earliest cluster that matches:
  //   timeMs >= startTime && timeMs <= endTime + holdBufferMs
  // Clusters are in chronological order, and endTime is monotonic; adding a constant hold buffer preserves ordering.
  // So we can binary search by extended end time to find the first possible match.
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

function getMotionClusters(
  mouseEvents: MouseEvent[],
  videoWidth: number,
  videoHeight: number
): Cluster[] {
  if (!mouseEvents || mouseEvents.length === 0) return []

  const cacheKey = getClusterCacheKey(mouseEvents, videoWidth, videoHeight)
  const cached = motionClusterCache.get(cacheKey)

  if (cached) {
    return cached.clusters
  }

  const clusters = analyzeMotionClusters(mouseEvents, videoWidth, videoHeight)

  // Evict oldest entries if cache is full (simple LRU-like behavior)
  if (motionClusterCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = motionClusterCache.keys().next().value
    if (firstKey) motionClusterCache.delete(firstKey)
  }

  motionClusterCache.set(cacheKey, { clusters })
  return clusters
}

function getCinematicMousePosition(
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

function calculateAttractor(
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

function normalizeSmoothingAmount(value?: number): number {
  if (!Number.isFinite(value)) return 0
  const raw = value ?? 0
  // Support legacy 0-1 values by mapping to 0-100
  const normalized = raw > 0 && raw <= 1 ? raw * 100 : raw
  return Math.max(0, Math.min(100, normalized))
}

function getHalfWindows(
  zoomScale: number,
  screenWidth: number,
  screenHeight: number,
  outputWidth?: number,
  outputHeight?: number
): { halfWindowX: number; halfWindowY: number } {
  if (zoomScale <= 1.001) return { halfWindowX: 0.5, halfWindowY: 0.5 }

  let rX = 1
  let rY = 1

  if (outputWidth && outputHeight) {
    const sourceAspect = screenWidth / screenHeight
    const outputAspect = outputWidth / outputHeight
    // When aspects differ, the visible source window is constrained by the
    // narrower axis after fitting. Adjust the half-window on that axis.
    if (outputAspect > sourceAspect) {
      // Output is wider -> constrained by height (letterbox top/bottom).
      rY = outputAspect / sourceAspect
    } else if (outputAspect < sourceAspect) {
      // Output is taller/narrower -> constrained by width (pillarbox left/right).
      rX = sourceAspect / outputAspect
    }
  }

  return {
    halfWindowX: (0.5 * rX) / zoomScale,
    halfWindowY: (0.5 * rY) / zoomScale,
  }
}

function getSourceDimensionsAtTime(
  mouseEvents: MouseEvent[],
  timeMs: number,
  recording?: Recording | null,
  metadata?: RecordingMetadata | null
): { sourceWidth: number; sourceHeight: number } {
  const captureArea = (metadata?.captureArea ?? (recording?.metadata as any)?.captureArea) as
    | { fullBounds?: { width: number; height: number }; scaleFactor?: number }
    | undefined
  const fallbackScaleFactor = captureArea?.scaleFactor || 1

  const fallbackWidth =
    (captureArea?.fullBounds?.width
      ? Math.round(captureArea.fullBounds.width * fallbackScaleFactor)
      : undefined) ??
    recording?.width ??
    1920
  const fallbackHeight =
    (captureArea?.fullBounds?.height
      ? Math.round(captureArea.fullBounds.height * fallbackScaleFactor)
      : undefined) ??
    recording?.height ??
    1080

  if (!mouseEvents || mouseEvents.length === 0) {
    return { sourceWidth: fallbackWidth, sourceHeight: fallbackHeight }
  }

  // Find the most recent mouse event at or before timeMs.
  let low = 0
  let high = mouseEvents.length - 1
  let idx = 0
  while (low <= high) {
    const mid = (low + high) >> 1
    if (mouseEvents[mid].timestamp <= timeMs) {
      idx = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  const e = mouseEvents[idx] || mouseEvents[0]

  if (e?.captureWidth && e?.captureHeight) {
    return { sourceWidth: e.captureWidth, sourceHeight: e.captureHeight }
  }

  // Older metadata may lack capture dims. Infer whether screen dims need scaling.
  const screenW = e?.screenWidth
  const screenH = e?.screenHeight
  if (screenW && screenH) {
    const xLooksPhysical = e.x > screenW * 1.1
    const yLooksPhysical = e.y > screenH * 1.1
    const shouldScale = (xLooksPhysical || yLooksPhysical) && fallbackScaleFactor > 1
    return {
      sourceWidth: shouldScale ? Math.round(screenW * fallbackScaleFactor) : screenW,
      sourceHeight: shouldScale ? Math.round(screenH * fallbackScaleFactor) : screenH,
    }
  }

  return { sourceWidth: fallbackWidth, sourceHeight: fallbackHeight }
}

function getAdaptiveDeadZoneRatio(zoomScale: number): number {
  // At higher zoom levels, reduce dead‑zone so the camera tracks tighter.
  // Keeps legacy feel near 1x, but avoids under‑following at 2x+.
  const maxRatio = CAMERA_DEAD_ZONE_RATIO
  const minRatio = 0.18
  const startScale = 1.1
  const endScale = 2.5
  if (zoomScale <= startScale) return maxRatio
  const t = Math.min(1, (zoomScale - startScale) / (endScale - startScale))
  return maxRatio + (minRatio - maxRatio) * t
}

function calculateFollowTargetNormalized(
  cursorNorm: { x: number; y: number },
  currentCenterNorm: { x: number; y: number },
  halfWindowX: number,
  halfWindowY: number,
  zoomScale: number,
  overscan: OutputOverscan
): { x: number; y: number } {
  const deadZoneRatio = getAdaptiveDeadZoneRatio(zoomScale)
  const deadZoneHalfX = halfWindowX * deadZoneRatio
  const deadZoneHalfY = halfWindowY * deadZoneRatio

  const clampX = (c: number) =>
    Math.max(halfWindowX - overscan.left, Math.min(1 - halfWindowX + overscan.right, c))
  const clampY = (c: number) =>
    Math.max(halfWindowY - overscan.top, Math.min(1 - halfWindowY + overscan.bottom, c))

  const dx = cursorNorm.x - currentCenterNorm.x
  const dy = cursorNorm.y - currentCenterNorm.y

  // Soft dead-zone: no movement near center, gentle movement near edges.
  // This avoids both "creep" (always moving) and "snap" (discontinuous target).
  const innerDeadZoneHalfX = deadZoneHalfX * 0.6
  const innerDeadZoneHalfY = deadZoneHalfY * 0.6

  const nextCenterX = (() => {
    const absDx = Math.abs(dx)
    if (absDx <= innerDeadZoneHalfX) return currentCenterNorm.x
    const sign = dx < 0 ? -1 : 1
    const desired = cursorNorm.x - sign * deadZoneHalfX
    const t = deadZoneHalfX > innerDeadZoneHalfX
      ? clamp01((absDx - innerDeadZoneHalfX) / (deadZoneHalfX - innerDeadZoneHalfX))
      : 1
    const eased = smootherStep(t)
    return currentCenterNorm.x + (desired - currentCenterNorm.x) * eased
  })()

  const nextCenterY = (() => {
    const absDy = Math.abs(dy)
    if (absDy <= innerDeadZoneHalfY) return currentCenterNorm.y
    const sign = dy < 0 ? -1 : 1
    const desired = cursorNorm.y - sign * deadZoneHalfY
    const t = deadZoneHalfY > innerDeadZoneHalfY
      ? clamp01((absDy - innerDeadZoneHalfY) / (deadZoneHalfY - innerDeadZoneHalfY))
      : 1
    const eased = smootherStep(t)
    return currentCenterNorm.y + (desired - currentCenterNorm.y) * eased
  })()

  return { x: clampX(nextCenterX), y: clampY(nextCenterY) }
}

function projectCenterToKeepCursorVisible(
  centerNorm: { x: number; y: number },
  cursorNorm: { x: number; y: number },
  halfWindowX: number,
  halfWindowY: number,
  overscan: OutputOverscan,
  cursorMargins?: { left: number; right: number; top: number; bottom: number },
  /** When true, allow full 0-1 range for output-space calculations */
  allowFullRange: boolean = false
): { x: number; y: number } {
  const projectAxis = (
    c: number,
    cursorPos: number,
    halfWindow: number,
    marginMin: number,
    marginMax: number,
    overscanMin: number,
    overscanMax: number
  ) => {
    const clampedCursor = Math.max(0, Math.min(1, cursorPos))

    // Keep the full cursor image visible, not just the hotspot point.
    // Visible source window is [center - halfWindow, center + halfWindow].
    // Require: cursorPos - marginMin >= center - halfWindow  => center <= cursorPos - marginMin + halfWindow
    //          cursorPos + marginMax <= center + halfWindow  => center >= cursorPos + marginMax - halfWindow
    let minCenter = clampedCursor + marginMax - halfWindow
    let maxCenter = clampedCursor - marginMin + halfWindow

    const minAllowed = allowFullRange ? halfWindow : halfWindow - overscanMin
    const maxAllowed = allowFullRange ? 1 - halfWindow : 1 - halfWindow + overscanMax

    minCenter = Math.max(minCenter, minAllowed)
    maxCenter = Math.min(maxCenter, maxAllowed)

    // If constraints are infeasible (e.g., giant cursor at extreme zoom),
    // fall back to clamping within allowed content bounds.
    if (minCenter > maxCenter) {
      return Math.max(minAllowed, Math.min(maxAllowed, c))
    }

    return Math.max(minCenter, Math.min(maxCenter, c))
  }

  return {
    x: projectAxis(
      centerNorm.x,
      cursorNorm.x,
      halfWindowX,
      cursorMargins?.left ?? 0,
      cursorMargins?.right ?? 0,
      overscan.left,
      overscan.right
    ),
    y: projectAxis(
      centerNorm.y,
      cursorNorm.y,
      halfWindowY,
      cursorMargins?.top ?? 0,
      cursorMargins?.bottom ?? 0,
      overscan.top,
      overscan.bottom
    ),
  }
}

function clampCenterToContentBounds(
  centerNorm: { x: number; y: number },
  halfWindowX: number,
  halfWindowY: number,
  overscan: OutputOverscan,
  /** When true, allow full 0-1 range for output-space calculations */
  allowFullRange: boolean = false
): { x: number; y: number } {
  if (allowFullRange) {
    // In output space, allow camera center to span full 0-1 range
    return {
      x: Math.max(halfWindowX, Math.min(1 - halfWindowX, centerNorm.x)),
      y: Math.max(halfWindowY, Math.min(1 - halfWindowY, centerNorm.y)),
    }
  }
  return {
    x: Math.max(halfWindowX - overscan.left, Math.min(1 - halfWindowX + overscan.right, centerNorm.x)),
    y: Math.max(halfWindowY - overscan.top, Math.min(1 - halfWindowY + overscan.bottom, centerNorm.y)),
  }
}

interface CursorVelocityResult {
  velocity: number
  stoppedSinceMs: number | null
}

/**
 * Calculate cursor velocity from mouse events to detect when cursor has stopped.
 * Uses a short lookback window to compute instantaneous velocity.
 */
function calculateCursorVelocity(
  mouseEvents: MouseEvent[],
  timeMs: number,
  sourceWidth: number,
  sourceHeight: number,
  jitterThresholdPx: number,
  lookbackMs: number = 50
): CursorVelocityResult {
  if (mouseEvents.length < 2) {
    return { velocity: 0, stoppedSinceMs: timeMs }
  }

  const windowStart = timeMs - lookbackMs

  // Find the last event at or before timeMs using binary search.
  let low = 0
  let high = mouseEvents.length - 1
  let endIdx = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (mouseEvents[mid].timestamp <= timeMs) {
      endIdx = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  if (endIdx < 0) {
    return { velocity: 0, stoppedSinceMs: timeMs }
  }

  // Walk backwards from endIdx until outside the lookback window.
  let startIdx = endIdx
  while (startIdx > 0 && mouseEvents[startIdx - 1].timestamp >= windowStart) {
    startIdx--
  }

  const recentCount = endIdx - startIdx + 1
  if (recentCount < 2) {
    const lastTimestamp = mouseEvents[endIdx].timestamp
    if (timeMs - lastTimestamp > lookbackMs) {
      return { velocity: 0, stoppedSinceMs: lastTimestamp }
    }
    return { velocity: 0, stoppedSinceMs: null }
  }

  const first = mouseEvents[startIdx]
  const last = mouseEvents[endIdx]

  // Treat tiny movements as noise (e.g., trackpad jitter while typing).
  // This prevents the camera from "hunting" at high zoom levels.
  const jitterThresholdPxSafe = Math.max(0, jitterThresholdPx)
  if (
    Math.abs(last.x - first.x) <= jitterThresholdPxSafe &&
    Math.abs(last.y - first.y) <= jitterThresholdPxSafe
  ) {
    return { velocity: 0, stoppedSinceMs: first.timestamp }
  }

  const dt = (last.timestamp - first.timestamp) / 1000

  if (dt < 0.001) {
    return { velocity: 0, stoppedSinceMs: null }
  }

  const dx = (last.x - first.x) / sourceWidth
  const dy = (last.y - first.y) / sourceHeight
  const velocity = Math.sqrt(dx * dx + dy * dy) / dt

  return { velocity, stoppedSinceMs: null }
}

/**
 * Linear interpolation between two values.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function smootherStep(t: number): number {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/**
 * Exponentially-weighted smoothing of cursor position for deterministic export.
 * This provides temporal smoothing without relying on frame-to-frame physics state.
 *
 * Uses a decay window where recent positions have higher weight than older ones.
 * This produces smooth camera movement that's frame-order independent.
 */
function getExponentiallySmoothedCursorNorm(
  mouseEvents: MouseEvent[],
  timeMs: number,
  sourceWidth: number,
  sourceHeight: number
): { x: number; y: number } {
  if (mouseEvents.length === 0) {
    return { x: 0.5, y: 0.5 }
  }

  // Smoothing parameters
  const windowMs = 600  // Look back 600ms
  const tauMs = 180     // Exponential decay time constant
  const steps = 12      // Number of samples within the window

  let sumX = 0
  let sumY = 0
  let sumW = 0
  const stepMs = windowMs / steps

  for (let i = 0; i <= steps; i++) {
    const t = timeMs - i * stepMs
    const pos = interpolateMousePosition(mouseEvents, t)
    if (pos) {
      // Exponential decay weight: more recent = higher weight
      const w = Math.exp(-(i * stepMs) / tauMs)
      sumW += w
      sumX += (pos.x / sourceWidth) * w
      sumY += (pos.y / sourceHeight) * w
    }
  }

  if (sumW === 0) {
    return { x: 0.5, y: 0.5 }
  }

  return {
    x: sumX / sumW,
    y: sumY / sumW,
  }
}

const ZOOM_BLOCK_START_EPSILON_MS = 40

function getZoomBlockAtTime(zoomBlocks: ParsedZoomBlock[], timelineMs: number): ParsedZoomBlock | undefined {
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

  const safeOverscan: OutputOverscan = overscan || { left: 0, right: 0, top: 0, bottom: 0 }
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
    mouseEvents,
    sourceTimeMs,
    recording,
    effectiveMetadata ?? undefined
  )

  const { halfWindowX, halfWindowY } = getHalfWindows(
    currentScale,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight
  )

  const hasOverscan =
    safeOverscan.left > 0 || safeOverscan.right > 0 || safeOverscan.top > 0 || safeOverscan.bottom > 0

  const cursorClampBounds = hasOverscan
    ? {
      minX: -safeOverscan.left,
      maxX: 1 + safeOverscan.right,
      minY: -safeOverscan.top,
      maxY: 1 + safeOverscan.bottom,
    }
    : { minX: 0, maxX: 1, minY: 0, maxY: 1 }

  const clampCursorX = (x: number) => Math.max(cursorClampBounds.minX, Math.min(cursorClampBounds.maxX, x))
  const clampCursorY = (y: number) => Math.max(cursorClampBounds.minY, Math.min(cursorClampBounds.maxY, y))

  // Check for Cinematic Scroll effect
  const cinematicScrollEffect = EffectsFactory.getActiveEffectAtTime(effects, EffectType.Annotation, timelineMs)
  const isCinematicScrollEnabled = (cinematicScrollEffect?.data as any)?.kind === 'scrollCinematic' && cinematicScrollEffect?.enabled

  const cinematicSmoothing = isCinematicScrollEnabled
    ? normalizeSmoothingAmount((cinematicScrollEffect?.data as any)?.smoothing ?? 20)
    : 0
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
  // We need this early to project future source time during zoom transitions
  const dtSource = sourceTimeMs - (physics.lastSourceTimeMs ?? sourceTimeMs)
  const playbackRateEstimate = dtTimelineFromState > 1 ? dtSource / dtTimelineFromState : 1
  const rate = Math.max(0.5, Math.min(3, playbackRateEstimate || 1))

  // Predictive Tracking:
  // During zoom-in (intro), target the mouse position at the END of the intro.
  // This ensures the camera zooms directly to where the mouse *will be*,
  // rather than chasing the current mouse position.
  let effectiveSourceTimeMs = sourceTimeMs
  if (activeZoomBlock && timelineMs < activeZoomBlock.startTime + activeZoomBlock.introMs) {
    const timeUntilIntroEnd = (activeZoomBlock.startTime + activeZoomBlock.introMs) - timelineMs
    const sourceTimeUntilIntroEnd = timeUntilIntroEnd * rate
    // Blend in prediction as the zoom ramps up to avoid a "pre-pan then zoom" feel.
    effectiveSourceTimeMs = sourceTimeMs + sourceTimeUntilIntroEnd * introBlend
  }

  const attractor = calculateAttractor(
    mouseEvents,
    effectiveSourceTimeMs,
    sourceWidth,
    sourceHeight,
    smoothingAmount
  )

  let cursorNormX = 0.5
  let cursorNormY = 0.5
  if (attractor) {
    cursorNormX = attractor.x / sourceWidth
    cursorNormY = attractor.y / sourceHeight
  }
  if (mockupScreenPosition && outputWidth && outputHeight) {
    const screenX = Math.max(0, Math.min(1, mockupScreenPosition.x / outputWidth))
    const screenY = Math.max(0, Math.min(1, mockupScreenPosition.y / outputHeight))
    const screenW = Math.max(0, Math.min(1, mockupScreenPosition.width / outputWidth))
    const screenH = Math.max(0, Math.min(1, mockupScreenPosition.height / outputHeight))
    cursorNormX = screenX + cursorNormX * screenW
    cursorNormY = screenY + cursorNormY * screenH
  }
  // Important: cursor positions can legitimately be outside the capture bounds.
  // When the output has padding/letterbox (overscan), allow the camera to pan
  // into that area so the cursor never gets hidden behind the zoom window edge.
  cursorNormX = clampCursorX(cursorNormX)
  cursorNormY = clampCursorY(cursorNormY)

  // Calculate cursor velocity for stop detection.
  // Use per-zoom idle threshold if provided (wired from UI as `mouseIdlePx`).
  const jitterThresholdPx = activeZoomBlock?.mouseIdlePx ?? 2
  const cursorVelocity = calculateCursorVelocity(
    mouseEvents,
    sourceTimeMs,
    sourceWidth,
    sourceHeight,
    jitterThresholdPx
  )

  // Determine if cursor is frozen (stopped while zoomed)
  const shouldApplyStopDetection = currentScale >= CURSOR_STOP_MIN_ZOOM
  let cursorIsFrozen = false
  // "Frozen" refers to freezing the cursor input (attractor), not snapping the camera center.
  // This prevents halt-shake without introducing slow "creep" toward the cursor.
  let frozenTarget: { x: number; y: number } | null = null

  if (isDeterministic) {
    // Deterministic export: do not rely on prior-frame physics state for stop detection.
    if (shouldApplyStopDetection && cursorVelocity.velocity < CURSOR_STOP_VELOCITY_THRESHOLD) {
      const stoppedAt = cursorVelocity.stoppedSinceMs ?? sourceTimeMs
      const stoppedDuration = sourceTimeMs - stoppedAt
      if (stoppedDuration >= CURSOR_STOP_DWELL_MS) {
        cursorIsFrozen = true
        frozenTarget = { x: cursorNormX, y: cursorNormY }
      }
    }
  } else {
    const unfreezeVelocityThreshold = CURSOR_STOP_VELOCITY_THRESHOLD * 1.5

    if (shouldApplyStopDetection && cursorVelocity.velocity < CURSOR_STOP_VELOCITY_THRESHOLD) {
      const stoppedAt = physics.cursorStoppedAtMs ??
        cursorVelocity.stoppedSinceMs ??
        sourceTimeMs
      const stoppedDuration = sourceTimeMs - stoppedAt

      if (stoppedDuration >= CURSOR_STOP_DWELL_MS) {
        cursorIsFrozen = true
        frozenTarget = {
          x: physics.frozenTargetX ?? cursorNormX,
          y: physics.frozenTargetY ?? cursorNormY
        }
      }
      physics.cursorStoppedAtMs = stoppedAt
    } else if (physics.frozenTargetX != null && physics.frozenTargetY != null && cursorVelocity.velocity < unfreezeVelocityThreshold) {
      // Hysteresis: once frozen, keep it frozen until the cursor clearly moves again.
      cursorIsFrozen = true
      frozenTarget = {
        x: physics.frozenTargetX,
        y: physics.frozenTargetY,
      }
    } else {
      physics.cursorStoppedAtMs = undefined
      physics.frozenTargetX = undefined
      physics.frozenTargetY = undefined
    }
  }

  const followStrategy = activeZoomBlock?.followStrategy
  const shouldFollowMouse =
    followStrategy === 'mouse' ||
    // If strategy is unspecified, default to mouse follow.
    followStrategy == null
  const shouldCenterLock = followStrategy === 'center'

  let targetCenter = isDeterministic ? { x: 0.5, y: 0.5 } : { x: physics.x, y: physics.y }

  const followCursor = cursorIsFrozen && frozenTarget
    ? frozenTarget
    : { x: cursorNormX, y: cursorNormY }

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
    targetCenter = {
      x: activeZoomBlock.targetX / sw,
      y: activeZoomBlock.targetY / sh,
    }
    targetCenter = clampCenterToContentBounds(targetCenter, halfWindowX, halfWindowY, safeOverscan)
  } else {
    if (shouldFollowMouse && hasOverscan) {
      // When preview has padding/letterbox, compute follow in output-normalized space
      // so the camera can track the cursor all the way into padding.
      const cursorOut = {
        x: (safeOverscan.left + followCursor.x) / denomX,
        y: (safeOverscan.top + followCursor.y) / denomY,
      }
      const baseCenter = baseCenterForFollow
      const centerOut = {
        x: (safeOverscan.left + baseCenter.x) / denomX,
        y: (safeOverscan.top + baseCenter.y) / denomY,
      }
      const halfWindowOutX = halfWindowX / denomX
      const halfWindowOutY = halfWindowY / denomY
      const targetOut = calculateFollowTargetNormalized(
        cursorOut,
        centerOut,
        halfWindowOutX,
        halfWindowOutY,
        currentScale,
        { left: 0, right: 0, top: 0, bottom: 0 }
      )
      targetCenter = {
        x: targetOut.x * denomX - safeOverscan.left,
        y: targetOut.y * denomY - safeOverscan.top,
      }
    } else {
      const baseCenter = baseCenterForFollow
      targetCenter = calculateFollowTargetNormalized(
        followCursor,
        baseCenter,
        halfWindowX,
        halfWindowY,
        currentScale,
        safeOverscan
      )
    }
  }

  if (
    activeZoomBlock &&
    shouldFollowMouse &&
    !shouldCenterLock &&
    activeZoomBlock.autoScale !== 'fill' &&
    timelineMs < activeZoomBlock.startTime + activeZoomBlock.introMs
  ) {
    targetCenter = {
      x: lerp(baseCenterForFollow.x, targetCenter.x, introBlend),
      y: lerp(baseCenterForFollow.y, targetCenter.y, introBlend),
    }
  }

  // For deterministic export with mouse follow, use exponentially smoothed cursor
  // to provide temporal smoothing without relying on frame-to-frame physics state
  if (isDeterministic && shouldFollowMouse && activeZoomBlock) {
    const smoothedCursor = cursorIsFrozen && frozenTarget
      ? frozenTarget
      : getExponentiallySmoothedCursorNorm(
        mouseEvents,
        sourceTimeMs,
        sourceWidth,
        sourceHeight
      )
    // Apply dead zone and follow logic to the smoothed cursor
    const baseCenter = { x: 0.5, y: 0.5 }
    if (hasOverscan) {
      const cursorOut = {
        x: (safeOverscan.left + smoothedCursor.x) / denomX,
        y: (safeOverscan.top + smoothedCursor.y) / denomY,
      }
      const centerOut = {
        x: (safeOverscan.left + baseCenter.x) / denomX,
        y: (safeOverscan.top + baseCenter.y) / denomY,
      }
      const halfWindowOutX = halfWindowX / denomX
      const halfWindowOutY = halfWindowY / denomY
      const targetOut = calculateFollowTargetNormalized(
        cursorOut,
        centerOut,
        halfWindowOutX,
        halfWindowOutY,
        currentScale,
        { left: 0, right: 0, top: 0, bottom: 0 }
      )
      targetCenter = {
        x: targetOut.x * denomX - safeOverscan.left,
        y: targetOut.y * denomY - safeOverscan.top,
      }
    } else {
      targetCenter = calculateFollowTargetNormalized(
        smoothedCursor,
        baseCenter,
        halfWindowX,
        halfWindowY,
        currentScale,
        safeOverscan
      )
    }

    if (timelineMs < activeZoomBlock.startTime + activeZoomBlock.introMs) {
      targetCenter = {
        x: lerp(0.5, targetCenter.x, introBlend),
        y: lerp(0.5, targetCenter.y, introBlend),
      }
    }
  }

  if (forceFollowCursor) {
    targetCenter = followCursor
  }

  let nextPhysics: CameraPhysicsState
  if (isDeterministic) {
    // Deterministic per-frame center (no dependence on previous frames).
    nextPhysics = {
      x: targetCenter.x,
      y: targetCenter.y,
      vx: 0,
      vy: 0,
      lastTimeMs: timelineMs,
      lastSourceTimeMs: sourceTimeMs,
    }
  } else {
    if (isSeek) {
      nextPhysics = {
        x: targetCenter.x,
        y: targetCenter.y,
        vx: 0,
        vy: 0,
        lastTimeMs: timelineMs,
        lastSourceTimeMs: sourceTimeMs,
      }
    } else {
      const dtSeconds = dtTimelineFromState / 1000

      // Use pre-calculated rate
      // const playbackRateEstimate = dtTimeline > 1 ? dtSource / dtTimeline : 1
      const rate = Math.max(0.5, Math.min(3, playbackRateEstimate || 1))

      // Dynamic Physics Mapping
      // Map smoothingAmount (0-100) to Tension and Friction.
      // 0 (Base)  -> CAMERA_CONFIG spring tuning
      // 100 (Smooth) -> Low Tension (40), High Friction (40) -> Cinematic/Lazy

      const baseTension = lerp(SPRING_TENSION, 40, smoothingAmount / 100)
      const baseFriction = lerp(SPRING_FRICTION, 40, smoothingAmount / 100)

      const effectiveFriction = cursorIsFrozen
        ? baseFriction / CURSOR_STOP_DAMPING
        : baseFriction * Math.sqrt(rate)

      const effectiveTension = baseTension * rate

      // Standard Physics Engine (Continuous)
      // No mode switching or forced interpolation. The physics engine handles
      // the transition from Center -> Mouse naturally based on the tension/friction.

      let x: number, y: number, vx: number, vy: number

      // Center-locked zooms should not carry spring momentum from mouse-follow,
      // otherwise they can overshoot and look "twitchy" during zoom transitions.
      if (activeZoomBlock && (shouldCenterLock || activeZoomBlock.autoScale === 'fill')) {
        physics.vx = 0
        physics.vy = 0
      }

      const ax = (targetCenter.x - physics.x) * effectiveTension - physics.vx * effectiveFriction
      const ay = (targetCenter.y - physics.y) * effectiveTension - physics.vy * effectiveFriction
      let vxNext = physics.vx + ax * dtSeconds
      let vyNext = physics.vy + ay * dtSeconds

      // Additional velocity damping when frozen
      if (cursorIsFrozen) {
        vxNext *= CURSOR_STOP_DAMPING
        vyNext *= CURSOR_STOP_DAMPING
      }

      x = physics.x + vxNext * dtSeconds
      y = physics.y + vyNext * dtSeconds
      vx = vxNext
      vy = vyNext

      // Snap to target when frozen and very close
      if (cursorIsFrozen && activeZoomBlock?.autoScale !== 'fill') {
        const distToTarget = Math.sqrt(
          Math.pow(x - targetCenter.x, 2) + Math.pow(y - targetCenter.y, 2)
        )
        if (distToTarget < CURSOR_STOP_SNAP_THRESHOLD) {
          x = targetCenter.x
          y = targetCenter.y
          vx = 0
          vy = 0
        }
      }

      nextPhysics = { x, y, vx, vy, lastTimeMs: timelineMs, lastSourceTimeMs: sourceTimeMs }
    }
  }

  let finalCenter = { x: nextPhysics.x, y: nextPhysics.y }

  // Get RAW cursor position for visibility projection.
  // Camera follows the smoothed attractor for cinematic movement,
  // but visibility checks must use the actual rendered cursor position
  // to ensure it stays in frame (cursor uses different smoothing).
  const rawCursorPos = interpolateMousePosition(mouseEvents, sourceTimeMs)
  const rawCursorNormX = rawCursorPos
    ? clampCursorX(rawCursorPos.x / sourceWidth)
    : cursorNormX
  const rawCursorNormY = rawCursorPos
    ? clampCursorY(rawCursorPos.y / sourceHeight)
    : cursorNormY

  const mappedRawCursorNorm = (() => {
    if (!mockupScreenPosition || !outputWidth || !outputHeight) {
      return { x: rawCursorNormX, y: rawCursorNormY }
    }
    const screenX = Math.max(0, Math.min(1, mockupScreenPosition.x / outputWidth))
    const screenY = Math.max(0, Math.min(1, mockupScreenPosition.y / outputHeight))
    const screenW = Math.max(0, Math.min(1, mockupScreenPosition.width / outputWidth))
    const screenH = Math.max(0, Math.min(1, mockupScreenPosition.height / outputHeight))
    return {
      x: screenX + rawCursorNormX * screenW,
      y: screenY + rawCursorNormY * screenH,
    }
  })()

  const cursorMarginsNorm = (() => {
    const cursorEffect = effects.find(e => e.type === EffectType.Cursor && e.enabled)
    if (!cursorEffect) return null

    const cursorData = cursorEffect.data as CursorEffectData | undefined
    const cursorScale = cursorData?.size ?? DEFAULT_CURSOR_DATA.size

    // Determine cursor type at time (matches CursorLayer behavior).
    let cursorEventIndex = -1
    let low = 0
    let high = mouseEvents.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      if (mouseEvents[mid].timestamp <= sourceTimeMs) {
        cursorEventIndex = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    const cursorTypeRaw = (mouseEvents[cursorEventIndex] ?? mouseEvents[0])?.cursorType ?? 'default'
    const cursorType = electronToCustomCursor(cursorTypeRaw)

    const baseDim = CURSOR_DIMENSIONS[cursorType]
    const hotspot = CURSOR_HOTSPOTS[cursorType]
    const widthPx = baseDim.width * cursorScale
    const heightPx = baseDim.height * cursorScale

    const leftPx = hotspot.x * widthPx
    const rightPx = (1 - hotspot.x) * widthPx
    const topPx = hotspot.y * heightPx
    const bottomPx = (1 - hotspot.y) * heightPx

    const outW = outputWidth || sourceWidth
    const outH = outputHeight || sourceHeight
    const drawW = outW / (hasOverscan ? denomX : 1)
    const drawH = outH / (hasOverscan ? denomY : 1)
    const windowWidthNorm = halfWindowX * 2
    const windowHeightNorm = halfWindowY * 2

    // Cursor is rendered at a constant pixel size (it is not scaled by zoom).
    // Convert its pixel footprint into the normalized camera-space units
    // (i.e., source normalized coords) using the current visible window size.
    // This makes the "keep cursor visible" projection work across zoom levels,
    // aspect ratios, and cursor sizes.
    // Important: zoom/pan are applied to the video draw area (letterboxed content),
    // not the full output frame, so we normalize against drawW/drawH.
    const left = (leftPx / drawW) * windowWidthNorm
    const right = (rightPx / drawW) * windowWidthNorm
    const top = (topPx / drawH) * windowHeightNorm
    const bottom = (bottomPx / drawH) * windowHeightNorm

    return {
      left,
      right,
      top,
      bottom,
    }
  })()

  const shouldSkipVisibilityProjection = Boolean(forceFollowCursor)
  if (shouldSkipVisibilityProjection) {
    finalCenter = followCursor
  }

  // After freezing, avoid further cursor-visibility projections which can
  // reintroduce jitter from tiny cursor deltas.
  if (shouldFollowMouse && !cursorIsFrozen && !shouldSkipVisibilityProjection) {
    if (hasOverscan) {
      const finalOut = {
        x: (safeOverscan.left + finalCenter.x) / denomX,
        y: (safeOverscan.top + finalCenter.y) / denomY,
      }
      // Use RAW cursor position for visibility, not smoothed attractor
      const cursorOut = {
        x: (safeOverscan.left + mappedRawCursorNorm.x) / denomX,
        y: (safeOverscan.top + mappedRawCursorNorm.y) / denomY,
      }
      const cursorMarginsOut = cursorMarginsNorm
        ? {
          left: cursorMarginsNorm.left / denomX,
          right: cursorMarginsNorm.right / denomX,
          top: cursorMarginsNorm.top / denomY,
          bottom: cursorMarginsNorm.bottom / denomY,
        }
        : undefined
      const halfWindowOutX = halfWindowX / denomX
      const halfWindowOutY = halfWindowY / denomY
      const projectedOut = projectCenterToKeepCursorVisible(
        finalOut,
        cursorOut,
        halfWindowOutX,
        halfWindowOutY,
        { left: 0, right: 0, top: 0, bottom: 0 },
        cursorMarginsOut,
        true // allowFullRange: camera can span full output space to show padding
      )
      finalCenter = {
        x: projectedOut.x * denomX - safeOverscan.left,
        y: projectedOut.y * denomY - safeOverscan.top,
      }
    } else {
      // Use RAW cursor position for visibility, not smoothed attractor
      finalCenter = projectCenterToKeepCursorVisible(
        finalCenter,
        { x: mappedRawCursorNorm.x, y: mappedRawCursorNorm.y },
        halfWindowX,
        halfWindowY,
        safeOverscan,
        cursorMarginsNorm ?? undefined
      )
    }
  }
  // When there's overscan (padding), clamp in output space for consistency
  // with the projection calculations above. Otherwise use source-space clamp.
  if (shouldFollowMouse && hasOverscan && !shouldSkipVisibilityProjection) {
    const halfWindowOutX = halfWindowX / denomX
    const halfWindowOutY = halfWindowY / denomY
    const finalOut = {
      x: (safeOverscan.left + finalCenter.x) / denomX,
      y: (safeOverscan.top + finalCenter.y) / denomY,
    }
    const clampedOut = clampCenterToContentBounds(finalOut, halfWindowOutX, halfWindowOutY, { left: 0, right: 0, top: 0, bottom: 0 }, true)
    finalCenter = {
      x: clampedOut.x * denomX - safeOverscan.left,
      y: clampedOut.y * denomY - safeOverscan.top,
    }
  } else if (!shouldSkipVisibilityProjection) {
    finalCenter = clampCenterToContentBounds(finalCenter, halfWindowX, halfWindowY, safeOverscan)
  }
  nextPhysics.x = finalCenter.x
  nextPhysics.y = finalCenter.y

  return {
    activeZoomBlock,
    zoomScale: currentScale,
    zoomCenter: finalCenter,
    physics: nextPhysics,
  }
}

/**
 * Pre-warm camera caches during project load to eliminate first-frame lag.
 * Call this after metadata is loaded but before first render.
 *
 * @param mouseEvents - Mouse events from recording metadata
 * @param effects - Effects array (for zoom block parsing)
 * @param videoWidth - Video width for motion cluster analysis
 * @param videoHeight - Video height for motion cluster analysis
 */
export function precomputeCameraCaches(
  mouseEvents: MouseEvent[],
  effects: Effect[],
  videoWidth: number,
  videoHeight: number
): void {
  // 1. Pre-parse zoom blocks (populates zoomBlocksCache WeakMap)
  // Note: WeakMap is keyed by array reference, so this only helps if
  // the same effects array is used during rendering
  parseZoomBlocks(effects)

  // 2. Pre-compute motion clusters (populates motionClusterCache Map)
  // This is the most expensive operation - O(n) over all mouse events
  if (mouseEvents && mouseEvents.length > 0 && videoWidth > 0 && videoHeight > 0) {
    getMotionClusters(mouseEvents, videoWidth, videoHeight)
  }
}
