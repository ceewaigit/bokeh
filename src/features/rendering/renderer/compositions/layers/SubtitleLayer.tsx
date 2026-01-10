import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { Effect, Clip, Recording } from '@/types/project'
import type { SubtitleEffectData, TranscriptWord } from '@/types/project'
import { OverlayAnchor } from '@/types/overlays'
import { EffectType } from '@/types/project'
import { useTimelineContext } from '@/features/rendering/renderer/context/TimelineContext'
import { useOverlayContext } from '@/features/rendering/overlays/overlay-context'
import { getOverlayAnchorStyle } from '@/features/rendering/overlays/anchor-utils'
import { useVideoPosition } from '@/features/rendering/renderer/context/layout/VideoPositionContext'
import { useProjectStore } from '@/features/core/stores/project-store'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import type { SourceTimeRange } from '@/types/project'
import { timelineToSource } from '@/features/ui/timeline/time/time-space-converter'
import { getHighlightWeight, mixColors, scaleAlpha } from './subtitle-highlight'

function applyOpacity(color: string, opacity?: number): string {
  if (opacity == null) return color
  if (color.startsWith('rgba(')) {
    const parts = color.replace('rgba(', '').replace(')', '').split(',').map(p => p.trim())
    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${opacity})`
    }
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`)
  }
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4
      ? color.split('').map((c, i) => (i === 0 ? c : c + c)).join('')
      : color
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }
  return color
}

function findWordIndex(words: TranscriptWord[], timeMs: number): number {
  if (words.length === 0) return -1

  let low = 0
  let high = words.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const word = words[mid]
    if (timeMs < word.startTime) {
      high = mid - 1
    } else if (timeMs >= word.endTime) {
      low = mid + 1
    } else {
      return mid
    }
  }

  // If not inside any word, find the closest one
  // 'low' is where the time would be inserted, so check neighbors
  if (low >= words.length) {
    // Past the last word - return the last word
    return words.length - 1
  }
  if (low === 0) {
    // Before the first word - return first word if close enough (within 500ms)
    if (words[0].startTime - timeMs < 500) return 0
    return -1
  }

  // Between words - return the previous word (just finished speaking)
  return low - 1
}

function getWordWindow(words: TranscriptWord[], currentIndex: number, windowSize: number) {
  const size = Math.max(1, windowSize)
  const half = Math.floor(size / 2)
  const start = Math.max(0, currentIndex - half)
  const end = Math.min(words.length, start + size)
  return {
    start,
    end,
  }
}

export function SubtitleLayer() {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const videoPosition = useVideoPosition()
  const { effects, getRecording } = useTimelineContext()
  const { resolvedAnchors } = useOverlayContext()
  const currentTimeMs = (frame / fps) * 1000
  const project = useProjectStore((s) => s.currentProject)


  // 1. Efficiently derive active subtitle effects
  const activeSubtitleEffects = useMemo(() => {
    return effects.filter(e =>
      e.type === EffectType.Subtitle &&
      e.enabled !== false
    )
  }, [effects])

  // 2. Pre-compute hidden regions (Memoized per project structure, not frame)
  // Logic: Only re-calc when transcript edits in project actually change.
  const hiddenRegionsMap = useMemo(() => {
    if (!project) return new Map<string, SourceTimeRange[]>()
    const map = new Map<string, SourceTimeRange[]>()

    // Scan all active subtitle effects to determine which recordings need region maps
    for (const effect of activeSubtitleEffects) {
      const data = effect.data as SubtitleEffectData
      if (!map.has(data.recordingId)) {
        map.set(
          data.recordingId,
          TimelineDataService.getHiddenRegionsForRecording(project, data.recordingId)
        )
      }
    }
    return map
  }, [project, activeSubtitleEffects])

  // 3. Pre-compute Clip Lookup Map (Memoized per project structure)
  // Optimization: Instead of flatMap every frame, build a Map<RecordingId, Clip[]> once
  const clipsByRecordingId = useMemo(() => {
    const map = new Map<string, Clip[]>()
    if (!project) return map

    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        const list = map.get(clip.recordingId) ?? []
        list.push(clip)
        map.set(clip.recordingId, list)
      }
    }
    return map
  }, [project]) // Re-run only when project changes (which includes tracks)

  const overlayScale = React.useMemo(() => {
    const scaleFactor = videoPosition.scaleFactor
    if (typeof scaleFactor === 'number' && Number.isFinite(scaleFactor) && scaleFactor > 0) {
      return scaleFactor
    }
    return 1
  }, [videoPosition.scaleFactor])

  const overlayBounds = React.useMemo(() => {
    const drawWidth = Number.isFinite(videoPosition.drawWidth) && videoPosition.drawWidth > 0
      ? videoPosition.drawWidth
      : width
    const drawHeight = Number.isFinite(videoPosition.drawHeight) && videoPosition.drawHeight > 0
      ? videoPosition.drawHeight
      : height
    const offsetX = Number.isFinite(videoPosition.offsetX) ? videoPosition.offsetX : 0
    const offsetY = Number.isFinite(videoPosition.offsetY) ? videoPosition.offsetY : 0
    return {
      left: Math.round(offsetX),
      top: Math.round(offsetY),
      width: Math.round(drawWidth),
      height: Math.round(drawHeight),
    }
  }, [
    videoPosition.drawWidth,
    videoPosition.drawHeight,
    videoPosition.offsetX,
    videoPosition.offsetY,
    width,
    height
  ])

  // Only check if we have active effects
  if (activeSubtitleEffects.length === 0) return null

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 60 }}>
      {activeSubtitleEffects.map(effect => (
        <SubtitleEffectRenderer
          key={effect.id}
          effect={effect}
          currentTimeMs={currentTimeMs}
          width={width}
          height={height}
          overlayScale={overlayScale}
          overlayBounds={overlayBounds}
          getRecording={getRecording}
          hiddenRegionsMap={hiddenRegionsMap}
          clipsByRecordingId={clipsByRecordingId}
          resolvedAnchors={resolvedAnchors}
        />
      ))}
    </AbsoluteFill>
  )
}

// Sub-component to process individual effects - keeps main loop clean
const SubtitleEffectRenderer = React.memo<{
  effect: Effect
  currentTimeMs: number
  width: number
  height: number
  overlayScale: number
  overlayBounds: { left: number; top: number; width: number; height: number }
  getRecording: (id: string) => Recording | undefined
  hiddenRegionsMap: Map<string, SourceTimeRange[]>
  clipsByRecordingId: Map<string, Clip[]>
  resolvedAnchors: Map<string, OverlayAnchor>
}>(({
  effect,
  currentTimeMs,
  width,
  height,
  overlayScale,
  overlayBounds,
  getRecording,
  hiddenRegionsMap,
  clipsByRecordingId,
  resolvedAnchors
}) => {
  const data = effect.data as SubtitleEffectData
  const recording = getRecording(data.recordingId)

  // HOOKS MOVED UP
  const transcript = recording?.metadata?.transcript

  // Optimization: Filter once per hiddenRegions change.
  const visibleWords = useMemo(() => {
    const hiddenRegions = hiddenRegionsMap.get(data.recordingId) ?? []
    if (!transcript || hiddenRegions.length === 0) return transcript?.words ?? []

    const isSourceTimeInHiddenRegion = (time: number, regions: SourceTimeRange[]) => {
      for (const region of regions) {
        if (time >= region.startTime && time < region.endTime) return true
      }
      return false
    }

    return transcript.words.filter(word =>
      !isSourceTimeInHiddenRegion(word.startTime, hiddenRegions) ||
      !isSourceTimeInHiddenRegion(word.endTime - 1, hiddenRegions)
    )
  }, [transcript, hiddenRegionsMap, data.recordingId])

  const scaledOffsets = useMemo(() => ({
    offsetX: typeof data.offsetX === 'number' ? data.offsetX * overlayScale : data.offsetX,
    offsetY: typeof data.offsetY === 'number' ? data.offsetY * overlayScale : data.offsetY,
  }), [data.offsetX, data.offsetY, overlayScale])

  const resolvedAnchor = resolvedAnchors.get(effect.id) ?? data.anchor ?? OverlayAnchor.BottomCenter
  const anchorStyle = useMemo(() => {
    return getOverlayAnchorStyle(resolvedAnchor, scaledOffsets, 20 * overlayScale)
  }, [resolvedAnchor, scaledOffsets, overlayScale])

  // Fast exit if data missing
  if (!recording?.metadata?.transcript?.words.length) return null

  // 4. Resolve Active Clip (Fast Lookup)
  const candidates = clipsByRecordingId.get(data.recordingId) ?? []
  // Intentionally simple find. For very complex timelines, we could use binary search,
  // but N is usually small (<100 clips per recording).
  const activeClip = candidates.find(clip => {
    const start = clip.startTime
    const end = start + clip.duration
    return currentTimeMs >= start && currentTimeMs < end
  })

  if (!activeClip) return null

  // 6. Source Time Calculation
  const sourceTimeMs = timelineToSource(currentTimeMs, activeClip)

  const currentIndex = findWordIndex(visibleWords, sourceTimeMs)
  if (currentIndex === -1) return null

  // 8. Render Logic (Lightweight)
  const wordsPerLine = data.wordsPerLine ?? 8
  const transitionMs = data.transitionMs ?? 140
  const highlightStyle = data.highlightStyle ?? 'color'
  const { start, end } = getWordWindow(
    visibleWords,
    currentIndex,
    wordsPerLine
  )
  const windowWords = visibleWords.slice(start, end)

  // Subtitles span the full composition - they are UI overlays, not video content
  const maxWidthPercent = data.maxWidth ?? 80
  const maxWidthPx = Math.round((maxWidthPercent / 100) * width)

  const textColor = data.textColor ?? '#ffffff'
  const highlightColor = data.highlightColor ?? '#FFD166'
  const baseFontSize = data.fontSize ?? 32
  const baseLineHeight = data.lineHeight ?? Math.round(baseFontSize * 1.4)
  const fontSizePx = baseFontSize * overlayScale
  const lineHeightPx = baseLineHeight * overlayScale
  const padding = (data.padding ?? 4) * overlayScale
  const borderRadius = (data.borderRadius ?? 12) * overlayScale
  const highlightPadding = Math.max(1, Math.round(4 * overlayScale))
  const highlightRadius = Math.max(1, Math.round(6 * overlayScale))

  return (
    <div
      style={{
        position: 'absolute',
        left: overlayBounds.left,
        top: overlayBounds.top,
        width: overlayBounds.width,
        height: overlayBounds.height,
        pointerEvents: 'none',
      }}
    >
      <div
        data-subtitle-layer="true"
        data-effect-id={effect.id}
        style={{
          position: 'absolute',
          maxWidth: maxWidthPx,
          lineHeight: `${lineHeightPx}px`,
          fontSize: `${fontSizePx}px`,
          fontFamily: data.fontFamily ?? 'SF Pro Display, system-ui, -apple-system, sans-serif',
          color: textColor,
          textAlign: 'center',
          padding: `${padding}px ${padding * 2}px`,
          borderRadius: borderRadius,
          backgroundColor: data.backgroundColor
            ? applyOpacity(data.backgroundColor, data.backgroundOpacity)
            : 'transparent',
          ...anchorStyle
        }}
      >
        {windowWords.map((word) => {
          const weight = getHighlightWeight(sourceTimeMs, word, transitionMs)
          const style: React.CSSProperties = {
            color: highlightStyle === 'background'
              ? textColor
              : mixColors(textColor, highlightColor, weight),
          }
          if (highlightStyle === 'underline') {
            if (weight > 0) {
              style.textDecorationLine = 'underline'
              style.textDecorationColor = scaleAlpha(highlightColor, weight)
              style.textDecorationThickness = Math.max(1, Math.round(2 * overlayScale))
              style.textUnderlineOffset = Math.max(1, Math.round(3 * overlayScale))
            }
          }
          if (highlightStyle === 'background') {
            if (weight > 0) {
              style.display = 'inline-block'
              style.backgroundColor = scaleAlpha(highlightColor, weight)
              style.color = mixColors(textColor, '#000000', weight)
              const padX = Math.round(highlightPadding * weight)
              style.padding = `0 ${padX}px`
              style.borderRadius = Math.max(1, Math.round(highlightRadius * weight))
            }
          }
          if (highlightStyle === 'scale') {
            if (weight > 0) {
              style.display = 'inline-block'
              style.transform = `scale(${1 + 0.08 * weight})`
              style.transformOrigin = 'center bottom'
            }
          }
          return (
            <span key={word.id} style={style}>
              {word.text}{' '}
            </span>
          )
        })}
      </div>
    </div>
  )
})

SubtitleEffectRenderer.displayName = 'SubtitleEffectRenderer'
