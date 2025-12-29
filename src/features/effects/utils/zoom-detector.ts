/**
 * Zoom Detection for Remotion - Apple Commercial Style
 * Analyzes user actions (clicks, typing, scrolls) to generate intelligent zoom blocks
 * Uses action-point scoring to create deliberate, purposeful zooms like Apple product demos
 */

import type { MouseEvent, ZoomBlock, ClickEvent, KeyboardEvent as ProjectKeyboardEvent, ScrollEvent } from '@/types/project'
import { ACTION_ZOOM_CONFIG, ZOOM_DETECTION_CONFIG } from '@/features/effects/config/physics-config'

// Types for action-based detection
interface ActionPoint {
  timestamp: number
  x: number
  y: number
  type: 'click' | 'typing-start' | 'scroll-stop' | 'dwell'
  importance: number
  duration?: number
}

interface ActionCluster {
  actions: ActionPoint[]
  startTime: number
  endTime: number
  maxImportance: number
  center: { x: number; y: number }
}

// Legacy interface for backward compatibility
interface MouseCluster {
  events: MouseEvent[]
  startTime: number
  endTime: number
  center: { x: number; y: number }
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
  density: number
  stability: number
}

export class ZoomDetector {
  // Legacy config (kept for backward compatibility)
  private readonly MIN_CLUSTER_TIME = ZOOM_DETECTION_CONFIG.minClusterTime
  private readonly MAX_CLUSTER_SIZE = ZOOM_DETECTION_CONFIG.maxClusterSize
  private readonly MIN_CLUSTER_EVENTS = ZOOM_DETECTION_CONFIG.minClusterEvents
  private readonly CLUSTER_TIME_WINDOW = ZOOM_DETECTION_CONFIG.clusterTimeWindow
  private readonly CLUSTER_MERGE_DISTANCE = ZOOM_DETECTION_CONFIG.clusterMergeDistance
  private readonly MIN_ZOOM_DURATION = ZOOM_DETECTION_CONFIG.minDuration
  private readonly MAX_ZOOM_DURATION = ZOOM_DETECTION_CONFIG.maxDuration
  private readonly MOVEMENT_THRESHOLD = ZOOM_DETECTION_CONFIG.movementThreshold
  private readonly VELOCITY_WEIGHT = ZOOM_DETECTION_CONFIG.velocityWeight
  private readonly MIN_DENSITY = ZOOM_DETECTION_CONFIG.minDensity
  private readonly MIN_STABILITY = ZOOM_DETECTION_CONFIG.minStability

  // Action-based zoom config
  private readonly ACTION = ACTION_ZOOM_CONFIG

  /**
   * Main detection method - Action-Based Smart Zoom
   * Uses action-based detection when click/keyboard events are available,
   * falls back to legacy dwell-based detection for recordings without event data
   * @param runtimeConfig Optional config overrides from UI (maxZoomsPerMinute, minZoomGapMs)
   */
  detectZoomBlocks(
    mouseEvents: MouseEvent[],
    videoWidth: number,
    videoHeight: number,
    duration: number,
    clickEvents?: ClickEvent[],
    keyboardEvents?: ProjectKeyboardEvent[],
    scrollEvents?: ScrollEvent[],
    runtimeConfig?: { maxZoomsPerMinute?: number; minZoomGapMs?: number }
  ): ZoomBlock[] {
    // Use screen dimensions from events
    const screenWidth = mouseEvents[0]?.screenWidth || videoWidth
    const screenHeight = mouseEvents[0]?.screenHeight || videoHeight

    // Merge runtime config with defaults
    const effectiveConfig = {
      maxZoomsPerMinute: runtimeConfig?.maxZoomsPerMinute ?? this.ACTION.maxZoomsPerMinute,
      minZoomGapMs: runtimeConfig?.minZoomGapMs ?? this.ACTION.minZoomGapMs
    }

    // If we have click events, use action-based detection
    if (clickEvents && clickEvents.length > 0) {
      return this.detectActionBasedZooms(
        mouseEvents,
        clickEvents,
        keyboardEvents || [],
        scrollEvents || [],
        screenWidth,
        screenHeight,
        duration,
        effectiveConfig
      )
    }

    // Fallback to legacy dwell-based detection
    return this.detectLegacyZoomBlocks(mouseEvents, screenWidth, screenHeight, duration)
  }

  /**
   * Action-based zoom detection based on user actions
   */
  private detectActionBasedZooms(
    mouseEvents: MouseEvent[],
    clickEvents: ClickEvent[],
    keyboardEvents: ProjectKeyboardEvent[],
    scrollEvents: ScrollEvent[],
    screenWidth: number,
    screenHeight: number,
    duration: number,
    config: { maxZoomsPerMinute: number; minZoomGapMs: number }
  ): ZoomBlock[] {
    // Step 1: Extract action points from all event types
    const actionPoints = this.extractActionPoints(
      mouseEvents,
      clickEvents,
      keyboardEvents,
      scrollEvents,
      screenWidth,
      screenHeight
    )

    if (actionPoints.length === 0) {
      return this.detectLegacyZoomBlocks(mouseEvents, screenWidth, screenHeight, duration)
    }

    // Step 2: Filter by minimum importance
    const significantActions = actionPoints.filter(
      a => a.importance >= this.ACTION.minImportanceThreshold
    )

    if (significantActions.length === 0) {
      return this.detectLegacyZoomBlocks(mouseEvents, screenWidth, screenHeight, duration)
    }

    // Step 3: Cluster nearby actions
    const clusters = this.clusterActionPoints(significantActions, screenWidth, screenHeight)

    // Step 4: Apply zoom frequency limiting (using runtime config)
    const maxZooms = Math.ceil((duration / 60000) * config.maxZoomsPerMinute)
    const limitedClusters = this.limitZoomFrequency(clusters, maxZooms)

    // Step 5: Generate zoom blocks with activity-aware duration
    // Pass keyboard events so we can extend hold through typing activity
    const zoomBlocks = limitedClusters.map(cluster =>
      this.createZoomBlock(cluster, screenWidth, screenHeight, duration, keyboardEvents, mouseEvents)
    )

    // Step 6: Ensure minimum gap between zooms (using runtime config)
    return this.enforceMinimumGap(zoomBlocks, config.minZoomGapMs)
  }

  /**
   * Extract action points from all event types with importance scoring
   */
  private extractActionPoints(
    mouseEvents: MouseEvent[],
    clickEvents: ClickEvent[],
    keyboardEvents: ProjectKeyboardEvent[],
    scrollEvents: ScrollEvent[],
    screenWidth: number,
    screenHeight: number
  ): ActionPoint[] {
    const actions: ActionPoint[] = []
    let lastClickTime = -Infinity
    let isFirstTypingBurst = true

    // Process clicks - highest priority actions
    for (let i = 0; i < clickEvents.length; i++) {
      const click = clickEvents[i]
      let importance = this.ACTION.clickImportanceBase

      // Bonus for click after pause (deliberate action)
      const mouseActivity = this.getMouseActivityBefore(mouseEvents, click.timestamp, this.ACTION.pauseBeforeClickMs)
      if (mouseActivity < 0.3) {
        importance += this.ACTION.clickAfterPauseBonus
      }

      // Bonus for click in new area
      if (i > 0) {
        const prevClick = clickEvents[i - 1]
        const distance = this.calculateDistance(
          click.x, click.y,
          prevClick.x, prevClick.y,
          screenWidth, screenHeight
        )
        if (distance > this.ACTION.newAreaThreshold) {
          importance += this.ACTION.clickNewAreaBonus
        }
      }

      actions.push({
        timestamp: click.timestamp,
        x: click.x,
        y: click.y,
        type: 'click',
        importance: Math.min(1, importance)
      })

      lastClickTime = click.timestamp
    }

    // Process keyboard events - detect typing bursts
    const typingBursts = this.detectTypingBursts(keyboardEvents)
    for (const burst of typingBursts) {
      let importance = this.ACTION.typingImportanceBase

      // Bonus for first typing burst
      if (isFirstTypingBurst) {
        importance += this.ACTION.typingFirstBurstBonus
        isFirstTypingBurst = false
      }

      // Bonus for typing after click
      if (burst.startTime - lastClickTime < 2000) {
        importance += this.ACTION.typingAfterClickBonus
      }

      // Get mouse position at typing start
      const mousePos = this.getMousePositionAt(mouseEvents, burst.startTime)

      actions.push({
        timestamp: burst.startTime,
        x: mousePos.x,
        y: mousePos.y,
        type: 'typing-start',
        importance: Math.min(1, importance),
        duration: burst.endTime - burst.startTime
      })
    }

    // Process scroll events - detect scroll stops
    const scrollStops = this.detectScrollStops(scrollEvents)
    for (const stop of scrollStops) {
      let importance = this.ACTION.scrollStopImportanceBase

      // Bonus for significant scroll distance
      if (stop.totalDistance > 500) {
        importance += this.ACTION.scrollDistanceBonus
      }

      // Get mouse position at scroll stop
      const mousePos = this.getMousePositionAt(mouseEvents, stop.timestamp)

      actions.push({
        timestamp: stop.timestamp,
        x: mousePos.x,
        y: mousePos.y,
        type: 'scroll-stop',
        importance: Math.min(1, importance)
      })
    }

    // Sort by timestamp
    actions.sort((a, b) => a.timestamp - b.timestamp)

    return actions
  }

  /**
   * Detect typing bursts from keyboard events
   */
  private detectTypingBursts(
    keyboardEvents: ProjectKeyboardEvent[]
  ): Array<{ startTime: number; endTime: number; keyCount: number }> {
    const bursts: Array<{ startTime: number; endTime: number; keyCount: number }> = []

    if (keyboardEvents.length < this.ACTION.minKeysInBurst) return bursts

    let burstStart = keyboardEvents[0].timestamp
    let burstEnd = burstStart
    let keyCount = 1

    for (let i = 1; i < keyboardEvents.length; i++) {
      const event = keyboardEvents[i]
      const gap = event.timestamp - burstEnd

      if (gap <= this.ACTION.typingBurstWindowMs) {
        // Continue burst
        burstEnd = event.timestamp
        keyCount++
      } else {
        // End current burst, start new one
        if (keyCount >= this.ACTION.minKeysInBurst) {
          bursts.push({ startTime: burstStart, endTime: burstEnd, keyCount })
        }
        burstStart = event.timestamp
        burstEnd = burstStart
        keyCount = 1
      }
    }

    // Don't forget last burst
    if (keyCount >= this.ACTION.minKeysInBurst) {
      bursts.push({ startTime: burstStart, endTime: burstEnd, keyCount })
    }

    return bursts
  }

  /**
   * Detect scroll stops (where user pauses after scrolling)
   */
  private detectScrollStops(
    scrollEvents: ScrollEvent[]
  ): Array<{ timestamp: number; totalDistance: number }> {
    const stops: Array<{ timestamp: number; totalDistance: number }> = []

    if (!scrollEvents || scrollEvents.length < 2) return stops

    let scrollStart = scrollEvents[0].timestamp
    let totalDistance = 0
    let lastScrollTime = scrollStart

    for (let i = 1; i < scrollEvents.length; i++) {
      const event = scrollEvents[i]
      const gap = event.timestamp - lastScrollTime

      totalDistance += Math.abs(event.deltaY) + Math.abs(event.deltaX)

      if (gap > 500) {
        // Gap in scrolling = scroll stop
        if (totalDistance > 100) {
          stops.push({ timestamp: lastScrollTime, totalDistance })
        }
        scrollStart = event.timestamp
        totalDistance = 0
      }

      lastScrollTime = event.timestamp
    }

    return stops
  }

  /**
   * Cluster nearby action points
   */
  private clusterActionPoints(
    actions: ActionPoint[],
    screenWidth: number,
    screenHeight: number
  ): ActionCluster[] {
    const clusters: ActionCluster[] = []

    for (const action of actions) {
      // Find existing cluster to join
      let addedToCluster = false

      for (const cluster of clusters) {
        const lastAction = cluster.actions[cluster.actions.length - 1]
        const timeDiff = action.timestamp - lastAction.timestamp
        const spatialDist = this.calculateDistance(
          action.x, action.y,
          cluster.center.x, cluster.center.y,
          screenWidth, screenHeight
        )

        // Can join if within time window and spatial proximity
        if (timeDiff <= this.ACTION.actionClusterWindowMs && spatialDist < 0.25) {
          cluster.actions.push(action)
          cluster.endTime = action.timestamp
          cluster.maxImportance = Math.max(cluster.maxImportance, action.importance)
          // Update center (weighted average)
          cluster.center = {
            x: (cluster.center.x * (cluster.actions.length - 1) + action.x) / cluster.actions.length,
            y: (cluster.center.y * (cluster.actions.length - 1) + action.y) / cluster.actions.length
          }
          addedToCluster = true
          break
        }
      }

      if (!addedToCluster) {
        clusters.push({
          actions: [action],
          startTime: action.timestamp,
          endTime: action.timestamp + (action.duration || 0),
          maxImportance: action.importance,
          center: { x: action.x, y: action.y }
        })
      }
    }

    return clusters
  }

  /**
   * Limit zoom frequency to prevent over-zooming
   */
  private limitZoomFrequency(clusters: ActionCluster[], maxZooms: number): ActionCluster[] {
    if (clusters.length <= maxZooms) return clusters

    // Sort by importance and take top N
    return clusters
      .sort((a, b) => b.maxImportance - a.maxImportance)
      .slice(0, maxZooms)
      .sort((a, b) => a.startTime - b.startTime)
  }

  /**
   * Create a zoom block from an action cluster
   */
  private createZoomBlock(
    cluster: ActionCluster,
    screenWidth: number,
    screenHeight: number,
    duration: number,
    keyboardEvents: ProjectKeyboardEvent[] = [],
    mouseEvents: MouseEvent[] = []
  ): ZoomBlock {
    const importance = cluster.maxImportance

    // Calculate zoom scale based on importance (more conservative range)
    const scaleRange = this.ACTION.maxZoomScale - this.ACTION.minZoomScale
    const normalizedImportance = (importance - this.ACTION.minImportanceThreshold) /
      (1 - this.ACTION.minImportanceThreshold)
    const scale = this.ACTION.minZoomScale + (scaleRange * Math.min(1, normalizedImportance))

    // Longer, smoother transitions for cinematic feel
    const introMs = 600  // Slow ease in
    const outroMs = 500  // Slow ease out

    // Calculate timing with anticipation
    const startTime = Math.max(0, cluster.startTime - this.ACTION.anticipationMs)

    // ACTIVITY-AWARE HOLD DURATION:
    // Extend the zoom if there's keyboard activity following the action cluster
    // This keeps the zoom on screen while user is typing in that area
    const baseHold = this.ACTION.minHoldMs

    // Find keyboard activity that follows the cluster start (within 10 seconds)
    const keyboardAfterCluster = keyboardEvents.filter(
      k => k.timestamp >= cluster.startTime && k.timestamp <= cluster.startTime + 10000
    )

    // If there's typing after the click, extend hold to cover it
    let activityExtension = 0
    if (keyboardAfterCluster.length > 3) {  // At least a few keystrokes
      const lastKeystroke = keyboardAfterCluster[keyboardAfterCluster.length - 1]
      activityExtension = Math.min(
        8000,  // Cap extension at 8 seconds
        lastKeystroke.timestamp - cluster.startTime + 1500  // Extend 1.5s past last keystroke
      )
    }

    // Also check for sustained mouse activity in the same area (indicating continued focus)
    const mouseInArea = mouseEvents.filter(m => {
      if (m.timestamp < cluster.startTime || m.timestamp > cluster.startTime + 10000) return false
      const dist = this.calculateDistance(m.x, m.y, cluster.center.x, cluster.center.y, screenWidth, screenHeight)
      return dist < 0.15  // Within 15% of screen from cluster center
    })

    if (mouseInArea.length > 20 && mouseInArea.length > keyboardAfterCluster.length * 2) {
      // Sustained mouse activity in area without much typing - extend hold
      const lastMouse = mouseInArea[mouseInArea.length - 1]
      activityExtension = Math.max(
        activityExtension,
        Math.min(6000, lastMouse.timestamp - cluster.startTime + 1000)
      )
    }

    const holdDuration = Math.max(baseHold, baseHold + activityExtension)

    const endTime = Math.min(
      duration - 100,
      cluster.startTime + holdDuration + outroMs
    )

    return {
      id: `zoom-action-${cluster.startTime}`,
      origin: 'auto',
      startTime,
      endTime,
      scale: Math.round(scale * 10) / 10,
      targetX: cluster.center.x,
      targetY: cluster.center.y,
      screenWidth,
      screenHeight,
      introMs,
      outroMs,
      importance
    }
  }

  /**
   * Enforce minimum gap between zoom blocks
   * @param minGapMs Minimum gap in milliseconds (from runtime config)
   */
  private enforceMinimumGap(blocks: ZoomBlock[], minGapMs: number = this.ACTION.minZoomGapMs): ZoomBlock[] {
    if (blocks.length < 2) return blocks

    const result: ZoomBlock[] = [blocks[0]]

    for (let i = 1; i < blocks.length; i++) {
      const prev = result[result.length - 1]
      const curr = blocks[i]

      const gap = curr.startTime - prev.endTime
      if (gap >= minGapMs) {
        result.push(curr)
      } else if (curr.scale > prev.scale) {
        // If current is more important, replace previous
        result[result.length - 1] = curr
      }
      // Otherwise skip this block
    }

    return result
  }

  // Helper methods

  private getMouseActivityBefore(
    mouseEvents: MouseEvent[],
    timestamp: number,
    windowMs: number
  ): number {
    const windowStart = timestamp - windowMs
    const eventsInWindow = mouseEvents.filter(
      e => e.timestamp >= windowStart && e.timestamp < timestamp
    )

    if (eventsInWindow.length < 2) return 0

    // Calculate total movement
    let totalMovement = 0
    for (let i = 1; i < eventsInWindow.length; i++) {
      const dx = eventsInWindow[i].x - eventsInWindow[i - 1].x
      const dy = eventsInWindow[i].y - eventsInWindow[i - 1].y
      totalMovement += Math.sqrt(dx * dx + dy * dy)
    }

    // Normalize to 0-1 range (100px movement = high activity)
    return Math.min(1, totalMovement / 100)
  }

  private getMousePositionAt(mouseEvents: MouseEvent[], timestamp: number): { x: number; y: number } {
    if (mouseEvents.length === 0) return { x: 0, y: 0 }

    // Binary search for closest event
    let left = 0
    let right = mouseEvents.length - 1

    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      if (mouseEvents[mid].timestamp < timestamp) {
        left = mid + 1
      } else {
        right = mid
      }
    }

    const event = mouseEvents[left]
    return { x: event.x, y: event.y }
  }

  private calculateDistance(
    x1: number, y1: number,
    x2: number, y2: number,
    screenWidth: number, screenHeight: number
  ): number {
    const dx = (x1 - x2) / screenWidth
    const dy = (y1 - y2) / screenHeight
    return Math.sqrt(dx * dx + dy * dy)
  }

  // ============================================================================
  // LEGACY METHODS - Fallback for recordings without click data
  // ============================================================================

  private detectLegacyZoomBlocks(
    mouseEvents: MouseEvent[],
    screenWidth: number,
    screenHeight: number,
    duration: number
  ): ZoomBlock[] {
    if (!mouseEvents || mouseEvents.length < this.MIN_CLUSTER_EVENTS) {
      return []
    }

    const clusters = this.detectMouseClusters(mouseEvents, screenWidth, screenHeight)

    if (clusters.length === 0) return []

    const zoomBlocks: ZoomBlock[] = []

    clusters.forEach(cluster => {
      const clusterDuration = cluster.endTime - cluster.startTime
      const normalizedWidth = cluster.boundingBox.width / screenWidth
      const normalizedHeight = cluster.boundingBox.height / screenHeight
      const clusterSize = Math.max(normalizedWidth, normalizedHeight)

      if (clusterSize > this.MAX_CLUSTER_SIZE || clusterDuration < this.MIN_CLUSTER_TIME) {
        return
      }

      let zoomScale = 1.5
      if (clusterSize < 0.08) {
        zoomScale = 2.5
      } else if (clusterSize < 0.12) {
        zoomScale = 2.0
      } else if (clusterSize < 0.16) {
        zoomScale = 1.75
      }

      const effectiveDuration = Math.min(
        clusterDuration + 1000,
        this.MAX_ZOOM_DURATION,
        duration - cluster.startTime - 500
      )

      if (effectiveDuration > this.MIN_ZOOM_DURATION) {
        zoomBlocks.push({
          id: `zoom-cluster-${cluster.startTime}`,
          origin: 'auto',
          startTime: cluster.startTime,
          endTime: cluster.startTime + effectiveDuration,
          introMs: 400,
          outroMs: 500,
          scale: zoomScale,
          targetX: cluster.center.x,
          targetY: cluster.center.y,
          screenWidth,
          screenHeight,
        })
      }
    })

    return this.mergeOverlappingZooms(zoomBlocks)
  }

  private detectMouseClusters(
    events: MouseEvent[],
    videoWidth: number,
    videoHeight: number
  ): MouseCluster[] {
    const clusters: MouseCluster[] = []
    let i = 0

    while (i < events.length) {
      const windowStart = events[i].timestamp
      const windowEnd = windowStart + this.CLUSTER_TIME_WINDOW
      const windowEvents: MouseEvent[] = []

      let j = i
      while (j < events.length && events[j].timestamp <= windowEnd) {
        windowEvents.push(events[j])
        j++
      }

      if (windowEvents.length >= this.MIN_CLUSTER_EVENTS) {
        const activityCenters = this.kMeansClustering(windowEvents, videoWidth, videoHeight)

        for (const center of activityCenters) {
          if (center.density > this.MIN_DENSITY && center.stability > this.MIN_STABILITY) {
            const shouldMerge = clusters.length > 0 &&
              this.shouldMergeWithPrevious(clusters[clusters.length - 1], center, videoWidth, videoHeight)

            if (shouldMerge) {
              this.mergeClusters(clusters[clusters.length - 1], center, videoWidth, videoHeight)
            } else {
              clusters.push(center)
            }
          }
        }

        if (activityCenters.length > 0) {
          i = j - Math.floor(this.MIN_CLUSTER_EVENTS / 2)
        }
      }

      i++
    }

    return clusters
  }

  private kMeansClustering(
    events: MouseEvent[],
    videoWidth: number,
    videoHeight: number,
    k: number = 2
  ): MouseCluster[] {
    if (events.length < k) {
      return [this.analyzeCluster(events, videoWidth, videoHeight)]
    }

    const centers: { x: number; y: number }[] = []
    centers.push({
      x: events[Math.floor(Math.random() * events.length)].x,
      y: events[Math.floor(Math.random() * events.length)].y
    })

    for (let c = 1; c < k; c++) {
      const distances = events.map(e => {
        let minDist = Infinity
        centers.forEach(center => {
          const dist = Math.sqrt(
            Math.pow(e.x - center.x, 2) + Math.pow(e.y - center.y, 2)
          )
          minDist = Math.min(minDist, dist)
        })
        return minDist
      })

      const sumDist = distances.reduce((a, b) => a + b, 0)
      let target = Math.random() * sumDist
      let idx = 0

      for (let i = 0; i < distances.length; i++) {
        target -= distances[i]
        if (target <= 0) {
          idx = i
          break
        }
      }

      centers.push({ x: events[idx].x, y: events[idx].y })
    }

    let clusters: MouseEvent[][] = []
    const maxIterations = 15

    for (let iter = 0; iter < maxIterations; iter++) {
      clusters = Array(k).fill(null).map(() => [])

      events.forEach(event => {
        let minDist = Infinity
        let assignedCluster = 0

        centers.forEach((center, idx) => {
          const dist = Math.sqrt(
            Math.pow(event.x - center.x, 2) +
            Math.pow(event.y - center.y, 2)
          )
          if (dist < minDist) {
            minDist = dist
            assignedCluster = idx
          }
        })

        clusters[assignedCluster].push(event)
      })

      let converged = true
      clusters.forEach((cluster, idx) => {
        if (cluster.length > 0) {
          const newX = cluster.reduce((sum, e) => sum + e.x, 0) / cluster.length
          const newY = cluster.reduce((sum, e) => sum + e.y, 0) / cluster.length

          if (Math.abs(newX - centers[idx].x) > 1 || Math.abs(newY - centers[idx].y) > 1) {
            converged = false
          }

          centers[idx] = { x: newX, y: newY }
        }
      })

      if (converged) break
    }

    return clusters
      .filter(cluster => cluster.length >= this.MIN_CLUSTER_EVENTS)
      .map(cluster => this.analyzeCluster(cluster, videoWidth, videoHeight))
  }

  private analyzeCluster(
    events: MouseEvent[],
    videoWidth: number,
    videoHeight: number
  ): MouseCluster {
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity

    events.forEach(event => {
      minX = Math.min(minX, event.x)
      maxX = Math.max(maxX, event.x)
      minY = Math.min(minY, event.y)
      maxY = Math.max(maxY, event.y)
    })

    const boundingBox = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }

    let weightedSumX = 0, weightedSumY = 0, totalWeight = 0
    events.forEach((event, idx) => {
      const weight = 1 + (idx / events.length) * this.VELOCITY_WEIGHT
      weightedSumX += event.x * weight
      weightedSumY += event.y * weight
      totalWeight += weight
    })

    const center = {
      x: weightedSumX / totalWeight,
      y: weightedSumY / totalWeight
    }

    const area = boundingBox.width * boundingBox.height
    const maxArea = videoWidth * videoHeight

    const normalizedWidth = boundingBox.width / videoWidth
    const normalizedHeight = boundingBox.height / videoHeight
    const maxDimension = Math.max(normalizedWidth, normalizedHeight)

    const density = maxDimension > 0.3 ? 0 : (1 - (area / maxArea))

    const timeSpan = events[events.length - 1].timestamp - events[0].timestamp
    const expectedEvents = timeSpan / 50
    const stability = Math.min(1, events.length / Math.max(1, expectedEvents))

    return {
      events,
      startTime: events[0].timestamp,
      endTime: events[events.length - 1].timestamp,
      center,
      boundingBox,
      density,
      stability
    }
  }

  private shouldMergeWithPrevious(
    previousCluster: MouseCluster,
    currentCluster: MouseCluster,
    videoWidth: number,
    videoHeight: number
  ): boolean {
    const dx = (currentCluster.center.x - previousCluster.center.x) / videoWidth
    const dy = (currentCluster.center.y - previousCluster.center.y) / videoHeight
    const spatialDistance = Math.sqrt(dx * dx + dy * dy)

    const timeDiff = currentCluster.startTime - previousCluster.endTime

    const isContinuation = timeDiff < 500 && spatialDistance < this.CLUSTER_MERGE_DISTANCE
    const isFollowingPath = timeDiff < 1000 && spatialDistance < this.MOVEMENT_THRESHOLD * 2

    return isContinuation || isFollowingPath
  }

  private mergeClusters(
    target: MouseCluster,
    source: MouseCluster,
    videoWidth: number,
    videoHeight: number
  ): void {
    target.events.push(...source.events)
    target.events.sort((a, b) => a.timestamp - b.timestamp)

    target.startTime = Math.min(target.startTime, source.startTime)
    target.endTime = Math.max(target.endTime, source.endTime)

    const merged = this.analyzeCluster(target.events, videoWidth, videoHeight)
    target.boundingBox = merged.boundingBox
    target.center = merged.center
    target.density = merged.density
    target.stability = merged.stability
  }

  private mergeOverlappingZooms(effects: ZoomBlock[]): ZoomBlock[] {
    if (effects.length < 2) return effects

    effects.sort((a, b) => a.startTime - b.startTime)

    const merged: ZoomBlock[] = []
    let current = effects[0]

    for (let i = 1; i < effects.length; i++) {
      const next = effects[i]

      if (current.endTime >= next.startTime - 500) {
        current.endTime = Math.max(current.endTime, next.endTime)
      } else {
        merged.push(current)
        current = next
      }
    }

    merged.push(current)
    return merged
  }
}
