/**
 * Keystroke Sync Service
 *
 * Handles synchronization of keystroke effects with clip layout.
 * Clusters keyboard events in SOURCE SPACE, then projects to TIMELINE SPACE.
 *
 * Managed effects:
 * - New IDs: `keystroke|<recordingId>|<clipId>|<clusterIndex>`
 * - Legacy IDs: `keystroke-<recordingId>-<clusterIndex>`
 * - Old-style global effect (0..MAX_SAFE_INTEGER)
 */
import type { Effect, Project, KeystrokeEffectData, RecordingMetadata } from '@/types/project'
import { EffectType } from '@/types/project'
import { sourceToTimeline, getSourceDuration } from '@/lib/timeline/time-space-converter'
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects'
import { EffectStore } from '@/lib/core/effects'

// Configuration
const MAX_GAP_MS = 2000 // Max gap between keys to be in same cluster
const PADDING_MS = 500  // Add padding before/after cluster
const MIN_DURATION_MS = 100
const MERGE_TOLERANCE_MS = 1

/**
 * Create a keystroke effect with default data
 */
export function createKeystrokeEffect(options: {
  id: string
  startTime: number
  endTime: number
  enabled?: boolean
  data?: KeystrokeEffectData
}): Effect {
  return {
    id: options.id,
    type: EffectType.Keystroke,
    startTime: options.startTime,
    endTime: options.endTime,
    data: {
      ...DEFAULT_KEYSTROKE_DATA,
      ...(options.data ?? {})
    } as KeystrokeEffectData,
    enabled: options.enabled ?? true
  }
}

/**
 * Check if an effect is an old-style global keystroke effect
 */
function isOldStyleGlobalEffect(e: Effect): boolean {
  return e.type === EffectType.Keystroke &&
    e.startTime === 0 &&
    e.endTime >= Number.MAX_SAFE_INTEGER - 1
}

/**
 * Check if an effect is a managed (auto-generated) keystroke effect
 */
function isManagedKeystrokeEffect(e: Effect): boolean {
  if (isOldStyleGlobalEffect(e)) return true
  return typeof e.id === 'string' && (e.id.startsWith('keystroke|') || e.id.startsWith('keystroke-'))
}

/**
 * Cluster keyboard events by timestamp gaps
 */
function clusterKeyboardEvents(
  events: Array<{ timestamp: number }>
): Array<{ startTime: number; endTime: number }> {
  if (!events.length) return []

  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp)
  const clusters: Array<{ startTime: number; endTime: number }> = []
  let currentCluster: { startTime: number; endTime: number } | null = null

  for (const event of sortedEvents) {
    if (!currentCluster) {
      currentCluster = { startTime: event.timestamp, endTime: event.timestamp }
      continue
    }

    if (event.timestamp - currentCluster.endTime <= MAX_GAP_MS) {
      currentCluster.endTime = event.timestamp
      continue
    }

    clusters.push(currentCluster)
    currentCluster = { startTime: event.timestamp, endTime: event.timestamp }
  }

  if (currentCluster) clusters.push(currentCluster)
  return clusters
}

/**
 * Merge overlapping/adjacent timeline ranges
 */
function mergeTimelineRanges(
  ranges: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return []

  ranges.sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = []

  for (const range of ranges) {
    if (merged.length === 0) {
      merged.push({ ...range })
      continue
    }

    const last = merged[merged.length - 1]
    if (range.start <= last.end + MERGE_TOLERANCE_MS) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }

  return merged
}

/**
 * Rebuild "managed" keystroke effects so they always match the current clip layout.
 *
 * - Clusters keyboard events in SOURCE SPACE (recording timestamps)
 * - Projects each cluster into TIMELINE SPACE for every clip that uses that recording
 * - Preserves per-block `enabled` state + keystroke settings where possible
 */
export function syncKeystrokeEffects(
  project: Project,
  metadataByRecordingId?: Map<string, RecordingMetadata>
): void {
  // Ensure effects array exists using EffectStore
  EffectStore.ensureArray(project)

  const allClips = project.timeline.tracks.flatMap(t => t.clips)
  const existingKeystrokes = EffectStore.getAll(project).filter(e => e.type === EffectType.Keystroke)

  // Check if metadata is available
  const hasAnyLoadedMetadata = Boolean(metadataByRecordingId && metadataByRecordingId.size > 0) ||
    (project.recordings || []).some(r => r.metadata && Object.prototype.hasOwnProperty.call(r.metadata, 'keyboardEvents'))

  // If metadata isn't loaded yet, keep existing managed keystrokes to avoid resetting user settings.
  if (!hasAnyLoadedMetadata && existingKeystrokes.length > 0) {
    return
  }

  // Get template data from existing effects for style preservation
  const templateData: KeystrokeEffectData | undefined =
    (existingKeystrokes.find(e => e.data) as Effect | undefined)?.data as KeystrokeEffectData | undefined

  // Preserve state from existing managed effects so toggles/settings survive rebuilds.
  const stateById = new Map<string, { enabled: boolean; data?: KeystrokeEffectData }>()
  const legacyStateByRecordingCluster = new Map<string, { enabled: boolean; data?: KeystrokeEffectData }>()

  for (const e of existingKeystrokes) {
    if (!isManagedKeystrokeEffect(e)) continue

    stateById.set(e.id, { enabled: e.enabled, data: e.data as KeystrokeEffectData })

    // Legacy format: keystroke-<recordingId>-<clusterIndex>
    const legacyMatch = /^keystroke-(.+)-(\d+)$/.exec(e.id)
    if (legacyMatch) {
      const recordingId = legacyMatch[1]
      const clusterIndex = Number(legacyMatch[2])
      if (Number.isFinite(clusterIndex)) {
        legacyStateByRecordingCluster.set(`${recordingId}::${clusterIndex}`, {
          enabled: e.enabled,
          data: e.data as KeystrokeEffectData
        })
      }
    }
  }

  // Preserve user-created keystroke effects
  const preservedUserKeystrokes = existingKeystrokes.filter(e => !isManagedKeystrokeEffect(e))

  // Remove managed keystroke effects (including old-style global one).
  // Safe to use ! because ensureArray was called at the start
  project.timeline.effects = [
    ...project.timeline.effects!.filter(e => e.type !== EffectType.Keystroke),
    ...preservedUserKeystrokes
  ]

  // Map: `${recordingId}::${clusterIndex}` -> array of timeline ranges
  const clusterTimelineRanges = new Map<string, Array<{ start: number; end: number }>>()

  // Process each recording
  for (const recording of project.recordings || []) {
    const metadata = metadataByRecordingId?.get(recording.id) ?? recording.metadata
    const events = metadata?.keyboardEvents
    if (!events?.length) continue

    const clipsForRecording = allClips.filter(c => c.recordingId === recording.id)
    if (clipsForRecording.length === 0) continue

    const clusters = clusterKeyboardEvents(events)

    // Collect timeline ranges for each cluster from all clips
    for (const clip of clipsForRecording) {
      const clipStart = clip.startTime
      const clipEnd = clip.startTime + clip.duration
      const clipSourceIn = clip.sourceIn ?? 0
      const clipSourceOut = clip.sourceOut ?? (clipSourceIn + getSourceDuration(clip))

      clusters.forEach((cluster, clusterIndex) => {
        const paddedSourceStart = cluster.startTime - PADDING_MS
        const paddedSourceEnd = cluster.endTime + PADDING_MS

        // Skip if cluster doesn't intersect this clip's SOURCE range.
        if (paddedSourceEnd <= clipSourceIn || paddedSourceStart >= clipSourceOut) return

        // Map source → timeline using the canonical converter
        const timelineStart = sourceToTimeline(paddedSourceStart, clip)
        const timelineEnd = sourceToTimeline(paddedSourceEnd, clip)

        // Clamp to this clip's timeline bounds.
        const effectStart = Math.max(clipStart, Math.min(clipEnd, timelineStart))
        const effectEnd = Math.max(effectStart, Math.min(clipEnd, timelineEnd))
        if (effectEnd - effectStart < MIN_DURATION_MS) return

        const key = `${recording.id}::${clusterIndex}`
        if (!clusterTimelineRanges.has(key)) {
          clusterTimelineRanges.set(key, [])
        }
        clusterTimelineRanges.get(key)!.push({ start: effectStart, end: effectEnd })
      })
    }

    // Create merged keystroke effects for each cluster
    clusters.forEach((_, clusterIndex) => {
      const key = `${recording.id}::${clusterIndex}`
      const ranges = clusterTimelineRanges.get(key)
      if (!ranges || ranges.length === 0) return

      const mergedRanges = mergeTimelineRanges(ranges)

      // Create one keystroke effect per merged range
      for (let rangeIndex = 0; rangeIndex < mergedRanges.length; rangeIndex++) {
        const merged = mergedRanges[rangeIndex]

        // Use a stable ID based on recording + cluster + range index
        const id = `keystroke|${recording.id}|${clusterIndex}|${rangeIndex}`
        const saved = stateById.get(id) ??
          legacyStateByRecordingCluster.get(key) ??
          null

        project.timeline.effects!.push(createKeystrokeEffect({
          id,
          startTime: merged.start,
          endTime: merged.end,
          enabled: saved?.enabled ?? true,
          data: (saved?.data ?? templateData) as KeystrokeEffectData | undefined
        }))
      }
    })
  }
}
