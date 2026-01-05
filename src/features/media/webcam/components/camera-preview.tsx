'use client'

import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/utils/utils'
import { CameraOff, RefreshCw } from 'lucide-react'
import { useDeviceStore } from '@/features/core/stores/device-store'

interface CameraPreviewProps {
  deviceId: string | null
  className?: string
  aspectRatio?: '16:9' | '4:3' | '1:1'
  showControls?: boolean
  onError?: (error: string) => void
}

export function CameraPreview({
  deviceId,
  className,
  aspectRatio = '16:9',
  showControls = false,
  onError
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const isMountedRef = useRef(true)
  const refreshTimeoutRef = useRef<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const { startPreview, stopPreview, isPreviewActive } = useDeviceStore()

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!deviceId) {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        setStream(null)
      }
      return
    }

    let mounted = true

    const startCamera = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const mediaStream = await startPreview(deviceId)
        if (!mounted) {
          mediaStream?.getTracks().forEach(track => track.stop())
          return
        }

        if (mediaStream && videoRef.current) {
          videoRef.current.srcObject = mediaStream
          setStream(mediaStream)
        }
      } catch (err) {
        if (mounted) {
          const message = err instanceof Error ? err.message : 'Failed to access camera'
          setError(message)
          onError?.(message)
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    startCamera()

    return () => {
      mounted = false
      stopPreview()
    }
  }, [deviceId, startPreview, stopPreview, onError, stream])

  // Attach stream to video element when it changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  const aspectClasses = {
    '16:9': 'aspect-video',
    '4:3': 'aspect-[4/3]',
    '1:1': 'aspect-square'
  }

  const handleRefresh = async () => {
    if (deviceId) {
      stopPreview()
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current)
      }
      refreshTimeoutRef.current = window.setTimeout(() => {
        startPreview(deviceId)
          .then(mediaStream => {
            if (!isMountedRef.current) {
              mediaStream?.getTracks().forEach(track => track.stop())
              return
            }
            if (mediaStream && videoRef.current) {
              videoRef.current.srcObject = mediaStream
              setStream(mediaStream)
              setError(null)
            }
          })
          .catch(err => {
            if (!isMountedRef.current) return
            const message = err instanceof Error ? err.message : 'Failed to refresh camera'
            setError(message)
          })
      }, 100)
    }
  }

  return (
    <div
      className={cn(
        'relative bg-black/80 rounded-lg overflow-hidden',
        aspectClasses[aspectRatio],
        className
      )}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          'absolute inset-0 w-full h-full object-cover',
          (isLoading || error || !deviceId) && 'opacity-0'
        )}
      />

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-white/60">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span className="text-xs">Starting camera...</span>
          </div>
        </div>
      )}

      {/* No device selected */}
      {!deviceId && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-white/40">
            <CameraOff className="w-8 h-8" />
            <span className="text-xs">No camera selected</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-red-400 text-center px-4">
            <CameraOff className="w-8 h-8" />
            <span className="text-xs">{error}</span>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      {showControls && deviceId && !error && (
        <div className="absolute bottom-2 right-2 flex gap-1">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-colors"
            title="Refresh camera"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Active indicator */}
      {isPreviewActive && !error && !isLoading && deviceId && (
        <div className="absolute top-2 left-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 text-white/80">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-3xs font-medium">LIVE</span>
          </div>
        </div>
      )}
    </div>
  )
}
