/**
 * Export progress tracking and aggregation
 * Handles progress from multiple chunks/workers and forwards to UI
 */

import type { WebContents } from 'electron'
import type { SupervisedWorker } from '../../utils/worker-manager'
import type { ProgressData, AggregatedProgress } from './types'
import os from 'os'
import { execSync } from 'child_process'

/**
 * Progress tracker for managing export progress across chunks
 */
export class ProgressTracker {
  private chunkProgress = new Map<number, { rendered: number; total: number }>()
  private lastForwardedProgress = 0
  private totalFrameCount: number
  private webContents: WebContents
  private lastPercentLogged = -1
  private lastPercentLoggedAt = Date.now()
  private startedAt = Date.now()
  private lastPerfLoggedAt = Date.now()
  private lastRenderedSumLogged = 0
  private lastProcessSampleAt = 0

  constructor(webContents: WebContents, totalFrames: number) {
    this.webContents = webContents
    this.totalFrameCount = Math.max(1, totalFrames || 0)
    const now = Date.now()
    this.startedAt = now
    this.lastPercentLoggedAt = now
    this.lastPerfLoggedAt = now
  }

  private formatSeconds(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return 'n/a'
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    const remSeconds = Math.round(seconds - minutes * 60)
    return `${minutes}m${String(remSeconds).padStart(2, '0')}s`
  }

  private computeAvg(renderedFrames: number): { avgFps: number; etaSeconds: number } {
    const now = Date.now()
    const elapsedSeconds = Math.max(0.001, (now - this.startedAt) / 1000)
    const avgFps = renderedFrames / elapsedSeconds
    const remainingFrames = Math.max(0, this.totalFrameCount - renderedFrames)
    const etaSeconds = avgFps > 0.01 ? remainingFrames / avgFps : Number.NaN
    return { avgFps, etaSeconds }
  }

  /**
   * Logs progress only if it has increased by at least 1% since the last log.
   * Also samples memory and CPU usage periodically.
   */
  private maybeLogPercentDelta(
    progress: number,
    stage: string | undefined,
    renderedSum?: number
  ): void {
    const whole = Math.floor(progress)
    if (!Number.isFinite(whole) || whole < 0) return
    if (whole <= this.lastPercentLogged) return

    const now = Date.now()
    const deltaMs = now - this.lastPercentLoggedAt
    this.lastPercentLogged = whole
    this.lastPercentLoggedAt = now

    const mem = process.memoryUsage()
    const rssMB = mem.rss / (1024 * 1024)
    const heapUsedMB = mem.heapUsed / (1024 * 1024)
    const externalMB = mem.external / (1024 * 1024)

    // Activity Monitor numbers include Chromium child processes; Node's memoryUsage() is only for this process.
    // Sample child processes occasionally (debug aid) to correlate with Activity Monitor.
    let childPart = ''
    const nowForSample = now
    if (process.platform === 'darwin' && nowForSample - this.lastProcessSampleAt > 12_000) {
      this.lastProcessSampleAt = nowForSample
      try {
        const out = execSync('ps -axo command=,rss=', { encoding: 'utf8' })
        let chromeCount = 0
        let chromeRssKB = 0
        for (const line of out.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          // Format: "<command...> <rss_kb>"
          const parts = trimmed.split(/\s+/)
          if (parts.length < 2) continue
          const rss = Number(parts[parts.length - 1])
          const command = parts.slice(0, -1).join(' ')
          if (!Number.isFinite(rss) || rss <= 0) continue
          // Avoid counting your regular Chrome; Remotion uses headless + remote debugging.
          const isRemotionChrome =
            (command.includes('chrome-headless-shell') || command.includes('Chromium') || command.includes('chrome-for-testing')) &&
            command.includes('--remote-debugging-port=')

          if (isRemotionChrome) {
            chromeCount += 1
            chromeRssKB += rss
          }
        }
        const chromeMB = chromeRssKB / 1024
        const freeGB = os.freemem() / (1024 * 1024 * 1024)
        const totalGB = os.totalmem() / (1024 * 1024 * 1024)
        childPart = `, chrome=${chromeCount}x ${chromeMB.toFixed(0)}MB, free=${freeGB.toFixed(1)}/${totalGB.toFixed(1)}GB`
      } catch {
        // ignore process sampling errors
      }
    }

    let perfPart = ''
    if (typeof renderedSum === 'number' && Number.isFinite(renderedSum)) {
      const perfNow = now
      const perfDeltaMs = Math.max(1, perfNow - this.lastPerfLoggedAt)
      const deltaFrames = Math.max(0, renderedSum - this.lastRenderedSumLogged)
      const instFps = (deltaFrames / perfDeltaMs) * 1000
      const { avgFps, etaSeconds } = this.computeAvg(renderedSum)

      this.lastPerfLoggedAt = perfNow
      this.lastRenderedSumLogged = renderedSum

      perfPart = `, frames=${renderedSum}/${this.totalFrameCount}, fps=${instFps.toFixed(1)} (avg ${avgFps.toFixed(1)}), eta=${this.formatSeconds(etaSeconds)}`
    }

    console.log(
      `[Export] +1% in ${deltaMs}ms (now ${whole}%, stage=${stage ?? 'unknown'}${perfPart}, rss=${rssMB.toFixed(
        0
      )}MB, heap=${heapUsedMB.toFixed(0)}MB, ext=${externalMB.toFixed(0)}MB${childPart})`
    )
  }

  /**
   * Clamp progress to valid range and ensure monotonic increase
   */
  private clampProgress(value: number | undefined): number {
    if (!Number.isFinite(value ?? NaN)) {
      return this.lastForwardedProgress
    }
    const normalized = Math.min(100, Math.max(0, Math.round(value!)))
    return Math.max(this.lastForwardedProgress, normalized)
  }

  /**
   * Forward progress message to the renderer
   */
  forwardProgressMessage(payload: ProgressData | any): void {
    const data = payload ?? {}

    const hasChunkInfo =
      typeof data.chunkIndex === 'number' &&
      typeof data.chunkTotalFrames === 'number' &&
      Number.isFinite(data.chunkTotalFrames)

    if (hasChunkInfo) {
      const safeTotal = Math.max(0, data.chunkTotalFrames)
      const rendered = Math.max(0, Math.min(safeTotal, data.chunkRenderedFrames ?? 0))

      const chunkState = this.chunkProgress.get(data.chunkIndex) ?? { rendered: 0, total: safeTotal }
      chunkState.rendered = rendered
      if (safeTotal > 0) {
        chunkState.total = safeTotal
      }
      this.chunkProgress.set(data.chunkIndex, chunkState)

      let renderedSum = 0
      for (const state of this.chunkProgress.values()) {
        const chunkTotal = Math.max(1, state.total || 0)
        const chunkRendered = Math.max(0, Math.min(chunkTotal, state.rendered))
        renderedSum += chunkRendered
      }

      const normalized = Math.min(1, Math.max(0, renderedSum / this.totalFrameCount))
      const scaled = 10 + normalized * 80
      const percent = this.clampProgress(scaled)
      const { avgFps, etaSeconds } = this.computeAvg(renderedSum)

      const stage = data.stage === 'finalizing' ? 'finalizing' : data.stage === 'encoding' ? 'encoding' : 'rendering'
      const message = stage === 'finalizing'
        ? 'Finalizing export...'
        : `Rendering ${percent}% complete`

      const aggregated: AggregatedProgress = {
        progress: percent,
        stage,
        message,
        currentFrame: renderedSum,
        totalFrames: this.totalFrameCount,
        fps: Number.isFinite(avgFps) ? avgFps : undefined,
        etaSeconds: Number.isFinite(etaSeconds) ? etaSeconds : undefined
      }

      this.maybeLogPercentDelta(aggregated.progress, aggregated.stage, renderedSum)
      this.webContents.send('export-progress', aggregated)
      this.lastForwardedProgress = aggregated.progress
      return
    }

    if (typeof data.progress === 'number') {
      const percent = this.clampProgress(data.progress)
      const stage = data.stage ?? (percent >= 100 ? 'complete' : 'encoding')
      const message = data.stage === 'finalizing'
        ? 'Finalizing export...'
        : data.stage === 'complete'
          ? 'Export complete!'
          : `Rendering ${percent}% complete`

      const renderedFrames =
        typeof data.currentFrame === 'number' && Number.isFinite(data.currentFrame)
          ? Math.max(0, Math.min(this.totalFrameCount, Math.floor(data.currentFrame)))
          : undefined
      const perf = typeof renderedFrames === 'number' ? this.computeAvg(renderedFrames) : null

      const aggregated: AggregatedProgress = {
        progress: percent,
        stage,
        message,
        currentFrame: renderedFrames,
        totalFrames: this.totalFrameCount,
        fps: perf && Number.isFinite(perf.avgFps) ? perf.avgFps : undefined,
        etaSeconds: perf && Number.isFinite(perf.etaSeconds) ? perf.etaSeconds : undefined
      }

      this.maybeLogPercentDelta(aggregated.progress, aggregated.stage)
      this.webContents.send('export-progress', aggregated)
      this.lastForwardedProgress = aggregated.progress
      return
    }

    const fallback: AggregatedProgress = {
      progress: this.lastForwardedProgress,
      stage: data.stage ?? 'rendering',
      message: data.message ?? `Rendering ${this.lastForwardedProgress}% complete`
    }

    this.maybeLogPercentDelta(fallback.progress, fallback.stage)
    this.webContents.send('export-progress', fallback)
    this.lastForwardedProgress = fallback.progress
  }

  /**
   * Send a specific progress update
   */
  sendProgress(progress: number, stage: string, message: string): void {
    const clamped = this.clampProgress(progress)
    this.maybeLogPercentDelta(clamped, stage)
    this.webContents.send('export-progress', {
      progress: clamped,
      stage,
      message
    })
    this.lastForwardedProgress = clamped
  }

  /**
   * Attach progress forwarder to a worker
   * @returns Cleanup function to detach the forwarder
   */
  attachToWorker(worker: SupervisedWorker): () => void {
    const forward = (message: any) => {
      if (message.type === 'progress') {
        this.forwardProgressMessage(message.data)
      }
    }

    worker.on('message', forward)
    return () => worker.off('message', forward)
  }

  /**
   * Get the last forwarded progress value
   */
  getLastProgress(): number {
    return this.lastForwardedProgress
  }

  /**
   * Reset progress tracking state
   */
  reset(): void {
    this.chunkProgress.clear()
    this.lastForwardedProgress = 0
    this.lastPercentLogged = -1
    const now = Date.now()
    this.startedAt = now
    this.lastPercentLoggedAt = now
    this.lastPerfLoggedAt = now
    this.lastRenderedSumLogged = 0
  }
}
