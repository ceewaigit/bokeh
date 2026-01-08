/**
 * Timeline Activity Overlays
 * 
 * Shows suggestion bars above video track for:
 * - Typing periods (can be sped up)
 * - Idle periods (can be sped up)
 * - Edge idle (can be sped up OR trimmed - popover offers both)
 * 
 * All shown as simple bars with subtle styling.
 */

import React, { useState } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useTimelineLayout } from './timeline-layout-provider'
import { TimelineTrackType } from '@/types/project'
import { ActivityDetectionService } from '@/features/ui/timeline/activity-detection/detection-service'
import { useVideoClips, useRecordings } from '@/features/core/stores/selectors/clip-selectors'
import { TimelineConfig } from '@/features/ui/timeline/config'
import { useTimelineContext } from './TimelineContext'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { SpeedUpType } from '@/types/speed-up'
import { sourceToTimeline } from '@/features/ui/timeline/time/time-space-converter'
import { withAlpha, useTimelineColors } from '@/features/ui/timeline/utils/colors'

interface BarData {
    key: string
    clipId: string
    x: number
    width: number
    period: SpeedUpPeriod
    color: string
    label: string
    isEdge: boolean // Edge idle can be trimmed or sped up
    allTypingPeriods: SpeedUpPeriod[]
    allIdlePeriods: SpeedUpPeriod[]
}

/**
 * Simple suggestion bar
 */
const SuggestionBar = React.memo(({
    bar,
    y,
    onOpen
}: {
    bar: BarData
    y: number
    onOpen: (clipId: string, opts: {
        x: number
        y: number
        period: SpeedUpPeriod
        allTypingPeriods: SpeedUpPeriod[]
        allIdlePeriods: SpeedUpPeriod[]
    }) => void
}) => {
    const [hover, setHover] = useState(false)
    const [press, setPress] = useState(false)

    const lift = hover && !press ? -1 : 0
    const opacity = press ? 0.7 : hover ? 0.95 : 0.8

    return (
        <Group
            x={bar.x}
            y={y + lift}
            onMouseEnter={e => {
                setHover(true)
                e.target.getStage()?.container().style.setProperty('cursor', 'pointer')
            }}
            onMouseLeave={e => {
                setHover(false)
                setPress(false)
                e.target.getStage()?.container().style.setProperty('cursor', 'default')
            }}
            onMouseDown={e => { e.cancelBubble = true; setPress(true) }}
            onMouseUp={() => setPress(false)}
            onClick={e => {
                e.cancelBubble = true
                onOpen(bar.clipId, {
                    x: e.evt.clientX,
                    y: e.evt.clientY - 36,
                    period: bar.period,
                    allTypingPeriods: bar.allTypingPeriods,
                    allIdlePeriods: bar.allIdlePeriods
                })
            }}
        >
            {/* Bar background */}
            <Rect
                width={bar.width}
                height={18}
                fill={withAlpha(bar.color, hover ? 0.2 : 0.12)}
                cornerRadius={4}
                opacity={opacity}
                stroke={withAlpha(bar.color, hover ? 0.7 : 0.4)}
                strokeWidth={1}
                hitStrokeWidth={8}
            />

            {/* Label */}
            <Text
                x={6}
                y={3}
                text={bar.label}
                fontSize={10}
                fill={bar.color}
                fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                fontStyle="600"
                listening={false}
            />
        </Group>
    )
})

SuggestionBar.displayName = 'SuggestionBar'

/**
 * Main overlay component
 */
export const TimelineActivityOverlays = React.memo(() => {
    const {
        trackPositions,
        pixelsPerMs,
        visibleTracks,
        showTypingSuggestions
    } = useTimelineLayout()

    const { onOpenSpeedUpSuggestion } = useTimelineContext()
    const videoClips = useVideoClips()
    const recordings = useRecordings()
    const colors = useTimelineColors()

    if (!visibleTracks.has(TimelineTrackType.Video) || !showTypingSuggestions) {
        return null
    }

    const videoTrackY = trackPositions.video ?? 64
    const overlayY = videoTrackY - 22

    if (!Number.isFinite(overlayY)) return null

    const bars: BarData[] = []

    for (const clip of videoClips) {
        const recording = recordings.find(r => r.id === clip.recordingId)
        if (!recording?.metadata) continue

        const suggestions = ActivityDetectionService.getSuggestionsForClip(recording, clip, recording.metadata)

        // All speed-up periods (typing + idle)
        const allPeriods = [
            ...suggestions.typing,
            ...suggestions.idle,
            ...suggestions.edgeIdle // Edge idle periods (can be trimmed or sped up)
        ]

        allPeriods.forEach((period, i) => {
            const isTrim = period.type === SpeedUpType.TrimStart || period.type === SpeedUpType.TrimEnd

            // For trim periods, position at clip edges
            let barX: number
            let barWidth: number

            if (isTrim) {
                const clipX = (clip.startTime * pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
                const clipEndX = clipX + (clip.duration * pixelsPerMs)
                const savedMs = period.metadata?.trimSavedMs || (period.endTime - period.startTime)

                if (period.type === SpeedUpType.TrimStart) {
                    barX = clipX
                    barWidth = Math.max(40, savedMs * pixelsPerMs * 0.5) // Show portion of trim region
                } else {
                    barWidth = Math.max(40, savedMs * pixelsPerMs * 0.5)
                    barX = clipEndX - barWidth
                }
            } else {
                // Regular speed-up positioning
                const absStart = sourceToTimeline(period.startTime, clip)
                const absEnd = sourceToTimeline(period.endTime, clip)
                const clampedStart = Math.max(absStart, clip.startTime)
                const clampedEnd = Math.min(absEnd, clip.startTime + clip.duration)
                const relStart = Math.max(0, clampedStart - clip.startTime)
                const relDuration = Math.max(0, clampedEnd - clampedStart)

                const clipX = (clip.startTime * pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
                barX = clipX + (relStart * pixelsPerMs)
                barWidth = Math.max(40, relDuration * pixelsPerMs)
            }

            if (barWidth < 30 || !Number.isFinite(barX)) return

            // Color based on type
            let color: string
            let label: string

            if (period.type === SpeedUpType.Typing) {
                color = colors.speedUpTyping.base
                label = `${period.suggestedSpeedMultiplier.toFixed(1)}×`
            } else if (isTrim) {
                color = colors.trim.base
                label = period.type === SpeedUpType.TrimStart ? '→' : '←'
            } else {
                color = colors.speedUpIdle.base
                label = `${period.suggestedSpeedMultiplier.toFixed(1)}×`
            }

            bars.push({
                key: `${clip.id}-${period.type}-${i}`,
                clipId: clip.id,
                x: barX,
                width: barWidth,
                period,
                color,
                label,
                isEdge: isTrim,
                allTypingPeriods: suggestions.typing,
                allIdlePeriods: suggestions.idle
            })
        })
    }

    if (bars.length === 0) return null

    return (
        <Group>
            {bars.map(bar => (
                <SuggestionBar
                    key={bar.key}
                    bar={bar}
                    y={overlayY}
                    onOpen={onOpenSpeedUpSuggestion}
                />
            ))}
        </Group>
    )
})

TimelineActivityOverlays.displayName = 'TimelineActivityOverlays'
