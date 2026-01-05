import type { Project, Track } from '@/types/project'
import { calculateTimelineDuration, reflowClips, syncCropEffectTimes } from './clip-reflow'

export function withMutation<T>(
  project: Project,
  mutation: () => T,
  track?: Track
): T {
  const result = mutation()
  if (track) reflowClips(track)
  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  syncCropEffectTimes(project)
  return result
}
