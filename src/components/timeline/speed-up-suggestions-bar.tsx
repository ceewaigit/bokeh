/**
 * Speed-Up Suggestions Bar
 * Unified component rendering both typing and idle speed-up indicators above clips
 * Features: Modern hover effects, click feedback, smooth animations
 */

import React, { useState, useCallback } from 'react'
import { Group, Rect, Text } from 'react-konva'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { SpeedUpType } from '@/types/speed-up'
import { TimeConverter, sourceToTimeline } from '@/features/timeline/time/time-space-converter'
import type { Clip } from '@/types/project'
import { useTimelineContext } from './TimelineContext'
import { KonvaEventObject } from 'konva/lib/Node'

// Color schemes by type and intensity
const COLORS = {
  [SpeedUpType.Typing]: {
    high: '#f59e0b',   // Orange - high speed-up (>= 2.5x)
    medium: '#eab308', // Yellow - medium (>= 2.0x)
    low: '#84cc16'     // Green - low
  },
  [SpeedUpType.Idle]: {
    high: '#6366f1',   // Indigo - long idle (>= 2.5x)
    medium: '#8b5cf6', // Purple - medium (>= 2.0x)
    low: '#a1a1aa'     // Grey - short idle
  }
}

// Hover glow colors
const GLOW_COLORS = {
  [SpeedUpType.Typing]: '#fbbf24',
  [SpeedUpType.Idle]: '#818cf8'
}

export interface SpeedUpSuggestionsBarProps {
  typingPeriods: SpeedUpPeriod[]
  idlePeriods: SpeedUpPeriod[]
  clip: Clip
  clipWidth: number
  pixelsPerMs: number
}

// Individual suggestion bar component with hover state
const SuggestionBar: React.FC<{
  period: SpeedUpPeriod
  x: number
  y: number
  width: number
  color: string
  glowColor: string
  label: string
  subLabel: string
  timeSavedSec: number
  typingPeriods: SpeedUpPeriod[]
  idlePeriods: SpeedUpPeriod[]
  onOpenSuggestion: (opts: {
    x: number
    y: number
    period: SpeedUpPeriod
    allTypingPeriods: SpeedUpPeriod[]
    allIdlePeriods: SpeedUpPeriod[]
  }) => void
}> = ({
  period,
  x,
  y,
  width,
  color,
  glowColor,
  label,
  subLabel,
  timeSavedSec,
  typingPeriods,
  idlePeriods,
  onOpenSuggestion
}) => {
    const [isHovered, setIsHovered] = useState(false)
    const [isPressed, setIsPressed] = useState(false)

    const handleMouseEnter = useCallback((e: KonvaEventObject<MouseEvent>) => {
      setIsHovered(true)
      // Change cursor to pointer
      const stage = e.target.getStage()
      if (stage) {
        stage.container().style.cursor = 'pointer'
      }
    }, [])

    const handleMouseLeave = useCallback((e: KonvaEventObject<MouseEvent>) => {
      setIsHovered(false)
      setIsPressed(false)
      // Reset cursor
      const stage = e.target.getStage()
      if (stage) {
        stage.container().style.cursor = 'default'
      }
    }, [])

    const handleMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true
      setIsPressed(true)
    }, [])

    const handleMouseUp = useCallback(() => {
      setIsPressed(false)
    }, [])

    const handleClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true
      onOpenSuggestion({
        x: e.evt.clientX,
        y: e.evt.clientY - 44,
        period,
        allTypingPeriods: typingPeriods,
        allIdlePeriods: idlePeriods
      })
    }, [onOpenSuggestion, period, typingPeriods, idlePeriods])

    // Calculate visual properties based on state
    const scale = isPressed ? 0.97 : isHovered ? 1.02 : 1
    const offsetY = isHovered && !isPressed ? -2 : 0
    const opacity = isPressed ? 0.85 : isHovered ? 1 : 0.92
    const shadowBlur = isPressed ? 4 : isHovered ? 12 : 6
    const shadowOpacity = isPressed ? 0.15 : isHovered ? 0.4 : 0.25

    return (
      <Group
        x={x}
        y={y + offsetY}
        scaleX={scale}
        scaleY={scale}
        listening={true}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
      >
        {/* Glow effect on hover */}
        {isHovered && (
          <Rect
            x={-4}
            y={-4}
            width={width + 8}
            height={32}
            fill={glowColor}
            cornerRadius={10}
            opacity={0.15}
            listening={false}
          />
        )}

        {/* Main bar */}
        <Rect
          width={width}
          height={24}
          fill={color}
          cornerRadius={6}
          opacity={opacity}
          stroke={isHovered ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.25)'}
          strokeWidth={isHovered ? 1.5 : 1}
          shadowColor={isHovered ? glowColor : 'black'}
          shadowBlur={shadowBlur}
          shadowOpacity={shadowOpacity}
          shadowOffsetY={isPressed ? 0 : 2}
          hitStrokeWidth={10}
        />

        {/* Speed multiplier */}
        <Text
          x={8}
          y={4}
          text={label}
          fontSize={10}
          fill={'#0b0e11'}
          fontFamily="system-ui"
          fontStyle="bold"
          listening={false}
        />

        {/* Sub label (WPM or "Idle") */}
        {width > 60 && subLabel && (
          <Text
            x={8}
            y={14}
            text={subLabel}
            fontSize={9}
            fill={'rgba(11,14,17,0.8)'}
            fontFamily="system-ui"
            listening={false}
          />
        )}

        {/* Time saved badge */}
        {width > 90 && (
          <Text
            x={width - 8}
            y={7}
            text={`-${timeSavedSec.toFixed(1)}s`}
            fontSize={9}
            fill={'rgba(11,14,17,0.7)'}
            fontFamily="system-ui"
            fontStyle="600"
            width={width - 12}
            align={'right'}
            listening={false}
          />
        )}
      </Group>
    )
  }

export const SpeedUpSuggestionsBar: React.FC<SpeedUpSuggestionsBarProps> = ({
  typingPeriods,
  idlePeriods,
  clip,
  clipWidth,
  pixelsPerMs
}) => {
  const { onOpenSpeedUpSuggestion } = useTimelineContext()
  const handleOpenSuggestion = useCallback((opts: {
    x: number
    y: number
    period: SpeedUpPeriod
    allTypingPeriods: SpeedUpPeriod[]
    allIdlePeriods: SpeedUpPeriod[]
  }) => {
    onOpenSpeedUpSuggestion(clip.id, opts)
  }, [clip.id, onOpenSpeedUpSuggestion])
  const hasTyping = typingPeriods.length > 0
  const hasIdle = idlePeriods.length > 0

  if (!hasTyping && !hasIdle) return null

  const renderPeriod = (
    period: SpeedUpPeriod,
    index: number,
    yOffset: number
  ): React.ReactNode => {
    // Convert from source space to timeline space
    const absStart = sourceToTimeline(period.startTime, clip)
    const absEnd = sourceToTimeline(period.endTime, clip)

    // Clamp to clip bounds in timeline space
    const clampedStart = Math.max(absStart, clip.startTime)
    const clampedEnd = Math.min(absEnd, clip.startTime + clip.duration)

    const relStart = Math.max(0, clampedStart - clip.startTime)
    const relDuration = Math.max(0, clampedEnd - clampedStart)

    const x = TimeConverter.msToPixels(relStart, pixelsPerMs)
    const width = Math.max(50, TimeConverter.msToPixels(relDuration, pixelsPerMs))
    const clampedX = Math.max(0, Math.min(x, clipWidth - 50))
    const clampedWidth = Math.min(width, clipWidth - clampedX)

    if (clampedWidth < 40) return null

    // Get color based on type and multiplier
    const colors = COLORS[period.type]
    const color = period.suggestedSpeedMultiplier >= 2.5
      ? colors.high
      : period.suggestedSpeedMultiplier >= 2.0
        ? colors.medium
        : colors.low

    const glowColor = GLOW_COLORS[period.type]

    // Label based on type
    const isTyping = period.type === SpeedUpType.Typing
    const label = `${period.suggestedSpeedMultiplier.toFixed(1)}x`
    const subLabel = isTyping
      ? (period.metadata?.averageWpm ? `${Math.round(period.metadata.averageWpm)} WPM` : '')
      : 'Idle'

    // Time saved calculation
    const durationMs = period.endTime - period.startTime
    const timeSavedSec = (durationMs * (1 - 1 / period.suggestedSpeedMultiplier)) / 1000

    return (
      <SuggestionBar
        key={`${period.type}-${index}`}
        period={period}
        x={clampedX}
        y={yOffset}
        width={clampedWidth}
        color={color}
        glowColor={glowColor}
        label={label}
        subLabel={subLabel}
        timeSavedSec={timeSavedSec}
        typingPeriods={typingPeriods}
        idlePeriods={idlePeriods}
        onOpenSuggestion={handleOpenSuggestion}
      />
    )
  }

  // Simple single-row layout - all bars on same row
  const yOffset = 0

  return (
    <Group y={4}> {/* Small margin from ruler */}
      {/* Idle periods */}
      {idlePeriods.map((p, i) => renderPeriod(p, i, yOffset))}

      {/* Typing periods */}
      {typingPeriods.map((p, i) => renderPeriod(p, i, yOffset))}
    </Group>
  )
}
