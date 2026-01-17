import { useMemo } from 'react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { resolveOverlayConflicts } from '@/features/rendering/overlays/position-registry'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { EffectType } from '@/types/project'
import { useShallow } from 'zustand/react/shallow'
import type { Clip, Effect, Recording, SourceTimeRange, SubtitleEffectData, TranscriptWord } from '@/types/project'
import { timelineToSource } from '@/features/ui/timeline/time/time-space-converter'
import { findSubtitleWordIndex, getVisibleSubtitleWords } from '@/features/rendering/overlays/subtitle-words'
import { orderWebcamClipsForSelection, selectActiveWebcamClipAtTime } from '@/features/media/webcam/utils/active-webcam-clip'

export function useOverlayState() {
  const { project, currentTime } = useProjectStore(useShallow((s) => ({
    project: s.currentProject,
    currentTime: s.currentTime
  })))

  const subtitleResolutionContext = useMemo(() => {
    if (!project) return null

    const effects = project.timeline.effects ?? []
    const subtitleEffects = effects.filter((effect): effect is Effect => effect.type === EffectType.Subtitle && effect.enabled !== false)
    const recordingIds = Array.from(new Set(
      subtitleEffects
        .map(e => (e.data as SubtitleEffectData | undefined)?.recordingId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ))

    const clipsByRecordingId = new Map<string, Clip[]>()
    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        const list = clipsByRecordingId.get(clip.recordingId) ?? []
        list.push(clip)
        clipsByRecordingId.set(clip.recordingId, list)
      }
    }

    const hiddenRegionsByRecordingId = new Map<string, SourceTimeRange[]>()
    const visibleWordsByRecordingId = new Map<string, TranscriptWord[]>()

    for (const recordingId of recordingIds) {
      const hiddenRegions = TimelineDataService.getHiddenRegionsForRecording(project, recordingId)
      hiddenRegionsByRecordingId.set(recordingId, hiddenRegions)

      const recording = project.recordings.find(r => r.id === recordingId) as Recording | undefined
      const words = recording?.metadata?.transcript?.words ?? []
      visibleWordsByRecordingId.set(recordingId, getVisibleSubtitleWords(words, hiddenRegions))
    }

    return {
      clipsByRecordingId,
      visibleWordsByRecordingId
    }
  }, [project])

  return useMemo(() => {
    if (!project) return { displacedEffectIds: new Set<string>(), resolvedAnchors: new Map() }

    const effects = project.timeline.effects ?? []

    // Check for active transcript
    const hasActiveTranscript = effects.some(effect => {
      if (effect.type !== EffectType.Subtitle) return false
      const data = effect.data as { recordingId?: string } | undefined
      if (!data?.recordingId) return false
      const recording = project.recordings.find(r => r.id === data.recordingId)
      return Boolean(recording?.metadata?.transcript?.words?.length)
    })

    // Get active webcam clip
    const webcamClips = TimelineDataService.getWebcamClips(project)
    const orderedWebcamClips = orderWebcamClipsForSelection(webcamClips)
    const activeWebcamClip = selectActiveWebcamClipAtTime(orderedWebcamClips, currentTime)

    const isSubtitleVisibleAtTime = subtitleResolutionContext
      ? (effect: Effect, timeMs: number) => {
        if (effect.type !== EffectType.Subtitle) return true
        const data = effect.data as SubtitleEffectData | undefined
        const recordingId = data?.recordingId
        if (!recordingId) return false

        const candidates = subtitleResolutionContext.clipsByRecordingId.get(recordingId) ?? []
        const activeClip = candidates.find(clip => {
          const start = clip.startTime
          const end = start + clip.duration
          return timeMs >= start && timeMs < end
        })
        if (!activeClip) return false

        const visibleWords = subtitleResolutionContext.visibleWordsByRecordingId.get(recordingId) ?? []
        if (visibleWords.length === 0) return false

        const sourceTimeMs = timelineToSource(timeMs, activeClip)
        return findSubtitleWordIndex(visibleWords, sourceTimeMs) !== -1
      }
      : undefined

    return resolveOverlayConflicts(effects, currentTime, {
      hasActiveTranscript,
      activeWebcamClip,
      isSubtitleVisibleAtTime
    })
  }, [project, currentTime, subtitleResolutionContext])
}
