/**
 * Source Resolver - Resolves recording source information and capture bounds.
 *
 * Extracted from RecordingService to reduce complexity and improve testability.
 * Handles source discovery, bounds calculation, and scale factor normalization.
 */

import type { RecordingSettings } from '@/types'
import { RecordingSourceType, RecordingArea } from '@/types'
import { parseAreaSourceId, isAreaSource } from '@/features/media/recording/logic/area-source-parser'
import { logger } from '@/shared/utils/logger'
import { PermissionError } from '@/shared/errors'

export interface CaptureArea {
  fullBounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  sourceType: RecordingSourceType
  sourceId: string
}

export interface SourceResolution {
  sourceId: string
  displayId?: number
  captureArea: CaptureArea
  captureWidth: number
  captureHeight: number
}

/**
 * Resolves recording source information from settings.
 * Handles screen, window, and area sources with proper bounds and scale factor calculation.
 */
export class SourceResolver {
  /**
   * Resolve source information and capture bounds from recording settings.
   */
  async resolve(settings: RecordingSettings): Promise<SourceResolution> {
    if (!window.electronAPI?.getDesktopSources) {
      throw new PermissionError('Electron API not available', 'screen')
    }

    const sources = await window.electronAPI.getDesktopSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 }
    })

    if (!sources || sources.length === 0) {
      throw new PermissionError('No screen sources available. Please check permissions.', 'screen')
    }

    // Find the requested source
    let primarySource = sources.find(s => s.id === settings.sourceId)

    // Fallback: Electron window IDs often have a suffix (e.g. "window:123:0"), so try prefix match
    if (!primarySource && settings.sourceId?.startsWith('window:')) {
      primarySource = sources.find(s => s.id.startsWith(settings.sourceId + ':'))
    }

    // Area selections are encoded as "area:x,y,w,h[,displayId]" and won't exist in desktopCapturer sources.
    // Prefer the screen source matching the encoded displayId when possible.
    if (isAreaSource(settings.sourceId)) {
      const area = parseAreaSourceId(settings.sourceId!)
      if (area?.displayId) {
        const matchingScreen = sources.find(s => s.id.startsWith(`screen:${area.displayId}:`))
        if (matchingScreen) {
          primarySource = matchingScreen
        }
      }
    }

    if (!primarySource && settings.onlySelf) {
      const primaryScreen = sources.find(s => s.id.startsWith('screen:') && s.displayInfo?.isPrimary)
      primarySource = primaryScreen || sources.find(s => s.id.startsWith('screen:'))
      if (primarySource) {
        logger.warn('[SourceResolver] App-only source not found; falling back to display capture')
      }
    }

    if (!primarySource) {
      // Auto-select screen for fullscreen/region recording
      if (settings.area !== RecordingArea.Window) {
        primarySource = sources.find(s => s.id.startsWith('screen:'))
      }

      if (!primarySource) {
        throw new Error('No suitable recording source found')
      }
    }

    logger.info(`[SourceResolver] Using source: ${primarySource.name} (${primarySource.id})`)

    // Extract display ID from source
    const rawDisplayId =
      typeof (primarySource as any).display_id === 'string'
        ? Number((primarySource as any).display_id)
        : (primarySource as any).display_id
    const displayInfoId = (primarySource as any).displayInfo?.id

    // Resolve capture bounds
    const captureInfo = await this.resolveBounds(primarySource, settings, rawDisplayId, displayInfoId)

    const parsedDisplayId =
      Number.isFinite(rawDisplayId)
        ? rawDisplayId
        : (typeof displayInfoId === 'number' ? displayInfoId : undefined)

    return {
      sourceId: primarySource.id,
      displayId: Number.isFinite(parsedDisplayId) ? parsedDisplayId : undefined,
      captureArea: captureInfo.captureArea,
      captureWidth: captureInfo.captureWidth,
      captureHeight: captureInfo.captureHeight
    }
  }

  /**
   * Resolve capture bounds and scale factor for the given source.
   */
  private async resolveBounds(
    primarySource: { id: string; name: string },
    settings: RecordingSettings,
    rawDisplayId: number | undefined,
    displayInfoId: number | undefined
  ): Promise<{ captureArea: CaptureArea; captureWidth: number; captureHeight: number }> {
    // Default capture area (will be overwritten if bounds available)
    let captureArea: CaptureArea = {
      fullBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
      sourceType: RecordingSourceType.Screen,
      sourceId: primarySource.id
    }
    let captureWidth = 1920
    let captureHeight = 1080

    if (!window.electronAPI?.getSourceBounds) {
      return { captureArea, captureWidth, captureHeight }
    }

    const rawBounds = await window.electronAPI.getSourceBounds(primarySource.id)
    if (!rawBounds) {
      return { captureArea, captureWidth, captureHeight }
    }

    let bounds = rawBounds
    let scaleFactor = 1
    const resolvedDisplayId =
      Number.isFinite(rawDisplayId) ? rawDisplayId : (typeof displayInfoId === 'number' ? displayInfoId : undefined)

    // Get display scale factor for screen sources
    if (primarySource.id.startsWith('screen:') && window.electronAPI?.getScreens) {
      try {
        const screens = await window.electronAPI.getScreens()
        const parts = primarySource.id.split(':')
        const displayIdFromSource = resolvedDisplayId ?? parseInt(parts[1])
        const displayInfo = screens?.find((d: { id: number; scaleFactor?: number }) => d.id === displayIdFromSource)
        if (displayInfo?.scaleFactor && displayInfo.scaleFactor > 0) {
          scaleFactor = displayInfo.scaleFactor
        }
      } catch {
        // Keep scaleFactor = 1
      }
    }

    // For window sources, infer scale factor from the display containing the window bounds.
    // Some native window-bounds implementations may return physical pixels; normalize back to
    // Electron display coordinates (DIP) so downstream math can consistently apply scaleFactor.
    if (!primarySource.id.startsWith('screen:') && window.electronAPI?.getScreens) {
      try {
        const screens = await window.electronAPI.getScreens()
        const centerX = bounds.x + bounds.width / 2
        const centerY = bounds.y + bounds.height / 2

        const containsPoint = (b: { x: number; y: number; width: number; height: number }, x: number, y: number) =>
          x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height

        // Pass 1: assume bounds are in DIP
        const dipDisplay = screens?.find((d: { bounds: any }) => d?.bounds && containsPoint(d.bounds, centerX, centerY))
        if (dipDisplay?.scaleFactor && dipDisplay.scaleFactor > 0) {
          scaleFactor = dipDisplay.scaleFactor
        } else {
          // Pass 2: assume bounds are in physical pixels; try per-display de-scaling
          const physicalDisplay = screens?.find((d: { bounds: any; scaleFactor?: number }) => {
            const sf = d?.scaleFactor && d.scaleFactor > 0 ? d.scaleFactor : 1
            return d?.bounds && containsPoint(d.bounds, centerX / sf, centerY / sf)
          })
          const sf = physicalDisplay?.scaleFactor && physicalDisplay.scaleFactor > 0 ? physicalDisplay.scaleFactor : 1
          if (physicalDisplay?.bounds) {
            scaleFactor = sf
            bounds = {
              x: bounds.x / sf,
              y: bounds.y / sf,
              width: bounds.width / sf,
              height: bounds.height / sf
            }
          }
        }
      } catch {
        // Keep defaults
      }
    }

    let effectiveBounds = bounds
    let sourceType = primarySource.id.startsWith('screen:') ? RecordingSourceType.Screen : RecordingSourceType.Window
    let sourceId = primarySource.id

    // For area selections, set capture bounds to the selected region (in global display coordinates).
    if (isAreaSource(settings.sourceId)) {
      const area = parseAreaSourceId(settings.sourceId!)
      if (area) {
        effectiveBounds = {
          x: bounds.x + area.x,
          y: bounds.y + area.y,
          width: area.width,
          height: area.height
        }
        sourceType = RecordingSourceType.Area
        sourceId = settings.sourceId!
      }
    }

    captureArea = {
      fullBounds: effectiveBounds,
      workArea: effectiveBounds,
      scaleFactor,
      sourceType,
      sourceId
    }

    captureWidth = Math.round(effectiveBounds.width * scaleFactor)
    captureHeight = Math.round(effectiveBounds.height * scaleFactor)

    return { captureArea, captureWidth, captureHeight }
  }
}
