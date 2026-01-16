"use client"

import { useEffect, useRef, useState } from 'react'

/**
 * Webcam Preview Page
 *
 * Floating window showing live webcam feed during recording.
 * Device ID is passed via hash path: #/webcam-preview/{deviceId}
 */
function WebcamPreviewContent() {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [deviceId, setDeviceId] = useState<string | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)

    // Parse deviceId from hash URL
    useEffect(() => {
        const hash = window.location.hash
        const match = hash.match(/^#\/webcam-preview\/(.+)$/)
        if (match) {
            setDeviceId(decodeURIComponent(match[1]))
        }
    }, [])

    useEffect(() => {
        // Ensure full viewport coverage for h-full to work
        document.documentElement.style.height = '100%'
        document.documentElement.style.background = 'transparent'
        document.body.style.height = '100%'
        document.body.style.margin = '0'
        document.body.style.padding = '0'
        document.body.style.overflow = 'hidden'
        document.body.style.background = 'transparent'
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
            className="fixed inset-0 overflow-hidden"
            style={{ WebkitAppRegion: 'drag', background: 'transparent' } as React.CSSProperties}
        >
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover rounded-[32px]"
                style={{
                    transform: 'scaleX(-1)',
                    opacity: isLoaded ? 1 : 0,
                    transition: 'opacity 0.2s ease-out'
                }}
            />
            {/* Subtle border ring */}
            <div
                className="absolute inset-0 rounded-[32px] pointer-events-none"
                style={{
                    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.15), 0 4px 24px rgba(0,0,0,0.3)'
                }}
            />
        </div>
    )
}

export default function WebcamPreviewPage() {
    return <WebcamPreviewContent />
}
