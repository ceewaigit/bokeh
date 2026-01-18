/**
 * Black Box Tests: Webcam playback rate changes
 *
 * Reproduces a timeline UI bug where changing the playbackRate of a webcam clip
 * causes later webcam clips to overlap (speed up) or develop gaps (slow down).
 *
 * The expected behavior is that the webcam track remains temporally consistent:
 * - For contiguous clips: later clips should stay contiguous after rate changes.
 */

import { describe, it, expect } from '@jest/globals'
import { produceWithPatches } from 'immer'
import type { Project, Clip } from '@/types/project'
import { TrackType } from '@/types/project'
import type { CommandContext } from '@/features/core/commands'
import { ChangePlaybackRateCommand } from '@/features/core/commands'
import { EffectLayerType } from '@/features/effects/types'

type TestStoreState = {
  currentProject: Project | null
  currentTime: number
  selectedClips: string[]
  selectedEffectLayer: any
  clipboard: any
}

function createTestProject(webcamClips: Clip[]): Project {
  const webcamRecording = {
    id: 'webcam-rec-1',
    sourceType: 'video' as const,
    filePath: '/tmp/test-webcam.mp4',
    duration: 30000,
    width: 1280,
    height: 720,
    frameRate: 30,
    effects: [],
    metadata: {
      keyboardEvents: [],
      mouseEvents: [],
      clickEvents: [],
      screenEvents: [],
    },
  }

  return {
    id: 'project-1',
    version: '1.0.0',
    schemaVersion: 1,
    name: 'Test Project',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    recordings: [webcamRecording],
    timeline: {
      tracks: [
        {
          id: 'webcam-track-1',
          name: 'Webcam Track',
          type: TrackType.Webcam,
          clips: webcamClips,
          muted: false,
          locked: false,
        },
      ],
      duration: Math.max(...webcamClips.map(c => c.startTime + c.duration)),
      effects: [],
    },
    settings: {
      frameRate: 60,
      resolution: { width: 1920, height: 1080 },
      backgroundColor: '#000000',
      audio: { volume: 1, muted: false, fadeInDuration: 0, fadeOutDuration: 0, enhanceAudio: false },
      canvas: { aspectRatio: 'original' as any },
    } as any,
    exportPresets: [],
  } as Project
}

function createMockStore(initialState: TestStoreState) {
  let state = initialState

  const transaction = (recipe: (draft: any) => void) => {
    const [nextState, patches, inversePatches] = produceWithPatches(state, recipe)
    state = nextState as any
    return { patches, inversePatches }
  }

  return {
    getState: () => state,
    transaction,
  }
}

function createCommandContext(store: ReturnType<typeof createMockStore>): CommandContext {
  return {
    getProject: () => store.getState().currentProject,
    getCurrentTime: () => store.getState().currentTime,
    getSelectedClips: () => store.getState().selectedClips,
    getSelectedEffectLayer: () => store.getState().selectedEffectLayer,
    getClipboard: () => store.getState().clipboard,
    findClip: (clipId) => {
      const project = store.getState().currentProject
      if (!project) return null
      for (const track of project.timeline.tracks) {
        const clip = track.clips.find(c => c.id === clipId)
        if (clip) return { clip, track }
      }
      return null
    },
    findRecording: (recordingId) => {
      const project = store.getState().currentProject
      if (!project) return null
      return project.recordings.find(r => r.id === recordingId) ?? null
    },
    getStore: () => ({ transaction: store.transaction } as any),
  }
}

function getWebcamTrack(project: Project) {
  const track = project.timeline.tracks.find(t => t.type === TrackType.Webcam)
  if (!track) throw new Error('Missing webcam track')
  return track
}

function expectTrackContiguous(clips: Clip[]) {
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    expect(cur.startTime).toBeCloseTo(prev.startTime + prev.duration, 6)
  }
}

describe('Webcam playback rate changes keep timeline blocks consistent', () => {
  it('does not create overlap when speeding up a webcam clip', async () => {
    const clips: Clip[] = [
      { id: 'w1', recordingId: 'webcam-rec-1', startTime: 0, duration: 2000, sourceIn: 0, sourceOut: 2000, playbackRate: 1 },
      { id: 'w2', recordingId: 'webcam-rec-1', startTime: 2000, duration: 2000, sourceIn: 2000, sourceOut: 4000, playbackRate: 1 },
      { id: 'w3', recordingId: 'webcam-rec-1', startTime: 4000, duration: 2000, sourceIn: 4000, sourceOut: 6000, playbackRate: 1 },
    ]

    const project = createTestProject(clips)
    const store = createMockStore({
      currentProject: project,
      currentTime: 0,
      selectedClips: [],
      selectedEffectLayer: { type: EffectLayerType.Video },
      clipboard: {},
    })
    const context = createCommandContext(store)

    const cmd = new ChangePlaybackRateCommand(context, 'w1', 2)
    const result = await cmd.execute()
    expect(result.success).toBe(true)

    const updatedProject = store.getState().currentProject!
    const webcamTrack = getWebcamTrack(updatedProject)
    expectTrackContiguous(webcamTrack.clips)
  })

  it('does not create gaps when slowing down a webcam clip', async () => {
    const clips: Clip[] = [
      { id: 'w1', recordingId: 'webcam-rec-1', startTime: 0, duration: 2000, sourceIn: 0, sourceOut: 2000, playbackRate: 1 },
      { id: 'w2', recordingId: 'webcam-rec-1', startTime: 2000, duration: 2000, sourceIn: 2000, sourceOut: 4000, playbackRate: 1 },
      { id: 'w3', recordingId: 'webcam-rec-1', startTime: 4000, duration: 2000, sourceIn: 4000, sourceOut: 6000, playbackRate: 1 },
    ]

    const project = createTestProject(clips)
    const store = createMockStore({
      currentProject: project,
      currentTime: 0,
      selectedClips: [],
      selectedEffectLayer: { type: EffectLayerType.Video },
      clipboard: {},
    })
    const context = createCommandContext(store)

    const cmd = new ChangePlaybackRateCommand(context, 'w1', 0.5)
    const result = await cmd.execute()
    expect(result.success).toBe(true)

    const updatedProject = store.getState().currentProject!
    const webcamTrack = getWebcamTrack(updatedProject)
    expectTrackContiguous(webcamTrack.clips)
  })
})

