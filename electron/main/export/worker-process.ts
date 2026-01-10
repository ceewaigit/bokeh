/**
 * Export Worker Process with MessagePort IPC
 * Handles video export with supervision and error recovery
 * Optimized for memory efficiency using Remotion best practices
 */

import { BaseWorker } from '../utils/base-worker';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import * as os from 'os';
import type { X264Preset } from '@remotion/renderer/dist/options/x264-preset';

interface ChunkAssignment {
  index: number;
  startFrame: number;
  endFrame: number;
  startTimeMs: number;
  endTimeMs: number;
}

interface ExportJob {
  bundleLocation: string;
  compositionMetadata: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
    id: string;
    defaultProps: any;
  };
  inputProps: any;
  outputPath: string;
  settings: {
    format?: string;
    framerate?: number;
    quality?: string;
    resolution?: { width: number; height: number };
    enhanceAudio?: boolean;
  };
  offthreadVideoCacheSizeInBytes: number;
  jpegQuality: number;
  videoBitrate: string;
  x264Preset: X264Preset | string | null | undefined;
  useGPU: boolean;
  concurrency?: number;
  ffmpegPath: string;
  compositorDir: string | null;
  chunkSizeFrames?: number;
  assignedChunks?: ChunkAssignment[];
  totalChunks?: number;
  totalFrames?: number;
  combineChunksInWorker?: boolean;
  preFilteredMetadata?: Record<number, Record<string, any>> | Map<number, Map<string, any>>; // Pre-filtered metadata by chunk
}

interface MemorySnapshot {
  rssMB: number;
  freeMB: number;
  totalMB: number;
}

interface PressureCheck {
  hasPressure: boolean;
  reason: string | null;
}

class AdaptiveConcurrencyController {
  private current: number;
  private readonly min: number;
  private readonly max: number;
  private readonly increaseEvery: number;
  private cooldownChunks = 0;
  private successStreak = 0;

  constructor(min: number, max: number, increaseEvery: number = 2) {
    this.min = Math.max(1, Math.floor(min));
    this.max = Math.max(this.min, Math.floor(max));
    this.increaseEvery = Math.max(1, Math.floor(increaseEvery));
    this.current = this.min;
  }

  getConcurrency(): number {
    return this.current;
  }

  onChunkComplete(pressure: PressureCheck): { adjusted: boolean; value: number; reason?: string } {
    if (pressure.hasPressure) {
      const next = Math.max(this.min, Math.floor(this.current / 2) || this.min);
      const adjusted = next !== this.current;
      this.current = next;
      this.cooldownChunks = 2;
      this.successStreak = 0;
      return { adjusted, value: this.current, reason: pressure.reason || 'pressure' };
    }

    this.successStreak += 1;
    if (this.cooldownChunks > 0) {
      this.cooldownChunks -= 1;
      return { adjusted: false, value: this.current };
    }

    if (this.current < this.max && this.successStreak % this.increaseEvery === 0) {
      this.current += 1;
      return { adjusted: true, value: this.current, reason: 'steady' };
    }

    return { adjusted: false, value: this.current };
  }
}

class ExportWorker extends BaseWorker {
  private currentExport: {
    isActive: boolean;
    tempFiles: string[];
    cancelRenderFn?: () => void;
    cancelSignal?: any; // Remotion CancelSignal type
  } | null = null;

  private readonly allowedPresets: readonly X264Preset[] = [
    'ultrafast',
    'superfast',
    'veryfast',
    'faster',
    'fast',
    'medium',
    'slow',
    'slower',
    'veryslow',
    'placebo',
  ];

  private coerceX264Preset(preset: unknown): X264Preset | null {
    if (typeof preset !== 'string') return null;
    return (this.allowedPresets as readonly string[]).includes(preset)
      ? (preset as X264Preset)
      : null;
  }

  private getMemorySnapshot(): MemorySnapshot {
    return {
      rssMB: process.memoryUsage().rss / 1024 / 1024,
      freeMB: os.freemem() / 1024 / 1024,
      totalMB: os.totalmem() / 1024 / 1024
    };
  }

  private detectMemoryPressure(start: MemorySnapshot, end: MemorySnapshot): PressureCheck {
    const rssRatio = end.totalMB > 0 ? end.rssMB / end.totalMB : 0;

    // Relax absolute free memory threshold to 256MB (from 512MB)
    if (end.freeMB > 0 && end.freeMB < 256) {
      return { hasPressure: true, reason: 'low-free-mem-absolute' };
    }
    if (rssRatio > 0.6) {
      return { hasPressure: true, reason: 'high-rss' };
    }

    return { hasPressure: false, reason: null };
  }

  protected onInit(): void {
    console.log('[ExportWorker] Initialized with MessagePort IPC');
  }

  protected async onRequest(method: string, data: any): Promise<any> {
    switch (method) {
      case 'export':
        return this.performExport(data);

      case 'status':
        return this.getStatus();

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  protected async onMessage(method: string, _data: any): Promise<void> {
    switch (method) {
      case 'cancel':
        await this.cancelExport();
        break;

      default:
        console.warn(`[ExportWorker] Unknown message: ${method}`);
    }
  }

  protected async onShutdown(): Promise<void> {
    await this.cleanup();
  }

  private async performExport(job: ExportJob): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    const startTime = Date.now();

    try {
      // Create cancel signal for aborting renderMedia mid-render
      const { makeCancelSignal } = await import('@remotion/renderer');
      const { cancelSignal, cancel: cancelRenderFn } = makeCancelSignal();

      // Initialize export state with cancel function and signal
      this.currentExport = {
        isActive: true,
        tempFiles: [],
        cancelRenderFn,
        cancelSignal
      };

      // Send progress updates
      this.send('progress', {
        progress: 5,
        stage: 'preparing',
        message: 'Initializing export...'
      });

      // Use pre-selected composition metadata from main process
      if (!job.compositionMetadata) {
        throw new Error('Composition metadata is required');
      }

      const composition = {
        ...job.compositionMetadata,
        props: job.inputProps
      };

      this.ensureFileVideoUrls(job);

      console.log('[ExportWorker] Using pre-selected composition metadata');
      const inputResources = this.getVideoResources(job.inputProps);
      console.log('[ExportWorker] Video source strategy', {
        preferOffthreadVideo: Boolean(job.inputProps?.renderSettings?.preferOffthreadVideo ?? job.inputProps?.preferOffthreadVideo),
        videoUrls: Object.keys(inputResources?.videoUrls || {}).length,
        videoFilePaths: Object.keys(inputResources?.videoFilePaths || {}).length,
      });

      const fps = job.settings.framerate || composition.fps;
      const totalFrames = composition.durationInFrames;
      const durationInSeconds = totalFrames / fps;
      console.log(`[ExportWorker] Starting export: ${totalFrames} frames at ${fps}fps (${durationInSeconds.toFixed(1)}s)`);

      // Determine if we need chunked rendering
      const chunkAssignments = Array.isArray(job.assignedChunks) && job.assignedChunks.length > 0
        ? job.assignedChunks
        : null;

      // Chunking is an important stability tool, but it is also slower due to repeated Chromium
      // lifecycle + seeking overhead. Respect the main-process chunk plan:
      // - If chunks are assigned, we must chunk.
      // - Otherwise, chunk only when a chunkSizeFrames is explicitly provided and smaller than totalFrames.
      const requestedChunkSize =
        typeof job.chunkSizeFrames === 'number' && Number.isFinite(job.chunkSizeFrames) && job.chunkSizeFrames > 0
          ? Math.floor(job.chunkSizeFrames)
          : null;

      const effectiveChunkSize = requestedChunkSize ?? Math.min(totalFrames, 2000);

      // PERFORMANCE FIX: Skip chunking overhead for short videos.
      // Each chunk restart adds 2-3s overhead (browser restart, cache flush).
      // ~2 minutes at 60fps = 7200 frames is a reasonable threshold.
      const SHORT_VIDEO_THRESHOLD = 7200;

      const needsChunking =
        !!chunkAssignments ||
        (requestedChunkSize != null && requestedChunkSize < totalFrames) ||
        totalFrames > SHORT_VIDEO_THRESHOLD; // Only chunk longer videos

      if (needsChunking) {
        console.log(`[ExportWorker] Using chunked rendering for ${totalFrames} frames (chunk size: ${effectiveChunkSize})`);
        return await this.performChunkedExport(
          job,
          composition,
          totalFrames,
          effectiveChunkSize,
          startTime,
          chunkAssignments || undefined,
          job.combineChunksInWorker !== false
        );
      } else {
        console.log(`[ExportWorker] Using single-pass rendering for ${totalFrames} frames`);
        return await this.performSingleExport(job, composition, totalFrames, startTime);
      }

    } catch (error) {
      console.error('[ExportWorker] Export failed:', error);
      await this.cleanup();

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async performSingleExport(
    job: ExportJob,
    composition: any,
    totalFrames: number,
    startTime: number = Date.now()
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {

    const { renderFrames, stitchFramesToVideo, openBrowser } = await import('@remotion/renderer');
    const totalMemGB = os.totalmem() / 1024 / 1024 / 1024;
    const fps = job.settings?.framerate || composition?.fps || 30;
    const width = job.compositionMetadata?.width ?? job.settings?.resolution?.width ?? 1920;
    const height = job.compositionMetadata?.height ?? job.settings?.resolution?.height ?? 1080;
    const is1080pOrLess = width * height <= 1920 * 1080;

    // Concurrency is primarily bounded by Chromium process memory.
    // PERFORMANCE FIX: Conservative limits to prevent thermal throttling.
    // The AdaptiveConcurrencyController will ramp up if the machine can handle it.
    // Each concurrent process spawns Chromium + offthread video threads = N × threads total.
    // On 8-core machines (M-series), keeping this low prevents context switch overhead.
    const maxConcurrency =
      totalMemGB <= 16
        ? (is1080pOrLess ? 3 : 2)  // Conservative: 3 for 1080p, 2 for 4K on 16GB
        : totalMemGB <= 24
          ? 4  // Moderate for 24GB
          : 6; // Higher for 32GB+

    const minConcurrency = job.concurrency === 1 ? 1 : 2;
    const renderConcurrency = Math.max(minConcurrency, Math.min(job.concurrency || 3, maxConcurrency));

    // Send progress updates
    this.send('progress', {
      progress: 10,
      stage: 'rendering',
      message: 'Starting render engine...'
    });

    let lastProgressUpdate = Date.now();

    this.normalizeVideoProps(job.inputProps);
    const inputResources = this.getVideoResources(job.inputProps);
    console.log('[ExportWorker] inputProps.videoUrls:', inputResources?.videoUrls);
    console.log('[ExportWorker] recording IDs:', Object.keys(inputResources?.videoUrls || {}));
    const x264Preset = this.coerceX264Preset(job.x264Preset) ?? 'veryfast';
    // PERFORMANCE: Lowered default JPEG quality (75 is visually lossless for intermediates)
    const jpegQuality = Math.max(40, Math.min(job.jpegQuality ?? 75, 100));
    const chromiumOptions = {
      gl: job.useGPU ? 'angle' : 'swangle',
      headless: true,
      args: [
        '--allow-file-access',
        '--allow-file-access-from-files',
        '--enable-gpu-rasterization',
        '--enable-accelerated-video-decode',
        '--enable-accelerated-2d-canvas',
        '--num-raster-threads=2'
      ],
      enableMultiProcessOnLinux: true,
      disableWebSecurity: true,
      ignoreCertificateErrors: false,
      ...(job.useGPU ? {
        enableAcceleratedVideoDecode: true,
      } : {}),
      userAgent: undefined,
      ...({ chromiumSandbox: true, enableFakeUserMedia: false } as any),
    };

    const batchSize = Math.min(600, Math.max(120, Math.floor(totalFrames / 8)));
    const batches: Array<{ start: number; end: number }> = [];
    for (let start = 0; start < totalFrames; start += batchSize) {
      const end = Math.min(totalFrames - 1, start + batchSize - 1);
      batches.push({ start, end });
    }

    const concurrencyController = new AdaptiveConcurrencyController(minConcurrency, renderConcurrency);
    let renderedSoFar = 0;
    let combinedAssets: any[] = [];
    let baseAssetsInfo: any = null;
    let lastAssetsInfo: any = null;
    const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'remotion-frames-'));
    let browser: any = null;

    try {
      browser = await openBrowser('chrome', {
        chromiumOptions,
        logLevel: 'warn'
      });

      for (const batch of batches) {
        if (!this.currentExport?.isActive) {
          throw new Error('Export cancelled by user');
        }

        const memoryBefore = this.getMemorySnapshot();
        const adaptiveConcurrency = concurrencyController.getConcurrency();
        // PERFORMANCE FIX: Limit threads to prevent explosion (N concurrent × threads = total).
        // 2 threads is optimal for most Macs - allows parallelism without overwhelming cores.
        const offthreadVideoThreads = Math.min(2, adaptiveConcurrency);

        const batchResult = await renderFrames({
          serveUrl: job.bundleLocation,
          composition,
          inputProps: job.inputProps,
          outputDir: framesDir,
          frameRange: [batch.start, batch.end],
          imageFormat: 'jpeg',
          jpegQuality,
          chromiumOptions,
          concurrency: adaptiveConcurrency,
          cancelSignal: this.currentExport?.cancelSignal,
          muted: false,
          everyNthFrame: 1,
          offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
          offthreadVideoThreads,
          logLevel: 'warn',
          binariesDirectory: job.compositorDir,
          onStart: ({ resolvedConcurrency }) => {
            console.log(`[ExportWorker] Rendering frames ${batch.start}-${batch.end} with concurrency=${resolvedConcurrency}`);
          },
          onFrameUpdate: (framesRendered) => {
            const now = Date.now();
            if (now - lastProgressUpdate > 500 || renderedSoFar + framesRendered >= totalFrames) {
              lastProgressUpdate = now;
              const totalRendered = Math.min(totalFrames, renderedSoFar + framesRendered);
              const progressPercent = 10 + Math.round((totalRendered / totalFrames) * 85);
              this.send('progress', {
                progress: progressPercent,
                currentFrame: totalRendered,
                totalFrames,
                stage: 'rendering',
                message: `Rendering frame ${totalRendered} of ${totalFrames}`
              });
            }
          },
          timeoutInMilliseconds: 120000, // Increase timeout to 120s to prevent failures on load
        });

        combinedAssets.push(...batchResult.assetsInfo.assets);
        if (!baseAssetsInfo) {
          baseAssetsInfo = batchResult.assetsInfo;
        }
        lastAssetsInfo = batchResult.assetsInfo;
        renderedSoFar += batchResult.frameCount;

        const memoryAfter = this.getMemorySnapshot();
        const pressure = this.detectMemoryPressure(memoryBefore, memoryAfter);
        const adjustment = concurrencyController.onChunkComplete(pressure);
        if (adjustment.adjusted) {
          console.log(`[ExportWorker] Adaptive concurrency -> ${adjustment.value} (${adjustment.reason})`);
        }
      }

      if (!baseAssetsInfo || !lastAssetsInfo || combinedAssets.length === 0) {
        throw new Error('No frames rendered');
      }

      const assetsInfo = {
        ...baseAssetsInfo,
        assets: combinedAssets,
        // CRITICAL FIX: Update frameCount to reflect the total number of frames,
        // otherwise stitchFramesToVideo uses the count from the first batch (baseAssetsInfo)
        frameCount: combinedAssets.length,
        durationInFrames: totalFrames, // Ensure stitcher knows full duration
        downloadMap: lastAssetsInfo.downloadMap,
        imageSequenceName: baseAssetsInfo.imageSequenceName,
        firstFrameIndex: baseAssetsInfo.firstFrameIndex
      };

      await stitchFramesToVideo({
        assetsInfo,
        fps,
        width,
        height,
        outputLocation: job.outputPath,
        codec: 'h264',
        videoBitrate: job.videoBitrate,
        x264Preset,
        enforceAudioTrack: false,
        cancelSignal: this.currentExport?.cancelSignal,
        binariesDirectory: job.compositorDir,
        hardwareAcceleration: job.useGPU ? 'if-possible' : 'disable',
        numberOfGifLoops: null,
      });
    } finally {
      if (browser) {
        try {
          await browser.close({ silent: true });
        } catch (error) {
          console.warn('[ExportWorker] Failed to close browser:', error);
        }
      }
      await fs.rm(framesDir, { recursive: true, force: true }).catch(() => { });
    }

    // Finalize
    this.send('progress', {
      progress: 95,
      stage: 'finalizing',
      message: 'Finalizing video...'
    });

    // Get file size
    const stats = await fs.stat(job.outputPath);
    const duration = (Date.now() - startTime) / 1000;
    const framesPerSecond = totalFrames / duration;

    console.log(`[ExportWorker] ✅ Export complete in ${duration.toFixed(1)}s (${framesPerSecond.toFixed(1)} fps, ${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

    await this.cleanup();

    return {
      success: true,
      outputPath: job.outputPath
    };
  }

  private async performChunkedExport(
    job: ExportJob,
    composition: any,
    totalFrames: number,
    chunkSize: number,
    _startTime: number = Date.now(),
    providedChunks?: ChunkAssignment[],
    combineChunksInWorker: boolean = true
  ): Promise<{ success: boolean; outputPath?: string; error?: string; chunkResults?: Array<{ index: number; path: string }> }> {

    const { renderMedia } = await import('@remotion/renderer');

    const chunks: string[] = [];
    const preservedChunkResults: Array<{ index: number; path: string }> = [];

    const totalMemGB = os.totalmem() / 1024 / 1024 / 1024;
    const fps = job.settings?.framerate || composition?.fps || 30;
    const width = job.compositionMetadata?.width ?? job.settings?.resolution?.width ?? 1920;
    const height = job.compositionMetadata?.height ?? job.settings?.resolution?.height ?? 1080;
    const is1080pOrLess = width * height <= 1920 * 1080;

    // PERFORMANCE FIX: Conservative limits to prevent thermal throttling.
    // The AdaptiveConcurrencyController will ramp up if the machine can handle it.
    const maxConcurrency =
      totalMemGB <= 16
        ? (is1080pOrLess ? 3 : 2)  // Conservative: 3 for 1080p, 2 for 4K on 16GB
        : totalMemGB <= 24
          ? 4  // Moderate for 24GB
          : 6; // Higher for 32GB+

    const minConcurrency = job.concurrency === 1 ? 1 : 2;
    const renderConcurrency = Math.max(minConcurrency, Math.min(job.concurrency || 3, maxConcurrency));
    const concurrencyController = new AdaptiveConcurrencyController(minConcurrency, renderConcurrency); // Start at 2 unless explicitly forced to 1

    const chunkPlan: ChunkAssignment[] = providedChunks && providedChunks.length > 0
      ? [...providedChunks].sort((a, b) => a.index - b.index)
      : this.buildChunkPlan(totalFrames, chunkSize, fps);

    const totalChunkCount = Math.max(job.totalChunks ?? 0, chunkPlan.length);
    const numChunks = chunkPlan.length;

    console.log(`[ExportWorker] Rendering ${numChunks} chunks of ${chunkSize} frames each (combine=${combineChunksInWorker})`);
    console.log(
      '[ExportDebug] worker-init',
      JSON.stringify({
        fps,
        totalFrames,
        chunkSize,
        chunks: numChunks,
        width,
        height,
        useGPU: Boolean(job.useGPU),
        concurrency: renderConcurrency,
        maxConcurrency,
        preferOffthreadVideo: Boolean(job.inputProps?.renderSettings?.preferOffthreadVideo),
        enhanceAudio: Boolean(job.settings?.enhanceAudio),
      })
    )

    try {
      for (let i = 0; i < numChunks; i++) {
        // CRITICAL FIX: Check for cancellation before starting each chunk
        if (!this.currentExport?.isActive) {
          throw new Error('Export cancelled by user')
        }

        const chunkInfo = chunkPlan[i];
        const startFrame = chunkInfo.startFrame;
        const endFrame = chunkInfo.endFrame;
        const chunkFrames = endFrame - startFrame + 1;

        if (chunkFrames <= 0) {
          console.warn(`[ExportWorker] Skipping empty chunk ${chunkInfo.index + 1}/${totalChunkCount}`);
          continue;
        }

        // Create temp file for this chunk.
        // IMPORTANT: Use the globally unique chunk index (not the local loop index),
        // otherwise parallel workers can generate colliding filenames and corrupt outputs.
        const chunkPath = path.join(
          os.tmpdir(),
          `remotion-chunk-${chunkInfo.index}-${process.pid}-${Date.now()}.mp4`
        );
        chunks.push(chunkPath);
        if (combineChunksInWorker) {
          this.currentExport?.tempFiles.push(chunkPath);
        }

        const chunkStartTime = Date.now();
        const memoryBefore = this.getMemorySnapshot();
        console.log(`[ExportWorker] Rendering chunk ${chunkInfo.index + 1}/${totalChunkCount}: frames ${startFrame}-${endFrame}`);

        // Calculate time range for this chunk
        // Use pre-filtered metadata if available, otherwise filter on demand
        let chunkInputProps = { ...job.inputProps };
        let filteredMetadata: any = {};
        let usingPreFiltered = false;

        // Check if we have pre-filtered metadata for this chunk
        if (job.preFilteredMetadata) {
          // Handle both Map and plain object formats
          let chunkMetadata: any;
          if (job.preFilteredMetadata instanceof Map) {
            chunkMetadata = job.preFilteredMetadata.get(chunkInfo.index);
            if (chunkMetadata instanceof Map) {
              filteredMetadata = Object.fromEntries(chunkMetadata);
              usingPreFiltered = true;
            } else if (chunkMetadata) {
              filteredMetadata = chunkMetadata;
              usingPreFiltered = true;
            }
          } else {
            // Plain object format from IPC
            chunkMetadata = job.preFilteredMetadata[chunkInfo.index];
            if (chunkMetadata && typeof chunkMetadata === 'object') {
              filteredMetadata = chunkMetadata;
              usingPreFiltered = true;
            }
          }

          if (usingPreFiltered && Object.keys(filteredMetadata).length > 0) {
            console.log(`[ExportWorker] ✓ Using pre-filtered metadata for chunk ${chunkInfo.index + 1} (${Object.keys(filteredMetadata).length} recordings)`);
          } else if (job.preFilteredMetadata) {
            console.log(`[ExportWorker] ⚠️ Pre-filtered metadata provided but empty for chunk ${chunkInfo.index + 1}, will filter on-demand`);
          }
        }

        // MainComposition doesn't need segment filtering - pass props through directly
        // Remotion's chunking handles memory management, we just render the full composition
        chunkInputProps = {
          ...job.inputProps,
          // Keep the full metadata (already filtered by export-handler if needed)
          metadata: usingPreFiltered ? filteredMetadata : job.inputProps.metadata,
          frameOffset: startFrame
        };

        // Update progress
        const baseProgress = (chunkInfo.index / Math.max(1, totalChunkCount)) * 80;
        this.send('progress', {
          progress: 10 + Math.round(baseProgress),
          stage: 'rendering',
          message: `Rendering chunk ${chunkInfo.index + 1} of ${totalChunkCount}...`,
          currentFrame: startFrame,
          totalFrames,
          chunkIndex: chunkInfo.index,
          chunkCount: totalChunkCount,
          chunkRenderedFrames: 0,
          chunkTotalFrames: chunkFrames,
          chunkStartFrame: startFrame,
          chunkEndFrame: endFrame
        });

        // Render this chunk with filtered segments
        const chunkComposition = {
          ...composition,
          // Keep full duration so frameRange maps to absolute frames
          durationInFrames: composition.durationInFrames,
          props: chunkInputProps,
        };

        this.normalizeVideoProps(chunkInputProps);
        const chunkResources = this.getVideoResources(chunkInputProps);

        const chunkFrameRange: [number, number] = [startFrame, endFrame];

        console.log('[ExportWorker] chunk inputProps.videoUrls:', chunkResources?.videoUrls);
        console.log('[ExportWorker] chunk recording IDs:', Object.keys(chunkResources?.videoUrls || {}));
        const x264Preset = this.coerceX264Preset(job.x264Preset) ?? 'veryfast';
        // PERFORMANCE: Lowered default JPEG quality (75 is visually lossless for intermediates)
        const jpegQuality = Math.max(40, Math.min(job.jpegQuality ?? 75, 100));
        const adaptiveConcurrency = concurrencyController.getConcurrency();
        // PERFORMANCE FIX: Limit threads to prevent explosion (N concurrent × threads = total).
        const offthreadVideoThreads = Math.min(2, adaptiveConcurrency);

        const resources = this.getVideoResources(chunkInputProps)
        const urlValues = resources?.videoUrls ? Object.values(resources.videoUrls) : []
        const hostCounts = urlValues.reduce<Record<string, number>>((acc, url) => {
          if (typeof url !== 'string') {
            acc.invalid = (acc.invalid ?? 0) + 1
            return acc
          }
          try {
            const host = new URL(url).host
            acc[host] = (acc[host] ?? 0) + 1
          } catch {
            acc.invalid = (acc.invalid ?? 0) + 1
          }
          return acc
        }, {})
        console.log(
          '[ExportDebug] chunk',
          JSON.stringify({
            index: chunkInfo.index,
            frameRange: [startFrame, endFrame],
            chunkFrames,
            concurrency: adaptiveConcurrency,
            offthreadVideoThreads,
            jpegQuality,
            x264Preset,
            useGPU: Boolean(job.useGPU),
            gl: job.useGPU ? 'angle' : 'swangle',
            videoUrls: Object.keys(resources?.videoUrls || {}).length,
            videoHosts: hostCounts,
          })
        )

        await renderMedia({
          serveUrl: job.bundleLocation,
          composition: chunkComposition,
          inputProps: chunkInputProps,
          outputLocation: chunkPath,
          codec: 'h264',
          // CRITICAL FIX: Pass cancelSignal to allow mid-render cancellation
          cancelSignal: this.currentExport?.cancelSignal,
          // PERFORMANCE: Use hardware encoding when available
          hardwareAcceleration: job.useGPU ? 'if-possible' : 'disable',
          videoBitrate: job.videoBitrate,
          x264Preset,
          // OPTIMIZED: Lower JPEG quality for better performance (70 is sweet spot)
          jpegQuality,
          imageFormat: 'jpeg',
          frameRange: chunkFrameRange,
          concurrency: adaptiveConcurrency,
          enforceAudioTrack: false, // Don't require audio track
          offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
          offthreadVideoThreads,
          // Enable aggressive caching
          numberOfGifLoops: null,
          everyNthFrame: 1,
          preferLossless: false, // Prefer speed
          chromiumOptions: {
            // STABILITY FIX: Use conservative GPU settings to prevent crashes
            // Restore 'angle' backend as removing it caused performance regression
            gl: job.useGPU ? 'angle' : 'swangle',
            headless: true,
            args: [
              '--allow-file-access',
              '--allow-file-access-from-files',
              // STABILITY: Removed aggressive GPU flags that caused crashes
              '--enable-gpu-rasterization',
              '--enable-accelerated-video-decode',
              '--enable-accelerated-2d-canvas',
              '--num-raster-threads=2' // Restore thread limit
            ],
            enableMultiProcessOnLinux: true,
            disableWebSecurity: false,
            ignoreCertificateErrors: false,
            ...(job.useGPU ? {
              enableAcceleratedVideoDecode: true,
            } : {}),
            userAgent: undefined,
            ...({ chromiumSandbox: true, enableFakeUserMedia: false } as any),
          },
          binariesDirectory: job.compositorDir,
          // CRITICAL FIX: Force single-threaded rendering when concurrency=1
          disallowParallelEncoding: false,
          logLevel: 'warn',  // Reduced from 'info' to avoid console spam
          onProgress: ({ renderedFrames }) => {
            const chunkProgress = renderedFrames / chunkFrames;
            const totalProgress = 10 + ((chunkInfo.index + chunkProgress) / Math.max(1, totalChunkCount)) * 80;

            this.send('progress', {
              progress: Math.round(totalProgress),
              currentFrame: startFrame + renderedFrames,
              totalFrames,
              stage: 'rendering',
              message: `Rendering chunk ${chunkInfo.index + 1}/${totalChunkCount}: frame ${renderedFrames}/${chunkFrames}`,
              chunkIndex: chunkInfo.index,
              chunkCount: totalChunkCount,
              chunkRenderedFrames: renderedFrames,
              chunkTotalFrames: chunkFrames,
              chunkStartFrame: startFrame,
              chunkEndFrame: endFrame
            });
          },
          timeoutInMilliseconds: 120000, // Increase timeout to 120s
        });

        const chunkDuration = (Date.now() - chunkStartTime) / 1000;
        const chunkFps = chunkFrames / chunkDuration;
        console.log(`[ExportWorker] ✓ Chunk ${chunkInfo.index + 1} complete in ${chunkDuration.toFixed(1)}s (${chunkFps.toFixed(1)} fps)`);

        const memoryAfter = this.getMemorySnapshot();
        const pressure = this.detectMemoryPressure(memoryBefore, memoryAfter);
        const adjustment = concurrencyController.onChunkComplete(pressure);
        if (adjustment.adjusted) {
          console.log(`[ExportWorker] Adaptive concurrency -> ${adjustment.value} (${adjustment.reason})`);
        }

        // Force garbage collection between chunks if available
        if (global.gc) {
          global.gc();
        }

        // PERFORMANCE: Reduced inter-chunk delay (memory pressure is now handled adaptively)
        // Only add minimal delay to allow event loop to process
        if (i < numChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      if (!combineChunksInWorker) {
        preservedChunkResults.push(...chunks.map((chunkPath, idx) => ({
          index: chunkPlan[idx].index,
          path: chunkPath
        })));

        const lastChunk = chunkPlan[chunkPlan.length - 1];
        const lastChunkFrames = lastChunk ? lastChunk.endFrame - lastChunk.startFrame + 1 : 0;

        this.send('progress', {
          progress: Math.min(90, 10 + Math.round(((lastChunk?.index ?? 0) + 1) / Math.max(1, totalChunkCount) * 80)),
          stage: 'rendering',
          message: 'Chunk rendering complete',
          chunkIndex: lastChunk?.index ?? 0,
          chunkCount: totalChunkCount,
          chunkRenderedFrames: lastChunkFrames,
          chunkTotalFrames: lastChunkFrames,
          chunkStartFrame: lastChunk?.startFrame ?? 0,
          chunkEndFrame: lastChunk?.endFrame ?? 0
        });

        await this.cleanup();

        return {
          success: true,
          chunkResults: preservedChunkResults.sort((a, b) => a.index - b.index)
        };
      }

      // Combine chunks
      this.send('progress', {
        progress: 90,
        stage: 'finalizing',
        message: 'Combining video chunks...'
      });

      console.log(`[ExportWorker] Combining ${chunks.length} chunks into final video`);

      // Use FFmpeg directly to concatenate videos
      const concatListPath = path.join(os.tmpdir(), `concat-${Date.now()}.txt`);
      this.currentExport?.tempFiles.push(concatListPath);

      // Verify all chunk files exist before concat
      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = chunks[i];
        const exists = fsSync.existsSync(chunkPath);
        if (!exists) {
          throw new Error(`Chunk file ${i + 1}/${chunks.length} not found at: ${chunkPath}`);
        }
        const stats = await fs.stat(chunkPath);
        console.log(`[ExportWorker] Chunk ${i + 1}: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
      }

      // Create concat file
      const concatContent = chunks.map(chunk => `file '${chunk}'`).join('\n');
      await fs.writeFile(concatListPath, concatContent);
      console.log(`[ExportWorker] Concat list:\n${concatContent}`);

      // Run FFmpeg concat
      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-y', // Overwrite output file if exists
        // CRITICAL: Stream copy video to avoid re-encoding (prevents huge file size increase)
        '-c:v', 'copy',
        // Apply audio enhancement if enabled
      ];

      if (job.settings.enhanceAudio) {
        // Match Web Audio API compressor settings for consistent preview/export
        ffmpegArgs.push(
          '-af',
          'acompressor=threshold=-24dB:ratio=4:attack=3:release=150',
          // When applying audio filter, must re-encode audio (can't use -c:a copy with -af)
          '-c:a', 'aac',
          '-b:a', '160k'
        );
      } else {
        // Use copy if no enhancement
        ffmpegArgs.push('-c:a', 'copy');
      }
      ffmpegArgs.push(job.outputPath);

      console.log(`[ExportWorker] Running FFmpeg: ${job.ffmpegPath} ${ffmpegArgs.join(' ')}`);

      // CRITICAL FIX: Set DYLD_LIBRARY_PATH so FFmpeg can find its dynamic libraries
      // FFmpeg binary needs libavdevice.dylib, libavcodec.dylib, etc. from same directory
      const ffmpegDir = path.dirname(job.ffmpegPath);
      const env = {
        ...process.env,
        DYLD_LIBRARY_PATH: `${ffmpegDir}:${process.env.DYLD_LIBRARY_PATH || ''}`
      };

      const ffmpegProcess = spawn(job.ffmpegPath, ffmpegArgs, { env });

      let ffmpegStderr = '';
      let ffmpegStdout = '';

      ffmpegProcess.stderr?.on('data', (data) => {
        ffmpegStderr += data.toString();
      });

      ffmpegProcess.stdout?.on('data', (data) => {
        ffmpegStdout += data.toString();
      });

      await new Promise<void>((resolve, reject) => {
        ffmpegProcess.on('exit', (code, signal) => {
          if (code === 0) {
            console.log(`[ExportWorker] FFmpeg concat successful`);
            resolve();
          } else {
            console.error(`[ExportWorker] FFmpeg concat failed with code ${code}, signal ${signal}`);
            console.error(`[ExportWorker] FFmpeg stderr:\n${ffmpegStderr}`);
            console.error(`[ExportWorker] FFmpeg stdout:\n${ffmpegStdout}`);
            reject(new Error(`FFmpeg concat failed with code ${code}, signal ${signal}\nStderr: ${ffmpegStderr.slice(-500)}`));
          }
        });
        ffmpegProcess.on('error', (err) => {
          console.error(`[ExportWorker] FFmpeg process error:`, err);
          reject(err);
        });
      });

      // Clean up chunk files
      for (const chunk of chunks) {
        await fs.unlink(chunk).catch(() => { });
      }

      this.send('progress', {
        progress: 95,
        stage: 'finalizing',
        message: 'Finalizing video...'
      });

      await this.cleanup();

      return {
        success: true,
        outputPath: job.outputPath
      };

    } catch (error) {
      // Clean up chunk files on error
      for (const chunk of chunks) {
        await fs.unlink(chunk).catch(() => { });
      }
      throw error;
    }
  }

  private ensureFileVideoUrls(job: ExportJob): void {
    if (!job.inputProps) {
      return;
    }

    this.normalizeVideoProps(job.inputProps);
  }

  private normalizeVideoProps(inputProps: any): void {
    if (!inputProps || typeof inputProps !== 'object') {
      return;
    }

    const resources = this.getVideoResources(inputProps);
    const videoUrls = resources?.videoUrls;
    if (!videoUrls) {
      return;
    }

    if (videoUrls instanceof Map) {
      videoUrls.forEach((url: unknown, recId: string) => {
        if (typeof url !== 'string') {
          return;
        }
        const normalized = this.resolveVideoUrlToFile(url, recId, inputProps);
        if (normalized && normalized !== url) {
          videoUrls.set(recId, normalized);
        }
      });
      return;
    }

    if (typeof videoUrls === 'object') {
      Object.entries(videoUrls as Record<string, string | undefined>).forEach(([recId, url]) => {
        if (typeof url !== 'string') {
          return;
        }
        const normalized = this.resolveVideoUrlToFile(url, recId, inputProps);
        if (normalized && normalized !== url) {
          (resources as any).videoUrls[recId] = normalized;
        }
      });
    }
  }

  private getVideoResources(inputProps: any): any | null {
    if (!inputProps || typeof inputProps !== 'object') {
      return null;
    }
    if (inputProps.resources && typeof inputProps.resources === 'object') {
      return inputProps.resources;
    }
    return inputProps;
  }

  private resolveVideoUrlToFile(
    url: string | undefined,
    recordingId: string | undefined,
    inputProps: any
  ): string | undefined {
    if (!url || typeof url !== 'string') {
      return url;
    }

    const trimmed = url.trim();
    if (!trimmed) {
      return url;
    }

    if (
      trimmed.startsWith('file://') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://')
    ) {
      return trimmed;
    }

    let normalizedPath = this.normalizeVideoPath(trimmed);

    const recording =
      recordingId && inputProps?.recordings
        ? inputProps.recordings[recordingId]
        : null;

    const folderPath =
      typeof recording?.folderPath === 'string'
        ? this.normalizeVideoPath(recording.folderPath)
        : null;

    const projectFolder =
      typeof inputProps?.projectFolder === 'string'
        ? this.normalizeVideoPath(inputProps.projectFolder)
        : null;

    const candidates = new Set<string>();

    if (recording?.filePath && typeof recording.filePath === 'string') {
      candidates.add(this.normalizeVideoPath(recording.filePath));
    }

    if (normalizedPath) {
      candidates.add(normalizedPath);
    }

    if (folderPath) {
      const basename = normalizedPath ? path.basename(normalizedPath) : null;
      if (basename) {
        candidates.add(path.join(folderPath, basename));
      }

      if (recording?.filePath) {
        candidates.add(path.join(folderPath, path.basename(recording.filePath)));
      }
    }

    if (projectFolder && normalizedPath && !path.isAbsolute(normalizedPath)) {
      candidates.add(path.join(projectFolder, normalizedPath));
    }

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      const absoluteCandidate = path.isAbsolute(candidate)
        ? candidate
        : folderPath && path.isAbsolute(folderPath)
          ? path.join(folderPath, candidate)
          : projectFolder && path.isAbsolute(projectFolder)
            ? path.join(projectFolder, candidate)
            : path.resolve(candidate);

      if (fsSync.existsSync(absoluteCandidate)) {
        // STABILITY: Don't convert to file:// - Chromium blocks these URLs
        // The export handler already provides HTTP URLs via makeVideoSrc()
        // Just return the original URL if we can't find a better one
        console.log(`[ExportWorker] Found file at ${absoluteCandidate}, but keeping original URL to avoid file:// security issues`);
      }
    }

    return url;
  }

  private normalizeVideoPath(inputPath: string): string {
    if (!inputPath) {
      return '';
    }

    let normalized = inputPath.trim();

    normalized = normalized.replace(/^(file|video-stream):\/+/i, '');

    if (normalized.startsWith('local/')) {
      normalized = normalized.slice(6);
    } else if (normalized.startsWith('file/')) {
      normalized = normalized.slice(5);
    }

    const queryIndex = normalized.indexOf('?');
    if (queryIndex >= 0) {
      normalized = normalized.slice(0, queryIndex);
    }

    const hashIndex = normalized.indexOf('#');
    if (hashIndex >= 0) {
      normalized = normalized.slice(0, hashIndex);
    }

    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // ignore decode errors
    }

    normalized = normalized.replace(/^([A-Za-z])%3A/i, '$1:');

    if (process.platform === 'win32') {
      normalized = normalized.replace(/\//g, '\\');
      if (normalized.match(/^[a-z]:/)) {
        normalized = normalized[0].toUpperCase() + normalized.slice(1);
      }
    } else {
      normalized = normalized.replace(/\\/g, '/');
      if (!normalized.startsWith('/') && normalized.match(/^(Users|home|var|tmp|opt|Volumes)/i)) {
        normalized = '/' + normalized;
      }
    }

    return normalized;
  }

  private buildChunkPlan(totalFrames: number, chunkSize: number, fps: number): ChunkAssignment[] {
    const numChunks = Math.ceil(totalFrames / chunkSize);
    const plan: ChunkAssignment[] = [];

    for (let index = 0; index < numChunks; index++) {
      const startFrame = index * chunkSize;
      const endFrame = Math.min(startFrame + chunkSize - 1, totalFrames - 1);
      const startTimeMs = (startFrame / fps) * 1000;
      const endTimeMs = ((endFrame + 1) / fps) * 1000;

      plan.push({
        index,
        startFrame,
        endFrame,
        startTimeMs,
        endTimeMs
      });
    }

    return plan;
  }

  private async cancelExport(): Promise<void> {
    console.log('[ExportWorker] Cancelling export...');

    if (this.currentExport) {
      this.currentExport.isActive = false;

      // CRITICAL FIX: Call Remotion's cancel signal to abort renderMedia mid-render
      // This stops the actual rendering process, not just the chunk loop
      if (this.currentExport.cancelRenderFn) {
        console.log('[ExportWorker] Calling Remotion cancel signal...');
        try {
          this.currentExport.cancelRenderFn();
        } catch (e) {
          console.warn('[ExportWorker] Cancel signal error (expected):', e);
        }
      }
    }

    await this.cleanup();

    // STABILITY FIX: Wait for browser resources to be released
    // This prevents memory from staying allocated after cancel
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    console.log('[ExportWorker] Cancel cleanup complete');
  }

  private async cleanup(): Promise<void> {
    if (!this.currentExport) return;

    // Mark as inactive first
    this.currentExport.isActive = false;

    // Clean up any temp files
    for (const tempFile of this.currentExport.tempFiles) {
      await fs.unlink(tempFile).catch(() => { });
    }

    this.currentExport = null;

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  private getStatus(): { isExporting: boolean } {
    return {
      isExporting: this.currentExport?.isActive || false
    };
  }
}

// Create and start the worker
new ExportWorker();
console.log('[ExportWorker] Worker process started');
