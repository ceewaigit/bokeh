import { useRecordingsLibraryStore, flushHydrationUpdates, type LibraryRecording } from '@/features/media/recording/store/library-store'

describe('recordings-library-store', () => {
  afterEach(() => {
    flushHydrationUpdates() // Ensure any pending updates are flushed before reset
    useRecordingsLibraryStore.getState().reset()
  })

  it('updateRecording updates both page and full lists', () => {
    const a: LibraryRecording = { name: 'A', path: '/a.bokeh', timestamp: new Date('2024-01-01') }
    const b: LibraryRecording = { name: 'B', path: '/b.bokeh', timestamp: new Date('2024-01-02') }

    useRecordingsLibraryStore.setState({
      recordings: [{ ...a }, { ...b }],
      displayedCount: 24,
      isHydrated: true,
    })

    useRecordingsLibraryStore.getState().setHydration(a.path, { thumbnailUrl: 'thumb://a' })
    flushHydrationUpdates() // Flush batched updates immediately for test

    expect(useRecordingsLibraryStore.getState().hydrationByPath[a.path]?.thumbnailUrl).toBe('thumb://a')
    expect(useRecordingsLibraryStore.getState().hydrationByPath[b.path]?.thumbnailUrl).toBeUndefined()
  })
})
