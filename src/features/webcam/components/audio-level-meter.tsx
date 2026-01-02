'use client'

import React from 'react'
import { cn } from '@/shared/utils/utils'
import { useAudioLevel } from '@/features/audio/hooks/use-audio-level'
import { Mic, MicOff } from 'lucide-react'

interface AudioLevelMeterProps {
  deviceId: string | null
  enabled?: boolean
  variant?: 'horizontal' | 'vertical' | 'minimal'
  className?: string
  showLabel?: boolean
  showPeak?: boolean
}

export function AudioLevelMeter({
  deviceId,
  enabled = true,
  variant = 'horizontal',
  className,
  showLabel = false,
  showPeak = true
}: AudioLevelMeterProps) {
  const { level, peak, isMonitoring, error } = useAudioLevel({
    deviceId,
    enabled
  })

  // Convert level (0-1) to segments
  const segments = 12
  const activeSegments = Math.round(level * segments)
  const peakSegment = Math.round(peak * segments)

  // Determine segment color based on position
  const getSegmentColor = (index: number) => {
    const ratio = index / segments
    if (ratio < 0.6) return 'bg-green-500'
    if (ratio < 0.85) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  if (variant === 'minimal') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="relative flex items-center">
          {deviceId && !error ? (
            <Mic className={cn(
              'w-4 h-4 transition-colors',
              isMonitoring ? 'text-foreground' : 'text-muted-foreground'
            )} />
          ) : (
            <MicOff className="w-4 h-4 text-muted-foreground" />
          )}

          {/* Animated level indicator */}
          {isMonitoring && (
            <div
              className={cn(
                "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full transition-all",
                level > 0.8 ? "bg-red-500" : level > 0.5 ? "bg-yellow-500" : "bg-green-500"
              )}
              style={{
                opacity: 0.3 + level * 0.7,
                transform: `scale(${0.5 + level * 0.5})`
              }}
            />
          )}
        </div>

        {/* Simple bar */}
        <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden min-w-[40px]">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-75",
              level > 0.8 ? "bg-red-500" : level > 0.5 ? "bg-yellow-500" : "bg-green-500"
            )}
            style={{
              width: `${level * 100}%`,
            }}
          />
        </div>
      </div>
    )
  }

  if (variant === 'vertical') {
    return (
      <div className={cn('flex flex-col items-center gap-1.5', className)}>
        {showLabel && (
          <span className="text-3xs text-muted-foreground">Level</span>
        )}

        <div className="flex flex-col-reverse gap-0.5 h-20">
          {Array.from({ length: segments }).map((_, index) => (
            <div
              key={index}
              className={cn(
                'w-3 h-1.5 rounded-sm transition-all duration-75',
                index < activeSegments
                  ? getSegmentColor(index)
                  : 'bg-muted/30',
                showPeak && index === peakSegment && index >= activeSegments
                  ? 'bg-white/60'
                  : ''
              )}
            />
          ))}
        </div>

        {!deviceId && (
          <MicOff className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
    )
  }

  // Horizontal variant (default)
  return (
    <div className={cn('space-y-1.5', className)}>
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Audio Level</span>
          {error && (
            <span className="text-3xs text-red-400">{error}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {deviceId && !error ? (
          <Mic className={cn(
            'w-4 h-4 shrink-0',
            isMonitoring ? 'text-foreground' : 'text-muted-foreground'
          )} />
        ) : (
          <MicOff className="w-4 h-4 shrink-0 text-muted-foreground" />
        )}

        <div className="flex-1 flex gap-0.5">
          {Array.from({ length: segments }).map((_, index) => (
            <div
              key={index}
              className={cn(
                'flex-1 h-2 rounded-sm transition-all duration-75',
                index < activeSegments
                  ? getSegmentColor(index)
                  : 'bg-muted/30',
                showPeak && index === peakSegment && index >= activeSegments
                  ? 'bg-white/60'
                  : ''
              )}
            />
          ))}
        </div>

        {/* dB display */}
        <span className="text-3xs text-muted-foreground font-mono w-8 text-right">
          {level > 0 ? Math.round(-60 + level * 60) : '-∞'} dB
        </span>
      </div>
    </div>
  )
}

/**
 * Compact inline level indicator for use in selects/lists.
 */
export function InlineLevelIndicator({
  deviceId,
  className
}: {
  deviceId: string | null
  className?: string
}) {
  const { level, isMonitoring } = useAudioLevel({
    deviceId,
    enabled: !!deviceId
  })

  if (!deviceId || !isMonitoring) return null

  return (
    <div className={cn('flex gap-px', className)}>
      {[0.2, 0.4, 0.6, 0.8].map((threshold, i) => (
        <div
          key={i}
          className={cn(
            'w-0.5 rounded-full transition-all duration-75',
            level > threshold
              ? threshold > 0.7 ? 'bg-red-500' : threshold > 0.5 ? 'bg-yellow-500' : 'bg-green-500'
              : 'bg-muted/30'
          )}
          style={{ height: 4 + i * 2 }}
        />
      ))}
    </div>
  )
}
