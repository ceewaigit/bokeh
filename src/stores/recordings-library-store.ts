import { create } from 'zustand'

/** Lightweight metadata extracted from project for library display only */
export interface LibraryProjectInfo {
  name: string
  duration: number      // timeline.duration in ms
  width: number         // recordings[0].width
  height: number        // recordings[0].height
  recordingCount: number
}

export interface LibraryRecording {
  name: string
  path: string
  timestamp: Date
  projectInfo?: LibraryProjectInfo  // Lightweight display data only
  /** Size of the `.bokeh` project file (metadata), not the media */
  projectFileSize?: number
  /** Sum of referenced recording media file sizes (best-effort) */
  mediaFileSize?: number
  // NOTE: Thumbnails are intentionally treated as volatile UI state to avoid
  // retaining large data URLs for the entire library in memory.
  thumbnailUrl?: string
}

interface RecordingsStore {
  // Cached data
  recordings: LibraryRecording[]
  allRecordings: LibraryRecording[]
  currentPage: number
  isHydrated: boolean

  // Actions
  setRecordings: (recordings: LibraryRecording[]) => void
  setAllRecordings: (recordings: LibraryRecording[]) => void
  setCurrentPage: (page: number) => void
  updateRecording: (path: string, updates: Partial<LibraryRecording>) => void
  removeRecording: (path: string) => void
  setHydrated: (hydrated: boolean) => void
  reset: () => void

  // Memory management
  clearLibrary: () => void
}

export const useRecordingsLibraryStore = create<RecordingsStore>((set) => ({
  recordings: [],
  allRecordings: [],
  currentPage: 1,
  isHydrated: false,

  setRecordings: (recordings) => set({ recordings }),
  setAllRecordings: (recordings) => set({ allRecordings: recordings }),
  setCurrentPage: (page) => set({ currentPage: page }),

  updateRecording: (path, updates) => set((state) => {
    const nextRecordings = state.recordings.map(r =>
      r.path === path ? { ...r, ...updates } : r
    )

    const idx = state.allRecordings.findIndex(r => r.path === path)
    if (idx === -1) {
      return { recordings: nextRecordings }
    }

    const nextAll = [...state.allRecordings]
    nextAll[idx] = { ...nextAll[idx], ...updates }
    return { recordings: nextRecordings, allRecordings: nextAll }
  }),

  removeRecording: (path) => set((state) => ({
    recordings: state.recordings.filter(r => r.path !== path),
    allRecordings: state.allRecordings.filter(r => r.path !== path)
  })),

  setHydrated: (hydrated) => set({ isHydrated: hydrated }),

  reset: () => set({
    recordings: [],
    allRecordings: [],
    currentPage: 1,
    isHydrated: false
  }),

  // Memory management: completely clear library data
  clearLibrary: () => set({
    recordings: [],
    allRecordings: [],
    currentPage: 1,
    isHydrated: false
  })
}))
