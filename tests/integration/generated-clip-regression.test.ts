import { produce } from 'immer'
import { createTimelineSlice } from '@/features/stores/slices/timeline-slice'
import type { Project } from '@/types/project'
import { TrackType } from '@/types/project'
import { DEFAULT_STORE_SETTINGS } from '@/features/settings/defaults'
import { normalizeProjectSettings } from '@/features/settings/normalize-project-settings'

function createProject(): Project {
  const createdAt = new Date(0).toISOString()
  return {
    version: '1',
    id: 'proj-1',
    name: 'Generated Clip Regression',
    createdAt,
    modifiedAt: createdAt,
    schemaVersion: 1,
    recordings: [
      {
        id: 'rec-1',
        sourceType: 'video',
        filePath: '/tmp/rec-1.mp4',
        duration: 2000,
        width: 1920,
        height: 1080,
        frameRate: 60,
        effects: []
      },
      {
        id: 'rec-2',
        sourceType: 'video',
        filePath: '/tmp/rec-2.mp4',
        duration: 2000,
        width: 1920,
        height: 1080,
        frameRate: 60,
        effects: []
      }
    ],
    timeline: {
      duration: 4000,
      tracks: [
        {
          id: 't-video',
          name: 'Video',
          type: TrackType.Video,
          clips: [
            {
              id: 'clip-1',
              recordingId: 'rec-1',
              startTime: 0,
              duration: 2000,
              sourceIn: 0,
              sourceOut: 2000
            },
            {
              id: 'clip-2',
              recordingId: 'rec-2',
              startTime: 2000,
              duration: 2000,
              sourceIn: 0,
              sourceOut: 2000
            }
          ],
          muted: false,
          locked: false
        }
      ],
      effects: []
    },
    settings: normalizeProjectSettings(),
    exportPresets: []
  }
}

function createTimelineStore(project: Project) {
  let state: any = {
    currentProject: project,
    currentTime: 0,
    selectedClips: [],
    settings: { ...DEFAULT_STORE_SETTINGS }
  }

  const get = () => state
  const set = (updater: any) => {
    state = typeof updater === 'function'
      ? produce(state, (draft) => updater(draft))
      : { ...state, ...updater }
  }

  return {
    getState: () => state,
    ...createTimelineSlice(set as any, get as any)
  }
}

describe('Generated clip regression', () => {
  test('adding a generated clip does not shift existing video clips', () => {
    const project = createProject()
    const store = createTimelineStore(project)

    const videoTrack = store.getState().currentProject.timeline.tracks.find((t: any) => t.type === TrackType.Video)
    expect(videoTrack).toBeTruthy()
    const beforeStarts = new Map(videoTrack.clips.map((clip: any) => [clip.id, clip.startTime]))

    store.addGeneratedClip({
      pluginId: 'blank-clip',
      params: {},
      durationMs: 2000,
      startTime: 0
    })

    const updatedTrack = store.getState().currentProject.timeline.tracks.find((t: any) => t.type === TrackType.Video)
    expect(updatedTrack.clips.length).toBe(3)

    for (const [id, startTime] of beforeStarts.entries()) {
      const clip = updatedTrack.clips.find((c: any) => c.id === id)
      expect(clip).toBeTruthy()
      expect(clip.startTime).toBe(startTime)
    }
  })
})
