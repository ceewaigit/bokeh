/**
 * Source Dimensions - Centralized source dimension resolution
 * 
 * This module provides a single function to resolve source dimensions from
 * various data sources, replacing the scattered null coalescing chains
 * throughout the codebase.
 */

import type { Recording, RecordingMetadata, MouseEvent } from '@/types/project'
import type { SourceDimensions } from './types'

/**
 * Get source dimensions at a specific timestamp.
 * 
 * This is the SSOT for resolving video dimensions from various sources.
 * It replaces the numerous fallback chains scattered throughout the codebase.
 * 
 * Priority order:
 * 1. Mouse event at timestamp (captureWidth/captureHeight)
 * 2. Mouse event at timestamp (screenWidth/screenHeight, scaled if needed)
 * 3. Capture area from metadata
 * 4. Recording dimensions
 * 5. Default fallback (1920x1080)
 * 
 * @param timestamp - Source timestamp in milliseconds
 * @param recording - Recording object (optional)
 * @param metadata - Recording metadata (optional)
 * @param mouseEvents - Mouse events array (optional, falls back to metadata.mouseEvents)
 * @returns Source dimensions in pixels
 */
export function getSourceDimensions(
    timestamp: number,
    recording: Recording | null | undefined,
    metadata: RecordingMetadata | null | undefined,
    mouseEvents?: MouseEvent[]
): SourceDimensions {
    // Get mouse events from metadata if not provided directly
    const events = mouseEvents ?? metadata?.mouseEvents ?? []

    // Get capture area info for scale factor
    const captureArea = metadata?.captureArea ?? recording?.captureArea
    const scaleFactor = captureArea?.scaleFactor ?? 1

    // Default dimensions from capture area or recording
    const fallbackWidth = captureArea?.fullBounds?.width
        ? Math.round(captureArea.fullBounds.width * scaleFactor)
        : (recording?.width ?? 1920)

    const fallbackHeight = captureArea?.fullBounds?.height
        ? Math.round(captureArea.fullBounds.height * scaleFactor)
        : (recording?.height ?? 1080)

    // If no mouse events, return fallback
    if (events.length === 0) {
        return { width: fallbackWidth, height: fallbackHeight }
    }

    // Binary search for the most recent mouse event at or before timestamp
    const event = findEventAtTime(events, timestamp)
    if (!event) {
        return { width: fallbackWidth, height: fallbackHeight }
    }

    // Priority 1: captureWidth/captureHeight (most accurate)
    if (event.captureWidth && event.captureHeight) {
        return {
            width: event.captureWidth,
            height: event.captureHeight
        }
    }

    // Priority 2: screenWidth/screenHeight (may need scaling)
    const screenW = event.screenWidth
    const screenH = event.screenHeight
    if (screenW && screenH) {
        // Check if mouse coordinates look like physical pixels (Retina)
        const xLooksPhysical = event.x > screenW * 1.1
        const yLooksPhysical = event.y > screenH * 1.1
        const shouldScale = (xLooksPhysical || yLooksPhysical) && scaleFactor > 1

        return {
            width: shouldScale ? Math.round(screenW * scaleFactor) : screenW,
            height: shouldScale ? Math.round(screenH * scaleFactor) : screenH
        }
    }

    // Fallback
    return { width: fallbackWidth, height: fallbackHeight }
}

/**
 * Get source dimensions from recording and metadata (simplified version).
 * Use this when you don't have a specific timestamp.
 */
export function getSourceDimensionsStatic(
    recording: Recording | null | undefined,
    metadata: RecordingMetadata | null | undefined
): SourceDimensions {
    const captureArea = metadata?.captureArea ?? recording?.captureArea
    const scaleFactor = captureArea?.scaleFactor ?? 1

    // Check for capture area dimensions
    if (captureArea?.fullBounds?.width && captureArea?.fullBounds?.height) {
        return {
            width: Math.round(captureArea.fullBounds.width * scaleFactor),
            height: Math.round(captureArea.fullBounds.height * scaleFactor)
        }
    }

    // Check first mouse event for dimensions
    const firstEvent = metadata?.mouseEvents?.[0]
    if (firstEvent?.captureWidth && firstEvent?.captureHeight) {
        return {
            width: firstEvent.captureWidth,
            height: firstEvent.captureHeight
        }
    }

    if (firstEvent?.screenWidth && firstEvent?.screenHeight) {
        return {
            width: firstEvent.screenWidth,
            height: firstEvent.screenHeight
        }
    }

    // Recording dimensions
    if (recording?.width && recording?.height) {
        return {
            width: recording.width,
            height: recording.height
        }
    }

    // Default
    return { width: 1920, height: 1080 }
}

/**
 * Binary search to find the most recent mouse event at or before timestamp.
 */
function findEventAtTime(
    events: MouseEvent[],
    timestamp: number
): MouseEvent | null {
    if (events.length === 0) return null

    let lo = 0
    let hi = events.length - 1
    let result = -1

    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (events[mid].timestamp <= timestamp) {
            result = mid
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }

    return result >= 0 ? events[result] : events[0]
}
