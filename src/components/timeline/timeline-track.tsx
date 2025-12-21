import React from 'react'
import { Group, Rect, Text, Circle } from 'react-konva'
import { TimelineConfig } from '@/lib/timeline/config'
import { useTimelineColors } from '@/lib/timeline/colors'
import { TimelineTrackType } from '@/types/project'

interface TimelineTrackProps {
  type: TimelineTrackType
  y: number
  width: number
  height: number
  muted?: boolean
}

export const TimelineTrack = React.memo(({ type, y, width, height, muted = false }: TimelineTrackProps) => {
  const colors = useTimelineColors()

  const getTrackStyle = () => {
    switch (type) {
      case TimelineTrackType.Video:
        return {
          bgFill: colors.background,
          bgOpacity: 0.5,
          labelText: 'V',
          labelColor: colors.accent
        }
      case TimelineTrackType.Zoom:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'Z',
          labelColor: colors.zoomBlock
        }
      case TimelineTrackType.Screen:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'S',
          labelColor: colors.screenBlock
        }
      case TimelineTrackType.Keystroke:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'K',
          labelColor: colors.warning
        }
      case TimelineTrackType.Plugin:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'P',
          labelColor: colors.primary
        }
      case TimelineTrackType.Audio:
        return {
          bgFill: colors.background,
          bgOpacity: 0.3,
          labelText: 'A',
          labelColor: colors.success // Greenish for Audio
        }
    }
  }

  const style = getTrackStyle()

  return (
    <Group>
      {/* Track background */}
      <Rect
        x={0}
        y={y}
        width={width}
        height={height}
        fill={style.bgFill}
        opacity={muted ? 0.05 : 0.02}
      />

      {/* Divider line at bottom */}
      <Rect
        x={0}
        y={y + height - 1}
        width={width}
        height={1}
        fill={colors.border}
        opacity={0.08}
      />

      {/* Track label background */}
      <Rect
        x={0}
        y={y}
        width={TimelineConfig.TRACK_LABEL_WIDTH}
        height={height}
        opacity={0.4}
      />

      {/* Right border of label area */}
      <Rect
        x={TimelineConfig.TRACK_LABEL_WIDTH - 1}
        y={y}
        width={1}
        height={height}
        opacity={0.1}
      />

      {/* Track Icon/Label */}
      <Group x={TimelineConfig.TRACK_LABEL_WIDTH / 2} y={y + height / 2}>
        <Circle
          radius={10}
          fill={style.labelColor}
          opacity={muted ? 0.1 : 0.15}
        />
        <Text
          text={style.labelText}
          fontSize={10}
          fill={muted ? colors.mutedForeground : style.labelColor}
          fontFamily="system-ui"
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          offsetX={3}
          offsetY={4}
        />
      </Group>
    </Group>
  )
})
