import type { Effect, Recording, Clip, Project, ZoomEffectData, BackgroundEffectData, CursorEffectData, KeystrokeEffectData, ScreenEffectData, PluginEffectData, CropEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import { PluginRegistry } from '@/lib/effects/config/plugin-registry'
import { getPluginDefaults, getDefaultZIndexForCategory } from '@/lib/effects/config/plugin-sdk'
import {
  DEFAULT_BACKGROUND_DATA,
  DEFAULT_CURSOR_DATA,
  DEFAULT_KEYSTROKE_DATA,
  getDefaultWallpaper
} from '@/lib/constants/default-effects'
import { sourceToTimeline, getSourceDuration } from '@/lib/timeline/time-space-converter'

// Cache for filtered effects to avoid repeated filtering
// Uses WeakMap so cache entries are garbage collected when effects array is GC'd
type EffectsCacheEntry = {
  zoom: Effect[]
  screen: Effect[]
  keystroke: Effect[]
  plugin: Effect[]
  pluginAll: Effect[]
  crop: Effect[]
}
const effectsCache = new WeakMap<Effect[], EffectsCacheEntry>()

function getCacheEntry(effects: Effect[]): EffectsCacheEntry {
  let entry = effectsCache.get(effects)
  if (!entry) {
    entry = {
      zoom: [],
      screen: [],
      keystroke: [],
      plugin: [],
      pluginAll: [],
      crop: []
    }
    effectsCache.set(effects, entry)
  }
  return entry
}

export class EffectsFactory {
  // NOTE: createZoomEffectsFromRecording removed - zoom effects are created on-demand
  // via the sidebar and stored in timeline.effects (timeline-space), not recording.effects
  static createDefaultBackgroundEffect(): Effect {
    const defaultWallpaper = getDefaultWallpaper()
    return {
      id: `background-global`,
      type: EffectType.Background,
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
      data: {
        ...DEFAULT_BACKGROUND_DATA,
        wallpaper: defaultWallpaper
      } as BackgroundEffectData,
      enabled: true
    }
  }
  static createDefaultCursorEffect(): Effect {
    return {
      id: `cursor-global`,
      type: EffectType.Cursor,
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
      data: {
        ...DEFAULT_CURSOR_DATA,
      } as CursorEffectData,
      enabled: true
    }
  }

  static createKeystrokeEffect(options: {
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
  static createInitialEffectsForRecording(
    recording: Recording,
    existingGlobalEffects: Effect[] = []
  ): void {
    // Initialize effects array if not present
    if (!recording.effects) {
      recording.effects = []
    }

    // NOTE: Zoom effects are NOT auto-created here anymore.
    // They are created on-demand via the zoom toggle in the sidebar.
    // This ensures zoom effects are stored in timeline.effects (timeline-space)
    // rather than recording.effects (source-space), which decouples them from clips.
  }

  static ensureGlobalEffects(project: Project): void {
    // Ensure global effects array exists
    if (!project.timeline.effects) {
      project.timeline.effects = []
    }

    // Add default background if not present
    const hasBackground = project.timeline.effects.some(e => e.type === EffectType.Background)
    if (!hasBackground) {
      project.timeline.effects.push(this.createDefaultBackgroundEffect())
    }

    // Add default cursor if not present
    const hasCursor = project.timeline.effects.some(e => e.type === EffectType.Cursor)
    if (!hasCursor) {
      project.timeline.effects.push(this.createDefaultCursorEffect())
    }

    // Keep keystroke effects aligned with the current clip layout (trim/split/speed changes).
    // Also detects and replaces old-style global keystroke effects.
    this.syncKeystrokeEffects(project)
  }

  /**
   * Rebuild "managed" keystroke effects so they always match the current clip layout.
   * - Clusters keyboard events in SOURCE SPACE (recording timestamps)
   * - Projects each cluster into TIMELINE SPACE for every clip that uses that recording
   * - Preserves per-block `enabled` state + keystroke settings where possible
   *
   * Managed effects:
   * - New IDs: `keystroke|<recordingId>|<clipId>|<clusterIndex>`
   * - Legacy IDs: `keystroke-<recordingId>-<clusterIndex>`
   * - Old-style global effect (0..MAX_SAFE_INTEGER)
   */
  static syncKeystrokeEffects(
    project: Project,
    metadataByRecordingId?: Map<string, import('@/types/project').RecordingMetadata>
  ): void {
    if (!project.timeline.effects) {
      project.timeline.effects = []
    }

    const allClips = project.timeline.tracks.flatMap(t => t.clips)
    const MAX_GAP_MS = 2000 // Max gap between keys to be in same cluster
    const PADDING_MS = 500  // Add padding before/after cluster
    const MIN_DURATION_MS = 100

    const existingKeystrokes = project.timeline.effects.filter(e => e.type === EffectType.Keystroke)

    const isOldStyleGlobalEffect = (e: Effect): boolean => {
      return e.type === EffectType.Keystroke &&
        e.startTime === 0 &&
        e.endTime >= Number.MAX_SAFE_INTEGER - 1
    }

    const isManagedKeystrokeEffect = (e: Effect): boolean => {
      if (isOldStyleGlobalEffect(e)) return true
      return typeof e.id === 'string' && (e.id.startsWith('keystroke|') || e.id.startsWith('keystroke-'))
    }

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

    const preservedUserKeystrokes = existingKeystrokes.filter(e => !isManagedKeystrokeEffect(e))

    // Remove managed keystroke effects (including old-style global one).
    project.timeline.effects = [
      ...project.timeline.effects.filter(e => e.type !== EffectType.Keystroke),
      ...preservedUserKeystrokes
    ]

    // Rebuild managed keystroke effects from keyboard event clusters.
    // We collect all timeline ranges per recording+cluster, then merge adjacent/overlapping
    // ranges to avoid creating multiple keystroke blocks when clips are split.

    // Map: `${recordingId}::${clusterIndex}` -> array of timeline ranges
    const clusterTimelineRanges = new Map<string, { start: number; end: number }[]>()

    for (const recording of project.recordings || []) {
      const metadata = metadataByRecordingId?.get(recording.id) ?? recording.metadata
      const events = metadata?.keyboardEvents
      if (!events?.length) continue

      const clipsForRecording = allClips.filter(c => c.recordingId === recording.id)
      if (clipsForRecording.length === 0) continue

      const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp)

      const clusters: { startTime: number; endTime: number }[] = []
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

          // Map source → timeline using the canonical converter (handles playbackRate + time remaps).
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

        // Sort ranges by start time
        ranges.sort((a, b) => a.start - b.start)

        // Merge overlapping/adjacent ranges (within 1ms tolerance)
        const MERGE_TOLERANCE_MS = 1
        const mergedRanges: { start: number; end: number }[] = []

        for (const range of ranges) {
          if (mergedRanges.length === 0) {
            mergedRanges.push({ ...range })
            continue
          }

          const last = mergedRanges[mergedRanges.length - 1]
          // If adjacent or overlapping, merge
          if (range.start <= last.end + MERGE_TOLERANCE_MS) {
            last.end = Math.max(last.end, range.end)
          } else {
            mergedRanges.push({ ...range })
          }
        }

        // Create one keystroke effect per merged range
        for (let rangeIndex = 0; rangeIndex < mergedRanges.length; rangeIndex++) {
          const merged = mergedRanges[rangeIndex]

          // Use a stable ID based on recording + cluster + range index
          const id = `keystroke|${recording.id}|${clusterIndex}|${rangeIndex}`
          const saved = stateById.get(id) ??
            legacyStateByRecordingCluster.get(key) ??
            null

          project.timeline.effects!.push(this.createKeystrokeEffect({
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
  static getEffectsInTimeRange(effects: Effect[], startTime: number, endTime: number): Effect[] {
    return effects.filter(effect =>
      effect.startTime < endTime && effect.endTime > startTime
    )
  }

  // Cached filter methods - cache is invalidated when effects array reference changes
  static getZoomEffects(effects: Effect[]): Effect[] {
    if (effects.length === 0) return []
    const cache = getCacheEntry(effects)
    if (cache.zoom.length === 0 && effects.length > 0) {
      cache.zoom = effects.filter(e => e.type === EffectType.Zoom && e.enabled)
    }
    return cache.zoom
  }

  static getScreenEffects(effects: Effect[]): Effect[] {
    if (effects.length === 0) return []
    const cache = getCacheEntry(effects)
    if (cache.screen.length === 0 && effects.length > 0) {
      cache.screen = effects.filter(e => e.type === EffectType.Screen && e.enabled)
    }
    return cache.screen
  }

  static getCursorEffect(effects: Effect[]): Effect | undefined {
    return effects.find(e => e.type === EffectType.Cursor)
  }

  static getKeystrokeEffects(effects: Effect[]): Effect[] {
    if (effects.length === 0) return []
    const cache = getCacheEntry(effects)
    if (cache.keystroke.length === 0 && effects.length > 0) {
      cache.keystroke = effects.filter(e => e.type === EffectType.Keystroke)
    }
    return cache.keystroke
  }

  static getKeystrokeEffect(effects: Effect[]): Effect | undefined {
    // Returns first keystroke effect (for settings UI)
    return effects.find(e => e.type === EffectType.Keystroke)
  }

  static getBackgroundEffect(effects: Effect[]): Effect | undefined {
    return effects.find(e => e.type === EffectType.Background && e.enabled)
  }
  /**
   * Find the index of an effect that is active at the given time using binary search.
   * Assumes effects are sorted by startTime.
   */
  static findActiveEffectIndex(effects: Effect[], time: number): number {
    let lo = 0;
    let hi = effects.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const effect = effects[mid];

      if (time >= effect.startTime && time <= effect.endTime) {
        return mid;
      }

      if (time < effect.startTime) {
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    return -1;
  }

  static getActiveEffectAtTime(effects: Effect[], type: EffectType, time: number): Effect | undefined {

    if (effects.length === 0) return undefined;
    let lo = 0;
    let hi = effects.length;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (effects[mid].startTime <= time) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    for (let i = lo - 1; i >= 0; i--) {
      const e = effects[i];
      if (e.endTime < time) {
        continue;
      }

      if (e.type === type && e.enabled && time >= e.startTime && time <= e.endTime) {
        return e;
      }
    }

    return undefined;
  }
  static hasActiveZoomEffects(effects: Effect[]): boolean {
    return effects.some(e => e.type === EffectType.Zoom && e.enabled)
  }
  static hasKeystrokeTrack(effects: Effect[]): boolean {
    return effects.some(e => e.type === EffectType.Keystroke)
  }

  static hasEnabledKeystrokeEffects(effects: Effect[]): boolean {
    return effects.some(e => e.type === EffectType.Keystroke && e.enabled)
  }

  // Type-safe data getters
  static getZoomData(effect: Effect): ZoomEffectData | null {
    if (effect.type !== EffectType.Zoom) return null
    return effect.data as ZoomEffectData
  }

  static getCursorData(effect: Effect): CursorEffectData | null {
    if (effect.type !== EffectType.Cursor) return null
    return effect.data as CursorEffectData
  }

  static getBackgroundData(effect: Effect): BackgroundEffectData | null {
    if (effect.type !== EffectType.Background) return null
    return effect.data as BackgroundEffectData
  }

  static getKeystrokeData(effect: Effect): KeystrokeEffectData | null {
    if (effect.type !== EffectType.Keystroke) return null
    return effect.data as KeystrokeEffectData
  }

  static getScreenData(effect: Effect): ScreenEffectData | null {
    if (effect.type !== EffectType.Screen) return null
    return effect.data as ScreenEffectData
  }

  // Crop effect methods
  static getCropEffects(effects: Effect[]): Effect[] {
    if (effects.length === 0) return []
    const cache = getCacheEntry(effects)
    if (cache.crop.length === 0 && effects.length > 0) {
      cache.crop = effects.filter(e => e.type === EffectType.Crop && e.enabled)
    }
    return cache.crop
  }

  static getCropEffect(effects: Effect[]): Effect | undefined {
    return effects.find(e => e.type === EffectType.Crop)
  }

  static getCropData(effect: Effect): CropEffectData | null {
    if (effect.type !== EffectType.Crop) return null
    return effect.data as CropEffectData
  }

  static hasCropEffect(effects: Effect[]): boolean {
    return effects.some(e => e.type === EffectType.Crop && e.enabled)
  }

  /**
   * Create a crop effect for a clip
   * Times are in timeline space (matching clip.startTime/endTime)
   */
  static createCropEffect(options: {
    clipId: string
    startTime: number
    endTime: number
    cropData?: Partial<CropEffectData>
  }): Effect {
    return {
      id: `crop-${options.clipId}-${Date.now()}`,
      type: EffectType.Crop,
      startTime: options.startTime,
      endTime: options.endTime,
      data: {
        x: options.cropData?.x ?? 0,
        y: options.cropData?.y ?? 0,
        width: options.cropData?.width ?? 1,
        height: options.cropData?.height ?? 1,
      } as CropEffectData,
      enabled: true,
    }
  }

  /**
   * Get crop effect for a specific clip by matching time range
   */
  static getCropEffectForClip(effects: Effect[], clip: Clip): Effect | undefined {
    return effects.find(e =>
      e.type === EffectType.Crop &&
      e.startTime === clip.startTime &&
      e.endTime === clip.startTime + clip.duration
    )
  }

  // Plugin effect methods
  static createPluginEffect(options: {
    pluginId: string
    startTime: number
    endTime: number
    params?: Record<string, unknown>
    position?: { x: number; y: number }
    zIndex?: number
  }): Effect | null {
    const plugin = PluginRegistry.get(options.pluginId)
    if (!plugin) {
      console.error(`[EffectsFactory] Plugin not found: ${options.pluginId}`)
      return null
    }
    if (plugin.kind === 'clip') {
      console.warn(`[EffectsFactory] Clip plugin "${options.pluginId}" cannot be added as an effect`)
      return null
    }

    const defaults = getPluginDefaults(plugin)
    const defaultZIndex = getDefaultZIndexForCategory(plugin.category)

    // Determine position: use provided, or default from plugin if positionable
    let position = options.position
    if (!position && plugin.positioning?.enabled) {
      position = {
        x: plugin.positioning.defaultX ?? 50,
        y: plugin.positioning.defaultY ?? 50
      }
    }

    return {
      id: `plugin-${options.pluginId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: EffectType.Plugin,
      startTime: options.startTime,
      endTime: options.endTime,
      data: {
        pluginId: options.pluginId,
        params: { ...defaults, ...options.params },
        position,
        zIndex: options.zIndex ?? defaultZIndex
      } as PluginEffectData,
      enabled: true
    }
  }

  // Cached plugin filter methods
  static getPluginEffects(effects: Effect[]): Effect[] {
    if (effects.length === 0) return []
    const cache = getCacheEntry(effects)
    if (cache.plugin.length === 0 && effects.length > 0) {
      cache.plugin = effects.filter(e => e.type === EffectType.Plugin && e.enabled)
    }
    return cache.plugin
  }

  static getAllPluginEffects(effects: Effect[]): Effect[] {
    if (effects.length === 0) return []
    const cache = getCacheEntry(effects)
    if (cache.pluginAll.length === 0 && effects.length > 0) {
      cache.pluginAll = effects.filter(e => e.type === EffectType.Plugin)
    }
    return cache.pluginAll
  }

  static getPluginData(effect: Effect): PluginEffectData | null {
    if (effect.type !== EffectType.Plugin) return null
    return effect.data as PluginEffectData
  }

  static hasPluginEffects(effects: Effect[]): boolean {
    return effects.some(e => e.type === EffectType.Plugin)
  }

  static getEffectsForClip(project: Project, clipId: string): Effect[] {
    // Find the clip
    let clip: Clip | null = null
    for (const track of project.timeline.tracks) {
      clip = track.clips.find(c => c.id === clipId) || null
      if (clip) break
    }
    if (!clip) return []

    // Find the recording
    const recording = project.recordings.find(r => r.id === clip.recordingId)
    if (!recording || !recording.effects) return []

    // Filter effects to only those that overlap with clip's source range
    // Effects are in source space (recording time), clip references source via sourceIn/sourceOut
    return recording.effects.filter(effect => {
      // Check if effect overlaps with clip's source range
      // Effect is visible if: effect.startTime < clip.sourceOut AND effect.endTime > clip.sourceIn
      return effect.startTime < clip.sourceOut && effect.endTime > clip.sourceIn
    })
  }
  static ensureEffectsArray(project: Project): void {
    if (!project.timeline.effects) {
      project.timeline.effects = []
    }
  }
  static addEffectToProject(project: Project, effect: Effect): void {
    // Zoom effects can now be added to timeline.effects (timeline-space)
    // This enables zoom effects to apply to any clip at that timeline position,
    // regardless of which recording the clip comes from
    this.ensureEffectsArray(project)
    project.timeline.effects!.push(effect)
    project.modifiedAt = new Date().toISOString()
  }

  // NOTE: addEffectToRecording removed - all effects should go to timeline.effects now
  // Use addEffectToProject instead
  static removeEffectFromProject(project: Project, effectId: string): boolean {
    const located = this.findEffectInProject(project, effectId)
    if (!located) {
      return false
    }

    if (located.scope === 'timeline') {
      const effects = project.timeline.effects || []
      const index = effects.findIndex(e => e.id === effectId)
      if (index !== -1) {
        effects.splice(index, 1)
        project.modifiedAt = new Date().toISOString()
        return true
      }
    } else if (located.scope === 'recording' && located.recording) {
      const effects = located.recording.effects || []
      const index = effects.findIndex(e => e.id === effectId)
      if (index !== -1) {
        effects.splice(index, 1)
        project.modifiedAt = new Date().toISOString()
        return true
      }
    }

    return false
  }

  static updateEffectInProject(project: Project, effectId: string, updates: Partial<Effect>): boolean {
    const located = this.findEffectInProject(project, effectId)
    if (!located) {
      return false
    }

    // Apply updates to the effect
    // CRITICAL: Deep merge the data object to preserve existing properties
    if (updates.data && located.effect.data) {
      Object.assign(located.effect, updates, {
        data: { ...located.effect.data, ...updates.data }
      })
    } else {
      Object.assign(located.effect, updates)
    }

    project.modifiedAt = new Date().toISOString()
    return true
  }

  private static findEffectInProject(project: Project, effectId: string): { effect: Effect; scope: 'timeline' | 'recording'; recording?: Recording } | null {
    // Check timeline effects FIRST for zoom effects (new architecture)
    // Zoom effects should be in timeline.effects (timeline-space)
    if (project.timeline.effects) {
      const effect = project.timeline.effects.find(e => e.id === effectId)
      if (effect) {
        return { effect, scope: 'timeline' }
      }
    }

    // Then check recording-level effects (recording-scoped non-zoom effects)
    for (const recording of project.recordings) {
      if (!recording.effects) continue
      const effect = recording.effects.find(e => e.id === effectId)
      if (effect) {
        return { effect, scope: 'recording', recording }
      }
    }

    return null
  }

}
