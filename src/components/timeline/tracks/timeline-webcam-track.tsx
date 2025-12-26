'use client'

import React, { useMemo, useCallback, useState } from 'react'
import { Rect, Group, Text } from 'react-konva'
import { useTimelineLayout } from '../timeline-layout-provider'
import { useProjectStore } from '@/stores/project-store'
import { TrackType } from '@/types/project'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
import { useTimelineColors } from '@/lib/timeline/colors'
import { useShallow } from 'zustand/react/shallow'

/**
 * TimelineWebcamTrack
 *
 * Renders webcam clips in the timeline with a refined Apple-esque design.
 * Shows a drop zone placeholder when empty for importing webcam videos.
 */
export function TimelineWebcamTrack() {
  const {
    pixelsPerMs,
    trackHeights,
    trackPositions,
    hasWebcamTrack,
    stageWidth
  } = useTimelineLayout()

  const {
    currentProject,
    selectedClips,
    selectClip
  } = useProjectStore(
    useShallow((s) => ({
      currentProject: s.currentProject,
      selectedClips: s.selectedClips,
      selectClip: s.selectClip
    }))
  )

  const colors = useTimelineColors()
  const [isHovering, setIsHovering] = useState(false)

  // Get webcam track and clips
  const webcamTrack = useMemo(() => {
    if (!currentProject?.timeline?.tracks) return null
    return currentProject.timeline.tracks.find(t => t.type === TrackType.Webcam)
  }, [currentProject?.timeline?.tracks])

  const webcamClips = useMemo(() => webcamTrack?.clips || [], [webcamTrack])

  const handleClipClick = useCallback((clipId: string) => {
    selectClip(clipId)
  }, [selectClip])

  if (!hasWebcamTrack) return null

  const trackY = trackPositions.webcam
  const trackHeight = trackHeights.webcam
  const clipHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2
  const trackWidth = stageWidth - TimelineConfig.TRACK_LABEL_WIDTH

  // Empty state - show drop zone
  if (webcamClips.length === 0) {
    return (
      <Group>
        {/* Drop zone background */}
        <Rect
          x={TimelineConfig.TRACK_LABEL_WIDTH}
          y={trackY + TimelineConfig.TRACK_PADDING}
          width={trackWidth}
          height={clipHeight}
          fill={isHovering ? colors.webcamTrack : 'transparent'}
          stroke={colors.border}
          strokeWidth={1}
          dash={[6, 4]}
          cornerRadius={8}
          opacity={isHovering ? 0.8 : 0.4}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        />

        {/* Placeholder text */}
        <Text
          x={TimelineConfig.TRACK_LABEL_WIDTH + trackWidth / 2}
          y={trackY + trackHeight / 2}
          text="Drop webcam video or import from library"
          fontSize={11}
          fontFamily="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
          fontStyle="400"
          fill={colors.mutedForeground}
          opacity={0.6}
          align="center"
          offsetX={140}
          offsetY={5}
        />
      </Group>
    )
  }

  // Render clips
  return (
    <Group>
      {webcamClips.map((clip) => {
        const isSelected = selectedClips.includes(clip.id)
        const clipX = TimeConverter.msToPixels(clip.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
        const clipWidth = Math.max(
          TimelineConfig.MIN_CLIP_WIDTH,
          TimeConverter.msToPixels(clip.duration, pixelsPerMs)
        )

        // Compact mode for narrow clips
        const isCompact = clipWidth < 100
        const isVeryCompact = clipWidth < 50

        // Camera indicator dimensions
        const indicatorSize = Math.min(clipHeight * 0.6, 24)
        const indicatorX = isCompact ? clipWidth / 2 : indicatorSize / 2 + 12
        const indicatorY = clipHeight / 2

        return (
          <Group
            key={clip.id}
            x={clipX}
            y={trackY + TimelineConfig.TRACK_PADDING}
            onClick={() => handleClipClick(clip.id)}
            onTap={() => handleClipClick(clip.id)}
          >
            {/* Clip background */}
            <Rect
              width={clipWidth}
              height={clipHeight}
              fill={isSelected ? colors.primary : colors.webcamClip}
              cornerRadius={6}
              opacity={isSelected ? 1 : 0.9}
              shadowColor="rgba(0, 0, 0, 0.2)"
              shadowBlur={isSelected ? 8 : 4}
              shadowOffsetY={2}
            />

            {/* Top highlight for depth */}
            <Rect
              x={1}
              y={1}
              width={clipWidth - 2}
              height={clipHeight * 0.4}
              fill="rgba(255, 255, 255, 0.1)"
              cornerRadius={[5, 5, 0, 0]}
            />

            {/* Selection border */}
            {isSelected && (
              <Rect
                width={clipWidth}
                height={clipHeight}
                stroke="rgba(255, 255, 255, 0.4)"
                strokeWidth={2}
                cornerRadius={6}
              />
            )}

            {/* Camera indicator */}
            {!isVeryCompact && (
              <>
                <Rect
                  x={indicatorX - indicatorSize / 2}
                  y={indicatorY - indicatorSize / 2}
                  width={indicatorSize}
                  height={indicatorSize}
                  fill="rgba(255, 255, 255, 0.15)"
                  cornerRadius={indicatorSize / 2}
                  stroke="rgba(255, 255, 255, 0.3)"
                  strokeWidth={1.5}
                />
                <Rect
                  x={indicatorX - indicatorSize * 0.25}
                  y={indicatorY - indicatorSize * 0.25}
                  width={indicatorSize * 0.5}
                  height={indicatorSize * 0.5}
                  fill="rgba(255, 255, 255, 0.25)"
                  cornerRadius={indicatorSize * 0.25}
                />
              </>
            )}

            {/* Labels */}
            {!isCompact && (
              <>
                <Text
                  x={indicatorX + indicatorSize / 2 + 10}
                  y={clipHeight / 2 - 8}
                  text="Webcam"
                  fontSize={11}
                  fontFamily="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
                  fontStyle="500"
                  fill="rgba(255, 255, 255, 0.95)"
                  shadowColor="rgba(0, 0, 0, 0.3)"
                  shadowBlur={2}
                  shadowOffsetY={1}
                />
                <Text
                  x={indicatorX + indicatorSize / 2 + 10}
                  y={clipHeight / 2 + 4}
                  text={formatDuration(clip.duration)}
                  fontSize={9}
                  fontFamily="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
                  fontStyle="400"
                  fill="rgba(255, 255, 255, 0.6)"
                />
              </>
            )}

            {/* Audio waveform bars */}
            {!isVeryCompact && (
              <Group x={isCompact ? 4 : indicatorX + indicatorSize / 2 + 10} y={clipHeight - 8}>
                {generateWaveformBars(isCompact ? clipWidth - 8 : clipWidth - indicatorSize - 32, 4)}
              </Group>
            )}
          </Group>
        )
      })}
    </Group>
  )
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function generateWaveformBars(availableWidth: number, barHeight: number): React.ReactNode[] {
  const barWidth = 2
  const barGap = 2
  const numBars = Math.min(Math.floor(availableWidth / (barWidth + barGap)), 30)
  const bars: React.ReactNode[] = []

  for (let i = 0; i < numBars; i++) {
    const height = barHeight * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.7)))
    bars.push(
      <Rect
        key={i}
        x={i * (barWidth + barGap)}
        y={-height / 2}
        width={barWidth}
        height={height}
        fill="rgba(255, 255, 255, 0.3)"
        cornerRadius={1}
      />
    )
  }

  return bars
}
