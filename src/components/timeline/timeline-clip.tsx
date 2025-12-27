import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { Group, Rect, Text, Image } from 'react-konva'
import Konva from 'konva'

import type { Clip, Recording } from '@/types/project'
import { TrackType } from '@/types/project'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { ClipPositioning } from '@/lib/timeline/clip-positioning'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { useTimelineColors } from '@/lib/timeline/colors'
import { WaveformAnalyzer, type WaveformData } from '@/lib/audio/waveform-analyzer'
import { SpeedUpSuggestionsBar } from './speed-up-suggestions-bar'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { ActivityDetectionService } from '@/lib/timeline/activity-detection/detection-service'
import { useRecordingMetadata } from '@/remotion/hooks/media/useRecordingMetadata'
import { PluginRegistry } from '@/lib/effects/config/plugin-registry'

import { useProjectStore } from '@/stores/project-store'

interface TimelineClipProps {
  clip: Clip
  recording?: Recording | null
  trackType: TrackType.Video | TrackType.Audio
  trackY: number
  trackHeight: number
  pixelsPerMs: number
  isSelected: boolean
  otherClipsInTrack?: Clip[]
  onSelect: (clipId: string) => void
  onDragPreview?: (clipId: string, proposedStartTime: number) => void
  onDragCommit?: (clipId: string, proposedStartTime: number) => void
  onContextMenu?: (e: any, clipId: string) => void
  onTrimStart?: (clipId: string, newStartTime: number) => void
  onTrimEnd?: (clipId: string, newEndTime: number) => void
  displayStartTime?: number
  onOpenSpeedUpSuggestion?: (opts: {
    x: number
    y: number
    period: SpeedUpPeriod
    allTypingPeriods: SpeedUpPeriod[]
    allIdlePeriods: SpeedUpPeriod[]
  }) => void
}

// Minimum clip duration in milliseconds (enforced during edge trimming)
const MIN_CLIP_DURATION_MS = 1000 // 1 second minimum

const TimelineClipComponent = ({
  clip,
  recording,
  trackType,
  trackY,
  trackHeight,
  pixelsPerMs,
  isSelected,
  otherClipsInTrack = [],
  onSelect,
  onDragPreview,
  onDragCommit,
  onContextMenu,
  onTrimStart,
  onTrimEnd,
  displayStartTime,
  onOpenSpeedUpSuggestion
}: TimelineClipProps) => {


  const [waveformData, setWaveformData] = useState<WaveformData | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isValidPosition, setIsValidPosition] = useState(true)
  const [typingPeriods, setTypingPeriods] = useState<SpeedUpPeriod[]>([])
  const [idlePeriods, setIdlePeriods] = useState<SpeedUpPeriod[]>([])
  const [isHovering, setIsHovering] = useState(false)
  const [trimEdge, setTrimEdge] = useState<'left' | 'right' | null>(null)
  const [trimPreview, setTrimPreview] = useState<{ startTime: number; endTime: number } | null>(null)
  const trimStartRef = useRef<{
    startTime: number
    endTime: number
    mouseX: number
    minStartTime: number
    maxEndTime: number
  } | null>(null)
  const groupRef = useRef<Konva.Group>(null)

  const colors = useTimelineColors()
  const showWaveforms = useProjectStore((s) => s.settings.editing.showWaveforms ?? true)
  const showTypingSuggestions = useProjectStore((s) => s.settings.showTypingSuggestions)
  const isGeneratedClip = trackType === TrackType.Video && recording?.sourceType === 'generated'
  const generatedLabel = React.useMemo(() => {
    const pluginId = recording?.generatedSource?.pluginId
    if (!pluginId) return 'Generated Clip'
    return PluginRegistry.get(pluginId)?.name ?? 'Generated Clip'
  }, [recording?.generatedSource?.pluginId])
  const { metadata: lazyMetadata } = useRecordingMetadata({
    recordingId: recording?.sourceType === 'generated' ? '' : (recording?.id || ''),
    folderPath: recording?.folderPath,
    metadataChunks: recording?.metadataChunks,
    inlineMetadata: recording?.metadata,
  })

  // Use preview values during trimming for live feedback
  const effectiveStartTime = trimPreview?.startTime ?? clip.startTime
  const effectiveDuration = trimPreview
    ? trimPreview.endTime - trimPreview.startTime
    : clip.duration

  const visualStartTime = displayStartTime ?? effectiveStartTime
  const clipX = TimeConverter.msToPixels(visualStartTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
  const clipWidth = Math.max(
    TimelineConfig.MIN_CLIP_WIDTH,
    TimeConverter.msToPixels(effectiveDuration, pixelsPerMs)
  )

  // Track height is now passed as a prop

  // Load audio waveform data
  useEffect(() => {
    if (!recording?.hasAudio || !recording?.filePath) return

    const loadWaveform = async () => {
      try {
        // Get or load video URL
        let blobUrl = RecordingStorage.getBlobUrl(recording.id)
        if (!blobUrl && recording.filePath) {
          blobUrl = await globalBlobManager.loadVideos({
            id: recording.id,
            filePath: recording.filePath,
            folderPath: recording.folderPath
          })
        }

        if (!blobUrl) return

        // Analyze audio and extract waveform
        const waveform = await WaveformAnalyzer.analyzeAudio(
          blobUrl,
          clip.id,
          clip.sourceIn,
          clip.sourceOut - clip.sourceIn,
          50 // Samples per second for smooth visualization
        )

        if (waveform) {
          setWaveformData(waveform)
        }
      } catch (error) {
        console.warn('Failed to load waveform:', error)
      }
    }

    loadWaveform()
  }, [recording?.id, recording?.filePath, recording?.folderPath, recording?.hasAudio, clip.id, clip.sourceIn, clip.sourceOut])

  // Analyze activity patterns for speed-up suggestions (typing + idle)
  useEffect(() => {
    if (!recording) {
      setTypingPeriods([])
      setIdlePeriods([])
      return
    }

    try {
      // Use unified detection service - handles caching internally
      const effectiveMetadata = lazyMetadata || recording.metadata
      const suggestions = ActivityDetectionService.getSuggestionsForClip(recording, clip, effectiveMetadata)

      setTypingPeriods(suggestions.typing)
      setIdlePeriods(suggestions.idle)
    } catch (error) {
      console.warn('Failed to analyze activity patterns:', error)
      setTypingPeriods([])
      setIdlePeriods([])
    }
  }, [
    recording?.id,
    lazyMetadata?.keyboardEvents,
    lazyMetadata?.mouseEvents,
    lazyMetadata?.detectedIdlePeriods,
    lazyMetadata?.detectedTypingPeriods,
    recording?.metadata?.keyboardEvents,
    recording?.metadata?.mouseEvents,
    recording?.metadata?.detectedIdlePeriods,  // Re-run when idle cache is updated (e.g., after regenerate with new config)
    recording?.metadata?.detectedTypingPeriods,
    clip.id,
    clip.sourceIn,
    clip.sourceOut,
    clip.duration,
    clip.playbackRate,
    clip.typingSpeedApplied,
    clip.idleSpeedApplied
  ])

  const resolvedVideoPath = useMemo(() => {
    if (!recording?.filePath) return null
    if (recording.filePath.startsWith('/')) return recording.filePath
    const basename = recording.filePath.split('/').pop() || recording.filePath
    if (recording.folderPath) {
      return `${recording.folderPath.replace(/\/$/, '')}/${basename}`
    }
    return recording.filePath
  }, [recording?.filePath, recording?.folderPath])

  // Multiple thumbnails at evenly spaced source positions for video clips
  // Max 10 thumbnails per clip to balance visual variety vs performance
  const MAX_THUMBNAILS_PER_CLIP = 10
  const [thumbnails, setThumbnails] = useState<HTMLImageElement[]>([])

  useEffect(() => {
    if (trackType !== 'video' || !resolvedVideoPath || isGeneratedClip || !recording) return

    let cancelled = false

    const loadThumbnails = async () => {
      try {
        const thumbHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2

        // Fast path for image clips (e.g. Cursor Return clips)
        if (recording.sourceType === 'image') {
          const img = document.createElement('img')
          let src = resolvedVideoPath

          // Handle local paths by using video-stream protocol to bypass security restrictions
          if (src && src.startsWith('/')) {
            src = `video-stream://local/${encodeURIComponent(src)}`
          }

          img.src = src
          img.onload = () => {
            if (!cancelled) setThumbnails([img])
          }
          img.onerror = (_e) => {
            console.warn('[TimelineClip] Failed to load image thumbnail:', src)
          }
          return
        }

        const sourceAspectRatio = recording.width && recording.height
          ? recording.width / recording.height
          : 16 / 9
        const thumbWidth = Math.max(1, Math.round(thumbHeight * sourceAspectRatio))

        // Calculate tile count based on clip's source duration (not pixel width)
        // Approximately one thumbnail per 5 seconds of source video
        const sourceDurationSec = (clip.sourceOut - clip.sourceIn) / 1000
        const tileCount = Math.min(MAX_THUMBNAILS_PER_CLIP, Math.max(1, Math.ceil(sourceDurationSec / 5)))
        const sourceDuration = clip.sourceOut - clip.sourceIn

        const loadedThumbs: HTMLImageElement[] = new Array(tileCount)

        // Load all thumbnails in parallel for speed
        const loadPromises = Array.from({ length: tileCount }, async (_, i) => {
          if (cancelled) return

          // Calculate source timestamp for this tile position
          const tileProgress = tileCount > 1 ? i / (tileCount - 1) : 0.5
          const sourceTime = clip.sourceIn + sourceDuration * tileProgress
          const timestamp = sourceTime / (recording.duration || 1)

          const cacheKey = `${clip.id}_${recording.id}_t${i}_${Math.round(sourceTime)}_${thumbWidth}x${thumbHeight}`

          const dataUrl = await ThumbnailGenerator.generateThumbnail(
            resolvedVideoPath,
            cacheKey,
            {
              width: thumbWidth,
              height: thumbHeight,
              timestamp
            }
          )

          if (cancelled || !dataUrl) return

          const img = document.createElement('img')
          img.src = dataUrl
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = reject
          })

          if (!cancelled) {
            loadedThumbs[i] = img
          }
        })

        await Promise.all(loadPromises)

        if (!cancelled) {
          setThumbnails([...loadedThumbs.filter(Boolean)])
        }
      } catch (error) {
        // Failed to load thumbnails - will show placeholder
      }
    }

    loadThumbnails()

    return () => {
      cancelled = true
    }
  }, [recording, resolvedVideoPath, clip.id, clip.sourceIn, clip.sourceOut, trackHeight, trackType, isGeneratedClip])

  // Calculate trim boundaries based on source material and locked bounds
  // Adjacent clips are handled by push/reflow after trim, not by blocking expansion
  const getTrimBoundaries = useCallback(() => {
    const playbackRate = clip.playbackRate || 1
    const recordingDuration = recording?.duration || 0

    // Use locked bounds if set, otherwise full recording range
    const effectiveMinSource = clip.lockedSourceIn ?? 0
    const effectiveMaxSource = clip.lockedSourceOut ?? recordingDuration

    // Source space constraints - limited by locked bounds
    const sourceExpandLeft = (clip.sourceIn - effectiveMinSource) / playbackRate
    const sourceExpandRight = (effectiveMaxSource - clip.sourceOut) / playbackRate

    // Find previous clip - we can't push clips left (would go negative), so this is a hard limit
    const sortedClips = [...otherClipsInTrack].filter(c => c.id !== clip.id).sort((a, b) => a.startTime - b.startTime)
    const prevClip = sortedClips.filter(c => c.startTime + c.duration <= clip.startTime).pop()

    // Left edge: constrained by previous clip AND source material (respecting locked bounds)
    const minStartTime = Math.max(
      prevClip ? prevClip.startTime + prevClip.duration : 0,
      clip.startTime - sourceExpandLeft
    )

    // Right edge: constrained by source material respecting locked bounds (subsequent clips will be pushed)
    const maxEndTime = clip.startTime + clip.duration + sourceExpandRight

    return { minStartTime, maxEndTime }
  }, [clip, recording, otherClipsInTrack])

  // Handle trim drag with visual preview
  const handleTrimMouseDown = useCallback((edge: 'left' | 'right', e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true // Stop propagation to prevent clip drag
    setTrimEdge(edge)

    const boundaries = getTrimBoundaries()
    const initialState = {
      startTime: clip.startTime,
      endTime: clip.startTime + clip.duration,
      mouseX: e.evt.clientX,
      minStartTime: boundaries.minStartTime,
      maxEndTime: boundaries.maxEndTime
    }
    trimStartRef.current = initialState
    setTrimPreview({ startTime: initialState.startTime, endTime: initialState.endTime })

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!trimStartRef.current) return

      const deltaX = moveEvent.clientX - trimStartRef.current.mouseX
      const deltaMs = TimeConverter.pixelsToMs(deltaX, pixelsPerMs)

      if (edge === 'left') {
        // Trim start: moving right makes clip shorter, left makes it longer
        let newStartTime = trimStartRef.current.startTime + deltaMs

        // Enforce minimum duration
        const maxStartTime = trimStartRef.current.endTime - MIN_CLIP_DURATION_MS
        newStartTime = Math.min(newStartTime, maxStartTime)

        // Can't go before minimum (previous clip or source boundary)
        newStartTime = Math.max(trimStartRef.current.minStartTime, newStartTime)

        // Update visual preview in real-time
        setTrimPreview({ startTime: newStartTime, endTime: trimStartRef.current.endTime })
      } else {
        // Trim end: moving right makes clip longer, left makes it shorter
        let newEndTime = trimStartRef.current.endTime + deltaMs

        // Enforce minimum duration
        const minEndTime = trimStartRef.current.startTime + MIN_CLIP_DURATION_MS
        newEndTime = Math.max(newEndTime, minEndTime)

        // Can't go past maximum (next clip or source boundary)
        newEndTime = Math.min(trimStartRef.current.maxEndTime, newEndTime)

        // Update visual preview in real-time
        setTrimPreview({ startTime: trimStartRef.current.startTime, endTime: newEndTime })
      }
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      if (!trimStartRef.current) return

      const deltaX = upEvent.clientX - trimStartRef.current.mouseX
      const deltaMs = TimeConverter.pixelsToMs(deltaX, pixelsPerMs)

      if (edge === 'left') {
        let newStartTime = trimStartRef.current.startTime + deltaMs
        const maxStartTime = trimStartRef.current.endTime - MIN_CLIP_DURATION_MS
        newStartTime = Math.min(newStartTime, maxStartTime)
        newStartTime = Math.max(trimStartRef.current.minStartTime, newStartTime)

        if (newStartTime !== trimStartRef.current.startTime) {
          onTrimStart?.(clip.id, newStartTime)
        }
      } else {
        let newEndTime = trimStartRef.current.endTime + deltaMs
        const minEndTime = trimStartRef.current.startTime + MIN_CLIP_DURATION_MS
        newEndTime = Math.max(newEndTime, minEndTime)
        newEndTime = Math.min(trimStartRef.current.maxEndTime, newEndTime)

        if (newEndTime !== trimStartRef.current.endTime) {
          onTrimEnd?.(clip.id, newEndTime)
        }
      }

      setTrimEdge(null)
      setTrimPreview(null)
      trimStartRef.current = null
      document.body.style.cursor = 'default'

      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [clip.id, clip.startTime, clip.duration, pixelsPerMs, onTrimStart, onTrimEnd, getTrimBoundaries])

  // Prevent rendering if track is collapsed (height 0) to avoid invalid shape errors
  // Must be after all hooks to prevent "Rendered fewer hooks" error
  if (trackHeight <= TimelineConfig.TRACK_PADDING * 2) return null

  return (
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
        onDragPreview?.(clip.id, proposedStartTime)
      }}
      onDragEnd={(e) => {
        setIsDragging(false)

        const finalX = e.target.x()
        const proposedStartTime = Math.max(
          0,
          TimeConverter.pixelsToMs(finalX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
        )
        onDragCommit?.(clip.id, proposedStartTime)
        setIsValidPosition(true)
      }}
      onClick={() => {
        // Simple click handler - just select the clip
        // Suggestion bars will handle their own clicks and stop propagation
        onSelect(clip.id)
      }}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.evt.preventDefault()
          onContextMenu(e, clip.id)
        }
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
      {/* Clip background with rounded corners */}
      <Rect
        // Center pivot for scaling
        offsetX={clipWidth / 2}
        offsetY={(trackHeight - TimelineConfig.TRACK_PADDING * 2) / 2}
        x={clipWidth / 2}
        y={(trackHeight - TimelineConfig.TRACK_PADDING * 2) / 2}
        width={clipWidth}
        height={trackHeight - TimelineConfig.TRACK_PADDING * 2}
        fill={
          trackType === TrackType.Video && thumbnails.length > 0
            ? 'transparent'
            : trackType === TrackType.Video
              ? (isGeneratedClip ? colors.muted : 'rgba(127,127,127,0.15)')
              : colors.success
        }
        stroke={
          isDragging && !isValidPosition
            ? colors.destructive
            : isSelected
              ? colors.primary
              : 'transparent'
        }
        strokeWidth={isDragging && !isValidPosition ? 1.5 : isSelected ? 1 : 0}
        cornerRadius={8}
        opacity={1}
        shadowColor="black"
        shadowBlur={isSelected ? 3 : 1}
        shadowOpacity={isSelected ? 0.08 : 0.02}
        shadowOffsetY={1}
      />

      {isGeneratedClip && thumbnails.length === 0 && (
        <Group
          clipFunc={(ctx) => {
            ctx.beginPath()
            ctx.roundRect(0, 0, clipWidth, trackHeight - TimelineConfig.TRACK_PADDING * 2, 8)
            ctx.closePath()
          }}
        >
          {(() => {
            const stripeWidth = 10
            const stripeGap = 10
            const stripeCount = Math.max(1, Math.ceil(clipWidth / (stripeWidth + stripeGap)))
            const clipInnerHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2

            return Array.from({ length: stripeCount }, (_, i) => (
              <Rect
                key={`gen-stripe-${clip.id}-${i}`}
                x={i * (stripeWidth + stripeGap)}
                y={0}
                width={stripeWidth}
                height={clipInnerHeight}
                fill="rgba(255,255,255,0.06)"
                opacity={0.6}
                listening={false}
              />
            ))
          })()}
          <Rect
            width={clipWidth}
            height={trackHeight - TimelineConfig.TRACK_PADDING * 2}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: trackHeight - TimelineConfig.TRACK_PADDING * 2 }}
            fillLinearGradientColorStops={[
              0, 'rgba(255,255,255,0.05)',
              0.5, 'rgba(255,255,255,0)',
              1, 'rgba(0,0,0,0.1)'
            ]}
            listening={false}
          />
          {clipWidth > 80 && (
            <Text
              x={12}
              y={10}
              text={generatedLabel}
              fontSize={10}
              fontFamily="system-ui"
              fontStyle="bold"
              fill="rgba(255,255,255,0.7)"
              listening={false}
            />
          )}
        </Group>
      )}

      {/* Video thumbnails - multiple frames distributed across clip */}
      {trackType === TrackType.Video && thumbnails.length > 0 && (
        <Group clipFunc={(ctx) => {
          // Clip to rounded rectangle
          ctx.beginPath()
          ctx.roundRect(0, 0, clipWidth, trackHeight - TimelineConfig.TRACK_PADDING * 2, 8)
          ctx.closePath()
        }}>
          {/* Distribute thumbnails across clip width */}
          {(() => {
            const thumbHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2
            const firstThumb = thumbnails[0]
            if (!firstThumb) return null
            const aspectRatio = firstThumb.width / firstThumb.height
            const thumbWidth = Math.floor(thumbHeight * aspectRatio)
            const tileCount = Math.max(1, Math.ceil(clipWidth / thumbWidth))

            return Array.from({ length: tileCount }, (_, i) => {
              // Distribute available thumbnails across tile positions
              const thumbIndex = Math.floor((i / tileCount) * thumbnails.length)
              const thumb = thumbnails[thumbIndex] || thumbnails[0]
              if (!thumb) return null
              return (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image
                  key={i}
                  image={thumb}
                  x={i * thumbWidth}
                  y={0}
                  width={thumbWidth}
                  height={thumbHeight}
                  opacity={0.95}
                />
              )
            })
          })()}
          {/* Gradient overlay for text visibility */}
          <Rect
            width={clipWidth}
            height={trackHeight - TimelineConfig.TRACK_PADDING * 2}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: trackHeight - TimelineConfig.TRACK_PADDING * 2 }}
            fillLinearGradientColorStops={[
              0, 'rgba(0,0,0,0.02)', // Very subtle top
              0.7, 'rgba(0,0,0,0)',
              1, 'rgba(0,0,0,0.1)' // Much more subtle bottom
            ]}
          />
        </Group>
      )}

      {/* Audio waveform visualization - minimal bottom strip */}
      {trackType === TrackType.Video && recording?.hasAudio && showWaveforms && (
        <Group
          y={(() => {
            const clipInnerHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2
            const stripHeight = Math.max(12, Math.min(24, Math.floor(clipInnerHeight * 0.4)))
            return clipInnerHeight - stripHeight - 2 // Lift up slightly
          })()}
          clipFunc={(ctx) => {
            ctx.beginPath()
            const clipInnerHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2
            const stripHeight = Math.max(12, Math.min(24, Math.floor(clipInnerHeight * 0.4)))
            // Rounded bottom corners only - match clip's 8px radius
            ctx.roundRect(0, 0, clipWidth, stripHeight, [0, 0, 8, 8])
            ctx.closePath()
          }}
        >
          {(() => {
            const clipInnerHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2
            const stripHeight = Math.max(16, Math.min(34, Math.floor(clipInnerHeight * 0.7)))
            const baselineY = stripHeight - 1
            const maxAmplitude = stripHeight - 4
            const minBarHeight = 3
            const heightBoost = 1.6

            // Modern minimal waveform: thin, rounded bars centered on the midline
            const barWidth = 2
            const barGap = 1
            const peaks = waveformData?.peaks?.length
              ? WaveformAnalyzer.resamplePeaks(waveformData.peaks, clipWidth, barWidth, barGap)
              : []

            const fill = isSelected ? colors.primary : 'rgba(255,255,255,0.9)'
            const opacity = isSelected ? 0.8 : 0.6

            return (
              <>
                {/* Contrast backdrop so waveform stays visible over thumbnails */}
                <Rect
                  x={0}
                  y={0}
                  width={clipWidth}
                  height={stripHeight}
                  fill="rgba(0,0,0,0.15)"
                  opacity={1}
                  cornerRadius={[0, 0, 8, 8]}
                  listening={false}
                />
                {peaks.length > 0 && peaks.map((peak, i) => {
                  const clamped = Math.max(0, Math.min(1, peak))
                  const shaped = Math.pow(clamped, 0.5)
                  const scaled = minBarHeight + shaped * (maxAmplitude - minBarHeight) * heightBoost
                  const barHeight = Math.max(minBarHeight, Math.min(maxAmplitude, scaled))
                  const x = i * (barWidth + barGap)
                  if (x > clipWidth) return null
                  return (
                    <Rect
                      key={`wf-${clip.id}-${i}`}
                      x={x}
                      y={baselineY - barHeight}
                      width={barWidth}
                      height={barHeight}
                      fill={fill}
                      opacity={opacity}
                      cornerRadius={1}
                      listening={false}
                    />
                  )
                })}
              </>
            )
          })()}
        </Group>
      )}

      {/* Speed indicator badge - only shown when playback rate is modified */}
      {trackType === TrackType.Video && clip.playbackRate && clip.playbackRate !== 1.0 && (() => {
        const rateText = `${clip.playbackRate.toFixed(clip.playbackRate === Math.floor(clip.playbackRate) ? 0 : 1)}x`
        return (
          <Group x={6} y={6}>
            <Rect
              width={24}
              height={14}
              fill={'rgba(0,0,0,0.6)'}
              cornerRadius={7}
              stroke={'rgba(255,255,255,0.2)'}
              strokeWidth={1}
            />
            <Text
              x={12}
              y={7}
              text={rateText}
              fontSize={9}
              fill={'white'}
              fontFamily="system-ui"
              fontStyle="bold"
              align="center"
              verticalAlign="middle"
              offsetX={rateText.length * 2.5}
              offsetY={4.5}
            />
          </Group>
        )
      })()}

      {/* Fade indicators - accent colored edge bars showing intro/outro fade regions */}
      {trackType === TrackType.Video && (clip.introFadeMs || clip.outroFadeMs) && (() => {
        const clipInnerHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2
        const introWidth = clip.introFadeMs
          ? Math.max(6, Math.min(clipWidth * 0.3, TimeConverter.msToPixels(clip.introFadeMs, pixelsPerMs)))
          : 0
        const outroWidth = clip.outroFadeMs
          ? Math.max(6, Math.min(clipWidth * 0.3, TimeConverter.msToPixels(clip.outroFadeMs, pixelsPerMs)))
          : 0

        // Helper to apply alpha to token colors
        const withOpacity = (color: string, alpha: number) => {
          if (!color) return `rgba(168, 85, 247, ${alpha})`
          if (color.startsWith('hsl(')) {
            // Remove 'hsl(' and ')' and trim
            const content = color.slice(4, -1).trim()
            // Check if space-separated (CSS Level 4) e.g. "263 70% 65%"
            if (content.includes(' ') && !content.includes(',')) {
              // Convert to comma-separated for compatibility: "263, 70%, 65%"
              const parts = content.split(/\s+/).join(', ')
              return `hsla(${parts}, ${alpha})`
            }
            // Already comma-separated or other format
            return color.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`)
          }
          return color // Fallback or already has alpha
        }

        const colorFull = withOpacity(colors.primary, 0.8)
        const colorMid = withOpacity(colors.primary, 0.4)
        const colorNone = withOpacity(colors.primary, 0)

        return (
          <Group
            clipFunc={(ctx) => {
              // Clip to rounded rectangle to match clip shape
              ctx.beginPath()
              ctx.roundRect(0, 0, clipWidth, clipInnerHeight, 8)
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

      {/* Speed-up suggestions bar - shows typing and idle indicators */}
      {trackType === TrackType.Video && (typingPeriods.length > 0 || idlePeriods.length > 0) && showTypingSuggestions && (
        <SpeedUpSuggestionsBar
          typingPeriods={typingPeriods}
          idlePeriods={idlePeriods}
          clip={clip}
          clipWidth={clipWidth}
          pixelsPerMs={pixelsPerMs}
          onOpenSuggestion={onOpenSpeedUpSuggestion}
        />
      )}

      {/* Trim ghost overlay - shows the region being trimmed away */}
      {trimPreview && trimEdge && (
        <>
          {trimEdge === 'left' && trimPreview.startTime > clip.startTime && (
            // Ghost showing trimmed region on left
            <Rect
              x={TimeConverter.msToPixels(clip.startTime - effectiveStartTime, pixelsPerMs)}
              y={0}
              width={TimeConverter.msToPixels(trimPreview.startTime - clip.startTime, pixelsPerMs)}
              height={trackHeight - TimelineConfig.TRACK_PADDING * 2}
              fill={colors.destructive}
              opacity={0.3}
              cornerRadius={[8, 0, 0, 8]}
              listening={false}
            />
          )}
          {trimEdge === 'right' && trimPreview.endTime < (clip.startTime + clip.duration) && (
            // Ghost showing trimmed region on right
            <Rect
              x={clipWidth}
              y={0}
              width={TimeConverter.msToPixels((clip.startTime + clip.duration) - trimPreview.endTime, pixelsPerMs)}
              height={trackHeight - TimelineConfig.TRACK_PADDING * 2}
              fill={colors.destructive}
              opacity={0.3}
              cornerRadius={[0, 8, 8, 0]}
              listening={false}
            />
          )}
        </>
      )}

      {/* Trim handles - shown on hover */}
      {(isHovering || trimEdge) && !isDragging && (
        <>
          {/* Left trim handle */}
          <Rect
            x={0}
            y={0}
            width={8}
            height={trackHeight - TimelineConfig.TRACK_PADDING * 2}
            fill={trimEdge === 'left' ? colors.primary : 'transparent'}
            opacity={trimEdge === 'left' ? 0.6 : 1}
            cornerRadius={[8, 0, 0, 8]}
            onMouseEnter={() => {
              document.body.style.cursor = 'ew-resize'
            }}
            onMouseLeave={() => {
              if (!trimEdge) {
                document.body.style.cursor = 'grab'
              }
            }}
            onMouseDown={(e) => handleTrimMouseDown('left', e)}
          />
          {/* Left handle visual indicator */}
          <Rect
            x={2}
            y={(trackHeight - TimelineConfig.TRACK_PADDING * 2) / 2 - 10}
            width={4}
            height={20}
            fill={colors.primary}
            opacity={0.8}
            cornerRadius={2}
            listening={false}
          />

          {/* Right trim handle */}
          <Rect
            x={clipWidth - 8}
            y={0}
            width={8}
            height={trackHeight - TimelineConfig.TRACK_PADDING * 2}
            fill={trimEdge === 'right' ? colors.primary : 'transparent'}
            opacity={trimEdge === 'right' ? 0.6 : 1}
            cornerRadius={[0, 8, 8, 0]}
            onMouseEnter={() => {
              document.body.style.cursor = 'ew-resize'
            }}
            onMouseLeave={() => {
              if (!trimEdge) {
                document.body.style.cursor = 'grab'
              }
            }}
            onMouseDown={(e) => handleTrimMouseDown('right', e)}
          />
          {/* Right handle visual indicator */}
          <Rect
            x={clipWidth - 6}
            y={(trackHeight - TimelineConfig.TRACK_PADDING * 2) / 2 - 10}
            width={4}
            height={20}
            fill={colors.primary}
            opacity={0.8}
            cornerRadius={2}
            listening={false}
          />
        </>
      )}

    </Group>
  )
}

export const TimelineClip = React.memo(TimelineClipComponent, (prev, next) => {
  return prev.clip === next.clip &&
    prev.recording === next.recording &&
    prev.trackType === next.trackType &&
    prev.trackY === next.trackY &&
    prev.trackHeight === next.trackHeight &&
    prev.pixelsPerMs === next.pixelsPerMs &&
    prev.isSelected === next.isSelected &&
    prev.otherClipsInTrack === next.otherClipsInTrack &&
    prev.displayStartTime === next.displayStartTime
})
