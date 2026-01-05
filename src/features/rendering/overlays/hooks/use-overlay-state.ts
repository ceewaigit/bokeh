import { useMemo } from 'react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { resolveOverlayConflicts } from '@/features/rendering/overlays/position-registry'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { EffectType } from '@/types/project'
import { useShallow } from 'zustand/react/shallow'

export function useOverlayState() {
  const { project, currentTime } = useProjectStore(useShallow((s) => ({
    project: s.currentProject,
    currentTime: s.currentTime
  })))

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
    const activeWebcamClip = webcamClips.find(clip => {
      const clipStart = clip.startTime
      const clipEnd = clip.startTime + clip.duration
      return currentTime >= clipStart && currentTime < clipEnd
    }) ?? null

    return resolveOverlayConflicts(effects, currentTime, {
      hasActiveTranscript,
      activeWebcamClip
    })
  }, [project, currentTime])
}
