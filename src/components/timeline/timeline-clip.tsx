import React, { useMemo, useState, useRef } from 'react'
import { Group, Rect, Text } from 'react-konva'
import Konva from 'konva'

import type { Clip } from '@/types/project'
import { TrackType } from '@/types/project'
import { TimelineConfig, getClipInnerHeight } from '@/features/timeline/config'
import { TimeConverter } from '@/features/timeline/time/time-space-converter'
import { ClipPositioning } from '@/features/timeline/clips/clip-positioning'
import { useTimelineColors, withAlpha } from '@/features/timeline/utils/colors'
import { useRecordingMetadata } from '@/remotion/hooks/media/useRecordingMetadata'
import { PluginRegistry } from '@/features/effects/config/plugin-registry'

import { useProjectStore } from '@/stores/project-store'
import { usePreviewSettingsStore } from '@/stores/preview-settings-store'
import { useAudioClips, useVideoClips, useRecordingById } from '@/stores/selectors/clip-selectors'
import { useTimelineContext } from './TimelineContext'
import { useShallow } from 'zustand/react/shallow'
import { useClipWaveform } from '@/hooks/use-clip-waveform'
import { useClipThumbnails } from '@/hooks/use-clip-thumbnails'
import { useClipTrimInteraction } from '@/hooks/timeline/use-clip-trim-interaction'
import { TimelineClipBackground } from './clip/timeline-clip-background'
import { TimelineClipThumbnails } from './clip/timeline-clip-thumbnails'
import { TimelineClipWaveform } from './clip/timeline-clip-waveform'

interface TimelineClipProps {
  clip: Clip
  trackType: TrackType.Video | TrackType.Audio
  trackY: number
  trackHeight: number
  isSelected: boolean
}

const TimelineClipComponent = ({
  clip,
  trackType,
  trackY,
  trackHeight,
  isSelected,
}: TimelineClipProps) => {
  const {
    pixelsPerMs,
    dragPreview,
    onSelect,
    onDragPreview,
    onDragCommit,
    onContextMenu,
    onTrimStart,
    onTrimEnd
  } = useTimelineContext()

  // Use selectors that are less likely to trigger unnecessary re-renders
  // Note: We use useRecordingById which is memoized in the selector system
  const recording = useRecordingById(clip.recordingId)

  // These selectors fetch ALL clips, which might be heavy if not shallow checked.
  // Ideally we should pass the relevant siblings from parent or use a tailored selector.
  // For now, we assume these are stable enough via existing selectors.
  const videoClips = useVideoClips()
  const audioClips = useAudioClips()
  const otherClipsInTrack = useMemo(() =>
    trackType === TrackType.Video ? videoClips : audioClips,
    [trackType, videoClips, audioClips]
  )

  /* ---------------- STATE & REFS ---------------- */
  const [isDragging, setIsDragging] = useState(false)
  const [isValidPosition, setIsValidPosition] = useState(true)
  const [isHovering, setIsHovering] = useState(false)
  /* ---------------- INTERACTION HOOKS ---------------- */
  const {
    trimEdge,
    trimPreview,
    handleTrimMouseDown
  } = useClipTrimInteraction({
    clip,
    recording,
    otherClipsInTrack,
    pixelsPerMs,
    onTrimStart,
    onTrimEnd
  })
  const groupRef = useRef<Konva.Group>(null)

  /* ---------------- THEME & SETTINGS ---------------- */
  const colors = useTimelineColors()
  const showWaveforms = useProjectStore(useShallow((s) => s.settings.editing.showWaveforms ?? true))
  const showTimelineThumbnails = usePreviewSettingsStore((s) => s.showTimelineThumbnails)

  /* ---------------- COMPUTED VALUES ---------------- */
  const isGeneratedClip = trackType === TrackType.Video && recording?.sourceType === 'generated'

  const previewStartTime = dragPreview?.trackType === trackType && dragPreview.clipId !== clip.id
    ? dragPreview.startTimes[clip.id]
    : undefined

  const generatedLabel = React.useMemo(() => {
    const pluginId = recording?.generatedSource?.pluginId
    if (!pluginId) return 'Generated Clip'
    return PluginRegistry.get(pluginId)?.name ?? 'Generated Clip'
  }, [recording?.generatedSource?.pluginId])

  useRecordingMetadata({
    recordingId: recording?.sourceType === 'generated' ? '' : (recording?.id || ''),
    folderPath: recording?.folderPath,
    metadataChunks: recording?.metadataChunks,
    inlineMetadata: recording?.metadata,
  })

  // Visual calculations
  const visualStartTime = previewStartTime ?? clip.startTime
  const clipWidth = Math.max(
    TimelineConfig.MIN_CLIP_WIDTH,
    TimeConverter.msToPixels(clip.duration, pixelsPerMs)
  )
  const clipX = TimeConverter.msToPixels(visualStartTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
  const clipInnerHeight = getClipInnerHeight(trackHeight)

  /* ---------------- ASSETS (HOOKS) ---------------- */
  // Load audio waveform data using extracted hook
  const waveformData = useClipWaveform({
    clipId: clip.id,
    recording,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceOut,
    samplesPerSecond: 50
  })

  // Load thumbnails using extracted hook
  const { thumbnails } = useClipThumbnails({
    clipId: clip.id,
    recording,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceOut,
    clipInnerHeight,
    enabled: showTimelineThumbnails && trackType === TrackType.Video && !isGeneratedClip
  })

  // Derived colors and flags
  const hasThumbnails = showTimelineThumbnails && thumbnails.length > 0
  const showMissingThumb = trackType === TrackType.Video && !isGeneratedClip && !hasThumbnails

  // Prevent rendering if track is collapsed (height 0) to avoid invalid shape errors
  // Must be after all hooks to prevent "Rendered fewer hooks" error
  if (trackHeight <= TimelineConfig.TRACK_PADDING * 2) return null

  // Calculate ghost dimensions for trim preview
  const ghostX = trimPreview
    ? TimeConverter.msToPixels(trimPreview.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
    : 0

  const ghostWidth = trimPreview
    ? TimeConverter.msToPixels(trimPreview.endTime - trimPreview.startTime, pixelsPerMs)
    : 0

  return (
    <>
      <Group
        ref={groupRef}
        x={clipX}
        y={trackY + TimelineConfig.TRACK_PADDING}
        draggable={!trimEdge}
        dragBoundFunc={(pos) => {
          const proposedTime = Math.max(
            0,
            TimeConverter.pixelsToMs(pos.x - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
          )
          const preview = ClipPositioning.computeContiguousPreview(otherClipsInTrack, proposedTime, { clipId: clip.id })
          const insertTime = preview?.insertTime ?? proposedTime
          const snappedX = TimeConverter.msToPixels(insertTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
          return {
            x: snappedX,
            y: trackY + TimelineConfig.TRACK_PADDING
          }
        }}
        onDragStart={() => {
          setIsDragging(true)
          setIsValidPosition(true)
        }}
        onDragMove={(e) => {
          const draggedX = e.target.x()
          const proposedStartTime = Math.max(
            0,
            TimeConverter.pixelsToMs(draggedX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
          )
          onDragPreview(clip.id, trackType, proposedStartTime)
        }}
        onDragEnd={(e) => {
          setIsDragging(false)

          const finalX = e.target.x()
          const proposedStartTime = Math.max(
            0,
            TimeConverter.pixelsToMs(finalX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
          )
          onDragCommit(clip.id, trackType, proposedStartTime)
          setIsValidPosition(true)
        }}
        onClick={() => {
          // Simple click handler - just select the clip
          // Suggestion bars will handle their own clicks and stop propagation
          onSelect(clip.id)
        }}
        onMouseDown={(e) => {
          e.cancelBubble = true
        }}
        onTap={(e) => {
          e.cancelBubble = true
        }}
        onContextMenu={(e) => {
          e.evt.preventDefault()
          onContextMenu(e, clip.id)
        }}
        onMouseEnter={() => {
          if (!trimEdge) {
            document.body.style.cursor = 'grab'
          }
          setIsHovering(true)
        }}
        onMouseLeave={() => {
          if (!trimEdge) {
            document.body.style.cursor = 'default'
          }
          setIsHovering(false)
        }}
        opacity={isDragging ? (isValidPosition ? 0.95 : 0.7) : 1}
      >

        <TimelineClipBackground
          clipId={clip.id}
          width={clipWidth}
          height={clipInnerHeight}
          isSelected={isSelected}
          isDragging={isDragging}
          isValidPosition={isValidPosition}
          isGeneratedClip={isGeneratedClip}
          generatedLabel={generatedLabel}
          showMissingThumb={showMissingThumb}
          trackType={trackType}
          hasThumbnails={hasThumbnails}
          colors={colors}
        />

        {/* Video thumbnails - multiple frames distributed across clip */}
        {trackType === TrackType.Video && hasThumbnails && (
          <TimelineClipThumbnails
            thumbnails={thumbnails}
            width={clipInnerHeight}
            height={clipInnerHeight}
            clipWidth={clipWidth}
          />
        )}

        {/* Clip metadata display - simple centered layout */}
        {trackType === TrackType.Video && showMissingThumb && (() => {
          const durationSec = Math.round(clip.duration / 1000)
          const durationText = `${durationSec}s`
          const speedText = clip.playbackRate && clip.playbackRate !== 1.0
            ? `${clip.playbackRate.toFixed(clip.playbackRate === Math.floor(clip.playbackRate) ? 0 : 1)}x`
            : '1x'

          const showMeta = clipWidth > 60

          return (
            <Group>
              {/* Single centered text block with both label and value */}
              <Text
                x={0}
                y={0}
                width={clipWidth}
                height={clipInnerHeight}
                text={showMeta ? `Clip\n${durationText}  ⊘ ${speedText}` : 'Clip'}
                fontSize={showMeta ? 12 : 10}
                lineHeight={1.5}
                fontFamily="'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                fontStyle="500"
                fill={colors.foreground}
                opacity={0.8}
                align="center"
                verticalAlign="middle"
                wrap="none"
                listening={false}
              />
            </Group>
          )
        })()}

        {/* Audio waveform visualization - minimal bottom strip */}
        {trackType === TrackType.Video && recording?.hasAudio && showWaveforms && (
          <TimelineClipWaveform
            clipId={clip.id}
            clipWidth={clipWidth}
            clipInnerHeight={clipInnerHeight}
            peaks={waveformData?.peaks || []}
            isSelected={isSelected}
            colors={colors}
          />
        )}

        {/* Fade indicators - accent colored edge bars showing intro/outro fade regions */}
        {trackType === TrackType.Video && (clip.introFadeMs || clip.outroFadeMs) && (() => {
          const introWidth = clip.introFadeMs
            ? Math.max(6, Math.min(clipWidth * 0.3, TimeConverter.msToPixels(clip.introFadeMs, pixelsPerMs)))
            : 0
          const outroWidth = clip.outroFadeMs
            ? Math.max(6, Math.min(clipWidth * 0.3, TimeConverter.msToPixels(clip.outroFadeMs, pixelsPerMs)))
            : 0

          // Use centralized withAlpha utility
          const applyAlpha = (color: string, alpha: number) => withAlpha(color, alpha)

          const colorFull = applyAlpha(colors.primary, 0.8)
          const colorMid = applyAlpha(colors.primary, 0.4)
          const colorNone = applyAlpha(colors.primary, 0)

          return (
            <Group
              clipFunc={(ctx) => {
                // Clip to rounded rectangle to match clip shape
                ctx.beginPath()
                if (clipWidth > 0 && clipInnerHeight > 0) {
                  ctx.roundRect(0, 0, clipWidth, clipInnerHeight, 8)
                }
                ctx.closePath()
              }}
            >
              {/* Intro fade indicator (left side) - gradient bar */}
              {introWidth > 0 && (
                <Rect
                  x={0}
                  y={0}
                  width={introWidth}
                  height={clipInnerHeight}
                  fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                  fillLinearGradientEndPoint={{ x: introWidth, y: 0 }}
                  fillLinearGradientColorStops={[
                    0, colorFull,
                    0.6, colorMid,
                    1, colorNone
                  ]}
                  listening={false}
                />
              )}
              {/* Outro fade indicator (right side) - gradient bar */}
              {outroWidth > 0 && (
                <Rect
                  x={clipWidth - outroWidth}
                  y={0}
                  width={outroWidth}
                  height={clipInnerHeight}
                  fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                  fillLinearGradientEndPoint={{ x: outroWidth, y: 0 }}
                  fillLinearGradientColorStops={[
                    0, colorNone,
                    0.4, colorMid,
                    1, colorFull
                  ]}
                  listening={false}
                />
              )}
            </Group>
          )
        })()}

        {/* Trim handles (invisible hover targets) */}
        {!isDragging && isHovering && (
          <>
            {/* Left handle */}
            <Rect
              x={0}
              y={0}
              width={10}
              height={clipInnerHeight}
              fill="transparent"
              onMouseDown={(e) => handleTrimMouseDown('left', e)}
              onMouseEnter={() => {
                document.body.style.cursor = 'ew-resize'
              }}
              onMouseLeave={() => {
                if (!trimEdge) document.body.style.cursor = 'default'
              }}
            />
            {/* Right handle */}
            <Rect
              x={clipWidth - 10}
              y={0}
              width={10}
              height={clipInnerHeight}
              fill="transparent"
              onMouseDown={(e) => handleTrimMouseDown('right', e)}
              onMouseEnter={() => {
                document.body.style.cursor = 'ew-resize'
              }}
              onMouseLeave={() => {
                if (!trimEdge) document.body.style.cursor = 'default'
              }}
            />
          </>
        )}
      </Group>

      {/* Ghost overlay for trim preview */}
      {trimPreview && (
        <Rect
          x={ghostX}
          y={trackY + TimelineConfig.TRACK_PADDING}
          width={ghostWidth}
          height={clipInnerHeight}
          fill={colors.primary}
          opacity={0.3}
          stroke={colors.primary}
          strokeWidth={2}
          cornerRadius={8}
          listening={false}
        />
      )}
    </>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const TimelineClip = React.memo(TimelineClipComponent)
