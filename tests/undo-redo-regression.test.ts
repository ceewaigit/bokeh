import { CommandManager, DefaultCommandContext } from '@/lib/commands'
import { DuplicateClipCommand } from '@/lib/commands/timeline/DuplicateClipCommand'
import { RemoveClipCommand } from '@/lib/commands/timeline/RemoveClipCommand'
import { ChangePlaybackRateCommand } from '@/lib/commands/timeline/ChangePlaybackRateCommand'
import { TrimCommand } from '@/lib/commands/timeline/TrimCommand'
import { SplitClipCommand } from '@/lib/commands/timeline/SplitClipCommand'
import { findClipById, executeTrimClipEnd, updateClipInTrack, removeClipFromTrack, restoreClipToTrack, addClipToTrack, duplicateClipInTrack, executeSplitClip } from '@/lib/timeline/timeline-operations'
import { TrackType, type Project, type Clip } from '@/types/project'
import type { ProjectStore } from '@/types/stores'

function createProjectWithAudioClip(): Project {
  const createdAt = new Date(0).toISOString()
  const clip: Clip = {
    id: 'clip-a1',
    recordingId: 'rec-1',
    startTime: 0,
    duration: 1000,
    sourceIn: 0,
    sourceOut: 1000,
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
        filePath: '/tmp/rec.mp4',
        duration: 1000,
        width: 1920,
        height: 1080,
        frameRate: 60,
        effects: []
      }
    ],
    timeline: {
      duration: 1000,
      tracks: [
        { id: 't-video', name: 'Video', type: TrackType.Video, clips: [], muted: false, locked: false },
        { id: 't-audio', name: 'Audio', type: TrackType.Audio, clips: [clip], muted: false, locked: false }
      ],
      effects: []
    },
    settings: {} as any,
    exportPresets: []
  }
}

function createStoreAccessor(project: Project): { getState: () => ProjectStore } {
  const state: ProjectStore = {
    currentProject: project,
    currentTime: 0,
    selectedClips: ['clip-a1'],
    selectedEffectLayer: null,
    clipboard: {},

    addClip: (clipOrRecordingId, startTime) => {
      if (!state.currentProject) return
      addClipToTrack(state.currentProject, clipOrRecordingId as any, startTime)
    },
    removeClip: (clipId) => {
      if (!state.currentProject) return
      removeClipFromTrack(state.currentProject, clipId)
      state.selectedClips = state.selectedClips.filter(id => id !== clipId)
    },
    updateClip: (clipId, updates, options) => {
      if (!state.currentProject) return
      updateClipInTrack(state.currentProject, clipId, updates, options)
    },
    restoreClip: (trackId, clip, index) => {
      if (!state.currentProject) return
      restoreClipToTrack(state.currentProject, trackId, clip, index)
    },
    selectClip: (clipId, multi) => {
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
    splitClip: (clipId, splitTime) => {
      if (!state.currentProject) return
      executeSplitClip(state.currentProject, clipId, splitTime)
    },
    trimClipStart: () => { },
    trimClipEnd: (clipId, newEndTime) => {
      if (!state.currentProject) return
      executeTrimClipEnd(state.currentProject, clipId, newEndTime)
    },
    duplicateClip: (clipId) => {
      if (!state.currentProject) return null
      const newClip = duplicateClipInTrack(state.currentProject, clipId)
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
    regenerateAllEffects: () => { },
    applyTypingSpeedToClip: () => ({ affectedClips: [], originalClips: [] }),
    applySpeedUpToClip: () => ({ affectedClips: [], originalClips: [] }),
    cacheTypingPeriods: () => { },
    cacheIdlePeriods: () => { },
    restoreClipsFromUndo: () => { },
    settings: {
      showTypingSuggestions: true,
      audio: { volume: 100, muted: false, fadeInDuration: 0.5, fadeOutDuration: 0.5 },
      editing: { snapToGrid: true, showWaveforms: false, autoRipple: true },
      playback: { previewSpeed: 1 }
    }
  }

  return { getState: () => state }
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

    const newClipResult = findClipById(project, newClipId)
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

    const audioTrack = project.timeline.tracks.find(t => t.type === TrackType.Audio)!
    const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)!
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
    expect(project.timeline.tracks.find(t => t.type === TrackType.Audio)!.clips.length).toBe(1)
    expect(findClipById(project, duplicateId)).toBeNull()

    // Undo delete should restore the duplicate exactly once.
    const undoDelete = await manager.undo()
    expect(undoDelete.success).toBe(true)
    expect(project.timeline.tracks.find(t => t.type === TrackType.Audio)!.clips.length).toBe(2)
    expect(findClipById(project, duplicateId)).not.toBeNull()

    // Undo duplicate should remove it again (back to one clip).
    const undoDuplicate = await manager.undo()
    expect(undoDuplicate.success).toBe(true)
    expect(project.timeline.tracks.find(t => t.type === TrackType.Audio)!.clips.map(c => c.id)).toEqual(['clip-a1'])
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

    const audioTrack = project.timeline.tracks.find(t => t.type === TrackType.Audio)!
    expect(audioTrack.clips.length).toBe(2)

    const undoSplit = await manager.undo()
    expect(undoSplit.success).toBe(true)

    expect(audioTrack.clips.map(c => c.id)).toEqual(['clip-a1'])
  })
})
