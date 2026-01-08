/**
 * Unified Proxy Service
 * 
 * Generates downscaled proxy files for videos to reduce memory usage.
 * Used for both preview playback and export rendering.
 * Follows Single Responsibility Principle - one service for all proxy generation.
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import crypto from 'crypto'
import { spawn, ChildProcess } from 'child_process'
import { resolveFfmpegPath, resolveFfprobePath } from '../utils/ffmpeg-resolver'

// ============================================
// Types
// ============================================

export interface ProxyOptions {
    /** Target width for the proxy */
    targetWidth: number
    /** Target height for the proxy */
    targetHeight: number
    /** Video bitrate (e.g., '6M', '8M') */
    videoBitrate?: string
    /** Audio bitrate (e.g., '128k', '160k') */
    audioBitrate?: string
    /** Quality preset for libx264 */
    preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'fast' | 'medium'
    /** CRF value for libx264 (lower = higher quality, 18-28 typical) */
    crf?: number
    /** Maintain aspect ratio with padding */
    maintainAspectRatio?: boolean
    /** Proxy type for organizing cache directories */
    proxyType?: 'preview' | 'export' | 'glow' | 'scrub'
    /** Target Framerate (force CFR) */
    fps?: number
}

export interface ProxyResult {
    success: boolean
    proxyPath?: string
    error?: string
    skipped?: boolean
    reason?: string
}

// ============================================
// Configuration
// ============================================

// Default settings for preview (higher quality, memory-optimized)
const PREVIEW_DEFAULTS: Required<Pick<ProxyOptions, 'targetWidth' | 'targetHeight' | 'videoBitrate' | 'audioBitrate' | 'preset' | 'crf' | 'maintainAspectRatio' | 'proxyType'>> = {
    targetWidth: 2560, // 1440p - sufficient for 720p preview at 2x zoom
    targetHeight: 1440,
    videoBitrate: '8M', // Lower bitrate for 1440p
    audioBitrate: '128k',
    preset: 'ultrafast', // Changed from 'fast' for faster on-demand generation
    crf: 23, // Raised from 20 - proxy quality vs speed tradeoff
    maintainAspectRatio: true,
    proxyType: 'preview',
}

// Default settings for export (balance of speed and quality)
const EXPORT_DEFAULTS: Required<Pick<ProxyOptions, 'videoBitrate' | 'audioBitrate' | 'preset' | 'crf' | 'maintainAspectRatio' | 'proxyType'>> = {
    videoBitrate: '6M',
    audioBitrate: '160k',
    preset: 'veryfast',
    crf: 23,
    maintainAspectRatio: false,
    proxyType: 'export',
}

// Default settings for glow (ultra low-res, ultra low-bitrate)
const GLOW_DEFAULTS: Required<Pick<ProxyOptions, 'targetWidth' | 'targetHeight' | 'videoBitrate' | 'audioBitrate' | 'preset' | 'crf' | 'maintainAspectRatio' | 'proxyType' | 'fps'>> = {
    targetWidth: 48,
    targetHeight: 28,
    videoBitrate: '200k',
    audioBitrate: '32k',
    preset: 'veryfast',
    crf: 32,
    maintainAspectRatio: true,
    proxyType: 'glow',
    fps: 5, // Low FPS is fine for blurred background glow
}

// Default settings for scrub (low latency, fast seek)
const SCRUB_DEFAULTS: Required<Pick<ProxyOptions, 'targetWidth' | 'targetHeight' | 'videoBitrate' | 'audioBitrate' | 'preset' | 'crf' | 'maintainAspectRatio' | 'proxyType' | 'fps'>> = {
    targetWidth: 640,
    targetHeight: 360,
    videoBitrate: '1M',
    audioBitrate: '64k',
    preset: 'ultrafast',
    crf: 28,
    maintainAspectRatio: true,
    proxyType: 'scrub',
    fps: 15, // Match glow FPS or go slightly higher (e.g. 30) if desired. User said 'fix keyframes', low FPS helps GOP structure.
}

// Minimum source width to trigger proxy generation for preview
const MIN_SOURCE_WIDTH_FOR_PROXY = 2560 // 1440p
const MIN_SOURCE_WIDTH_FOR_GLOW_PROXY = 1920

// ============================================
// Cache Management
// ============================================

// In-memory cache of proxy paths to avoid repeated disk checks
const proxyPathCache = new Map<string, string>()

// Active generation promises to prevent duplicate work
const activeGenerations = new Map<string, Promise<ProxyResult>>()

/**
 * Get the directory where proxies are stored
 */
function getProxiesDirectory(proxyType: 'preview' | 'export' | 'glow' | 'scrub'): string {
    const tempRoot = app.getPath('temp')
    return path.join(tempRoot, `bokeh-${proxyType}-proxies`)
}

/**
 * Generate a unique cache key for a proxy
 */
function getProxyCacheKey(inputPath: string, options: ProxyOptions): string {
    // Bumped to v18 to force Robust Fallback Pipeline (Safe HW/SW)
    const key = `${inputPath}|${options.targetWidth}x${options.targetHeight}|${options.proxyType || 'generic'}|${options.fps || 'auto'}|v18`
    return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)
}

/**
 * Get the expected proxy file path
 */
function getProxyFilePath(inputPath: string, options: ProxyOptions): string {
    const hash = getProxyCacheKey(inputPath, options)
    const proxyType = options.proxyType || 'preview'
    const proxiesDir = getProxiesDirectory(proxyType)
    return path.join(proxiesDir, `${proxyType}-${hash}.mp4`)
}

/**
 * Check if a proxy already exists and is valid
 */
async function checkExistingProxy(inputPath: string, options: ProxyOptions): Promise<string | null> {
    const proxyType = options.proxyType || 'preview'
    const cacheKey = `${inputPath}|${proxyType}|${options.targetWidth}x${options.targetHeight}|${options.fps || 'auto'}`

    // Check in-memory cache first
    const cached = proxyPathCache.get(cacheKey)
    if (cached && fsSync.existsSync(cached)) {
        return cached
    }

    const proxyPath = getProxyFilePath(inputPath, options)
    const minProxySize = proxyType === 'glow' ? 64 * 1024 : 512 * 1024

    try {
        const [inStat, outStat] = await Promise.all([
            fs.stat(inputPath),
            fs.stat(proxyPath).catch(() => null),
        ])

        // Proxy is valid if it exists, is newer than source, and has reasonable size
        if (outStat && outStat.mtimeMs >= inStat.mtimeMs && outStat.size > minProxySize) {
            proxyPathCache.set(cacheKey, proxyPath)
            return proxyPath
        }
    } catch {
        // Source file doesn't exist or other error
    }

    return null
}

// ============================================
// FFmpeg Utilities
// ============================================

/**
 * Run FFmpeg with the given arguments
 */
async function runFfmpeg(
    ffmpegPath: string,
    args: string[],
    onProgress?: (progress: number) => void
): Promise<void> {
    const ffmpegDir = path.dirname(ffmpegPath)
    const env = {
        ...process.env,
        DYLD_LIBRARY_PATH: `${ffmpegDir}:${process.env.DYLD_LIBRARY_PATH || ''}`
    }

    await new Promise<void>((resolve, reject) => {
        const proc: ChildProcess = spawn(ffmpegPath, args, { env })
        let stderr = ''
        let duration = 0

        proc.stderr?.on('data', (data: Buffer) => {
            const chunk = data.toString()
            stderr += chunk

            // Parse duration from initial output
            const durationMatch = chunk.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/)
            if (durationMatch) {
                const hours = parseInt(durationMatch[1], 10)
                const minutes = parseInt(durationMatch[2], 10)
                const seconds = parseInt(durationMatch[3], 10)
                duration = hours * 3600 + minutes * 60 + seconds
            }

            // Parse progress
            if (onProgress && duration > 0) {
                const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+)\.(\d+)/)
                if (timeMatch) {
                    const hours = parseInt(timeMatch[1], 10)
                    const minutes = parseInt(timeMatch[2], 10)
                    const seconds = parseInt(timeMatch[3], 10)
                    const currentTime = hours * 3600 + minutes * 60 + seconds
                    const progress = Math.min(99, Math.round((currentTime / duration) * 100))
                    onProgress(progress)
                }
            }
        })

        proc.on('exit', (code) => {
            if (code === 0) {
                onProgress?.(100)
                resolve()
            } else {
                reject(new Error(stderr || `ffmpeg exited with code ${code}`))
            }
        })

        proc.on('error', reject)
    })
}

/**
 * Get video dimensions using ffprobe
 */
export async function getVideoDimensions(videoPath: string): Promise<{ width: number; height: number } | null> {
    const ffprobePath = resolveFfprobePath()

    return new Promise((resolve) => {
        const args = [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'csv=s=x:p=0',
            videoPath
        ]

        let output = ''
        const proc = spawn(ffprobePath, args)
        const timeout = setTimeout(() => {
            proc.kill()
            resolve(null)
        }, 5000)

        proc.stdout?.on('data', (data) => {
            output += data.toString()
        })

        proc.on('exit', (code) => {
            clearTimeout(timeout)
            if (code === 0) {
                const match = output.trim().match(/(\d+)x(\d+)/)
                if (match) {
                    resolve({ width: parseInt(match[1], 10), height: parseInt(match[2], 10) })
                    return
                }
            }
            resolve(null)
        })

        proc.on('error', () => {
            clearTimeout(timeout)
            resolve(null)
        })
    })
}

// ============================================
// Core Proxy Generation
// ============================================

/**
 * Generate a proxy file with the given options
 * This is the core function that handles the actual transcoding
 */
/**
 * Generate a proxy file with the given options
 * This is the core function that handles the actual transcoding
 */
/**
 * Generate a proxy file with the given options
 * This is the core function that handles the actual transcoding
 */
async function generateProxyInternal(
    inputPath: string,
    options: ProxyOptions,
    onProgress?: (progress: number) => void
): Promise<ProxyResult> {
    const ffmpegPath = resolveFfmpegPath()
    const proxyType = options.proxyType || 'preview'
    const proxiesDir = getProxiesDirectory(proxyType)
    const proxyPath = getProxyFilePath(inputPath, options)

    // Ensure proxies directory exists
    await fs.mkdir(proxiesDir, { recursive: true })

    const { targetWidth, targetHeight, maintainAspectRatio } = options
    const videoBitrate = options.videoBitrate || (proxyType === 'preview' ? PREVIEW_DEFAULTS.videoBitrate : proxyType === 'glow' ? GLOW_DEFAULTS.videoBitrate : EXPORT_DEFAULTS.videoBitrate)
    const audioBitrate = options.audioBitrate || (proxyType === 'preview' ? PREVIEW_DEFAULTS.audioBitrate : proxyType === 'glow' ? GLOW_DEFAULTS.audioBitrate : EXPORT_DEFAULTS.audioBitrate)
    const preset = options.preset || (proxyType === 'preview' ? PREVIEW_DEFAULTS.preset : proxyType === 'glow' ? GLOW_DEFAULTS.preset : EXPORT_DEFAULTS.preset)
    const crf = options.crf ?? (proxyType === 'preview' ? PREVIEW_DEFAULTS.crf : proxyType === 'glow' ? GLOW_DEFAULTS.crf : EXPORT_DEFAULTS.crf)
    const fps = options.fps

    console.log(`[ProxyService] Generating ${proxyType} proxy for ${path.basename(inputPath)}:`, {
        target: `${targetWidth}x${targetHeight}`,
        fps: fps || 'auto',
    })

    onProgress?.(0)

    // Common audio arguments
    const audioArgs = ['-c:a', 'aac', '-b:a', audioBitrate]

    // Common output arguments
    const commonOutputArgs = [
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-g', proxyType === 'export' ? '1' : (proxyType === 'scrub' ? '15' : '30'),
        '-sc_threshold', '0',
        '-tune', 'zerolatency',
    ]

    // Helper: Build standard SW Scale Filter
    let swVf: string
    if (maintainAspectRatio) {
        swVf = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`
    } else {
        swVf = `scale=${targetWidth}:${targetHeight}`
    }

    // ========================================================================
    // STRATEGY 1: Full Hardware (HW Decode -> Download -> SW Scale -> HW Encode)
    // ========================================================================
    // Note: VideoToolbox 'scale_videotoolbox' is often missing.
    // We use 'hwdownload' to explicitly fetch frames for the SW scaler.
    // This fixes the "Audio Only" bug where implicit download fails.
    if (process.platform === 'darwin') {
        try {
            const hwArgs = [
                '-hide_banner', '-loglevel', 'error', '-y',
                // HW DECODE
                '-hwaccel', 'videotoolbox',
                '-i', inputPath,
                ...(fps ? ['-r', String(fps)] : []),
                // DOWNLOAD + SCALE (Fixes Audio-Only issue)
                '-vf', `hwdownload,format=nv12,${swVf}`,
                // HW ENCODE
                '-c:v', 'h264_videotoolbox',
                '-allow_sw', '0', '-profile:v', 'high', '-b:v', videoBitrate,
                ...audioArgs, ...commonOutputArgs,
                proxyPath
            ]

            // console.log(`[ProxyService] Attempting Strategy 1: HW Decode -> Download -> SW Scale -> HW Encode`)
            await runFfmpeg(ffmpegPath, hwArgs, onProgress)

            // Success
            const cacheKey = `${inputPath}|${proxyType}|${targetWidth}x${targetHeight}|${fps || 'auto'}`
            proxyPathCache.set(cacheKey, proxyPath)
            console.log(`[ProxyService] Proxy generated (Strategy 1 - HW/HW): ${path.basename(proxyPath)}`)
            return { success: true, proxyPath }
        } catch {
            // Silently fall through to Strategy 2
            // console.warn('[ProxyService] Strategy 1 failed (HW Decode/Encode):', err)
        }
    }

    // ========================================================================
    // STRATEGY 2: Output Hardware (SW Decode -> SW Scale -> HW Encode)
    // ========================================================================
    // Use this if HW Decode fails (e.g. incompatible source) but we still want fast enc.
    if (process.platform === 'darwin') {
        try {
            const mixedArgs = [
                '-hide_banner', '-loglevel', 'error', '-y',
                // SW DECODE (Standard -i)
                '-i', inputPath,
                ...(fps ? ['-r', String(fps)] : []),
                // SW SCALE
                '-vf', swVf,
                // HW ENCODE
                '-c:v', 'h264_videotoolbox',
                '-allow_sw', '0', '-profile:v', 'high', '-b:v', videoBitrate,
                ...audioArgs, ...commonOutputArgs,
                proxyPath
            ]

            // console.log(`[ProxyService] Attempting Strategy 2: SW Decode -> SW Scale -> HW Encode`)
            await runFfmpeg(ffmpegPath, mixedArgs, onProgress)

            // Success
            const cacheKey = `${inputPath}|${proxyType}|${targetWidth}x${targetHeight}|${fps || 'auto'}`
            proxyPathCache.set(cacheKey, proxyPath)
            console.log(`[ProxyService] Proxy generated (Strategy 2 - SW/HW): ${path.basename(proxyPath)}`)
            return { success: true, proxyPath }
        } catch {
            // Silently fall through to Strategy 3
            // console.warn('[ProxyService] Strategy 2 failed (HW Encode):', err)
        }
    }

    // ========================================================================
    // STRATEGY 3: Software Fallback (SW Decode -> SW Scale -> SW Encode)
    // ========================================================================
    const swArgs = [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', inputPath,
        ...(fps ? ['-r', String(fps)] : []),
        '-vf', swVf,
        '-c:v', 'libx264',
        '-preset', preset,
        '-crf', String(crf),
        ...audioArgs,
        ...commonOutputArgs,
        proxyPath
    ]

    try {
        // console.log(`[ProxyService] Attempting Strategy 3: Pure Software (libx264)`)
        await runFfmpeg(ffmpegPath, swArgs, onProgress)

        const cacheKey = `${inputPath}|${proxyType}|${targetWidth}x${targetHeight}|${fps || 'auto'}`
        proxyPathCache.set(cacheKey, proxyPath)
        console.log(`[ProxyService] Proxy generated (Strategy 3 - Pure SW): ${path.basename(proxyPath)}`)
        return { success: true, proxyPath }
    } catch (error) {
        console.error('[ProxyService] All strategies failed:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

// ============================================
// Public API - Preview Proxies
// ============================================

/**
 * Generate or retrieve a preview proxy for a video file
 * Only generates if source is larger than 1440p width
 */
export async function ensurePreviewProxy(
    inputPath: string,
    onProgress?: (progress: number) => void
): Promise<ProxyResult> {
    const normalizedPath = path.resolve(inputPath)
    const options: ProxyOptions = { ...PREVIEW_DEFAULTS }

    // Preserve exact aspect ratio without padding by scaling to fit within the target box.
    const dimensions = await getVideoDimensions(normalizedPath)
    if (dimensions?.width && dimensions?.height) {
        const scale = Math.min(
            PREVIEW_DEFAULTS.targetWidth / dimensions.width,
            PREVIEW_DEFAULTS.targetHeight / dimensions.height,
            1
        )
        const scaledWidth = Math.max(1, Math.round(dimensions.width * scale))
        const scaledHeight = Math.max(1, Math.round(dimensions.height * scale))
        options.targetWidth = scaledWidth
        options.targetHeight = scaledHeight
        options.maintainAspectRatio = false
    }

    // Check if proxy already exists
    const existingProxy = await checkExistingProxy(normalizedPath, options)
    if (existingProxy) {
        console.log(`[ProxyService] Using cached preview proxy: ${path.basename(existingProxy)}`)
        return { success: true, proxyPath: existingProxy }
    }

    // Check if generation is already in progress
    const genKey = `preview:${normalizedPath}`
    const existing = activeGenerations.get(genKey)
    if (existing) {
        return existing
    }

    // Start generation
    const promise = generateProxyInternal(normalizedPath, options, onProgress)
        .finally(() => activeGenerations.delete(genKey))

    activeGenerations.set(genKey, promise)
    return promise
}

// ============================================
// Public API - Glow Proxies
// ============================================

/**
 * Generate or retrieve a glow proxy for a video file
 * Used exclusively by the ambient glow player
 */
export async function ensureGlowProxy(
    inputPath: string,
    onProgress?: (progress: number) => void
): Promise<ProxyResult> {
    const normalizedPath = path.resolve(inputPath)
    const options: ProxyOptions = { ...GLOW_DEFAULTS }

    // Check if proxy already exists
    const existingProxy = await checkExistingProxy(normalizedPath, options)
    if (existingProxy) {
        console.log(`[ProxyService] Using cached glow proxy: ${path.basename(existingProxy)}`)
        return { success: true, proxyPath: existingProxy }
    }

    // Skip if source is small enough that glow proxy is unnecessary
    const dimensions = await getVideoDimensions(normalizedPath)
    if (!dimensions || dimensions.width <= MIN_SOURCE_WIDTH_FOR_GLOW_PROXY) {
        return { success: true, skipped: true, reason: 'Source below glow proxy threshold' }
    }

    // Check if generation is already in progress
    const genKey = `glow:${normalizedPath}`
    const existing = activeGenerations.get(genKey)
    if (existing) {
        return existing
    }

    // Start generation
    const promise = generateProxyInternal(normalizedPath, options, onProgress)
        .finally(() => activeGenerations.delete(genKey))

    activeGenerations.set(genKey, promise)
    return promise
}

// ============================================
// Public API - Scrub Proxies
// ============================================

/**
 * Generate or retrieve a scrub proxy for a video file
 * Used for low-latency scrubbing
 */
export async function ensureScrubProxy(
    inputPath: string,
    onProgress?: (progress: number) => void
): Promise<ProxyResult> {
    const normalizedPath = path.resolve(inputPath)
    const options: ProxyOptions = { ...SCRUB_DEFAULTS }

    // Check if proxy already exists
    const existingProxy = await checkExistingProxy(normalizedPath, options)
    if (existingProxy) {
        console.log(`[ProxyService] Using cached scrub proxy: ${path.basename(existingProxy)}`)
        return { success: true, proxyPath: existingProxy }
    }

    // Check if generation is already in progress
    const genKey = `scrub:${normalizedPath}`
    const existing = activeGenerations.get(genKey)
    if (existing) {
        return existing
    }

    // Start generation
    // Use lower GOP for scrub proxies to ensure fast seeking
    const promise = generateProxyInternal(normalizedPath, options, onProgress)
        .finally(() => activeGenerations.delete(genKey))

    activeGenerations.set(genKey, promise)
    return promise
}

/**
 * Check if a video needs a preview proxy (based on dimensions)
 */
export async function needsPreviewProxy(inputPath: string): Promise<boolean> {
    const dimensions = await getVideoDimensions(inputPath)
    if (!dimensions) return false
    return dimensions.width > MIN_SOURCE_WIDTH_FOR_PROXY
}

/**
 * Get preview proxy path if it exists, without generating
 * 
 * IMPORTANT: Must use same dimension scaling as ensurePreviewProxy
 * to generate the correct cache key, otherwise lookup will miss.
 */
export async function getExistingProxyPath(inputPath: string): Promise<string | null> {
    const normalizedPath = path.resolve(inputPath)

    // Get source dimensions to calculate scaled proxy dimensions (same as ensurePreviewProxy)
    const dimensions = await getVideoDimensions(normalizedPath)
    if (!dimensions) return null

    const options: ProxyOptions = { ...PREVIEW_DEFAULTS }

    // Apply same scaling as ensurePreviewProxy to match the generated proxy's cache key
    const scale = Math.min(
        PREVIEW_DEFAULTS.targetWidth / dimensions.width,
        PREVIEW_DEFAULTS.targetHeight / dimensions.height,
        1
    )
    const scaledWidth = Math.max(1, Math.round(dimensions.width * scale))
    const scaledHeight = Math.max(1, Math.round(dimensions.height * scale))
    options.targetWidth = scaledWidth
    options.targetHeight = scaledHeight
    options.maintainAspectRatio = false

    return checkExistingProxy(normalizedPath, options)
}

/**
 * Get glow proxy path if it exists, without generating
 */
export async function getExistingGlowProxyPath(inputPath: string): Promise<string | null> {
    return checkExistingProxy(path.resolve(inputPath), GLOW_DEFAULTS)
}

// ============================================
// Public API - Export Proxies
// ============================================

/**
 * Generate or retrieve an export proxy for a video file
 * Used by the export system when output resolution is smaller than source
 */
export async function ensureExportProxy(
    inputPath: string,
    targetWidth: number,
    targetHeight: number,
    fps?: number,
    onProgress?: (progress: number) => void
): Promise<string> {
    const normalizedPath = path.resolve(inputPath)
    const options: ProxyOptions = {
        ...EXPORT_DEFAULTS,
        targetWidth,
        targetHeight,
        fps,
    }

    // Check if proxy already exists
    const existingProxy = await checkExistingProxy(normalizedPath, options)
    if (existingProxy) {
        console.log(`[ProxyService] Using cached export proxy: ${path.basename(existingProxy)}`)
        return existingProxy
    }

    // Check if generation is already in progress
    const genKey = `export:${normalizedPath}:${targetWidth}x${targetHeight}:${fps || 'auto'}`
    const existing = activeGenerations.get(genKey)
    if (existing) {
        const result = await existing
        if (result.success && result.proxyPath) {
            return result.proxyPath
        }
        throw new Error(result.error || 'Proxy generation failed')
    }

    // Start generation
    const promise = generateProxyInternal(normalizedPath, options, onProgress)
        .finally(() => activeGenerations.delete(genKey))

    activeGenerations.set(genKey, promise)

    const result = await promise
    if (result.success && result.proxyPath) {
        return result.proxyPath
    }
    throw new Error(result.error || 'Proxy generation failed')
}

// ============================================
// Cache Management
// ============================================

/**
 * Clear all preview proxies to free disk space
 */
export async function clearPreviewProxies(): Promise<void> {
    await clearProxiesOfType('preview')
}

/**
 * Clear all scrub proxies to free disk space
 */
export async function clearScrubProxies(): Promise<void> {
    await clearProxiesOfType('scrub')
}

/**
 * Clear all glow proxies to free disk space
 */
export async function clearGlowProxies(): Promise<void> {
    await clearProxiesOfType('glow')
}

/**
 * Clear all export proxies to free disk space
 */
export async function clearExportProxies(): Promise<void> {
    await clearProxiesOfType('export')
}

/**
 * Clear proxies of a specific type
 */
async function clearProxiesOfType(proxyType: 'preview' | 'export' | 'glow' | 'scrub'): Promise<void> {
    const proxiesDir = getProxiesDirectory(proxyType)

    // Clear relevant entries from cache
    for (const [key] of proxyPathCache) {
        if (key.includes(`|${proxyType}|`)) {
            proxyPathCache.delete(key)
        }
    }

    try {
        const files = await fs.readdir(proxiesDir)
        await Promise.all(
            files.map(file => fs.unlink(path.join(proxiesDir, file)).catch(() => { }))
        )
        console.log(`[ProxyService] Cleared ${files.length} ${proxyType} proxies`)
    } catch {
        // Directory doesn't exist or other error
    }
}

/**
 * Get the size of all preview proxies on disk
 */
export async function getProxyCacheSize(): Promise<number> {
    const previewSize = await getProxySizeOfType('preview')
    const scrubSize = await getProxySizeOfType('scrub')
    const exportSize = await getProxySizeOfType('export')
    const glowSize = await getProxySizeOfType('glow')
    return previewSize + scrubSize + exportSize + glowSize
}

/**
 * Get the size of proxies of a specific type
 */
async function getProxySizeOfType(proxyType: 'preview' | 'export' | 'glow' | 'scrub'): Promise<number> {
    const proxiesDir = getProxiesDirectory(proxyType)

    try {
        const files = await fs.readdir(proxiesDir)
        const stats = await Promise.all(
            files.map(file =>
                fs.stat(path.join(proxiesDir, file))
                    .then(s => s.size)
                    .catch(() => 0)
            )
        )
        return stats.reduce((a, b) => a + b, 0)
    } catch {
        return 0
    }
}
