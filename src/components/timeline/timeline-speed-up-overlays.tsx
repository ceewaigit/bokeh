import React, { useState } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useTimelineLayout } from './timeline-layout-provider'
import { TimelineTrackType } from '@/types/project'
import { ActivityDetectionService } from '@/features/timeline/activity-detection/detection-service'
import { useVideoClips, useRecordings } from '@/stores/selectors/clip-selectors'
import { TimelineConfig } from '@/features/timeline/config'
import { useTimelineContext } from './TimelineContext'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { SpeedUpType } from '@/types/speed-up'
import { sourceToTimeline } from '@/features/timeline/time/time-space-converter'
import { withAlpha, useTimelineColors } from '@/features/timeline/utils/colors'

// Color schemes
const COLORS = {
    [SpeedUpType.Typing]: { base: '#f59e0b', glow: '#fbbf24' },
    [SpeedUpType.Idle]: { base: '#6366f1', glow: '#818cf8' }
}

interface BarData {
    key: string
    clipId: string
    x: number
    width: number
    period: SpeedUpPeriod
    color: string
    glowColor: string
    label: string
    allTypingPeriods: SpeedUpPeriod[]
    allIdlePeriods: SpeedUpPeriod[]
}

/**
 * Individual bar component with hover state
 */
const SuggestionBarItem = React.memo(({
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
    const [isHovered, setIsHovered] = useState(false)
    const [isPressed, setIsPressed] = useState(false)
    const colors = useTimelineColors()

    const scale = isPressed ? 0.97 : isHovered ? 1.02 : 1
    const offsetY = isHovered && !isPressed ? -2 : 0
    const opacity = isPressed ? 0.85 : isHovered ? 1 : 0.92
    const shadowBlur = isPressed ? 4 : isHovered ? 12 : 6

    return (
        <Group
            x={bar.x}
            y={y + offsetY}
            scaleX={scale}
            scaleY={scale}
            onMouseEnter={(e) => {
                setIsHovered(true)
                const stage = e.target.getStage()
                if (stage) stage.container().style.cursor = 'pointer'
            }}
            onMouseLeave={(e) => {
                setIsHovered(false)
                setIsPressed(false)
                const stage = e.target.getStage()
                if (stage) stage.container().style.cursor = 'default'
            }}
            onMouseDown={(e) => {
                e.cancelBubble = true
                setIsPressed(true)
            }}
            onMouseUp={() => setIsPressed(false)}
            onClick={(e) => {
                e.cancelBubble = true
                onOpen(bar.clipId, {
                    x: e.evt.clientX,
                    y: e.evt.clientY - 44,
                    period: bar.period,
                    allTypingPeriods: bar.allTypingPeriods,
                    allIdlePeriods: bar.allIdlePeriods
                })
            }}
        >

            {/* Main bar */}
            <Rect
                width={bar.width}
                height={24}
                fill={withAlpha(bar.color, 0.15)}
                cornerRadius={8}
                opacity={opacity}
                stroke={isHovered ? (colors.isDark ? 'rgba(255,255,255,0.9)' : colors.primary) : withAlpha(bar.color, 0.8)}
                strokeWidth={isHovered ? 2 : 1.5}
                shadowColor={isHovered ? bar.glowColor : 'black'}
                shadowBlur={shadowBlur / 2}
                shadowOpacity={isPressed ? 0.1 : isHovered ? 0.3 : 0.15}
                shadowOffsetY={isPressed ? 0 : 1}
                hitStrokeWidth={10}
            />

            {/* Speed multiplier label */}
            <Text
                x={8}
                y={4}
                text={bar.label}
                fontSize={10}
                fill={bar.color}
                fontFamily="system-ui"
                fontStyle="bold"
                listening={false}
            />

            {/* Type label */}
            {bar.width > 60 && (
                <Text
                    x={8}
                    y={14}
                    text={bar.period.type === SpeedUpType.Typing ?
                        (bar.period.metadata?.averageWpm ? `${Math.round(bar.period.metadata.averageWpm)} WPM` : '') :
                        'Idle'}
                    fontSize={9}
                    fill={colors.foreground}
                    opacity={0.8}
                    fontFamily="system-ui"
                    listening={false}
                />
            )}

            {/* Time saved badge */}
            {bar.width > 90 && (
                <Text
                    x={bar.width - 8}
                    y={7}
                    text={`-${((bar.period.endTime - bar.period.startTime) * (1 - 1 / bar.period.suggestedSpeedMultiplier) / 1000).toFixed(1)}s`}
                    fontSize={9}
                    fill="rgba(11,14,17,0.7)"
                    fontFamily="system-ui"
                    fontStyle="600"
                    width={bar.width - 12}
                    align="right"
                    listening={false}
                />
            )}
        </Group>
    )
})

SuggestionBarItem.displayName = 'SuggestionBarItem'

/**
 * Renders speed up suggestion bars for all visible video clips.
 */
export const TimelineSpeedUpOverlays = React.memo(() => {
    const {
        trackPositions,
        pixelsPerMs,
        visibleTracks,
        showTypingSuggestions
    } = useTimelineLayout()

    const { onOpenSpeedUpSuggestion } = useTimelineContext()
    const videoClips = useVideoClips()
    const recordings = useRecordings()

    // Only render if video track is visible and suggestions are enabled
    if (!visibleTracks.has(TimelineTrackType.Video) || !showTypingSuggestions) {
        return null
    }

    // Position bars ABOVE the video track (in the gap between ruler and video)
    // Use video track position as reference since it's more reliable
    const videoTrackY = trackPositions.video ?? 64
    const barHeight = 28 // 24px bar + 4px margin
    const speedUpBarY = videoTrackY - barHeight

    if (!Number.isFinite(speedUpBarY)) {
        return null
    }

    // Collect all bar data
    const bars: BarData[] = []

    for (const clip of videoClips) {
        const recording = recordings.find(r => r.id === clip.recordingId)
        if (!recording?.metadata) continue

        const suggestions = ActivityDetectionService.getSuggestionsForClip(recording, clip, recording.metadata)
        const allPeriods = [...suggestions.typing, ...suggestions.idle]

        for (let i = 0; i < allPeriods.length; i++) {
            const period = allPeriods[i]

            const absStart = sourceToTimeline(period.startTime, clip)
            const absEnd = sourceToTimeline(period.endTime, clip)
            const clampedStart = Math.max(absStart, clip.startTime)
            const clampedEnd = Math.min(absEnd, clip.startTime + clip.duration)
            const relStart = Math.max(0, clampedStart - clip.startTime)
            const relDuration = Math.max(0, clampedEnd - clampedStart)

            const clipX = (clip.startTime * pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
            const barX = clipX + (relStart * pixelsPerMs)
            const barWidth = Math.max(50, relDuration * pixelsPerMs)

            if (barWidth < 40 || !Number.isFinite(barX) || !Number.isFinite(barWidth)) continue

            const colors = COLORS[period.type]

            bars.push({
                key: `${clip.id}-${period.type}-${i}`,
                clipId: clip.id,
                x: barX,
                width: barWidth,
                period,
                color: colors.base,
                glowColor: colors.glow,
                label: `${period.suggestedSpeedMultiplier.toFixed(1)}x`,
                allTypingPeriods: suggestions.typing,
                allIdlePeriods: suggestions.idle
            })
        }
    }

    if (bars.length === 0) {
        return null
    }

    return (
        <Group>
            {bars.map(bar => (
                <SuggestionBarItem
                    key={bar.key}
                    bar={bar}
                    y={speedUpBarY + 4}
                    onOpen={onOpenSpeedUpSuggestion}
                />
            ))}
        </Group>
    )
})

TimelineSpeedUpOverlays.displayName = 'TimelineSpeedUpOverlays'
