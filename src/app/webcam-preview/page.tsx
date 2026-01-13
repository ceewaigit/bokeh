"use client"

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Webcam Preview Page
 * 
 * Floating window showing live webcam feed during recording.
 * Device ID is passed via query param.
 */
function WebcamPreviewContent() {
    const videoRef = useRef<HTMLVideoElement>(null)
    const searchParams = useSearchParams()
    const deviceId = searchParams.get('deviceId')
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        document.body.style.margin = '0'
        document.body.style.padding = '0'
        document.body.style.overflow = 'hidden'
        document.body.style.background = 'transparent'
        document.documentElement.style.background = 'transparent'
    }, [])

    useEffect(() => {
        if (!deviceId) return
        let stream: MediaStream | null = null

        async function startCamera() {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: deviceId as string } }
                })
                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                    setIsLoaded(true)
                }
            } catch (error) {
                console.error('[WebcamPreview] Failed to start camera:', error)
            }
        }

        startCamera()

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop())
            }
        }
    }, [deviceId])

    return (
        <div
            className="w-full h-full bg-transparent overflow-hidden"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover rounded-pill"
                style={{
                    transform: 'scaleX(-1)', // Mirror for natural feel
                    opacity: isLoaded ? 1 : 0,
                    transition: 'opacity 0.2s ease-out'
                }}
            />
            {/* Subtle border ring */}
            <div
                className="absolute inset-0 rounded-pill pointer-events-none"
                style={{
                    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.15), 0 4px 24px rgba(0,0,0,0.3)'
                }}
            />
        </div>
    )
}

export default function WebcamPreviewPage() {
    return (
        <Suspense fallback={<div className="w-full h-full bg-transparent" />}>
            <WebcamPreviewContent />
        </Suspense>
    )
}
