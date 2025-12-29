/**
 * Cursor effect calculator
 * Pure functions for calculating cursor position, visibility, and effects
 * Used by both Remotion preview and export engines
 */

import type { CursorEffectData, MouseEvent, ClickEvent } from '@/types/project'
import { CursorStyle } from '@/types/project'
import { interpolateMousePosition } from './mouse-interpolation'
import { CursorType, electronToCustomCursor } from '../cursor-types'
import { DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects'
import { clamp01, lerp, easeOutCubic, clamp } from '@/lib/core/math'
import { CameraDataService } from '@/features/camera/camera-data-service'

/**
 * Clear the smoothing cache - call when switching projects or recordings
 * @deprecated Use CameraDataService.invalidateCache() instead.
 */
export function clearCursorCalculatorCache(): void {
  CameraDataService.invalidateCache()
}

/**
 * Pre-compute cursor smoothing cache for the first N seconds of a recording.
 * This eliminates the lag when first rendering cursor effects by warming the cache
 * during project load instead of on first render.
 *
 * @param mouseEvents - Mouse events from recording metadata
 * @param cursorData - Cursor effect settings
 * @param durationMs - Duration to precompute (default 5000ms = 5 seconds)
 * @param fps - Frame rate for sampling (default 30fps for efficiency)
 */
export function precomputeCursorSmoothingCache(
  mouseEvents: MouseEvent[],
  cursorData: CursorEffectData,
  durationMs: number = 5000,
  fps: number = 30
): void {
  if (!mouseEvents || mouseEvents.length === 0 || !cursorData.gliding) {
    return
  }

  const frameInterval = 1000 / fps
  const startTime = mouseEvents[0]?.timestamp ?? 0
  const endTime = Math.min(startTime + durationMs, mouseEvents[mouseEvents.length - 1]?.timestamp ?? startTime)

  // Simulate frame-by-frame to build up cache
  for (let t = startTime; t <= endTime; t += frameInterval) {
    const rawPosition = interpolateMousePosition(mouseEvents, t)
    if (!rawPosition) continue

    // This will populate the smoothingCache
    smoothPositionWithHistory(mouseEvents, t, rawPosition, cursorData, fps)
  }
}

export interface CursorState {
  visible: boolean
  x: number
  y: number
  type: CursorType
  scale: number
  opacity: number
  /** CSS rotation in degrees (clockwise positive). */
  rotation?: number
  /** CSS 3D tilt in degrees (positive = rotateX/rotateY positive). */
  tiltX?: number
  tiltY?: number
  clickEffects: ClickEffect[]
  timestamp: number
  motionBlur?: {
    previousX: number
    previousY: number
    velocity: number
  }
}

export interface ClickEffect {
  x: number
  y: number
  timestamp: number
  progress: number // 0 to 1
  radius: number
  opacity: number
  word?: string
}

export interface ResolvedClickEffectConfig {
  style: NonNullable<CursorEffectData['clickEffectStyle']>
  animation: NonNullable<CursorEffectData['clickEffectAnimation']>
  durationMs: number
  maxRadius: number
  lineWidth: number
  color: string
  textWords: string[]
  textMode: NonNullable<CursorEffectData['clickTextMode']>
  textAnimation: NonNullable<CursorEffectData['clickTextAnimation']>
  textSize: number
  textColor: string
  textOffsetY: number
  textRise: number
}

export function resolveClickEffectConfig(cursorData?: CursorEffectData): ResolvedClickEffectConfig {
  const defaults = DEFAULT_CURSOR_DATA

  const style = (cursorData?.clickEffectStyle ?? defaults.clickEffectStyle ?? 'ripple')
  const animation = (cursorData?.clickEffectAnimation ?? defaults.clickEffectAnimation ?? 'expand')
  const durationMs = clamp(cursorData?.clickEffectDurationMs ?? defaults.clickEffectDurationMs ?? 300, 80, 2000)
  const maxRadius = clamp(cursorData?.clickEffectMaxRadius ?? defaults.clickEffectMaxRadius ?? 50, 4, 200)
  const lineWidth = clamp(cursorData?.clickEffectLineWidth ?? defaults.clickEffectLineWidth ?? 2, 1, 12)
  const color = cursorData?.clickEffectColor ?? defaults.clickEffectColor ?? '#ffffff'

  const textWords = normalizeClickWords(cursorData?.clickTextWords ?? defaults.clickTextWords ?? ['click!'])
  const textMode = (cursorData?.clickTextMode ?? defaults.clickTextMode ?? 'random')
  const textAnimation = (cursorData?.clickTextAnimation ?? defaults.clickTextAnimation ?? 'float')
  const textSize = clamp(cursorData?.clickTextSize ?? defaults.clickTextSize ?? 16, 8, 64)
  const textColor = cursorData?.clickTextColor ?? defaults.clickTextColor ?? '#ffffff'
  const textOffsetY = clamp(cursorData?.clickTextOffsetY ?? defaults.clickTextOffsetY ?? -12, -200, 200)
  const textRise = clamp(cursorData?.clickTextRise ?? defaults.clickTextRise ?? 24, 0, 200)

  return {
    style,
    animation,
    durationMs,
    maxRadius,
    lineWidth,
    color,
    textWords,
    textMode,
    textAnimation,
    textSize,
    textColor,
    textOffsetY,
    textRise
  }
}

export function getClickTextStyle(effect: ClickEffect, config: ResolvedClickEffectConfig): {
  opacity: number
  offsetY: number
  scale: number
} | null {
  if (!effect.word) return null

  const progress = clamp01(effect.progress)
  const fade = 1 - progress
  const eased = easeOutCubic(progress)

  if (config.textAnimation === 'pop') {
    const popIn = progress < 0.5
      ? easeOutCubic(progress / 0.5)
      : 1 - (progress - 0.5) / 0.5 * 0.2
    return {
      opacity: Math.max(0, fade),
      offsetY: config.textOffsetY,
      scale: 0.7 + popIn * 0.6
    }
  }

  return {
    opacity: Math.max(0, fade),
    offsetY: config.textOffsetY - config.textRise * eased,
    scale: 1
  }
}

/**
 * Calculate cursor state at a given timestamp
 */
export function calculateCursorState(
  cursorData: CursorEffectData | undefined,
  mouseEvents: MouseEvent[],
  clickEvents: ClickEvent[],
  timestamp: number,
  renderFps?: number,
  disableHistorySmoothing?: boolean
): CursorState {
  // Default state
  if (!cursorData || !mouseEvents || mouseEvents.length === 0) {
    return {
      visible: false,
      x: 0,
      y: 0,
      type: CursorType.ARROW,
      scale: cursorData?.size ?? DEFAULT_CURSOR_DATA.size,
      opacity: 0,
      rotation: 0,
      tiltX: 0,
      tiltY: 0,
      clickEffects: [],
      timestamp
    }
  }

  // Get interpolated mouse position
  const rawPosition = interpolateMousePosition(mouseEvents, timestamp)
  if (!rawPosition) {
    return {
      visible: false,
      x: 0,
      y: 0,
      type: CursorType.ARROW,
      scale: cursorData.size ?? DEFAULT_CURSOR_DATA.size,
      opacity: 0,
      rotation: 0,
      tiltX: 0,
      tiltY: 0,
      clickEffects: [],
      timestamp
    }
  }

  // Apply additional smoothing on top of interpolation (stateless, time-based)
  // This matches the original CursorLayer behavior for buttery-smooth movement
  const { position } = smoothCursorPosition(
    mouseEvents,
    timestamp,
    rawPosition,
    cursorData,
    renderFps,
    disableHistorySmoothing
  )

  // Determine cursor type - use binary search for most recent event
  let cursorEventIndex = -1
  let low = 0, high = mouseEvents.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (mouseEvents[mid].timestamp <= timestamp) {
      cursorEventIndex = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  const currentEvent = cursorEventIndex >= 0 ? mouseEvents[cursorEventIndex] : mouseEvents[0]
  const cursorType = electronToCustomCursor(currentEvent?.cursorType || 'default')

  // Calculate visibility based on idle timeout
  let visible = true
  let opacity = 1

  if (cursorData.hideOnIdle) {
    const idleTimeout = cursorData.idleTimeout ?? DEFAULT_CURSOR_DATA.idleTimeout
    const lastMovement = findLastMovement(mouseEvents, timestamp)
    if (lastMovement) {
      const idleTime = timestamp - lastMovement.timestamp
      const fadeOnIdle = cursorData.fadeOnIdle ?? DEFAULT_CURSOR_DATA.fadeOnIdle

      if (!fadeOnIdle) {
        if (idleTime > idleTimeout) {
          visible = false
          opacity = 0
        }
      } else {
        const FADE_OUT_DURATION = 300 // ms
        const FADE_IN_DURATION = 180 // ms

        if (idleTime >= idleTimeout) {
          opacity = 0
        } else if (idleTime > idleTimeout - FADE_OUT_DURATION) {
          // Fade out in the last FADE_OUT_DURATION ms
          opacity = Math.max(0, 1 - (idleTime - (idleTimeout - FADE_OUT_DURATION)) / FADE_OUT_DURATION)
        }

        // Fade in on "wake" movement after being idle long enough to hide
        const previousMovement = findLastMovement(mouseEvents, lastMovement.timestamp - 1)
        const idleGap = previousMovement ? (lastMovement.timestamp - previousMovement.timestamp) : 0
        const resumedAfterHide = previousMovement
          ? idleGap > idleTimeout
          : lastMovement.timestamp >= idleTimeout
        if (resumedAfterHide) {
          const sinceWake = timestamp - lastMovement.timestamp
          if (sinceWake >= 0 && sinceWake < FADE_IN_DURATION) {
            opacity = Math.min(opacity, Math.max(0, sinceWake / FADE_IN_DURATION))
          }
        }

        visible = opacity > 0.001
      }
    }
  }

  // Calculate motion blur if enabled (with optional intensity)
  let motionBlur: CursorState['motionBlur'] = undefined
  const motionBlurIntensity = cursorData.motionBlurIntensity ?? (cursorData.motionBlur ? (DEFAULT_CURSOR_DATA.motionBlurIntensity ?? 40) : 0)
  if (motionBlurIntensity > 0) {
    // Special "ice" friction model used in Bokeh
    const referencePosition = sampleHistoricalPosition(
      mouseEvents,
      timestamp,
      position,
      Math.min(60, (1 - (cursorData.speed ?? DEFAULT_CURSOR_DATA.speed)) * 80 + 20)
    )

    const dx = position.x - referencePosition.x
    const dy = position.y - referencePosition.y
    const velocity = Math.sqrt(dx * dx + dy * dy)

    if (velocity > 6) { // Only show blur for significant movement
      motionBlur = {
        previousX: referencePosition.x,
        previousY: referencePosition.y,
        velocity: Math.min(velocity, 50) * (motionBlurIntensity / 100) // Cap velocity for reasonable blur
      }
    }
  }

  const { rotation, tiltX, tiltY } = calculateDirectionalTilt({
    cursorData,
    cursorType,
    timestamp,
    position,
    mouseEvents,
    renderFps
  })

  // Calculate click effects
  const activeClickEffects = cursorData.clickEffects
    ? calculateClickEffects(clickEvents, timestamp, cursorData)
    : []

  return {
    visible,
    x: position.x,
    y: position.y,
    type: cursorType,
    scale: cursorData.size ?? DEFAULT_CURSOR_DATA.size,
    opacity,
    rotation,
    tiltX,
    tiltY,
    clickEffects: activeClickEffects,
    motionBlur,
    timestamp
  }
}

function calculateDirectionalTilt(options: {
  cursorData: CursorEffectData
  cursorType: CursorType
  timestamp: number
  position: { x: number; y: number }
  mouseEvents: MouseEvent[]
  renderFps?: number
}): { rotation: number; tiltX: number; tiltY: number } {
  const { cursorData, cursorType, timestamp, position, mouseEvents, renderFps } = options

  const enabled = cursorData.directionalTilt ?? DEFAULT_CURSOR_DATA.directionalTilt ?? false
  if (!enabled) return { rotation: 0, tiltX: 0, tiltY: 0 }

  // Keep "text" and "precision" cursors stable.
  if (cursorType === CursorType.IBEAM || cursorType === CursorType.CROSSHAIR) return { rotation: 0, tiltX: 0, tiltY: 0 }

  const maxDegRaw = cursorData.directionalTiltMaxDeg ?? DEFAULT_CURSOR_DATA.directionalTiltMaxDeg ?? 10
  const maxDeg = Math.max(0, Math.min(25, Number.isFinite(maxDegRaw) ? maxDegRaw : 0))
  if (maxDeg <= 0) return { rotation: 0, tiltX: 0, tiltY: 0 }

  // Deterministic: compute a smoothed velocity using a fixed, finite impulse response
  // filter over raw interpolated positions (no previous-frame dependency).
  //
  // This is important for parallel/out-of-order export: multiple threads get the same
  // rotation for the same timestamp.
  //
  // NOTE: We intentionally avoid calling history-based smoothing here for performance.

  const fps = clampRenderFps(renderFps)
  const dtMs = 1000 / fps
  const dtSec = dtMs / 1000

  // Wider window + slower decay for smoother, more cinematic tilt response
  // Prevents jerky snapping on fast direction changes
  const windowMs = 400  // was 280ms - wider for more stability
  const sampleCount = Math.max(8, Math.min(18, Math.round(windowMs / dtMs)))

  const tauMs = 200 // was 120ms - slower decay for gentler response

  let sumW = 0
  let sumVx = 0
  let sumVy = 0

  for (let i = 0; i < sampleCount; i++) {
    const t0 = timestamp - i * dtMs
    const t1 = timestamp - (i + 1) * dtMs

    const p0 = interpolateMousePosition(mouseEvents, t0) || position
    const p1 = interpolateMousePosition(mouseEvents, t1) || p0

    const vx = (p0.x - p1.x) / dtSec
    const vy = (p0.y - p1.y) / dtSec

    const w = Math.exp(-(i * dtMs) / tauMs)
    sumW += w
    sumVx += w * vx
    sumVy += w * vy
  }

  if (sumW <= 0) return { rotation: 0, tiltX: 0, tiltY: 0 }

  const vxHat = sumVx / sumW
  const vyHat = sumVy / sumW
  const speedPxPerSec = Math.sqrt(vxHat * vxHat + vyHat * vyHat)

  // Higher deadzone threshold to ignore micro-movements and reduce jitter
  // Smoother ramp for gradual tilt engagement
  const speed01Raw = clamp01((speedPxPerSec - 60) / 700)  // was 40/600
  const speed01Smooth = speed01Raw * speed01Raw * (3 - 2 * speed01Raw) // smoothstep
  const speed01 = clamp01(speed01Smooth * 1.1) // slightly more dynamic response

  // Smooth direction mapping; avoids sign flip jitter on tiny vx.
  const direction = Math.tanh(vxHat / 900)

  // Normalize for 360° tilt direction (all angles).
  const invSpeed = speedPxPerSec > 1e-6 ? (1 / speedPxPerSec) : 0
  const ux = vxHat * invSpeed
  const uy = vyHat * invSpeed

  // Point towards travel direction: cursor leans into the direction of movement.
  // rotateX responds to vertical travel; rotateY responds to horizontal travel.
  const tiltX = maxDeg * speed01 * Math.tanh(uy / 0.85)
  const tiltY = maxDeg * speed01 * Math.tanh(ux / 0.85)

  // Small in-plane roll adds a subtle "snap" in the direction of movement.
  const rotation = maxDeg * 0.25 * speed01 * direction

  return { rotation, tiltX, tiltY }
}

/**
 * Apply smoothing filter - Simulates original stateful smoothing but stateless
 * Works by simulating frame-by-frame exponential smoothing lookback
 */
function smoothCursorPosition(
  mouseEvents: MouseEvent[],
  timestamp: number,
  rawPosition: { x: number; y: number },
  cursorData: CursorEffectData,
  renderFps?: number,
  disableHistorySmoothing?: boolean
): { position: { x: number; y: number } } {
  // If gliding is disabled, return the raw interpolated position
  if (!cursorData.gliding) {
    return { position: rawPosition }
  }

  if (disableHistorySmoothing) {
    // Export/perf mode: avoid expensive history simulation when frames render out of order.
    return { position: rawPosition }
  }

  // Deterministic smoothing using a short, time-based window.
  return smoothPositionWithHistory(mouseEvents, timestamp, rawPosition, cursorData, renderFps)
}

function smoothPositionWithHistory(
  mouseEvents: MouseEvent[],
  timestamp: number,
  rawPosition: { x: number; y: number },
  cursorData: CursorEffectData,
  renderFps?: number
): { position: { x: number; y: number } } {
  if (mouseEvents.length < 2) {
    return { position: rawPosition }
  }

  // PERF: Check cache first - key includes timestamp and smoothing params
  const cacheKey = CameraDataService.getSmoothingCacheKey(
    timestamp,
    cursorData.smoothness ?? DEFAULT_CURSOR_DATA.smoothness,
    cursorData.speed ?? DEFAULT_CURSOR_DATA.speed,
    cursorData.glide ?? DEFAULT_CURSOR_DATA.glide ?? 0.75,
    cursorData.smoothingJumpThreshold ?? DEFAULT_CURSOR_DATA.smoothingJumpThreshold ?? 0.9
  )
  const cached = CameraDataService.getSmoothingPosition(cacheKey)
  if (cached) {
    return { position: cached }
  }

  const historyWindowMs = computeHistoryWindowMs(cursorData)
  const fps = clampRenderFps(renderFps)
  const stepMs = Math.max(8, 1000 / fps)
  const sampleCount = Math.max(6, Math.min(16, Math.round(historyWindowMs / stepMs)))
  const tauMs = Math.max(120, historyWindowMs * 0.45)

  const smoothed = computeExponentialSmooth(
    mouseEvents,
    timestamp,
    rawPosition,
    stepMs,
    sampleCount,
    tauMs,
    cursorData
  )
  CameraDataService.setSmoothingPosition(cacheKey, smoothed)

  return { position: smoothed }
}

function sampleHistoricalPosition(
  mouseEvents: MouseEvent[],
  timestamp: number,
  fallback: { x: number; y: number },
  lookbackMs: number
): { x: number; y: number } {
  if (lookbackMs <= 0) {
    return fallback
  }

  const sampleTime = timestamp - lookbackMs
  if (sampleTime <= mouseEvents[0].timestamp) {
    return fallback
  }

  return interpolateMousePosition(mouseEvents, sampleTime) || fallback
}

function computeHistoryWindowMs(cursorData: CursorEffectData): number {
  const smoothness = clamp01(cursorData.smoothness ?? DEFAULT_CURSOR_DATA.smoothness)
  const speed = clamp01(cursorData.speed ?? DEFAULT_CURSOR_DATA.speed)
  const glide = clamp01(cursorData.glide ?? DEFAULT_CURSOR_DATA.glide ?? 0.75)

  const minWindow = 120
  const maxWindow = 420
  const baseWindow = minWindow + (maxWindow - minWindow) * smoothness
  const responsiveness = 0.55 + (1 - speed) * 0.4

  const glideFactor = lerp(0.85, 1.35, glide)

  return Math.max(90, baseWindow * responsiveness * glideFactor)
}

function getSmoothingJumpThreshold(mouseEvents: MouseEvent[], cursorData?: CursorEffectData): number {
  const first = mouseEvents[0]
  const width = first?.captureWidth || first?.screenWidth || 1920
  const height = first?.captureHeight || first?.screenHeight || 1080
  const diagonal = Math.sqrt(width * width + height * height)
  const ratioRaw = cursorData?.smoothingJumpThreshold ?? DEFAULT_CURSOR_DATA.smoothingJumpThreshold ?? 0.9
  const ratio = clamp(ratioRaw, 0.4, 1.6)
  return Math.max(1200, diagonal * ratio)
}

// clamp01 is now imported from @/lib/core/math

// clampNumber removed in favor of standard clamp function

// easeOutCubic is now imported from @/lib/core/math and re-exported for backwards compatibility
export { easeOutCubic }

function normalizeClickWords(words: string[]): string[] {
  const sanitized = words
    .map((word) => word.trim())
    .filter((word) => word.length > 0)

  return sanitized.length > 0 ? sanitized : ['click!']
}

function shouldShowClickText(config: ResolvedClickEffectConfig): boolean {
  return config.style === 'text' || config.style === 'ripple-text'
}

function pickClickWord(index: number, timestamp: number, config: ResolvedClickEffectConfig): string {
  if (config.textMode === 'single') {
    return config.textWords[0]
  }

  if (config.textMode === 'sequence') {
    return config.textWords[index % config.textWords.length]
  }

  const seed = Math.abs(Math.floor(timestamp) + index * 997)
  return config.textWords[seed % config.textWords.length]
}

function clampRenderFps(renderFps?: number): number {
  if (!renderFps || !Number.isFinite(renderFps)) {
    return 60
  }
  return Math.max(15, Math.min(120, renderFps))
}

/**
 * Find the last mouse movement before a timestamp
 * PERF: Uses binary search O(log n) instead of filter+sort O(n log n)
 */
function findLastMovement(
  mouseEvents: MouseEvent[],
  timestamp: number
): MouseEvent | null {
  if (!mouseEvents || mouseEvents.length === 0) return null

  // Binary search for the last event at or before timestamp
  let low = 0, high = mouseEvents.length - 1
  let startIdx = -1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (mouseEvents[mid].timestamp <= timestamp) {
      startIdx = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  if (startIdx < 0) return null

  // Scan backwards for last actual movement (position change)
  for (let i = startIdx; i > 0; i--) {
    const current = mouseEvents[i]
    const previous = mouseEvents[i - 1]
    if (current.x !== previous.x || current.y !== previous.y) {
      return current
    }
  }

  return mouseEvents[0]
}

/**
 * Calculate active click effects
 * Matches original CursorLayer timing: 300ms duration, 200ms animation
 * PERF: Uses binary search to find relevant window instead of filtering entire array
 */
function calculateClickEffects(
  clickEvents: ClickEvent[],
  timestamp: number,
  cursorData: CursorEffectData
): ClickEffect[] {
  const config = resolveClickEffectConfig(cursorData)
  const effectDuration = config.durationMs
  const maxRadius = config.maxRadius

  if (!clickEvents || clickEvents.length === 0) return []

  // Binary search for first potentially active click (timestamp >= minTime)
  const minTime = timestamp - effectDuration
  let low = 0, high = clickEvents.length - 1
  let startIdx = clickEvents.length
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (clickEvents[mid].timestamp >= minTime) {
      startIdx = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  // Only process clicks in the active window
  const activeClicks: ClickEffect[] = []
  for (let i = startIdx; i < clickEvents.length; i++) {
    const click = clickEvents[i]
    if (click.timestamp > timestamp) break // Future clicks

    const age = timestamp - click.timestamp
    if (age >= 0 && age < effectDuration) {
      const progress = Math.min(1, age / effectDuration)
      const easedProgress = easeOutCubic(progress)
      const baseRadius = Math.max(4, maxRadius * 0.2)

      let radius = baseRadius + easedProgress * maxRadius
      let opacity = Math.max(0, 1 - progress) * 0.5

      if (config.animation === 'pulse') {
        const pulse = Math.sin(progress * Math.PI)
        radius = baseRadius + pulse * maxRadius
        opacity = Math.max(0, pulse) * 0.5
      }

      const word = shouldShowClickText(config)
        ? pickClickWord(i, click.timestamp, config)
        : undefined

      activeClicks.push({
        x: click.x,
        y: click.y,
        timestamp: click.timestamp,
        progress,
        radius,
        opacity,
        word
      })
    }
  }

  return activeClicks
}

function computeExponentialSmooth(
  mouseEvents: MouseEvent[],
  timestamp: number,
  fallback: { x: number; y: number },
  stepMs: number,
  sampleCount: number,
  tauMs: number,
  cursorData?: CursorEffectData
): { x: number; y: number } {
  const jumpThreshold = getSmoothingJumpThreshold(mouseEvents, cursorData)
  const previousSample = interpolateMousePosition(mouseEvents, timestamp - stepMs)
  if (previousSample) {
    const dx = fallback.x - previousSample.x
    const dy = fallback.y - previousSample.y
    if (Math.hypot(dx, dy) > jumpThreshold) {
      return fallback
    }
  }

  let sumX = 0
  let sumY = 0
  let sumW = 0

  for (let i = 0; i <= sampleCount; i++) {
    const t = timestamp - i * stepMs
    const pos = interpolateMousePosition(mouseEvents, t)
    if (!pos) continue

    const w = Math.exp(-(i * stepMs) / tauMs)
    sumW += w
    sumX += pos.x * w
    sumY += pos.y * w
  }

  if (sumW === 0) {
    return fallback
  }

  return { x: sumX / sumW, y: sumY / sumW }
}

/**
 * Get cursor drawing properties for canvas rendering
 */
export function getCursorDrawingProps(
  state: CursorState,
  style: CursorStyle
): {
  shape: 'arrow' | 'circle' | 'cross' | 'hand'
  color: string
  size: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
} {
  const baseSize = 12 * state.scale

  // Determine shape based on style and type
  let shape: 'arrow' | 'circle' | 'cross' | 'hand' = 'arrow'
  if (style === CursorStyle.Custom) {
    shape = 'circle'
  } else if (state.type === CursorType.POINTING_HAND || state.type === CursorType.OPEN_HAND) {
    shape = 'hand'
  } else if (state.type === CursorType.CROSSHAIR) {
    shape = 'cross'
  }

  // Colors based on style
  const color = style === CursorStyle.Custom ? '#ffffff' : '#ffffff'

  return {
    shape,
    color,
    size: baseSize,
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowBlur: 4 * state.scale,
    shadowOffsetX: 1 * state.scale,
    shadowOffsetY: 2 * state.scale
  }
}

/**
 * Calculate cursor path for canvas drawing
 */
export function getCursorPath(
  x: number,
  y: number,
  type: CursorType,
  scale: number
): Path2D {
  const path = new Path2D()

  switch (type) {
    case CursorType.ARROW:
    default:
      // macOS-style arrow cursor
      path.moveTo(x, y)
      path.lineTo(x + 12 * scale, y + 12 * scale)
      path.lineTo(x + 5 * scale, y + 12 * scale)
      path.lineTo(x + 7 * scale, y + 17 * scale)
      path.lineTo(x + 4 * scale, y + 18 * scale)
      path.lineTo(x + 2 * scale, y + 13 * scale)
      path.lineTo(x, y + 15 * scale)
      path.closePath()
      break

    case CursorType.POINTING_HAND:
    case CursorType.OPEN_HAND:
      // Hand/pointer cursor
      path.moveTo(x + 5 * scale, y)
      path.lineTo(x + 5 * scale, y + 8 * scale)
      path.lineTo(x + 2 * scale, y + 8 * scale)
      path.lineTo(x + 2 * scale, y + 12 * scale)
      path.lineTo(x + 8 * scale, y + 12 * scale)
      path.lineTo(x + 8 * scale, y + 8 * scale)
      path.lineTo(x + 10 * scale, y + 8 * scale)
      path.lineTo(x + 10 * scale, y + 14 * scale)
      path.lineTo(x, y + 14 * scale)
      path.lineTo(x, y + 6 * scale)
      path.closePath()
      break

    case CursorType.CROSSHAIR:
      // Crosshair cursor
      const size = 10 * scale
      path.moveTo(x - size, y)
      path.lineTo(x + size, y)
      path.moveTo(x, y - size)
      path.lineTo(x, y + size)
      break
  }

  return path
}

/**
 * Calculate motion blur trail points
 */
export function getMotionBlurTrail(
  currentX: number,
  currentY: number,
  previousX: number,
  previousY: number,
  velocity: number
): Array<{ x: number; y: number; opacity: number }> {
  const trail: Array<{ x: number; y: number; opacity: number }> = []

  // Number of trail points based on velocity
  const trailCount = Math.min(5, Math.floor(velocity / 10))

  for (let i = 1; i <= trailCount; i++) {
    const t = i / (trailCount + 1)
    trail.push({
      x: previousX + (currentX - previousX) * t,
      y: previousY + (currentY - previousY) * t,
      opacity: (1 - t) * 0.3
    })
  }

  return trail
}
