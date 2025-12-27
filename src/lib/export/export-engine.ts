/**
 * Export Engine
 */

import type { ExportSettings, Project, Recording, Clip } from '@/types'
import { RemotionExportService } from './remotion-export-service'
import { timelineProcessor } from './timeline-processor'
import { logger } from '../utils/logger'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { memoryMonitor } from '@/lib/utils/memory-monitor'
import { resolveProjectRoot } from '@/lib/storage/recording-storage'
import { TimelineDataService } from '@/lib/timeline/timeline-data-service'

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

      // Process timeline into segments  
      // Note: Chunking duration doesn't matter here since actual chunking happens in export-handler.ts
      const processedTimeline = timelineProcessor.processTimeline(
        project.timeline,
        recordingsMap,
        5000 // Arbitrary value, not used in actual export
      )
      const webcamClips: Clip[] = TimelineDataService.getWebcamClips(project)

      if (processedTimeline.clipCount === 0) {
        throw new Error('No video clips to export')
      }

      // All exports go through the same path - chunking is handled in export-handler.ts
      logger.info(`Export: ${processedTimeline.clipCount} clips, duration: ${processedTimeline.totalDuration}ms`);

      // Extract project folder from project file path
      let projectFolder: string | undefined
      if (project.filePath) {
        const fileExists = typeof window !== 'undefined' ? window.electronAPI?.fileExists : undefined
        projectFolder = await resolveProjectRoot(project.filePath, fileExists)
        logger.info(`Project folder: ${projectFolder}`)
      }

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
      this.currentExportPromise = this.remotionEngine.export(
        processedTimeline.segments,
        recordingsMap,
        new Map(), // Empty - metadata loaded lazily via HTTP during export
        settings,
        progressAdapter,
        this.abortController?.signal,
        projectFolder,
        webcamClips
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
          message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
