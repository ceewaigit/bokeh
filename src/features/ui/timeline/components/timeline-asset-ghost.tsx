import React from 'react'
import Image from 'next/image'
import { TimelineConfig } from '@/features/ui/timeline/config'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import type { Asset } from '@/features/core/stores/asset-library-store'
import type { TrackType } from '@/types/project'
import { createVideoStreamUrl } from '@/features/media/recording/components/library/utils/recording-paths'

interface TimelineAssetGhostProps {
    draggingAsset: Asset | null
    dragTime: number | null
    trackType: TrackType | null
    getTrackBounds: (type: TrackType) => { clipY: number; clipHeight: number }
    pixelsPerMs: number
}

export const TimelineAssetGhost = ({
    draggingAsset,
    dragTime,
    trackType,
    getTrackBounds,
    pixelsPerMs
}: TimelineAssetGhostProps) => {
    if (!draggingAsset || dragTime === null || !trackType) return null

    const bounds = getTrackBounds(trackType)
    const duration = draggingAsset.metadata?.duration || 5000

    return (
        <div
            className="absolute pointer-events-none z-50 flex flex-col justify-center overflow-hidden rounded-md border-2 border-primary bg-primary/20 backdrop-blur-[1px] timeline-asset-ghost"
            style={{
                left: (TimelineConfig.TRACK_LABEL_WIDTH + TimeConverter.msToPixels(dragTime, pixelsPerMs)) + 'px',
                top: bounds.clipY + 'px',
                width: Math.max(TimelineConfig.MIN_CLIP_WIDTH, TimeConverter.msToPixels(duration, pixelsPerMs)) + 'px',
                height: bounds.clipHeight + 'px',
            }}
        >
            {(draggingAsset.type === 'image' || draggingAsset.type === 'video') ? (
                <div className="w-full h-full opacity-50 relative">
                    {(draggingAsset.type === 'image' && draggingAsset.path) ? (
                        <Image
                            src={createVideoStreamUrl(draggingAsset.path) || draggingAsset.path}
                            className="object-cover"
                            alt={draggingAsset.name}
                            fill
                            unoptimized
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-black/20">
                            <span className="text-xs text-white/70 truncate px-2">{draggingAsset.name}</span>
                        </div>
                    )}
                </div>
            ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <span className="text-xs text-white/70 truncate px-2">{draggingAsset.name}</span>
                </div>
            )}
        </div>
    )
}
