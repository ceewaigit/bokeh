/**
 * useClipThumbnails - Hook for loading video thumbnails for a clip
 */

import { useEffect, useState, useMemo } from 'react'
import type { Recording } from '@/types/project'
import { ThumbnailGenerator } from '@/shared/utils/thumbnail-generator'
import { TimelineConfig } from '@/features/timeline/config'
import { createVideoStreamUrl, resolveRecordingPath } from '@/components/recordings-library/utils/recording-paths'

// Max thumbnails per clip to balance visual variety vs performance
const MAX_THUMBNAILS_PER_CLIP = 10

interface UseClipThumbnailsOptions {
    clipId: string
    recording: Recording | null | undefined
    sourceIn: number
    sourceOut: number
    clipInnerHeight: number
    enabled?: boolean
}

interface UseClipThumbnailsReturn {
    thumbnails: HTMLImageElement[]
    isLoading: boolean
}

/**
 * Loads and manages video thumbnails for a timeline clip.
 * Returns empty array if thumbnails are disabled or loading fails.
 */
export function useClipThumbnails({
    clipId,
    recording,
    sourceIn,
    sourceOut,
    enabled = true,
}: UseClipThumbnailsOptions): UseClipThumbnailsReturn {
    const [thumbnails, setThumbnails] = useState<HTMLImageElement[]>([])
    const [isLoading, setIsLoading] = useState(false)

    // Resolve the video path
    const resolvedVideoPath = useMemo(() => {
        return createVideoStreamUrl(resolveRecordingPath(recording))
    }, [recording])

    // Handle image source type (single image)
    const isImageSource = recording?.sourceType === 'image'
    const isGeneratedClip = recording?.sourceType === 'generated'

    useEffect(() => {
        if (!enabled) {
            setThumbnails([])
            return
        }

        if (!resolvedVideoPath || isGeneratedClip || !recording) {
            setThumbnails([])
            return
        }

        let cancelled = false
        setIsLoading(true)

        const loadThumbnails = async () => {
            // Use fixed maximum height for generation to prevent cache thrashing on resize
            // The image will be visually scaled down by the rendering component
            const thumbHeight = TimelineConfig.MAX_TRACK_HEIGHT

            // Fast path for image clips
            if (isImageSource) {
                const img = document.createElement('img')
                let src = resolvedVideoPath

                // Handle local paths with video-stream protocol
                if (src.startsWith('/')) {
                    src = createVideoStreamUrl(src) || src
                }

                img.src = src
                try {
                    await new Promise<void>((resolve, reject) => {
                        img.onload = () => resolve()
                        img.onerror = () => reject(new Error(`Failed to load image thumbnail: ${src}`))
                    })

                    if (!cancelled) {
                        setThumbnails([img])
                    }
                } catch (error) {
                    console.error('[useClipThumbnails]', error)
                } finally {
                    if (!cancelled) setIsLoading(false)
                }
                return
            }

            // Video thumbnails
            const sourceAspectRatio = recording.width && recording.height
                ? recording.width / recording.height
                : 16 / 9
            const thumbWidth = Math.max(1, Math.round(thumbHeight * sourceAspectRatio))

            // Calculate tile count based on source duration
            const sourceDurationSec = (sourceOut - sourceIn) / 1000
            const tileCount = Math.min(MAX_THUMBNAILS_PER_CLIP, Math.max(1, Math.ceil(sourceDurationSec / 5)))
            const sourceDuration = sourceOut - sourceIn

            const loadedThumbs: HTMLImageElement[] = new Array(tileCount)

            // Load all thumbnails in parallel
            const loadPromises = Array.from({ length: tileCount }, async (_, i) => {
                if (cancelled) return

                const tileProgress = tileCount > 1 ? i / (tileCount - 1) : 0.5
                const sourceTime = sourceIn + sourceDuration * tileProgress
                const timestamp = sourceTime / (recording.duration || 1)

                const cacheKey = `${clipId}_${recording.id}_t${i}_${Math.round(sourceTime)}_${thumbWidth}x${thumbHeight}`

                const dataUrl = await ThumbnailGenerator.generateThumbnail(
                    resolvedVideoPath,
                    cacheKey,
                    {
                        width: thumbWidth,
                        height: thumbHeight,
                        timestamp
                    }
                )

                if (cancelled || !dataUrl) return

                const img = document.createElement('img')
                img.src = dataUrl
                try {
                    await new Promise<void>((resolve, reject) => {
                        img.onload = () => resolve()
                        img.onerror = () => reject(new Error(`Failed to load thumbnail for ${cacheKey}`))
                    })

                    if (!cancelled) {
                        loadedThumbs[i] = img
                    }
                } catch (error) {
                    console.error('[useClipThumbnails]', error)
                }
            })

            await Promise.all(loadPromises)

            if (!cancelled) {
                setThumbnails([...loadedThumbs.filter(Boolean)])
                setIsLoading(false)
            }
        }

        loadThumbnails()

        return () => {
            cancelled = true
        }
    }, [
        recording,
        resolvedVideoPath,
        clipId,
        sourceIn,
        sourceOut,
        isGeneratedClip,
        isImageSource,
        enabled,
    ])

    return { thumbnails, isLoading }
}
