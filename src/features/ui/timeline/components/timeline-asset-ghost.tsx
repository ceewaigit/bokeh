import React from 'react'
import Image from 'next/image'
import { TimelineConfig } from '@/features/ui/timeline/config'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import type { Asset } from '@/features/core/stores/asset-library-store'
import type { TrackType } from '@/types/project'
import { createVideoStreamUrl } from '@/features/media/recording/components/library/utils/recording-paths'
import { useTimelineScroll } from './timeline-layout-provider'

interface TimelineAssetGhostProps {
    draggingAsset: Asset | null
    dragTime: number | null
    trackType: TrackType | null
    getTrackBounds: (type: TrackType) => { clipY: number; clipHeight: number }
    pixelsPerMs: number
    scrollContainerRef: React.RefObject<HTMLDivElement | null>
}

import { createPortal } from 'react-dom'

export const TimelineAssetGhost = React.memo(function TimelineAssetGhost({
    draggingAsset,
    dragTime,
    trackType,
    getTrackBounds,
    pixelsPerMs,
    scrollContainerRef
}: TimelineAssetGhostProps) {
    const { scrollLeftRef, scrollTopRef } = useTimelineScroll()
    const containerRef = React.useRef<HTMLDivElement>(null)

    // BATTERY OPTIMIZATION: Only run RAF loop when actively dragging
    // Imperative update loop to follow scroll position smoothly and convert to screen coordinates
    React.useEffect(() => {
        // Early exit - don't start RAF loop if nothing to drag
        if (!draggingAsset || dragTime === null || !trackType) return

        let rafId: number
        const update = () => {
            try {
                if (containerRef.current) {
                    const scrollContainer = scrollContainerRef.current
                    if (!scrollContainer) {
                        // Fallback if ref not ready (should settle quickly)
                        return
                    }

                    const scrollLeft = scrollLeftRef.current
                    const scrollTop = scrollTopRef.current

                    // Get container screen position
                    const containerRect = scrollContainer.getBoundingClientRect()

                    const relativeX = TimelineConfig.TRACK_LABEL_WIDTH + TimeConverter.msToPixels(dragTime, pixelsPerMs) - scrollLeft
                    const screenX = containerRect.left + relativeX

                    const bounds = trackType ? getTrackBounds(trackType) : { clipY: 0 }
                    const relativeY = bounds.clipY - scrollTop + TimelineConfig.TRACK_PADDING
                    const screenY = containerRect.top + relativeY

                    const width = Math.max(TimelineConfig.MIN_CLIP_WIDTH, TimeConverter.msToPixels(draggingAsset?.metadata?.duration || 5000, pixelsPerMs))

                    containerRef.current.style.transform = `translate(${screenX}px, ${screenY}px)`
                    containerRef.current.style.width = width + 'px'
                    // Make visible once positioned
                    containerRef.current.style.opacity = '1'
                }
            } catch {
                // Silently fail frame
            }
            rafId = requestAnimationFrame(update)
        }
        rafId = requestAnimationFrame(update)
        return () => cancelAnimationFrame(rafId)
    }, [dragTime, pixelsPerMs, scrollLeftRef, scrollTopRef, scrollContainerRef, trackType, getTrackBounds, draggingAsset])

    if (!draggingAsset || dragTime === null || !trackType) return null
    const bounds = getTrackBounds(trackType)
    const height = bounds.clipHeight

    // Render into body to avoid clipping
    return createPortal(
        <div
            ref={containerRef}
            className="fixed top-0 left-0 z-[9999] flex flex-col justify-center timeline-asset-ghost pointer-events-none"
            style={{
                // Initial styles, updated by RAF
                height: height + 'px',
                width: '100px', // Default visible width, updated by RAF
                opacity: 0, // Hidden until first RAF position update to avoid flash at 0,0
                willChange: 'transform, width, opacity',
                transform: 'translate(-9999px, -9999px)' // Move offscreen initially
            }}
        >
            {/* Inner content container with clipping */}
            <div className="absolute inset-0 overflow-hidden rounded-md border-2 border-primary bg-primary/20 backdrop-blur-[1px]">
                {/* Premium glass border */}
                <div className="absolute inset-0 border border-white/40 rounded-md z-20 pointer-events-none" />

                {(draggingAsset.type === 'image' || draggingAsset.type === 'video') ? (
                    <div className="w-full h-full opacity-60 relative">
                        {(draggingAsset.type === 'image' && draggingAsset.path) ? (
                            <Image
                                src={createVideoStreamUrl(draggingAsset.path) || draggingAsset.path}
                                className="object-cover rounded-md"
                                alt={draggingAsset.name}
                                fill
                                unoptimized
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-black/40 rounded-md">
                                <span className="text-xs text-white/90 truncate px-2 font-medium">{draggingAsset.name}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary/20 rounded-md">
                        <span className="text-xs text-white/90 truncate px-2 font-medium">{draggingAsset.name}</span>
                    </div>
                )}
            </div>

            {/* Centered Add Icon - Outside overflow hidden to prevent clipping on small tracks */}
            <div className="absolute inset-0 z-[60] flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center shadow-xl border border-white/30 transform scale-100">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </div>
            </div>
        </div>,
        document.body
    )
})
