/**
 * Export Engine
 */

import type { ExportSettings, Project, Recording, Clip } from '@/types'
import { TrackType } from '@/types'
import { RemotionExportService } from './remotion-export-service'
import { timelineProcessor } from './timeline-processor'
import { logger } from '@/shared/utils/logger'
import { globalBlobManager } from '@/shared/security/blob-url-manager'
import { memoryMonitor } from '@/shared/utils/memory-monitor'
import { resolveProjectRoot } from '@/features/core/storage/project-paths'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { assertDefined } from '@/shared/errors'
import { applySkipRangesToClips, applySkipRangesToEffects } from './skip-range-utils'

export function buildExportProject(project: Project) {
  const skipRanges = TimelineDataService.getGlobalTimelineSkips(project)
  if (skipRanges.length === 0) {
    return { project, skipRanges }
  }

  const timeline = project.timeline
  const nextTracks = timeline.tracks.map(track => {
    const { clips: adjustedClips } = applySkipRangesToClips(track.clips, skipRanges)
    return { ...track, clips: adjustedClips }
  })

  const videoClips = nextTracks
    .filter(track => track.type === TrackType.Video)
    .flatMap(track => track.clips)
  const { segmentsByOriginalId } = applySkipRangesToClips(
    timeline.tracks.flatMap(track => track.clips),
    skipRanges
  )
  const nextEffects = applySkipRangesToEffects(timeline.effects ?? [], skipRanges, segmentsByOriginalId)

  const nextDuration = videoClips.length > 0
    ? Math.max(...videoClips.map(clip => clip.startTime + clip.duration))
    : 0

  const nextTimeline = {
    ...timeline,
    tracks: nextTracks,
    effects: nextEffects,
    duration: nextDuration
  }

  return {
    project: {
      ...project,
      timeline: nextTimeline
    },
    skipRanges
  }
}

export interface ExportProgress {
  progress: number
  stage: 'preparing' | 'processing' | 'encoding' | 'finalizing' | 'complete' | 'error'
  message: string
  currentFrame?: number
  totalFrames?: number
  eta?: number
}

export class ExportEngine {
  private remotionEngine: RemotionExportService
  private isExporting = false
  private abortController: AbortController | null = null
  private currentExportPromise: Promise<Blob> | null = null

  constructor() {
    this.remotionEngine = new RemotionExportService()
  }

  /**
   * Export project using Remotion
   */
  async exportProject(
    project: Project,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    if (this.isExporting) {
      throw new Error('Export already in progress')
    }

    this.isExporting = true
    this.abortController = new AbortController()
    const startTime = performance.now()

    // Clean up memory before export starts
    logger.info('[Export] Cleaning up memory before export...')
    globalBlobManager.cleanupForExport()

    // Start memory monitoring
    memoryMonitor.startMonitoring(3000, () => {
      logger.warn('[Export] High memory pressure detected during export!')
    })

    try {
      // Prepare recordings map
      const recordingsMap = new Map<string, Recording>()
      project.recordings.forEach(r => recordingsMap.set(r.id, r))

      const { project: exportProject } = buildExportProject(project)

      // Process timeline into segments  
      // Note: Chunking duration doesn't matter here since actual chunking happens in export-handler.ts
      const processedTimeline = timelineProcessor.processTimeline(
        exportProject.timeline,
        recordingsMap,
        5000 // Arbitrary value, not used in actual export
      )
      const webcamClips: Clip[] = TimelineDataService.getWebcamClips(exportProject)
      const audioClips: Clip[] = TimelineDataService.getAudioClips(exportProject)

      if (processedTimeline.clipCount === 0) {
        throw new Error('No video clips to export')
      }

      // All exports go through the same path - chunking is handled in export-handler.ts
      logger.info(`Export: ${processedTimeline.clipCount} clips, duration: ${processedTimeline.totalDuration}ms`);

      // Extract project folder from project file path
      const projectPath = assertDefined(project.filePath, 'Project must be saved before export')
      const fileExists = typeof window !== 'undefined' ? window.electronAPI?.fileExists : undefined
      const projectFolder = await resolveProjectRoot(projectPath, fileExists)
      assertDefined(projectFolder, 'Failed to resolve project folder for export')
      logger.info(`Project folder: ${projectFolder}`)

      onProgress?.({
        progress: 2,
        stage: 'preparing',
        message: `Preparing ${processedTimeline.clipCount} clips for export...`
      })

      // LAZY LOADING: Metadata is now loaded on-demand by useRecordingMetadata hook during export
      // This prevents multi-GB memory allocation for mouse/click/keyboard events
      // Pass empty metadata map - Remotion compositions will fetch via HTTP URLs

      // Map progress from Remotion format
      const progressAdapter = (remotionProgress: any) => {
        onProgress?.({
          progress: remotionProgress.progress,
          stage: remotionProgress.stage === 'bundling' ? 'preparing' :
            remotionProgress.stage === 'rendering' ? 'processing' :
              remotionProgress.stage === 'encoding' ? 'encoding' :
                remotionProgress.stage,
          message: remotionProgress.message,
          currentFrame: remotionProgress.currentFrame,
          totalFrames: remotionProgress.totalFrames,
          eta: typeof remotionProgress.etaSeconds === 'number' ? remotionProgress.etaSeconds : undefined
        })
      }

      // Export using Remotion - all chunking/optimization handled in export-handler.ts
      // Pass project folder as additional parameter
      // Note: metadata is loaded lazily via useRecordingMetadata hook, pass empty map
      // Include camera settings (for motion blur, etc.) in export settings
      const settingsWithCamera = {
        ...settings,
        cameraSettings: project.settings?.camera
      };

      this.currentExportPromise = this.remotionEngine.export(
        processedTimeline.segments,
        recordingsMap,
        new Map(), // Empty - metadata loaded lazily via HTTP during export
        settingsWithCamera,
        progressAdapter,
        this.abortController?.signal,
        projectFolder,
        webcamClips,
        audioClips
      )

      return await this.currentExportPromise
    } catch (error) {
      const canceled =
        this.abortController?.signal.aborted ||
        (error instanceof Error && /cancel|abort/i.test(error.message))

      if (!canceled) {
        onProgress?.({
          progress: 0,
          stage: 'error',
          // User-facing: keep generic here; full details are logged below/in Remotion service.
          message: 'Export failed'
        })
      }
      throw error
    } finally {
      this.isExporting = false
      this.abortController = null
      this.currentExportPromise = null

      // Stop memory monitoring
      memoryMonitor.stopMonitoring()

      // Final memory cleanup
      globalBlobManager.cleanupByType('export')

      // Log memory stats
      const memStats = memoryMonitor.getMemoryStats()
      if (memStats) {
        logger.info(`[Export] Final memory: ${memStats.usedMB}MB / ${memStats.limitMB}MB (${memStats.percentUsed}%)`)
      }

      const duration = (performance.now() - startTime) / 1000
      logger.info(`Export completed in ${duration.toFixed(2)}s`)
    }
  }

  /**
   * Cancel ongoing export
   */
  async cancelExport(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort()
      logger.info('Export cancelled by user')

      // Best-effort: let the in-flight export unwind, but don't hang the UI if the
      // underlying pipeline ignores cancellation (e.g. stuck worker/ffmpeg).
      const inFlight = this.currentExportPromise
      if (inFlight) {
        await Promise.race([
          inFlight.catch(() => { }),
          new Promise((resolve) => setTimeout(resolve, 1500))
        ])
      }
    }
  }

  /**
   * Check if export is in progress
   */
  isExportInProgress(): boolean {
    return this.isExporting
  }
}
