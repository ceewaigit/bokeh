'use client'

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { CropOverlay } from '@/features/effects/crop/components/CropOverlay'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'
import type { WebcamLayoutData, CropEffectData } from '@/types/project'

interface WebcamPreviewProps {
    webcamData: WebcamLayoutData | undefined
    previewSrc: string | null
    aspectRatio: number
    displayCrop: CropEffectData
    onCropChange: (crop: CropEffectData) => void
    onReset: () => void
    mirror: boolean
}

export function WebcamPreview({
    previewSrc,
    aspectRatio,
    displayCrop,
    onCropChange,
    onReset,
    mirror
}: WebcamPreviewProps) {
    const cropPreviewRef = useRef<HTMLDivElement>(null)
    const [cropPreviewSize, setCropPreviewSize] = useState({ width: 0, height: 0 })

    // Local state for live preview during drag
    const [previewCrop, setPreviewCrop] = useState<CropEffectData | null>(null)

    // Use preview crop during drag, otherwise use committed displayCrop
    const activeCrop = previewCrop ?? displayCrop

    const handleCropPreviewLoaded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = event.currentTarget
        if (!Number.isFinite(video.duration)) return
        video.currentTime = 0
        video.pause()
    }

    // Handle live preview during drag
    const handleCropPreview = useCallback((crop: CropEffectData) => {
        setPreviewCrop(crop)
    }, [])

    // Clear preview state on change commit
    const handleCropChangeWithClear = useCallback((crop: CropEffectData) => {
        setPreviewCrop(null)
        onCropChange(crop)
    }, [onCropChange])

    // Clear preview state on reset
    const handleResetWithClear = useCallback(() => {
        setPreviewCrop(null)
        onReset()
    }, [onReset])

    useEffect(() => {
        const element = cropPreviewRef.current
        if (!element) return
        const updateSize = () => {
            const rect = element.getBoundingClientRect()
            setCropPreviewSize({ width: rect.width, height: rect.height })
        }
        updateSize()
        const observer = new ResizeObserver(updateSize)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    // Sidebar video style - video fills container 1:1 so CropOverlay coordinates match exactly
    // Use 'fill' not 'cover' so the normalized crop coordinates map directly to pixels
    const videoStyle = useMemo<React.CSSProperties>(() => ({
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'fill' as const, // Fill exactly so overlay coords match 1:1
        transform: mirror ? 'scaleX(-1)' : undefined,
        transformOrigin: 'center',
    }), [mirror])

    if (!previewSrc) return null

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold tracking-[-0.01em]">Webcam Framing</label>
                    <InfoTooltip content="Crop the source to control what shows." />
                </div>
                <button
                    type="button"
                    onClick={handleResetWithClear}
                    className="flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-background"
                >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                </button>
            </div>
            <div
                ref={cropPreviewRef}
                className="relative w-full overflow-hidden rounded-xl border border-border/50 bg-black/50"
                style={{ aspectRatio: `${aspectRatio}` }}
            >
                <video
                    src={previewSrc}
                    style={videoStyle}
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={handleCropPreviewLoaded}
                    onLoadedData={handleCropPreviewLoaded}
                />
                {cropPreviewSize.width > 0 && cropPreviewSize.height > 0 && (
                    <CropOverlay
                        cropData={activeCrop}
                        onCropChange={handleCropChangeWithClear}
                        onCropPreview={handleCropPreview}
                        onConfirm={() => null}
                        onReset={handleResetWithClear}
                        videoRect={{
                            x: 0,
                            y: 0,
                            width: cropPreviewSize.width,
                            height: cropPreviewSize.height
                        }}
                        showActions={false}
                        showInfo={false}
                    />
                )}
            </div>
            <p className="text-xs text-muted-foreground/70">
                Drag the box to reframe which part of the webcam is shown.
            </p>
        </div>
    )
}
