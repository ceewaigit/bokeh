import { CommandManager, DefaultCommandContext } from '@/features/commands'
import { DuplicateClipCommand } from '@/features/commands/timeline/DuplicateClipCommand'
import { RemoveClipCommand } from '@/features/commands/timeline/RemoveClipCommand'
import { ChangePlaybackRateCommand } from '@/features/commands/timeline/ChangePlaybackRateCommand'
import { TrimCommand } from '@/features/commands/timeline/TrimCommand'
import { SplitClipCommand } from '@/features/commands/timeline/SplitClipCommand'
import { ClipLookup } from '@/features/timeline/clips/clip-lookup'
import { addClipToTrack, updateClipInTrack, removeClipFromTrack, restoreClipToTrack, duplicateClipInTrack } from '@/features/timeline/clips/clip-crud'
import { executeTrimClipEnd } from '@/features/timeline/clips/clip-trim'
import { executeSplitClip } from '@/features/timeline/clips/clip-split'
import { TrackType, type Project, type Clip } from '@/types/project'
import { normalizeProjectSettings } from '@/features/settings/normalize-project-settings'
import { DEFAULT_STORE_SETTINGS } from '@/features/settings/defaults'
import type { ProjectStore } from '@/features/stores/slices/types'
import { produceWithPatches, enablePatches } from 'immer'

enablePatches()

const findClipById = ClipLookup.byId

function createProjectWithAudioClip(): Project {
  const createdAt = new Date(0).toISOString()
  const clip: Clip = {
    id: 'clip-a1',
    recordingId: 'rec-1',
    startTime: 0,
    duration: 2000,
    sourceIn: 0,
    sourceOut: 2000,
    playbackRate: 1
  }

  return {
    version: '1',
    id: 'proj-1',
    name: 'Test',
    createdAt,
    modifiedAt: createdAt,
    schemaVersion: 1,
    recordings: [
      {
        id: 'rec-1',
        sourceType: 'video',
        filePath: '/tmp/rec.mp4',
        duration: 2000,
        width: 1920,
        height: 1080,
        frameRate: 60,
        effects: []
      }
    ],
    timeline: {
      duration: 2000,
      tracks: [
        { id: 't-video', name: 'Video', type: TrackType.Video, clips: [], muted: false, locked: false },
        { id: 't-audio', name: 'Audio', type: TrackType.Audio, clips: [clip], muted: false, locked: false }
      ],
      effects: []
    },
    settings: normalizeProjectSettings(),
    exportPresets: []
  }
}

function createStoreAccessor(project: Project): { getState: () => ProjectStore; project: Project } {
  // Use a wrapper object so setProject can update the reference
  const projectRef = { current: project }

  const state = {
    get currentProject() { return projectRef.current },
    set currentProject(p: Project) { projectRef.current = p },
    currentTime: 0,
    selectedClips: ['clip-a1'],
    selectedEffectLayer: null,
    clipboard: {},
    isEditingCrop: false,
    editingCropId: null,
    isEditingOverlay: false,
    editingOverlayId: null,
    isPlaying: false,
    isScrubbing: false,
    hoverTime: null,
    zoom: 1,
    zoomManuallyAdjusted: false,

    transaction: (recipe: any) => {
      // Mock state that includes the currentProject
      const mockState = {
        currentProject: projectRef.current,
        settings: state.settings,
        selectedClips: state.selectedClips,
        currentTime: state.currentTime
      }

      const [nextState, patches, inversePatches] = produceWithPatches(mockState, recipe)

      // Apply changes back to refs
      if (nextState.currentProject !== projectRef.current) {
        projectRef.current = nextState.currentProject
      }
      state.selectedClips = nextState.selectedClips
      state.currentTime = nextState.currentTime

      return { patches, inversePatches }
    },

    addClip: (clipOrRecordingId: Clip | string, startTime?: number) => {
      if (!projectRef.current) return
      addClipToTrack(projectRef.current, clipOrRecordingId as any, startTime)
    },
    removeClip: (clipId: string) => {
      if (!projectRef.current) return
      removeClipFromTrack(projectRef.current, clipId)
      state.selectedClips = state.selectedClips.filter(id => id !== clipId)
    },
    updateClip: (clipId: string, updates: Partial<Clip>, options?: { exact?: boolean; maintainContiguous?: boolean }) => {
      if (!projectRef.current) return
      updateClipInTrack(projectRef.current, clipId, updates, options)
    },
    restoreClip: (trackId: string, clip: Clip, index: number) => {
      if (!projectRef.current) return
      restoreClipToTrack(projectRef.current, trackId, clip, index)
    },
    selectClip: (clipId: string | null, multi?: boolean) => {
      if (!clipId) {
        state.selectedClips = []
        return
      }
      if (multi) {
        if (state.selectedClips.includes(clipId)) {
          state.selectedClips = state.selectedClips.filter(id => id !== clipId)
        } else {
          state.selectedClips = [...state.selectedClips, clipId]
        }
      } else {
        state.selectedClips = [clipId]
      }
    },
    splitClip: (clipId: string, splitTime: number) => {
      if (!projectRef.current) return
      executeSplitClip(projectRef.current, clipId, splitTime)
    },
    trimClipStart: () => { },
    trimClipEnd: (clipId: string, newEndTime: number) => {
      if (!projectRef.current) return
      executeTrimClipEnd(projectRef.current, clipId, newEndTime)
    },
    duplicateClip: (clipId: string) => {
      if (!projectRef.current) return null
      const newClip = duplicateClipInTrack(projectRef.current, clipId)
      if (!newClip) return null
      state.selectedClips = [newClip.id]
      return newClip.id
    },
    copyClip: () => { },
    copyEffect: () => { },
    clearClipboard: () => { },
    addEffect: () => { },
    removeEffect: () => { },
    updateEffect: () => { },
    getEffectsAtTimeRange: () => [],
    regenerateAllEffects: async () => { },
    applyTypingSpeedToClip: () => ({ affectedClips: [], originalClips: [] }),
    applySpeedUpToClip: () => ({ affectedClips: [], originalClips: [] }),
    cacheTypingPeriods: () => { },
    cacheIdlePeriods: () => { },
    restoreClipsFromUndo: () => { },
    settings: { ...DEFAULT_STORE_SETTINGS },
    // PatchedCommand support: transaction handles updates
    setProject: (newProject: Project) => {
      projectRef.current = newProject
    }
  } as unknown as ProjectStore

  return {
    getState: () => state,
    // Expose project ref for tests to read updated state
    get project() { return projectRef.current }
  }
}

describe('Undo/redo regression: duplicate + trim + undo', () => {
  beforeEach(() => {
    let now = 1000
    jest.spyOn(Date, 'now').mockImplementation(() => {
      now += 1
      return now
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    try {
      CommandManager.getInstance().clearHistory()
    } catch {
      // ignore: instance might not exist yet
    }
  })

  test('does not leave extra clips after undoing trim and duplicate', async () => {
    const project = createProjectWithAudioClip()
    const storeAccessor = createStoreAccessor(project)
    const ctx = new DefaultCommandContext(storeAccessor)
    const manager = CommandManager.getInstance(ctx)
    manager.setContext(ctx)
    manager.clearHistory()

    const duplicate = new DuplicateClipCommand(ctx, 'clip-a1')
    const duplicateResult = await manager.execute(duplicate)
    expect(duplicateResult.success).toBe(true)

    const newClipId = (duplicateResult.data as any)?.newClipId as string
    expect(newClipId).toBeTruthy()

    const newClipResult = findClipById(storeAccessor.project, newClipId)
    expect(newClipResult).not.toBeNull()

    const newClip = newClipResult!.clip
    const trimEndTime = newClip.startTime + newClip.duration - 100
    const trim = new TrimCommand(ctx, newClipId, trimEndTime, 'end')
    const trimResult = await manager.execute(trim)
    expect(trimResult.success).toBe(true)

    const undoTrim = await manager.undo()
    expect(undoTrim.success).toBe(true)

    const undoDuplicate = await manager.undo()
    expect(undoDuplicate.success).toBe(true)

    const audioTrack = storeAccessor.project.timeline.tracks.find(t => t.type === TrackType.Audio)!
    const videoTrack = storeAccessor.project.timeline.tracks.find(t => t.type === TrackType.Video)!
    expect(audioTrack.clips.map(c => c.id)).toEqual(['clip-a1'])
    expect(videoTrack.clips.length).toBe(0)
  })
})

describe('Undo/redo regression: duplicate + delete + speed-up + undo', () => {
  beforeEach(() => {
    let now = 2000
    jest.spyOn(Date, 'now').mockImplementation(() => {
      now += 1
      return now
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    try {
      CommandManager.getInstance().clearHistory()
    } catch {
      // ignore
    }
  })

  test('does not create extra clips when undoing speed-up then delete then duplicate', async () => {
    const project = createProjectWithAudioClip()
    const storeAccessor = createStoreAccessor(project)
    const ctx = new DefaultCommandContext(storeAccessor)
    const manager = CommandManager.getInstance(ctx)
    manager.setContext(ctx)
    manager.clearHistory()

    const duplicate = new DuplicateClipCommand(ctx, 'clip-a1')
    const duplicateResult = await manager.execute(duplicate)
    expect(duplicateResult.success).toBe(true)

    const duplicateId = (duplicateResult.data as any)?.newClipId as string
    expect(duplicateId).toBeTruthy()

    const removeDuplicate = new RemoveClipCommand(ctx, duplicateId)
    const removeResult = await manager.execute(removeDuplicate)
    expect(removeResult.success).toBe(true)

    const speedUp = new ChangePlaybackRateCommand(ctx, 'clip-a1', 2.0)
    const speedResult = await manager.execute(speedUp)
    expect(speedResult.success).toBe(true)

    // Undo speed-up should NOT resurrect the deleted duplicate.
    const undoSpeed = await manager.undo()
    expect(undoSpeed.success).toBe(true)
    expect(storeAccessor.project.timeline.tracks.find(t => t.type === TrackType.Audio)!.clips.length).toBe(1)
    expect(findClipById(storeAccessor.project, duplicateId)).toBeNull()

    // Undo delete should restore the duplicate exactly once.
    const undoDelete = await manager.undo()
    expect(undoDelete.success).toBe(true)
    expect(storeAccessor.project.timeline.tracks.find(t => t.type === TrackType.Audio)!.clips.length).toBe(2)
    expect(findClipById(storeAccessor.project, duplicateId)).not.toBeNull()

    // Undo duplicate should remove it again (back to one clip).
    const undoDuplicate = await manager.undo()
    expect(undoDuplicate.success).toBe(true)
    expect(storeAccessor.project.timeline.tracks.find(t => t.type === TrackType.Audio)!.clips.map(c => c.id)).toEqual(['clip-a1'])
  })
})

describe('Undo/redo regression: split + undo', () => {
  beforeEach(() => {
    let now = 3000
    jest.spyOn(Date, 'now').mockImplementation(() => {
      now += 1
      return now
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    try {
      CommandManager.getInstance().clearHistory()
    } catch {
      // ignore
    }
  })

  test('undoing a split restores original without duplication', async () => {
    const project = createProjectWithAudioClip()
    const storeAccessor = createStoreAccessor(project)
    const ctx = new DefaultCommandContext(storeAccessor)
    const manager = CommandManager.getInstance(ctx)
    manager.setContext(ctx)
    manager.clearHistory()

    const splitTime = 500
    const split = new SplitClipCommand(ctx, 'clip-a1', splitTime)
    const splitResult = await manager.execute(split)
    expect(splitResult.success).toBe(true)

    const audioTrack = storeAccessor.project.timeline.tracks.find(t => t.type === TrackType.Audio)!
    expect(audioTrack.clips.length).toBe(2)

    const undoSplit = await manager.undo()
    expect(undoSplit.success).toBe(true)

    expect(storeAccessor.project.timeline.tracks.find(t => t.type === TrackType.Audio)!.clips.map(c => c.id)).toEqual(['clip-a1'])
  })
})
