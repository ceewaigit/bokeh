/**
 * Service for tracking mouse, keyboard, and scroll events during recording.
 * Manages event collection, batching, and persistence to metadata files.
 */

import type { ElectronMetadata } from '@/types/recording'
import { RecordingIpcBridge, getRecordingBridge } from '@/features/core/bridges'
import { logger } from '@/shared/utils/logger'
import { isLikelyKeyboardKey } from '@/features/core/keyboard/keyboard-utils'

interface CaptureArea {
  fullBounds?: { x: number; y: number; width: number; height: number }
  scaleFactor?: number
}

interface MouseEventData {
  x: number
  y: number
  velocity?: { x: number; y: number }
  cursorType?: string
  logicalX?: number
  logicalY?: number
  displayBounds?: { x: number; y: number; width: number; height: number }
  scaleFactor?: number
}

interface ClickEventData extends MouseEventData {
  button: string
}

interface KeyboardEventData {
  key: string
  type: 'keydown' | 'keyup'
  modifiers?: string[]
}

interface ScrollEventData {
  deltaX?: number
  deltaY?: number
}

export class TrackingService {
  private bridge: RecordingIpcBridge
  private metadata: ElectronMetadata[] = []
  private metadataPath: string | null = null
  private persistMetadataToFile = false
  private writeQueue: ElectronMetadata[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private startTime = 0
  private isActive = false
  private isPaused = false
  private captureArea: CaptureArea | null = null
  private captureWidth = 0
  private captureHeight = 0
  private pauseStartTime = 0
  private totalPausedDuration = 0
  private lastEventTimestamp = -1

  // Event listener cleanup functions
  private mouseCleanup: (() => void) | null = null
  private clickCleanup: (() => void) | null = null
  private scrollCleanup: (() => void) | null = null
  private keyboardCleanup: (() => void) | null = null

  constructor(bridge?: RecordingIpcBridge) {
    this.bridge = bridge ?? getRecordingBridge()
  }

  /**
   * Starts tracking mouse, keyboard, and scroll events.
   * @param sourceId - The recording source ID
   * @param captureArea - The capture area bounds and scale factor
   */
  async start(
    sourceId: string,
    captureArea?: CaptureArea,
    captureWidth?: number,
    captureHeight?: number
  ): Promise<void> {
    if (this.isActive) {
      logger.warn('[TrackingService] Already active')
      return
    }

    this.startTime = Date.now()
    this.isPaused = false
    this.metadata = []
    this.writeQueue = []
    this.totalPausedDuration = 0
    this.lastEventTimestamp = -1
    this.persistMetadataToFile = false
    this.captureArea = captureArea || null
    this.captureWidth = captureWidth || 0
    this.captureHeight = captureHeight || 0

    try {
      const result = await this.bridge.createMetadataFile()
      if (result?.success && result.data) {
        this.metadataPath = result.data
        this.persistMetadataToFile = true
        logger.info(`[TrackingService] Metadata file: ${this.metadataPath}`)
      }

      this.isActive = true
      await this.startMouseTracking(sourceId)
      await this.startKeyboardTracking()

      logger.info('[TrackingService] Started')
    } catch (error) {
      this.mouseCleanup?.()
      this.clickCleanup?.()
      this.scrollCleanup?.()
      this.keyboardCleanup?.()
      this.mouseCleanup = null
      this.clickCleanup = null
      this.scrollCleanup = null
      this.keyboardCleanup = null
      this.isActive = false
      this.isPaused = false
      this.metadataPath = null
      throw error
    }
  }

  /**
   * Stops tracking and returns all collected metadata.
   */
  async stop(): Promise<ElectronMetadata[]> {
    if (!this.isActive) {
      return []
    }

    this.isActive = false
    this.isPaused = false

    // Stop native tracking
    await this.bridge.stopMouseTracking().catch(() => { })
    await this.bridge.stopKeyboardTracking().catch(() => { })

    // Clean up event listeners
    this.mouseCleanup?.()
    this.clickCleanup?.()
    this.scrollCleanup?.()
    this.keyboardCleanup?.()
    this.mouseCleanup = null
    this.clickCleanup = null
    this.scrollCleanup = null
    this.keyboardCleanup = null

    // Flush remaining metadata
    await this.flush(true).catch(() => { })

    // Read persisted metadata if available (more complete than in-memory)
    if (this.metadataPath) {
      const result = await this.bridge.readMetadataFile(this.metadataPath)
      if (result?.success && result.data) {
        logger.info(`[TrackingService] Loaded ${(result.data as unknown[]).length} events from file`)
        return result.data as ElectronMetadata[]
      }
    }

    logger.info(`[TrackingService] Returning ${this.metadata.length} in-memory events`)
    return this.metadata
  }

  /**
   * Pauses tracking (events are ignored while paused).
   */
  pause(): void {
    if (!this.isActive || this.isPaused) return
    this.isPaused = true
    this.pauseStartTime = Date.now()
    logger.info('[TrackingService] Paused')
  }

  /**
   * Resumes tracking after pause.
   */
  resume(): void {
    if (!this.isActive || !this.isPaused) return
    const pausedDuration = Date.now() - this.pauseStartTime
    this.totalPausedDuration += pausedDuration
    this.isPaused = false
    this.pauseStartTime = 0
    logger.info(`[TrackingService] Resumed. Paused for ${pausedDuration}ms`)
  }

  /**
   * Gets the adjusted timestamp (accounting for pauses).
   */
  private getAdjustedTimestamp(): number {
    const rawTimestamp = Date.now() - this.startTime
    return rawTimestamp - this.totalPausedDuration
  }

  /**
   * Converts absolute screen coordinates to capture-relative coordinates.
   */
  private toCaptureRelative(x: number, y: number): { rx: number; ry: number; inside: boolean } {
    // Electron's cursor coordinates are in DIP ("points") in a global coordinate space.
    // Convert to capture-relative physical pixels using the capture area's fixed scale factor,
    // which matches the captured video resolution on high-DPI displays.
    const scale = this.captureArea?.scaleFactor || 1
    const bounds = this.captureArea?.fullBounds

    if (!bounds) {
      return { rx: x * scale, ry: y * scale, inside: true }
    }

    const rxDip = x - bounds.x
    const ryDip = y - bounds.y
    const inside = rxDip >= 0 && ryDip >= 0 && rxDip < bounds.width && ryDip < bounds.height

    const rx = rxDip * scale
    const ry = ryDip * scale

    return { rx, ry, inside }
  }

  /**
   * Adds a metadata event to the queue.
   */
  private addEvent(event: Partial<ElectronMetadata>): void {
    if (!this.isActive || this.isPaused) return

    // Ensure timestamps are monotonic (Date.now() can repeat within the same ms),
    // which prevents interpolation glitches and cursor "jitter" on high-frequency sampling.
    const rawTimestamp = this.getAdjustedTimestamp()
    const timestamp = rawTimestamp <= this.lastEventTimestamp
      ? this.lastEventTimestamp + 1
      : rawTimestamp
    this.lastEventTimestamp = timestamp

    const fullEvent: ElectronMetadata = {
      timestamp,
      ...event
    } as ElectronMetadata

    if (!this.persistMetadataToFile) {
      this.metadata.push(fullEvent)
    }
    this.writeQueue.push(fullEvent)

    this.scheduleFlush()
  }

  /**
   * Schedules a flush of the write queue.
   */
  private scheduleFlush(): void {
    if (this.writeQueue.length >= 100) {
      this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 1000)
    }
  }

  /**
   * Flushes the write queue to the metadata file.
   */
  private async flush(isLast = false): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    if (this.writeQueue.length === 0) return

    if (this.metadataPath) {
      try {
        await this.bridge.appendMetadataBatch(
          this.metadataPath,
          this.writeQueue,
          isLast
        )
      } catch (err) {
        logger.error('[TrackingService] Flush failed:', err)
      }
    }

    this.writeQueue = []
  }

  /**
   * Starts mouse tracking via IPC.
   */
  private async startMouseTracking(sourceId: string): Promise<void> {
    // Mouse move handler
    this.mouseCleanup = this.bridge.onMouseMove((data: unknown) => {
      const d = data as MouseEventData
      const { rx, ry, inside } = this.toCaptureRelative(Number(d.x), Number(d.y))
      if (!inside) return

      this.addEvent({
        eventType: 'mouse',
        mouseX: rx,
        mouseY: ry,
        velocity: d.velocity,
        cursorType: d.cursorType,
        scaleFactor: this.captureArea?.scaleFactor,
        captureWidth: this.captureWidth,
        captureHeight: this.captureHeight,
        screenWidth: d.displayBounds?.width && d.scaleFactor ? d.displayBounds.width * d.scaleFactor : undefined,
        screenHeight: d.displayBounds?.height && d.scaleFactor ? d.displayBounds.height * d.scaleFactor : undefined,
        logicalX: d.logicalX,
        logicalY: d.logicalY
      })
    })

    // Mouse click handler
    this.clickCleanup = this.bridge.onMouseClick((data: unknown) => {
      const d = data as ClickEventData
      const { rx, ry, inside } = this.toCaptureRelative(Number(d.x), Number(d.y))
      if (!inside) return

      this.addEvent({
        eventType: 'click',
        mouseX: rx,
        mouseY: ry,
        key: d.button,
        cursorType: d.cursorType,
        scaleFactor: this.captureArea?.scaleFactor,
        captureWidth: this.captureWidth,
        captureHeight: this.captureHeight,
        screenWidth: d.displayBounds?.width && d.scaleFactor ? d.displayBounds.width * d.scaleFactor : undefined,
        screenHeight: d.displayBounds?.height && d.scaleFactor ? d.displayBounds.height * d.scaleFactor : undefined,
        logicalX: d.logicalX,
        logicalY: d.logicalY
      })
    })

    // Scroll handler
    this.scrollCleanup = this.bridge.onScroll((data: unknown) => {
      const d = data as ScrollEventData
      this.addEvent({
        eventType: 'scroll',
        scrollDelta: { x: d.deltaX || 0, y: d.deltaY || 0 },
        captureWidth: this.captureWidth,
        captureHeight: this.captureHeight
      })
    })

    // Start tracking in main process
    const sourceType = sourceId.startsWith('screen:') ? 'screen' : sourceId.startsWith('area:') ? 'area' : 'window'
    const result = await this.bridge.startMouseTracking({
      // Higher sampling reduces visible cursor stepping/jitter, especially on high-DPI displays.
      intervalMs: 16,
      sourceId,
      sourceType
    })

    if (!result.success) {
      throw new Error(`Failed to start mouse tracking: ${result.error}`)
    }

    logger.info(`[TrackingService] Mouse tracking started at ${result.fps}fps`)
  }

  /**
   * Starts keyboard tracking via IPC.
   */
  private async startKeyboardTracking(): Promise<void> {
    this.keyboardCleanup = this.bridge.onKeyboardEvent((data: unknown) => {
      const d = data as Partial<KeyboardEventData> | null
      if (!d || typeof d !== 'object') return
      if (d.type !== 'keydown' && d.type !== 'keyup') return
      if (typeof d.key !== 'string' || d.key.length === 0) return
      if (!isLikelyKeyboardKey(d.key)) return

      this.addEvent({
        eventType: 'keypress',
        key: d.key,
        modifiers: Array.isArray(d.modifiers) ? d.modifiers : [],
        keyEventType: d.type
      })
    })

    await this.bridge.startKeyboardTracking()
    logger.info('[TrackingService] Keyboard tracking started')
  }
}
