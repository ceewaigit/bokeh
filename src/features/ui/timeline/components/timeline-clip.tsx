import React, { useMemo, useRef, useState } from 'react'
import { Group, Rect, Text } from 'react-konva'
import Konva from 'konva'

import type { Clip } from '@/types/project'
import { TrackType } from '@/types/project'
import { TimelineConfig, getClipInnerHeight } from '@/features/ui/timeline/config'
import { getSourceDuration, TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import { computeContiguousPreview } from '@/features/ui/timeline/utils/drag-positioning'
import { useTimelineColors, withAlpha } from '@/features/ui/timeline/utils/colors'
import { useRecordingMetadata } from '@/features/rendering/renderer/hooks/media/useRecordingMetadata'
import { PluginRegistry } from '@/features/effects/config/plugin-registry'

import { useProjectStore } from '@/features/core/stores/project-store'
import { usePreviewSettingsStore } from '@/features/core/stores/preview-settings-store'
import { useRecordingById } from '@/features/core/stores/selectors/clip-selectors'
import { useTimelineOperations } from './timeline-operations-context'
import { useShallow } from 'zustand/react/shallow'
import { useTimelineClipAssets } from '@/features/ui/timeline/hooks/use-timeline-clip-assets'
import { TimelineClipBackground } from './clip/timeline-clip-background'
import { TimelineClipThumbnails } from './clip/timeline-clip-thumbnails'
import { TimelineClipWaveform } from './clip/timeline-clip-waveform'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { useTimelineScroll } from './timeline-layout-provider'
import { ContinuousRect } from './konva/continuous-rect'
import { drawSquircleRectPath } from '@/features/ui/timeline/utils/corners'

interface TimelineClipProps {
  clip: Clip
  trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam
  trackY: number
  trackHeight: number
  isSelected: boolean
  clipIdOverride?: string
  otherClipsInTrack: Clip[]
}

const TimelineClipComponent = ({
  clip,
  trackType,
  trackY,
  trackHeight,
  isSelected,
  clipIdOverride,
  otherClipsInTrack,
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
  } = useTimelineOperations()

  // Use selectors that are less likely to trigger unnecessary re-renders
  // Note: We use useRecordingById which is memoized in the selector system
  const recording = useRecordingById(clip.recordingId)

  /* ---------------- STATE & REFS ---------------- */
  // PERFORMANCE: Use refs for interaction state to avoid re-renders
  const isDraggingRef = useRef(false)
  const isValidPositionRef = useRef(true)
  const isHoveringRef = useRef(false)
  const hoverTweenRef = useRef<Konva.Tween | null>(null)
  // Only use state for trim handles visibility (requires DOM update)
  const [showTrimHandles, setShowTrimHandles] = useState(false)
  /* ---------------- INTERACTION HOOKS ---------------- */
  const interactionClip = useMemo(() =>
    clipIdOverride ? { ...clip, id: clipIdOverride } : clip
    , [clip, clipIdOverride])
  const groupRef = useRef<Konva.Group>(null)
  const { scrollLeftRef } = useTimelineScroll()

  /* ---------------- THEME & SETTINGS ---------------- */
  const colors = useTimelineColors()
  // Note: No useShallow needed for primitive boolean - shallow comparison adds overhead
  const showWaveforms = useProjectStore((s) => s.settings.editing.showWaveforms ?? true)
  const showTimelineThumbnails = usePreviewSettingsStore((s) => s.showTimelineThumbnails)

  /* ---------------- COMPUTED VALUES ---------------- */

  const actionClipId = clipIdOverride ?? clip.id
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
    isExternal: recording?.isExternal,
    capabilities: recording?.capabilities,
  })

  // Visual calculations
  const visualStartTime = previewStartTime ?? clip.startTime
  const visualEndTime = visualStartTime + clip.duration
  const clipWidth = Math.max(
    TimelineConfig.MIN_CLIP_WIDTH,
    TimeConverter.msToPixels(clip.duration, pixelsPerMs)
  )
  const clipX = TimeConverter.msToPixels(visualStartTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
  const clipInnerHeight = getClipInnerHeight(trackHeight)

  // PERFORMANCE FIX: Granular selector for hidden regions
  // We select the stable editState object to avoid "getSnapshot" loops with derived arrays
  const editState = useProjectStore(useShallow((s) =>
    s.currentProject?.timeline.transcriptEdits?.[clip.recordingId]
  ))

  const hiddenRegions = useMemo(() => {
    return TimelineDataService.getHiddenRegionsFromEditState(editState, recording)
  }, [editState, recording])
  const baseClip = useMemo(() => {
    if (!clipIdOverride) return null
    return otherClipsInTrack.find(candidate => candidate.id === clipIdOverride) ?? null
  }, [clipIdOverride, otherClipsInTrack])
  const baseSourceIn = baseClip?.sourceIn ?? 0
  const baseSourceOut = baseClip?.sourceOut ?? (baseSourceIn + getSourceDuration(baseClip ?? clip))
  const segmentSourceIn = clip.sourceIn ?? 0
  const segmentSourceOut = clip.sourceOut ?? (segmentSourceIn + getSourceDuration(clip))
  const showHiddenIndicator = hiddenRegions.length > 0 && Boolean(baseClip)
  const hasHiddenLeft = showHiddenIndicator && segmentSourceIn > baseSourceIn + 1
  const hasHiddenRight = showHiddenIndicator && segmentSourceOut < baseSourceOut - 1
  const cutMarkerWidth = Math.max(2, Math.min(6, clipWidth * 0.08))

  /* ---------------- ASSETS & INTERACTIONS (COMPOSITE HOOK) ---------------- */
  const {
    trimEdge,
    trimPreview,
    handleTrimMouseDown,
    waveformData,
    thumbnails,
  } = useTimelineClipAssets({
    clip: interactionClip,
    recording,
    otherClipsInTrack,
    pixelsPerMs,
    clipInnerHeight,
    showWaveforms,
    showThumbnails: showTimelineThumbnails && trackType === TrackType.Video && !isGeneratedClip,
    onTrimStart,
    onTrimEnd,
  })

  // Derived colors and flags
  const hasThumbnails = showTimelineThumbnails && thumbnails.length > 0
  const showMissingThumb = trackType === TrackType.Video && !isGeneratedClip && !hasThumbnails

  // ANIMATION: Handle hover effect with Tween
  // We use a useEffect to trigger the animation when hover state changes
  // This avoids re-rendering the whole component but updates the visual state
  React.useEffect(() => {
    const node = groupRef.current
    if (!node) return

    // Clean up previous tween
    if (hoverTweenRef.current) {
      hoverTweenRef.current.destroy()
      hoverTweenRef.current = null
    }

    if (isHoveringRef.current && !isDraggingRef.current) {
      // Hover state
      hoverTweenRef.current = new Konva.Tween({
        node: node,
        duration: 0.15, // Snappy
        opacity: 1, // Ensure full opacity
        scaleX: 1,
        scaleY: 1,
        // We can target specific children if needed, but here we might want to lift or brighten
        // Since we can't easily animate props passed to children without state, 
        // we'll rely on the fact that we might want to scale slightly or just use the
        // trim handles visibility as the main interaction, but for "snappy fade in",
        // we could animate opacity if it was hidden, or animate a shadow/overlay.
        // Given the user request "hover effects to be a fast snappy fade in", 
        // and currently we just set `setShowTrimHandles(true)`.
        // Let's assume they mean the highlight/active state itself.
        // For now, let's make sure the group is ready.
        easing: Konva.Easings.EaseOut,
      });
    } else {
      // Normal state
    }
  }, [showTrimHandles]) // showTrimHandles follows hover state mostly

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

  const hasLeftNeighbor = otherClipsInTrack.some((candidate) => {
    if (candidate.id === clip.id) return false
    const candidateEndTime = candidate.startTime + candidate.duration
    return Math.abs(candidateEndTime - visualStartTime) < 1
  })

  const hasRightNeighbor = otherClipsInTrack.some((candidate) => {
    if (candidate.id === clip.id) return false
    return Math.abs(candidate.startTime - visualEndTime) < 1
  })

  return (
    <>
      <Group
        ref={groupRef}
        x={clipX}
        y={trackY + TimelineConfig.TRACK_PADDING}
        draggable={!trimEdge}
        dragBoundFunc={(pos) => {
          const currentScrollLeft = scrollLeftRef.current
          const proposedTimelineX = pos.x + currentScrollLeft
          const proposedTime = Math.max(
            0,
            TimeConverter.pixelsToMs(proposedTimelineX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
          )

          const blocks = otherClipsInTrack.map(c => ({ id: c.id, startTime: c.startTime, endTime: c.startTime + c.duration }))
          const preview = computeContiguousPreview(blocks, proposedTime, clip.duration, clip.id)
          const insertTime = preview?.insertTime ?? proposedTime
          const snappedX = TimeConverter.msToPixels(insertTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
          return {
            x: snappedX - currentScrollLeft,
            y: trackY + TimelineConfig.TRACK_PADDING
          }
        }}
        onDragStart={() => {
          isDraggingRef.current = true
          isValidPositionRef.current = true
          // Update opacity directly via Konva API
          groupRef.current?.opacity(0.95)
        }}
        onDragMove={(e) => {
          const draggedX = e.target.x()
          const proposedStartTime = Math.max(
            0,
            TimeConverter.pixelsToMs(draggedX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
          )
          onDragPreview(actionClipId, trackType, proposedStartTime)
        }}
        onDragEnd={(e) => {
          isDraggingRef.current = false

          const finalX = e.target.x()
          const proposedStartTime = Math.max(
            0,
            TimeConverter.pixelsToMs(finalX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
          )
          onDragCommit(actionClipId, trackType, proposedStartTime)
          isValidPositionRef.current = true
          // Restore opacity directly via Konva API
          groupRef.current?.opacity(1)
        }}
        onClick={() => {
          // Simple click handler - just select the clip
          // Suggestion bars will handle their own clicks and stop propagation
          onSelect(actionClipId)
        }}
        onMouseDown={(e) => {
          e.cancelBubble = true
        }}
        onTap={(e) => {
          e.cancelBubble = true
        }}
        onContextMenu={(e) => {
          e.evt.preventDefault()
          onContextMenu(e, actionClipId)
        }}
        onMouseEnter={() => {
          if (!trimEdge) {
            document.body.style.cursor = 'grab'
          }
          isHoveringRef.current = true
          setShowTrimHandles(true)
        }}
        onMouseLeave={() => {
          if (!trimEdge) {
            document.body.style.cursor = 'default'
          }
          isHoveringRef.current = false
          setShowTrimHandles(false)
        }}
        opacity={1}
      >

        <TimelineClipBackground
          clipId={clip.id}
          width={clipWidth}
          height={clipInnerHeight}
          isSelected={isSelected}
          isDragging={isDraggingRef.current}
          isValidPosition={isValidPositionRef.current}
          isGeneratedClip={isGeneratedClip}
          generatedLabel={generatedLabel}
          showMissingThumb={showMissingThumb}
          trackType={trackType}
          hasThumbnails={hasThumbnails}
          colors={colors}
          roundLeft={!hasLeftNeighbor}
          roundRight={!hasRightNeighbor}
          isHovering={showTrimHandles} // Pass down hover state for visual changes
        />

        {showHiddenIndicator && (hasHiddenLeft || hasHiddenRight) && (
          <Group
            clipFunc={(ctx) => {
              drawSquircleRectPath(ctx as unknown as CanvasRenderingContext2D, 0, 0, clipWidth, clipInnerHeight, 10)
            }}
          >
            {hasHiddenLeft && (
              <Rect
                x={0}
                y={0}
                width={cutMarkerWidth}
                height={clipInnerHeight}
                fill={withAlpha(colors.foreground, 0.22)}
                listening={false}
              />
            )}
            {hasHiddenRight && (
              <Rect
                x={Math.max(0, clipWidth - cutMarkerWidth)}
                y={0}
                width={cutMarkerWidth}
                height={clipInnerHeight}
                fill={withAlpha(colors.foreground, 0.22)}
                listening={false}
              />
            )}
          </Group>
        )}

        {/* Video thumbnails - multiple frames distributed across clip */}
        {trackType === TrackType.Video && hasThumbnails && (
          <TimelineClipThumbnails
            thumbnails={thumbnails}
            width={clipInnerHeight}
            height={clipInnerHeight}
            clipWidth={clipWidth}
          />
        )}

        {/* Clip metadata display - muted type label with primary metadata below */}
        {((trackType === TrackType.Video && showMissingThumb) || trackType === TrackType.Webcam) && (() => {
          const durationSec = Math.round(clip.duration / 1000)
          const durationText = `${durationSec}s`
          const speedText = clip.playbackRate && clip.playbackRate !== 1.0
            ? `${clip.playbackRate.toFixed(clip.playbackRate === Math.floor(clip.playbackRate) ? 0 : 1)}x`
            : '1x'

          const showMeta = clipWidth > 60 && clipInnerHeight > 36
          const typeLabel = trackType === TrackType.Webcam ? 'Webcam' : 'Clip'
          const metadataText = `${durationText}  ⊘ ${speedText}`

          return (
            <Group
              clipFunc={(ctx) => {
                ctx.rect(0, 0, clipWidth, clipInnerHeight)
              }}
            >
              {/* Type label - muted (top line) */}
              <Text
                x={0}
                y={0}
                width={clipWidth}
                height={showMeta ? clipInnerHeight * 0.5 : clipInnerHeight}
                text={typeLabel}
                fontSize={10}
                fontFamily="'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                fontStyle="500"
                fill={colors.foreground}
                opacity={0.5}
                align="center"
                verticalAlign={showMeta ? 'bottom' : 'middle'}
                wrap="none"
                listening={false}
              />
              {/* Metadata - primary (bottom line) */}
              {showMeta && (
                <Text
                  x={0}
                  y={clipInnerHeight * 0.5 + 1}
                  width={clipWidth}
                  height={clipInnerHeight * 0.5 - 1}
                  text={metadataText}
                  fontSize={12}
                  fontFamily="'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                  fontStyle="600"
                  fill={colors.foreground}
                  opacity={0.95}
                  align="center"
                  verticalAlign="top"
                  wrap="none"
                  listening={false}
                />
              )}
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
        {!isDraggingRef.current && showTrimHandles && (
          <>
            {/* Left handle */}
            <Rect
              x={-5} // Extend outside slightly
              y={0}
              width={20} // Wider hit area (was 10)
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
              x={clipWidth - 15} // Adjusted for wider width
              y={0}
              width={20} // Wider hit area (was 10)
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
        <ContinuousRect
          x={ghostX}
          y={trackY + TimelineConfig.TRACK_PADDING}
          width={ghostWidth}
          height={clipInnerHeight}
          cornerRadius={8}
          fill={colors.primary}
          opacity={0.3}
          stroke={colors.primary}
          strokeWidth={2}
          listening={false}
        />
      )}
    </>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const TimelineClip = React.memo(TimelineClipComponent)
