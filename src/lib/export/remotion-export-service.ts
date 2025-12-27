/**
 * Remotion Export Service - Renderer Process
 * Communicates with Electron main process for actual export
 *
 * Uses IPC bridge abstraction for better testability (DIP compliance)
 */

import type { Clip, ExportSettings, Recording, RecordingMetadata } from '@/types';
import type { TimelineSegment } from './timeline-processor';
import { logger } from '@/lib/utils/logger';
import { getIpcBridge, isIpcAvailable, type IpcBridge } from '@/lib/bridges';

export interface RemotionExportProgress {
  progress: number;
  stage: 'bundling' | 'rendering' | 'encoding' | 'complete' | 'error';
  message: string;
  currentFrame?: number;
  totalFrames?: number;
  fps?: number;
  etaSeconds?: number;
}

export class RemotionExportService {
  private abortSignal: AbortSignal | null = null;
  private isAborting: boolean = false;
  private ipcBridge: IpcBridge | null = null;
  private abortHandler: (() => void) | null = null;

  /**
   * Get the IPC bridge, lazily initialized
   */
  private getIpc(): IpcBridge {
    if (!this.ipcBridge) {
      this.ipcBridge = getIpcBridge();
    }
    return this.ipcBridge;
  }

  /**
   * Export video using Remotion via IPC
   */
  async export(
    segments: TimelineSegment[],
    recordings: Map<string, Recording>,
    _metadata: Map<string, RecordingMetadata>,
    settings: ExportSettings,
    onProgress?: (progress: RemotionExportProgress) => void,
    abortSignal?: AbortSignal,
    projectFolder?: string,
    webcamClips: Clip[] = []
  ): Promise<Blob> {
    this.abortSignal = abortSignal || null;
    this.isAborting = false;

    // Set up abort handler
    if (this.abortSignal) {
      this.abortHandler = () => {
        this.isAborting = true;
        logger.info('Export aborted by user');

        // Cancel export in main process using IPC bridge
        this.getIpc().invoke('export-cancel').catch(() => { });
      };
      this.abortSignal.addEventListener('abort', this.abortHandler, { once: true });
    }

    try {
      // Check if IPC is available
      if (!isIpcAvailable()) {
        throw new Error('Export requires Electron environment');
      }

      const ipc = this.getIpc();
      logger.info('IPC bridge initialized and ready');

      const totalDuration = this.calculateTotalDuration(segments);
      const fps = settings.framerate || 30;
      const totalFrames = Math.ceil((totalDuration / 1000) * fps);

      logger.info(`Remotion export: ${totalFrames} frames at ${fps}fps`);

      onProgress?.({
        progress: 5,
        stage: 'bundling',
        message: 'Preparing export...'
      });

      // Convert Maps to plain objects for IPC
      // NOTE: Don't pass metadata separately - it's already embedded in Recording.metadata
      // Passing it again causes massive memory duplication (9000+ mouse events × 3 copies)
      const exportData = {
        segments,
        recordings: Array.from(recordings.entries()),
        metadata: [], // Metadata embedded in Recording.metadata - don't duplicate over IPC
        settings,
        projectFolder,
        webcamClips
      };

      // Listen for progress updates
      const progressHandler = (...args: unknown[]) => {
        const data = args[0] as any;
        if (this.abortSignal?.aborted || this.isAborting) {
          ipc.removeListener('export-progress', progressHandler);
          return;
        }

        const progressValue = typeof data.progress === 'number'
          ? data.progress
          : typeof data.percent === 'number'
            ? data.percent
            : 0;
        const message = data.message || data.status || `Rendering ${Math.round(progressValue)}% complete`;

        onProgress?.({
          progress: progressValue,
          stage: data.stage || (progressValue >= 100 ? 'complete' : 'rendering'),
          message,
          currentFrame: typeof data.currentFrame === 'number' ? data.currentFrame : undefined,
          totalFrames: typeof data.totalFrames === 'number' ? data.totalFrames : undefined,
          fps: typeof data.fps === 'number' ? data.fps : undefined,
          etaSeconds: typeof data.etaSeconds === 'number' ? data.etaSeconds : undefined,
        });
      };

      ipc.on('export-progress', progressHandler);

      // Check if already aborted
      if (this.abortSignal?.aborted || this.isAborting) {
        ipc.removeListener('export-progress', progressHandler);
        throw new Error('Export aborted');
      }

      // Call main process to handle export
      const result = await ipc.invoke<{
        success: boolean;
        error?: string;
        data?: string;
        isStream?: boolean;
        filePath?: string;
        fileSize?: number;
      }>('export-video', exportData);

      // Clean up listener
      ipc.removeListener('export-progress', progressHandler);

      if (!result.success) {
        throw new Error(result.error || 'Export failed');
      }

      let blob: Blob;

      if (result.isStream && result.fileSize && result.filePath) {
        // Handle streaming for large files
        logger.info(`Streaming large file: ${result.fileSize} bytes`);

        const chunks: Uint8Array[] = [];
        const chunkSize = 5 * 1024 * 1024; // 5MB chunks
        let offset = 0;

        while (offset < result.fileSize) {
          // Check for abort
          if (this.abortSignal?.aborted || this.isAborting) {
            // Clean up temp file
            await ipc.invoke('export-cleanup', { filePath: result.filePath }).catch(() => { });
            throw new Error('Export aborted during streaming');
          }

          const length = Math.min(chunkSize, result.fileSize - offset);

          const chunkResult = await ipc.invoke<{ success: boolean; data?: string }>('export-stream-chunk', {
            filePath: result.filePath,
            offset,
            length
          });

          if (!chunkResult.success || !chunkResult.data) {
            throw new Error('Failed to stream file chunk');
          }

          // Decode chunk
          const binaryString = atob(chunkResult.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          chunks.push(bytes);

          offset += length;

          // Update progress
          const streamProgress = 95 + (offset / result.fileSize) * 5;
          onProgress?.({
            progress: streamProgress,
            stage: 'encoding',
            message: `Processing: ${Math.round(offset / 1024 / 1024)}MB / ${Math.round(result.fileSize / 1024 / 1024)}MB`
          });
        }

        // Combine chunks into blob
        blob = new Blob(chunks as BlobPart[], {
          type: settings.format === 'webm' ? 'video/webm' : 'video/mp4'
        });

        // Clean up temp file
        await ipc.invoke('export-cleanup', { filePath: result.filePath });
      } else if (result.data) {
        // Small file - use base64 directly
        const binaryString = atob(result.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        blob = new Blob([bytes], {
          type: settings.format === 'webm' ? 'video/webm' : 'video/mp4'
        });
      } else {
        throw new Error('Export result missing data');
      }

      onProgress?.({
        progress: 100,
        stage: 'complete',
        message: 'Export complete!'
      });

      return blob;

    } catch (error) {
      logger.error('Remotion export failed:', error);

      // Check if it was an abort
      const isAbort = this.isAborting || this.abortSignal?.aborted ||
        (error instanceof Error && error.message.includes('abort'));

      onProgress?.({
        progress: 0,
        stage: 'error',
        message: isAbort ? 'Export canceled' : `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });

      throw error;
    } finally {
      // Clean up
      if (this.abortSignal && this.abortHandler) {
        this.abortSignal.removeEventListener('abort', this.abortHandler);
      }
      this.abortSignal = null;
      this.isAborting = false;
      this.abortHandler = null;
    }
  }

  /**
   * Calculate total duration of all segments
   */
  private calculateTotalDuration(segments: TimelineSegment[]): number {
    if (segments.length === 0) return 0;

    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    return lastSegment.endTime - firstSegment.startTime;
  }
}
