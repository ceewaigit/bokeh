import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { Effect, Clip, Recording } from '@/types/project'
import type { SubtitleEffectData, TranscriptWord } from '@/types/project'
import type { OverlayAnchor } from '@/types/overlays'
import { EffectType } from '@/types/project'
import { useTimelineContext } from '@/features/rendering/renderer/context/TimelineContext'
import { useOverlayContext } from '@/features/rendering/overlays/overlay-context'
import { getOverlayAnchorStyle } from '@/features/rendering/overlays/anchor-utils'
import { useProjectStore } from '@/features/core/stores/project-store'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import type { SourceTimeRange } from '@/types/project'
import { timelineToSource } from '@/features/ui/timeline/time/time-space-converter'

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
    highlightIndex: currentIndex - start
  }
}

export function SubtitleLayer() {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
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
  getRecording: (id: string) => Recording | undefined
  hiddenRegionsMap: Map<string, SourceTimeRange[]>
  clipsByRecordingId: Map<string, Clip[]>
  resolvedAnchors: Map<string, OverlayAnchor>
}>(({
  effect,
  currentTimeMs,
  width,
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
  const lineHeight = data.lineHeight ?? Math.round((data.fontSize ?? 32) * 1.4)
  const transitionMs = data.transitionMs ?? 140
  const highlightStyle = data.highlightStyle ?? 'color'
  const { start, end, highlightIndex } = getWordWindow(
    visibleWords,
    currentIndex,
    wordsPerLine
  )
  const windowWords = visibleWords.slice(start, end)

  const anchor = resolvedAnchors.get(effect.id) ?? data.anchor
  const anchorStyle = getOverlayAnchorStyle(anchor, data, 36)
  const maxWidthPercent = data.maxWidth ?? 80
  const maxWidthPx = Math.round((maxWidthPercent / 100) * width)

  const textColor = data.textColor ?? '#ffffff'
  const highlightColor = data.highlightColor ?? '#FFD166'
  const padding = data.padding ?? 4
  const borderRadius = data.borderRadius ?? 12

  return (
    <div
      data-subtitle-layer="true"
      data-effect-id={effect.id}
      style={{
        position: 'absolute',
        maxWidth: maxWidthPx,
        lineHeight: `${lineHeight}px`,
        fontSize: `${data.fontSize ?? 32}px`,
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
      {windowWords.map((word, index) => {
        const isActive = index === highlightIndex
        const style: React.CSSProperties = {
          color: isActive ? highlightColor : textColor,
          transition: `color ${transitionMs}ms, transform ${transitionMs}ms`
        }
        if (isActive && highlightStyle === 'underline') {
          style.textDecoration = 'underline'
        }
        if (isActive && highlightStyle === 'background') {
          style.backgroundColor = highlightColor
          style.color = '#000000'
          style.padding = '0 4px'
          style.borderRadius = 6
        }
        if (isActive && highlightStyle === 'scale') {
          style.display = 'inline-block'
          style.transform = 'scale(1.08)'
        }
        return (
          <span key={word.id} style={style}>
            {word.text}{' '}
          </span>
        )
      })}
    </div>
  )
})

SubtitleEffectRenderer.displayName = 'SubtitleEffectRenderer'
