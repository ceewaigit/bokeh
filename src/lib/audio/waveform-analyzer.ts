/**
 * Audio waveform analyzer for extracting real audio data from video files
 */

export interface WaveformData {
  peaks: number[]  // Normalized peak values (0-1)
  duration: number // Duration in ms
  sampleRate: number
}

export class WaveformAnalyzer {
  private static cache = new Map<string, WaveformData>()
  private static MAX_CACHE_SIZE = 5  // Reduced from 20 to save memory
  // MEMORY FIX: Skip waveform analysis for large videos to prevent memory bloat
  private static MAX_VIDEO_SIZE_FOR_WAVEFORM = 100 * 1024 * 1024  // 100MB limit

  // Concurrency control
  private static analysisQueue: Array<() => Promise<void>> = []
  private static isAnalyzing = false

  /**
   * Analyze audio from a video blob URL and extract waveform data
   */
  static async analyzeAudio(
    blobUrl: string,
    clipId: string,
    startTime: number = 0,
    duration: number = 0,
    samplesPerSecond: number = 100 // How many samples per second to extract
  ): Promise<WaveformData | null> {
    // Check cache first (sync check to avoid queue if possible)
    const cacheKey = `${clipId}-${startTime}-${duration}-${samplesPerSecond}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    // Wrap the actual analysis in a promise that resolves when it's this task's turn
    return new Promise<WaveformData | null>((resolve) => {
      const task = async () => {
        try {
          const result = await this._performAnalysis(blobUrl, cacheKey, startTime, duration, samplesPerSecond)
          resolve(result)
        } catch (e) {
          resolve(null)
        }
      }

      this.analysisQueue.push(task)
      this.processQueue()
    })
  }

  private static async processQueue() {
    if (this.isAnalyzing || this.analysisQueue.length === 0) return

    this.isAnalyzing = true
    const task = this.analysisQueue.shift()
    if (task) {
      try {
        await task()
      } finally {
        this.isAnalyzing = false
        // Process next item
        this.processQueue()
      }
    }
  }

  private static async _performAnalysis(
    blobUrl: string,
    cacheKey: string,
    startTime: number,
    duration: number,
    samplesPerSecond: number
  ): Promise<WaveformData | null> {
    let audioContext: BaseAudioContext | null = null

    try {
      // Prefer OfflineAudioContext to avoid needing an active audio device.
      if ('OfflineAudioContext' in window) {
        audioContext = new OfflineAudioContext(1, 1, 44100)
      } else {
        console.warn('OfflineAudioContext unavailable; skipping waveform analysis to avoid AudioContext device errors.')
        return null
      }

      // Fetch the video as array buffer (works for blob: and http(s); may work for custom protocols in Electron)
      const response = await fetch(blobUrl)

      // MEMORY FIX: Check Content-Length to skip large videos
      // This prevents loading 100MB+ videos into memory just for waveform display
      const contentLength = response.headers.get('content-length')
      if (contentLength) {
        const size = parseInt(contentLength, 10)
        if (size > this.MAX_VIDEO_SIZE_FOR_WAVEFORM) {
          console.warn(`Skipping waveform for large video (${Math.round(size / 1024 / 1024)}MB > ${Math.round(this.MAX_VIDEO_SIZE_FOR_WAVEFORM / 1024 / 1024)}MB limit)`)
          return null
        }
      }

      const arrayBuffer = await response.arrayBuffer()

      // Double-check actual size after download (in case Content-Length was missing)
      if (arrayBuffer.byteLength > this.MAX_VIDEO_SIZE_FOR_WAVEFORM) {
        console.warn(`Skipping waveform for large video (${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB)`)
        return null
      }

      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      // Get audio channel data (use first channel for simplicity)
      const channelData = audioBuffer.getChannelData(0)
      const audioSampleRate = audioBuffer.sampleRate

      // Calculate sample window
      const startSample = Math.floor((startTime / 1000) * audioSampleRate)
      const durationInSeconds = duration > 0 ? duration / 1000 : audioBuffer.duration
      const endSample = Math.min(
        channelData.length,
        startSample + Math.floor(durationInSeconds * audioSampleRate)
      )

      // Calculate how many samples to extract
      const totalSamples = Math.floor(durationInSeconds * samplesPerSecond)
      const samplesPerPeak = Math.floor((endSample - startSample) / totalSamples)

      // Extract peaks
      const peaks: number[] = []

      for (let i = 0; i < totalSamples; i++) {
        const start = startSample + i * samplesPerPeak
        const end = Math.min(start + samplesPerPeak, endSample)

        // Find the peak in this window
        let peak = 0
        for (let j = start; j < end; j++) {
          const absValue = Math.abs(channelData[j])
          if (absValue > peak) {
            peak = absValue
          }
        }

        // Normalize to 0-1 range
        peaks.push(Math.min(1, peak))
      }

      // Apply smoothing to reduce noise
      const smoothedPeaks = this.smoothWaveform(peaks)

      const waveformData: WaveformData = {
        peaks: smoothedPeaks,
        duration: durationInSeconds * 1000,
        sampleRate: samplesPerSecond
      }

      // Cache the result with LRU eviction
      if (this.cache.size >= this.MAX_CACHE_SIZE) {
        const firstKey = this.cache.keys().next().value
        if (firstKey) this.cache.delete(firstKey)
      }
      this.cache.set(cacheKey, waveformData)

      return waveformData

    } catch (error) {
      console.warn('Failed to analyze audio:', error)
      return null
    } finally {
      try {
        if (audioContext instanceof AudioContext) {
          audioContext.close().catch(() => { })
        }
      } catch {
        // Ignore close errors
      }
    }
  }

  /**
   * Apply smoothing to waveform peaks to reduce visual noise
   */
  private static smoothWaveform(peaks: number[], windowSize: number = 3): number[] {
    const smoothed: number[] = []

    for (let i = 0; i < peaks.length; i++) {
      let sum = 0
      let count = 0

      // Average with neighboring samples
      for (let j = Math.max(0, i - windowSize); j <= Math.min(peaks.length - 1, i + windowSize); j++) {
        sum += peaks[j]
        count++
      }

      smoothed.push(sum / count)
    }

    return smoothed
  }

  /**
   * Clear cached waveform data for a specific clip
   */
  static clearCache(clipId?: string) {
    if (clipId) {
      // Remove all cache entries for this clip
      const keys = Array.from(this.cache.keys())
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        if (key.startsWith(clipId)) {
          this.cache.delete(key)
        }
      }
    } else {
      // Clear all cache
      this.cache.clear()
    }
  }

  /**
   * Clear all cached waveform data
   * Used when closing a project to free memory
   */
  static clearAllCache(): void {
    this.cache.clear()
  }

  /**
   * Clear cached waveform data for clips belonging to a recording
   * Note: Cache keys are clipId-based, so caller must provide relevant clipIds
   * @param clipIds - Array of clip IDs that belong to the recording being removed
   */
  static clearCacheForClips(clipIds: string[]): void {
    for (const clipId of clipIds) {
      this.clearCache(clipId)
    }
  }

  /**
   * Get waveform peaks for rendering at a specific width
   */
  static resamplePeaks(peaks: number[], targetWidth: number, barWidth: number = 2, barGap: number = 2): number[] {
    // Handle undefined or null peaks
    if (!peaks || !Array.isArray(peaks)) return []

    const barCount = Math.floor(targetWidth / (barWidth + barGap))
    const resampled: number[] = []

    if (peaks.length === 0) return resampled

    const samplesPerBar = peaks.length / barCount

    for (let i = 0; i < barCount; i++) {
      const start = Math.floor(i * samplesPerBar)
      const end = Math.floor((i + 1) * samplesPerBar)

      // Find the peak in this range
      let peak = 0
      for (let j = start; j < end && j < peaks.length; j++) {
        if (peaks[j] > peak) {
          peak = peaks[j]
        }
      }

      resampled.push(peak)
    }

    return resampled
  }
}
