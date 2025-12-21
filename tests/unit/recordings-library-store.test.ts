import { useRecordingsLibraryStore, type LibraryRecording } from '@/stores/recordings-library-store'

describe('recordings-library-store', () => {
  afterEach(() => {
    useRecordingsLibraryStore.getState().reset()
  })

  it('updateRecording updates both page and full lists', () => {
    const a: LibraryRecording = { name: 'A', path: '/a.bokeh', timestamp: new Date('2024-01-01') }
    const b: LibraryRecording = { name: 'B', path: '/b.bokeh', timestamp: new Date('2024-01-02') }

    useRecordingsLibraryStore.setState({
      recordings: [{ ...a }],
      allRecordings: [{ ...a }, { ...b }],
      currentPage: 1,
      isHydrated: true,
    })

    useRecordingsLibraryStore.getState().updateRecording(a.path, { thumbnailUrl: 'thumb://a' })

    expect(useRecordingsLibraryStore.getState().recordings[0]?.thumbnailUrl).toBe('thumb://a')
    expect(useRecordingsLibraryStore.getState().allRecordings.find(r => r.path === a.path)?.thumbnailUrl).toBe('thumb://a')
    expect(useRecordingsLibraryStore.getState().allRecordings.find(r => r.path === b.path)?.thumbnailUrl).toBeUndefined()
  })
})

