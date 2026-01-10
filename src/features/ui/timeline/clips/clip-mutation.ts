import type { Project, Track } from '@/types/project'
import { calculateTimelineDuration, reflowClips } from './clip-reflow'

/**
 * Wrapper for clip mutations that handles reflow and timeline duration updates.
 * Effect sync is now handled by individual commands via EffectSyncService.
 */
export function withMutation<T>(
  project: Project,
  mutation: () => T,
  track?: Track
): T {
  const result = mutation()
  if (track) reflowClips(track)
  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  return result
}

