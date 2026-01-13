'use client'

/**
 * TimelineWebcamTrack
 *
 * Renders webcam CLIPS (not effects) as draggable blocks on the timeline.
 * 
 * ARCHITECTURE: Webcam data now lives on clips (clip.layout), not as separate Effects.
 * This component shows actual clips from TrackType.Webcam track.
 */

import React, { useMemo, useState } from 'react'
import { Group, Text } from 'react-konva'
import { useTimelineLayout } from '../timeline-layout-provider'
import { useProjectStore } from '@/features/core/stores/project-store'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { TimelineConfig, getClipInnerHeight } from '@/features/ui/timeline/config'
import { useTimelineColors } from '@/features/ui/timeline/utils/colors'
import { getContinuousCornerRadius } from '@/features/ui/timeline/utils/corners'
import { useShallow } from 'zustand/react/shallow'
import { TrackType } from '@/types/project'
import { TimelineClip } from '../timeline-clip'
import { ContinuousRect } from '../konva/continuous-rect'

export function TimelineWebcamTrack() {
  const {
    trackHeights,
    trackPositions,
    stageWidth
  } = useTimelineLayout()

  const {
    currentProject,
    selectedClips
  } = useProjectStore(
    useShallow((s) => ({
      currentProject: s.currentProject,
      selectedClips: s.selectedClips
    }))
  )

  const colors = useTimelineColors()
  const [isHovering, setIsHovering] = useState(false)

  // Get webcam CLIPS from the webcam track - NOT effects!
  const webcamClips = useMemo(() => {
    if (!currentProject) return []
    return TimelineDataService.getWebcamClips(currentProject)
  }, [currentProject])

  const trackY = trackPositions.webcam
  const trackHeight = trackHeights.webcam
  const blockHeight = getClipInnerHeight(trackHeight)
  const dropZoneCornerRadius = getContinuousCornerRadius(blockHeight, { ratio: 0.28, min: 8, max: 16 })
  const trackWidth = stageWidth - TimelineConfig.TRACK_LABEL_WIDTH

  // Empty state - show drop zone when no webcam clips
  if (webcamClips.length === 0) {
    if (blockHeight <= 0) return null

    return (
      <Group>
        {/* Drop zone background */}
        <ContinuousRect
          x={TimelineConfig.TRACK_LABEL_WIDTH}
          y={trackY + TimelineConfig.TRACK_PADDING}
          width={trackWidth}
          height={blockHeight}
          fill={isHovering ? colors.webcamTrack : 'transparent'}
          stroke={colors.border}
          strokeWidth={1}
          dash={[6, 4]}
          cornerRadius={dropZoneCornerRadius}
          opacity={isHovering ? 0.8 : 0.4}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        />

        {/* Placeholder text */}
        <Text
          x={TimelineConfig.TRACK_LABEL_WIDTH + trackWidth / 2}
          y={trackY + trackHeight / 2}
          text="Drop webcam video here"
          fontSize={10}
          fontFamily="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
          fontStyle="400"
          fill={colors.mutedForeground}
          opacity={0.5}
          align="center"
          offsetX={60}
          offsetY={5}
        />
      </Group>
    )
  }

  // Render webcam clips as interactive TimelineClips
  return (
    <>
      {webcamClips.map((clip) => {
        const isClipSelected = selectedClips.includes(clip.id)

        return (
          <TimelineClip
            key={clip.id}
            clip={clip}
            trackType={TrackType.Webcam}
            trackY={trackY}
            trackHeight={trackHeight}
            isSelected={isClipSelected}
            otherClipsInTrack={webcamClips}
          />
        )
      })}
    </>
  )
}
