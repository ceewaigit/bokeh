/**
 * Zoom Detection for Remotion - Apple Commercial Style
 * Analyzes user actions (clicks, typing, scrolls) to generate intelligent zoom blocks
 * Uses action-point scoring to create deliberate, purposeful zooms like Apple product demos
 */

import type { MouseEvent, ZoomBlock, ClickEvent, KeyboardEvent as ProjectKeyboardEvent, ScrollEvent } from '@/types/project'
import { ACTION_ZOOM_CONFIG, ZOOM_TRANSITION_CONFIG } from '@/shared/config/physics-config'

// Types for action-based detection
interface ActionPoint {
  timestamp: number
  x: number
  y: number
  type: 'click' | 'typing-start' | 'scroll-stop' | 'dwell'
  importance: number
  duration?: number
  /** Context for determining zoom depth */
  context?: 'typing' | 'deliberateClick' | 'clickCluster' | 'scrollStop' | 'default'
  /** Whether this was a deliberate action (single click with clear intent) */
  isDeliberate?: boolean
}

// Click cluster for grouping nearby clicks
interface ClickClusterInfo {
  clicks: ClickEvent[]
  startTime: number
  endTime: number
  centerX: number
  centerY: number
  isDeliberate: boolean
}

interface ActionCluster {
  actions: ActionPoint[]
  startTime: number
  endTime: number
  maxImportance: number
  primary: ActionPoint
  center: { x: number; y: number }
}

export class ZoomDetector {
  // Action-based zoom config
  private readonly ACTION = ACTION_ZOOM_CONFIG
  private readonly TRANSITION = ZOOM_TRANSITION_CONFIG
  private readonly END_GUARD_MS = 100

  /**
   * Main detection method - Action-Based Smart Zoom
   * Uses action-based detection when click/keyboard events are available.
   * Note: Requires click event data for zoom detection.
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

    // No click events - return empty (legacy dwell-based detection removed)
    console.warn('[ZoomDetector] No click events available - zoom detection requires click data')
    return []
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
      console.warn('[ZoomDetector] No action points extracted from events')
      return []
    }

    // Step 2: Filter by minimum importance
    const significantActions = actionPoints.filter(
      a => a.importance >= this.ACTION.minImportanceThreshold
    )

    if (significantActions.length === 0) {
      console.warn('[ZoomDetector] No significant actions found above importance threshold')
      return []
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
   * Extract action points from all event types with cluster-based detection
   *
   * NEW APPROACH (like Cursorful/AutoZoom):
   * - Clicks are clustered first (2+ clicks in 3s window = zoom trigger)
   * - Single clicks only trigger zoom if they show "deliberate" intent
   * - Context determines zoom depth (typing=shallow, deliberate click=medium)
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
    let isFirstTypingBurst = true

    // Step 1: Cluster clicks by temporal and spatial proximity
    const clickClusters = this.clusterClickEvents(clickEvents, mouseEvents, screenWidth, screenHeight)

    // Step 2: Process each click cluster
    for (const cluster of clickClusters) {
      const hasEnoughClicks = cluster.clicks.length >= this.ACTION.minClicksToTrigger
      const isDeliberate = cluster.isDeliberate

      // Only create action point if cluster meets criteria
      if (hasEnoughClicks || isDeliberate) {
        let importance = this.ACTION.clickImportanceBase

        // Bonus for deliberate action
        if (isDeliberate) {
          importance += this.ACTION.clickAfterPauseBonus
        }

        // Bonus for multiple clicks (higher confidence)
        if (cluster.clicks.length >= 3) {
          importance += 0.1
        }

        // Determine context for zoom depth
        const context: ActionPoint['context'] = isDeliberate && cluster.clicks.length === 1
          ? 'deliberateClick'
          : 'clickCluster'

        actions.push({
          timestamp: cluster.startTime,
          x: cluster.centerX,
          y: cluster.centerY,
          type: 'click',
          importance: Math.min(1, importance),
          context,
          isDeliberate
        })
      }
    }

    // Step 3: Process keyboard events - detect typing bursts
    const typingBursts = this.detectTypingBursts(keyboardEvents)
    for (const burst of typingBursts) {
      let importance = this.ACTION.typingImportanceBase

      // Bonus for first typing burst
      if (isFirstTypingBurst) {
        importance += this.ACTION.typingFirstBurstBonus
        isFirstTypingBurst = false
      }

      // Bonus for longer typing sessions (more focused activity)
      const typingDuration = burst.endTime - burst.startTime
      if (typingDuration > 2000) {
        importance += 0.1
      }

      // Get mouse position at typing start
      const mousePos = this.getMousePositionAt(mouseEvents, burst.startTime)

      actions.push({
        timestamp: burst.startTime,
        x: mousePos.x,
        y: mousePos.y,
        type: 'typing-start',
        importance: Math.min(1, importance),
        duration: typingDuration,
        context: 'typing'
      })
    }

    // Step 4: Process scroll events - detect scroll stops (lower priority)
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
        importance: Math.min(1, importance),
        context: 'scrollStop'
      })
    }

    // Sort by timestamp
    actions.sort((a, b) => a.timestamp - b.timestamp)

    return actions
  }

  /**
   * Cluster click events by temporal and spatial proximity
   * Like Cursorful: requires 2+ clicks in 3s window, OR single deliberate click
   */
  private clusterClickEvents(
    clickEvents: ClickEvent[],
    mouseEvents: MouseEvent[],
    screenWidth: number,
    screenHeight: number
  ): ClickClusterInfo[] {
    if (clickEvents.length === 0) return []

    const clusters: ClickClusterInfo[] = []
    let currentCluster: ClickClusterInfo | null = null

    for (let i = 0; i < clickEvents.length; i++) {
      const click = clickEvents[i]

      // Check if this click is deliberate (single click with clear intent)
      const isDeliberate = this.isDeliberateClick(click, mouseEvents, screenWidth, screenHeight)

      if (currentCluster === null) {
        // Start new cluster
        currentCluster = {
          clicks: [click],
          startTime: click.timestamp,
          endTime: click.timestamp,
          centerX: click.x,
          centerY: click.y,
          isDeliberate
        }
      } else {
        // Check if click belongs to current cluster
        const timeDiff = click.timestamp - currentCluster.endTime
        const distance = this.calculateDistance(
          click.x, click.y,
          currentCluster.centerX, currentCluster.centerY,
          screenWidth, screenHeight
        )

        const withinTimeWindow = timeDiff <= this.ACTION.clickClusterWindowMs
        const withinSpatialWindow = distance <= this.ACTION.clusterSpatialThreshold

        if (withinTimeWindow && withinSpatialWindow) {
          // Add to current cluster
          currentCluster.clicks.push(click)
          currentCluster.endTime = click.timestamp
          // Update center to weighted average
          const n = currentCluster.clicks.length
          currentCluster.centerX = currentCluster.clicks.reduce((sum, c) => sum + c.x, 0) / n
          currentCluster.centerY = currentCluster.clicks.reduce((sum, c) => sum + c.y, 0) / n
          // Cluster is deliberate if any click in it was deliberate
          if (isDeliberate) currentCluster.isDeliberate = true
        } else {
          // Save current cluster and start new one
          clusters.push(currentCluster)
          currentCluster = {
            clicks: [click],
            startTime: click.timestamp,
            endTime: click.timestamp,
            centerX: click.x,
            centerY: click.y,
            isDeliberate
          }
        }
      }
    }

    // Don't forget last cluster
    if (currentCluster !== null) {
      clusters.push(currentCluster)
    }

    return clusters
  }

  /**
   * Determine if a click shows "deliberate" intent
   * A click is deliberate if the user paused/hovered before clicking
   */
  private isDeliberateClick(
    click: ClickEvent,
    mouseEvents: MouseEvent[],
    screenWidth: number,
    screenHeight: number
  ): boolean {
    // Check 1: Was mouse idle before click?
    const mouseActivity = this.getMouseActivityBefore(
      mouseEvents,
      click.timestamp,
      this.ACTION.deliberatePauseMs
    )
    const wasIdle = mouseActivity < this.ACTION.deliberateActivityThreshold

    // Check 2: Did mouse hover at/near click position before clicking?
    const hoverBehavior = this.checkHoverBeforeClick(
      mouseEvents,
      click,
      screenWidth,
      screenHeight
    )

    // Deliberate if: idle before click AND (hover behavior OR in new area)
    return wasIdle && hoverBehavior
  }

  /**
   * Check if mouse was hovering near the click position before clicking
   */
  private checkHoverBeforeClick(
    mouseEvents: MouseEvent[],
    click: ClickEvent,
    screenWidth: number,
    screenHeight: number
  ): boolean {
    const windowStart = click.timestamp - this.ACTION.hoverBeforeClickMs
    const windowEnd = click.timestamp

    // Get mouse events in the hover window
    const eventsInWindow = mouseEvents.filter(
      e => e.timestamp >= windowStart && e.timestamp < windowEnd
    )

    if (eventsInWindow.length < 3) return false

    // Check if mouse stayed near the click position
    const threshold = 0.05 // 5% of screen distance
    let nearClickCount = 0

    for (const event of eventsInWindow) {
      const distance = this.calculateDistance(
        event.x, event.y,
        click.x, click.y,
        screenWidth, screenHeight
      )
      if (distance < threshold) {
        nearClickCount++
      }
    }

    // At least 70% of positions should be near the click
    return nearClickCount / eventsInWindow.length >= 0.7
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
          cluster.endTime = Math.max(cluster.endTime, action.timestamp + (action.duration || 0))
          cluster.maxImportance = Math.max(cluster.maxImportance, action.importance)

          // Keep a stable target: pick the most important action in the cluster.
          // This avoids "averaging" distinct UI targets into a meaningless midpoint.
          const shouldPromotePrimary =
            action.importance > cluster.primary.importance ||
            (action.importance === cluster.primary.importance && action.timestamp < cluster.primary.timestamp)

          if (shouldPromotePrimary) {
            cluster.primary = action
          }

          cluster.center = { x: cluster.primary.x, y: cluster.primary.y }
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
          primary: action,
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

    // Determine context from the primary action in the cluster
    const primaryAction = cluster.primary
    const context = primaryAction.context ?? 'default'

    // Get scale range based on context (NEW: context-aware depth)
    const scaleConfig = this.ACTION.zoomScaleByContext[context] ?? this.ACTION.zoomScaleByContext.default
    const minScale = scaleConfig.min
    const maxScale = scaleConfig.max

    // Calculate zoom scale within the context-appropriate range
    const scaleRange = maxScale - minScale
    const normalizedImportance = (importance - this.ACTION.minImportanceThreshold) /
      (1 - this.ACTION.minImportanceThreshold)
    const scale = minScale + (scaleRange * Math.min(1, normalizedImportance))

    // Transitions should come from the central timing config (SSOT)
    const introMs = this.TRANSITION.defaultIntroMs
    const outroMs = this.TRANSITION.defaultOutroMs

    // Calculate timing with anticipation (keep action within the intro window)
    const focusTime = cluster.primary.timestamp
    const anticipation = Math.min(this.ACTION.anticipationMs, introMs)

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

    // Guard against ultra-short windows: always produce a strictly-positive duration window.
    const maxEndTime = Math.max(1, duration - this.END_GUARD_MS)
    const desiredTotal = introMs + holdDuration + outroMs

    // Prefer a start that lands the focus time during the intro.
    // If we can't fit the full block near the end, shift it earlier instead of truncating.
    let startTime = Math.max(0, focusTime - anticipation)
    let endTime = startTime + desiredTotal

    if (endTime > maxEndTime) {
      endTime = maxEndTime
      startTime = Math.max(0, endTime - desiredTotal)
    }

    // If we still can't fit the intended duration (very short clips), use the full available window.
    if (endTime <= startTime) {
      startTime = 0
      endTime = maxEndTime
    }

    // Track the most meaningful action within the cluster as the camera target.
    const target = cluster.primary

    return {
      id: `zoom-action-${cluster.startTime}`,
      origin: 'auto',
      startTime,
      endTime,
      scale: Math.round(scale * 10) / 10,
      targetX: target.x,
      targetY: target.y,
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
}
