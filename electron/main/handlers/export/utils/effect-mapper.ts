/**
 * Maps recording-scoped effects (source time) to timeline-scoped effects (timeline time).
 * 
 * Recording effects (like cursor settings) are stored with timestamps relative to the recording (0..duration).
 * When a clip is placed on the timeline, we need to project these effects onto the timeline coordinates
 * so that the renderer (which looks up effects by timeline time) can find them.
 * 
 * @param allClips List of all clips in the composition
 * @param downsampledRecordings List of recordings with their metadata/effects
 * @returns Array of effects mapped to timeline coordinates
 */
export function mapRecordingEffectsToTimeline(allClips: any[], downsampledRecordings: any[]) {
  return allClips.flatMap((clip) => {
    const recording = downsampledRecordings.find((r) => r.id === clip.recordingId)
    if (!recording || !recording.effects) return []

    const clipSourceIn = clip.sourceIn ?? 0
    const clipSourceOut = clip.sourceOut ?? (clipSourceIn + clip.duration)

    return recording.effects
      .filter((effect: any) => {
        // Check if effect overlaps with the used part of the recording
        return effect.startTime < clipSourceOut && effect.endTime > clipSourceIn
      })
      .map((effect: any) => {
        // Project source-relative effect to timeline-relative
        // Calculate overlap duration to clamp correctly
        const overlapStart = Math.max(effect.startTime, clipSourceIn)
        const overlapEnd = Math.min(effect.endTime, clipSourceOut)

        // Map to timeline
        const timelineStartTime = clip.startTime + (overlapStart - clipSourceIn)
        const timelineEndTime = clip.startTime + (overlapEnd - clipSourceIn)

        return {
          ...effect,
          id: `${effect.id}-mapped-${clip.id}`, // Unique ID for this clip instance
          startTime: timelineStartTime,
          endTime: timelineEndTime,
          clipId: clip.id // Explicitly bind to clip for safety
        }
      })
  })
}
