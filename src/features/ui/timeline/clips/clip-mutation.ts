import type { Project, Track } from '@/types/project'
import { calculateTimelineDuration, reflowClips } from './clip-reflow'
import { markModified } from '@/features/core/stores/store-utils'

/**
 * Wrapper for clip mutations that handles reflow and timeline duration updates.
 * Timeline sync is now handled by individual commands via TimelineSyncService.
 */
export function withMutation<T>(
  project: Project,
  mutation: () => T,
  track?: Track
): T {
  const result = mutation()
  if (track) reflowClips(track)
  project.timeline.duration = calculateTimelineDuration(project)
  markModified(project)
  return result
}

