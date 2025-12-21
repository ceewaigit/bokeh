import type { Project, Track, Clip, Effect, Recording } from '@/types/project'
import { TrackType, EffectType } from '@/types/project'
import { TimeConverter } from '@/lib/timeline/time-space-converter'

// Calculate total timeline duration
export function calculateTimelineDuration(project: Project): number {
  let maxEndTime = 0
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      maxEndTime = Math.max(maxEndTime, clip.startTime + clip.duration)
    }
  }
  return maxEndTime
}

// Find clip by ID across all tracks
export function findClipById(project: Project, clipId: string): { clip: Clip; track: Track } | null {
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find(c => c.id === clipId)
    if (clip) return { clip, track }
  }
  return null
}

// ARCHITECTURE NOTE: Effects are stored in source space on Recording objects
// When clips move/split on the timeline, effects do NOT need to be shifted or split
// because they remain anchored to the source recording timestamps

/**
 * Sort clips by their current startTime.
 * Use this before reflowClips when the clip order might have changed
 * (e.g., after paste, duplicate, or add operations).
 */
export function sortClipsByTime(track: Track): void {
  track.clips.sort((a, b) => a.startTime - b.startTime)
}

/**
 * Reflow clips to maintain contiguous layout.
 *
 * DESIGN PRINCIPLE: Array order IS the ONLY source of truth.
 * This function computes startTime values from array indices.
 * - Clip at index 0 starts at time 0
 * - Each subsequent clip starts where the previous one ends
 * - This function NEVER sorts - it preserves array order
 *
 * @param track - The track containing clips to reflow
 * @param startFromIndex - Start reflowing from this index (optimization)
 */
export function reflowClips(
  track: Track,
  startFromIndex: number = 0
): void {
  if (track.clips.length === 0) return

  // Validate and fix any duration inconsistencies
  // This ensures clip.duration matches the formula: (sourceOut - sourceIn) / playbackRate
  // IMPORTANT: Create NEW clip objects when fixing to break stale references
  const DEBUG_REFLOW = process.env.NEXT_PUBLIC_ENABLE_TYPING_DEBUG === '1'

  for (let i = 0; i < track.clips.length; i++) {
    const clip = track.clips[i]
    const expectedDuration = TimeConverter.computeEffectiveDuration(clip)

    // Allow 1ms tolerance for rounding
    if (Math.abs(clip.duration - expectedDuration) > 1) {
      if (DEBUG_REFLOW) {
        console.warn('[Reflow] Fixing inconsistent duration', {
          clipId: clip.id,
          storedDuration: clip.duration,
          expectedDuration,
          sourceIn: clip.sourceIn,
          sourceOut: clip.sourceOut,
          playbackRate: clip.playbackRate
        })
      }
      // Create NEW clip object to ensure React/Zustand detects the change
      track.clips[i] = { ...clip, duration: expectedDuration }
    }
  }

  // NO SORTING - array order IS the source of truth
  // startTime is purely derived from array position

  // First clip always starts at 0
  // IMPORTANT: Create NEW clip object to break stale references in memoized contexts
  if (startFromIndex === 0 && track.clips.length > 0) {
    if (track.clips[0].startTime !== 0) {
      track.clips[0] = { ...track.clips[0], startTime: 0 }
    }
  }

  // Chain clips contiguously: each clip starts where previous ends
  // IMPORTANT: Create NEW clip objects to ensure React/Zustand detects changes
  for (let i = Math.max(1, startFromIndex); i < track.clips.length; i++) {
    const prevClip = track.clips[i - 1]
    const newStart = prevClip.startTime + prevClip.duration

    if (track.clips[i].startTime !== newStart) {
      track.clips[i] = { ...track.clips[i], startTime: newStart }
    }
  }
}

// Split clip at relative time point
export function splitClipAtTime(
  clip: Clip,
  relativeSplitTime: number
): { firstClip: Clip; secondClip: Clip } | null {
  if (relativeSplitTime <= 0 || relativeSplitTime >= clip.duration) {
    return null
  }

  const playbackRate = clip.playbackRate || 1

  // Import the proper conversion function
  const { clipRelativeToSource } = require('../timeline/time-space-converter')

  // Convert clip-relative split time to source space
  const sourceSplitAbsolute = clipRelativeToSource(relativeSplitTime, clip)
  const sourceSplitPoint = sourceSplitAbsolute - clip.sourceIn

  const firstClip: Clip = {
    id: crypto.randomUUID(),
    recordingId: clip.recordingId,
    startTime: clip.startTime,
    duration: relativeSplitTime,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceIn + sourceSplitPoint,
    playbackRate: clip.playbackRate,
    // Keep intro fade on first clip, remove outro (clean cut at split point)
    introFadeMs: clip.introFadeMs,
    // outroFadeMs intentionally not set - clean cut at split
  }

  // Copy speed-up flags if they exist
  if (clip.typingSpeedApplied) {
    firstClip.typingSpeedApplied = true
  }
  if (clip.idleSpeedApplied) {
    firstClip.idleSpeedApplied = true
  }

  // Only handle timeRemapPeriods if they exist (for backward compatibility)
  if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
    const splitSourceTime = clip.sourceIn + sourceSplitPoint
    const firstPeriods = clip.timeRemapPeriods
      .filter(p => p.sourceStartTime < splitSourceTime)
      .map(p => ({
        ...p,
        sourceEndTime: Math.min(p.sourceEndTime, splitSourceTime)
      }))
    if (firstPeriods.length > 0) {
      firstClip.timeRemapPeriods = firstPeriods
    }
  }

  const secondClip: Clip = {
    id: crypto.randomUUID(),
    recordingId: clip.recordingId,
    startTime: clip.startTime + relativeSplitTime,
    duration: clip.duration - relativeSplitTime,
    sourceIn: clip.sourceIn + sourceSplitPoint,
    sourceOut: clip.sourceOut,
    playbackRate: clip.playbackRate,
    // Remove intro fade from second clip (clean cut at split), keep outro
    // introFadeMs intentionally not set - clean cut at split
    outroFadeMs: clip.outroFadeMs,
  }

  // Copy speed-up flags if they exist
  if (clip.typingSpeedApplied) {
    secondClip.typingSpeedApplied = true
  }
  if (clip.idleSpeedApplied) {
    secondClip.idleSpeedApplied = true
  }

  // Only handle timeRemapPeriods if they exist (for backward compatibility)
  if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
    const splitSourceTime = clip.sourceIn + sourceSplitPoint
    const secondPeriods = clip.timeRemapPeriods
      .filter(p => p.sourceEndTime > splitSourceTime)
      .map(p => ({
        ...p,
        sourceStartTime: Math.max(p.sourceStartTime, splitSourceTime)
      }))
    if (secondPeriods.length > 0) {
      secondClip.timeRemapPeriods = secondPeriods
    }
  }

  return { firstClip, secondClip }
}

// Execute split clip operation
export function executeSplitClip(
  project: Project,
  clipId: string,
  splitTime: number  // This is in timeline space
): { firstClip: Clip; secondClip: Clip } | null {
  const result = findClipById(project, clipId)
  if (!result) return null

  const { clip, track } = result

  // Convert timeline position to clip-relative time
  const clipRelativeTime = splitTime - clip.startTime

  const splitResult = splitClipAtTime(clip, clipRelativeTime)
  if (!splitResult) return null

  const clipIndex = track.clips.findIndex(c => c.id === clipId)
  track.clips.splice(clipIndex, 1, splitResult.firstClip, splitResult.secondClip)

  // Note: Effects are now stored on Recording in source space
  // Both split clips share the same recording's effects, no splitting needed

  project.modifiedAt = new Date().toISOString()
  return {
    firstClip: splitResult.firstClip,
    secondClip: splitResult.secondClip
  }
}

// Trim clip from start
export function trimClipStart(
  clip: Clip,
  newStartTime: number
): Partial<Clip> | null {
  if (newStartTime >= clip.startTime + clip.duration || newStartTime < 0) {
    return null
  }

  const trimAmount = newStartTime - clip.startTime

  // Sticky fade behavior: Fade stays with the clip edge
  // Only reduce fade if it's longer than the new clip duration
  const newDuration = clip.duration - trimAmount
  let newIntroFadeMs: number | undefined = clip.introFadeMs

  if (clip.introFadeMs) {
    // If fade is longer than the entire new clip, cap it at the new duration
    newIntroFadeMs = Math.min(clip.introFadeMs, newDuration)
  }

  // Convert timeline trim amount to source space (respects playbackRate + time remaps)
  const newSourceIn = TimeConverter.clipRelativeToSource(trimAmount, clip)
  return {
    startTime: newStartTime,
    duration: newDuration,
    sourceIn: newSourceIn,
    introFadeMs: newIntroFadeMs,
  }
}

// Execute trim clip from start
export function executeTrimClipStart(
  project: Project,
  clipId: string,
  newStartTime: number
): boolean {
  const result = findClipById(project, clipId)
  if (!result) return false

  const { clip, track } = result
  const trimResult = trimClipStart(clip, newStartTime)
  if (!trimResult) return false

  Object.assign(clip, trimResult)
  reflowClips(track, 0)
  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  return true
}

// Trim clip from end
export function trimClipEnd(
  clip: Clip,
  newEndTime: number
): Partial<Clip> | null {
  if (newEndTime <= clip.startTime || newEndTime < 0) {
    return null
  }

  const newDuration = newEndTime - clip.startTime

  // Sticky fade behavior: Fade stays with the clip edge
  // Only reduce fade if it's longer than the new clip duration
  let newOutroFadeMs: number | undefined = clip.outroFadeMs

  if (clip.outroFadeMs) {
    // If fade is longer than the entire new clip, cap it at the new duration
    newOutroFadeMs = Math.min(clip.outroFadeMs, newDuration)
  }

  // Convert new timeline duration to source space (respects playbackRate + time remaps)
  const newSourceOut = TimeConverter.clipRelativeToSource(newDuration, clip)
  return {
    duration: newDuration,
    sourceOut: newSourceOut,
    outroFadeMs: newOutroFadeMs,
  }
}

// Execute trim clip from end
export function executeTrimClipEnd(
  project: Project,
  clipId: string,
  newEndTime: number
): boolean {
  const result = findClipById(project, clipId)
  if (!result) return false

  const { clip, track } = result
  const trimResult = trimClipEnd(clip, newEndTime)
  if (!trimResult) return false

  Object.assign(clip, trimResult)
  // Maintain contiguous timeline layout after shortening the clip.
  // Without this, gaps can form and later reorder/playback may desync.
  reflowClips(track, 0)
  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  return true
}

// Check for clip overlaps (internal use only)
function wouldCauseOverlap(
  clips: Clip[],
  clipId: string,
  newStartTime: number,
  duration: number
): boolean {
  return clips.some(otherClip => {
    if (otherClip.id === clipId) return false
    const otherEnd = otherClip.startTime + otherClip.duration
    const newEnd = newStartTime + duration
    return newStartTime < otherEnd && newEnd > otherClip.startTime
  })
}

// Update clip with overlap handling
export function updateClipInTrack(
  project: Project,
  clipId: string,
  updates: Partial<Clip>,
  options?: { exact?: boolean; maintainContiguous?: boolean },
  knownTrack?: Track
): boolean {
  let clip: Clip;
  let track: Track;

  if (knownTrack) {
    const foundClip = knownTrack.clips.find(c => c.id === clipId);
    if (!foundClip) return false;
    clip = foundClip;
    track = knownTrack;
  } else {
    const result = findClipById(project, clipId);
    if (!result) return false;
    clip = result.clip;
    track = result.track;
  }

  const prevStartTime = clip.startTime
  const prevDuration = clip.duration

  // Apply updates to the clip
  Object.assign(clip, updates)

  // Always reflow clips to maintain contiguous layout unless explicitly disabled
  if (options?.maintainContiguous !== false) {
    reflowClips(track, 0)
  }

  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  return true
}

// Add clip to track
export function addClipToTrack(
  project: Project,
  clipOrRecordingId: Clip | string,
  startTime?: number
): Clip | null {
  let clip: Clip

  if (typeof clipOrRecordingId === 'object') {
    clip = clipOrRecordingId
  } else {
    const recording = project.recordings.find(r => r.id === clipOrRecordingId)
    if (!recording) return null

    clip = {
      id: `clip-${Date.now()}`,
      recordingId: clipOrRecordingId,
      startTime: startTime ?? 0,
      duration: recording.duration,
      sourceIn: 0,
      sourceOut: recording.duration
    }
  }

  const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
  if (!videoTrack) return null

  if (startTime === undefined) {
    if (videoTrack.clips.length > 0) {
      const sortedClips = [...videoTrack.clips].sort((a, b) => a.startTime - b.startTime)
      const lastClip = sortedClips[sortedClips.length - 1]
      clip.startTime = lastClip.startTime + lastClip.duration
    } else {
      clip.startTime = 0
    }
  }

  videoTrack.clips.push(clip)
  reflowClips(videoTrack, 0)

  project.timeline.duration = Math.max(
    project.timeline.duration,
    clip.startTime + clip.duration
  )
  project.modifiedAt = new Date().toISOString()
  return clip
}

// Remove clip from track
export function removeClipFromTrack(
  project: Project,
  clipId: string,
  knownTrack?: Track
): boolean {
  if (knownTrack) {
    const index = knownTrack.clips.findIndex(c => c.id === clipId)
    if (index !== -1) {
      knownTrack.clips.splice(index, 1)
      reflowClips(knownTrack, 0)
      project.timeline.duration = calculateTimelineDuration(project)
      project.modifiedAt = new Date().toISOString()
      return true
    }
    return false;
  }

  for (const track of project.timeline.tracks) {
    const index = track.clips.findIndex(c => c.id === clipId)
    if (index !== -1) {
      track.clips.splice(index, 1)
      reflowClips(track, 0)
      project.timeline.duration = calculateTimelineDuration(project)
      project.modifiedAt = new Date().toISOString()
      return true
    }
  }
  return false
}

// Duplicate clip
export function duplicateClipInTrack(
  project: Project,
  clipId: string
): Clip | null {
  const result = findClipById(project, clipId)
  if (!result) return null

  const { clip, track } = result
  const sourceIndex = track.clips.findIndex(c => c.id === clipId)
  if (sourceIndex === -1) return null

  const newClip: Clip = {
    ...clip,
    id: `${clip.id}-copy-${Date.now()}`,
    // Reflow will compute final startTimes based on array order.
    startTime: clip.startTime + clip.duration
  }

  // Insert directly after the source clip (array order is the source of truth).
  track.clips.splice(sourceIndex + 1, 0, newClip)

  // Reflow from the insertion point to keep clips contiguous and visible.
  reflowClips(track, sourceIndex + 1)

  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  return newClip
}

// Restore clip to track
export function restoreClipToTrack(
  project: Project,
  trackId: string,
  clip: Clip,
  index: number
): boolean {
  // Idempotency guard: undo should not be able to "double restore" the same clip
  // even if commands are triggered twice or history gets desynced.
  if (findClipById(project, clip.id)) return true

  const track = project.timeline.tracks.find(t => t.id === trackId)
  if (!track) return false

  const insertIndex = Math.max(0, Math.min(index, track.clips.length))
  track.clips.splice(insertIndex, 0, clip)

  // Restoring a clip changes array order; reflow to maintain contiguous layout.
  reflowClips(track, insertIndex)

  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  return true
}

/**
 * Atomic undo for speed-up - restores clips without intermediate reflows
 * This prevents intermediate reflows that cause incorrect clip positions
 */
export function restoreClipsToTrack(
  project: Project,
  trackId: string,
  clipIdsToRemove: string[],
  clipsToRestore: Clip[]
): boolean {
  const track = project.timeline.tracks.find(t => t.id === trackId)
  if (!track) return false

  // Step 1: Remove all affected clips (the split/sped-up ones) in one pass
  track.clips = track.clips.filter(c => !clipIdsToRemove.includes(c.id))

  // Step 2: Add back original clips
  for (const clip of clipsToRestore) {
    track.clips.push({ ...clip })
  }

  // Step 3: Sort by startTime
  sortClipsByTime(track)

  // Step 4: Single reflow at the end
  reflowClips(track, 0)

  // Step 5: Update timeline duration
  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()

  return true
}

// Add recording with effects
export function addRecordingToProject(
  project: Project,
  recording: Recording,
  createEffects: (recording: Recording) => void
): Clip | null {
  project.recordings.push(recording)

  const clipId = `clip-${Date.now()}`
  const clip: Clip = {
    id: clipId,
    recordingId: recording.id,
    startTime: project.timeline.duration,
    duration: recording.duration,
    sourceIn: 0,
    sourceOut: recording.duration
  }

  // Create effects on the recording itself (in source space)
  createEffects(recording)

  // Ensure global effects exist (background, cursor)
  const { EffectsFactory } = require('../effects/effects-factory')
  EffectsFactory.ensureGlobalEffects(project)

  const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
  if (!videoTrack) return null

  // Append to end of array (array order is the source of truth)
  videoTrack.clips.push(clip)

  // Reflow to ensure contiguous layout
  reflowClips(videoTrack, 0)

  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  return clip
}
