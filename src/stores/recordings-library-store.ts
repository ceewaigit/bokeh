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
  /** Size of the `.bokeh` project file (metadata), not the media */
  projectFileSize?: number
}

export interface LibraryRecordingHydration {
  projectInfo?: LibraryProjectInfo
  /** Sum of referenced recording media file sizes (best-effort) */
  mediaFileSize?: number
  // NOTE: Thumbnails are intentionally treated as volatile UI state to avoid
  // retaining large data URLs for the entire library in memory.
  thumbnailUrl?: string
}

export type LibraryRecordingView = LibraryRecording & LibraryRecordingHydration

interface RecordingsStore {
  // Single source of truth
  recordings: LibraryRecording[]
  hydrationByPath: Record<string, LibraryRecordingHydration>
  currentPage: number
  isHydrated: boolean

  // Actions
  setRecordings: (recordings: LibraryRecording[]) => void
  setCurrentPage: (page: number) => void
  setHydration: (path: string, updates: LibraryRecordingHydration) => void
  removeRecording: (path: string) => void
  setHydrated: (hydrated: boolean) => void
  reset: () => void

  // Memory management
  clearLibrary: () => void
}

export const useRecordingsLibraryStore = create<RecordingsStore>((set) => ({
  recordings: [],
  hydrationByPath: {},
  currentPage: 1,
  isHydrated: false,

  setRecordings: (recordings) => set({ recordings }),
  setCurrentPage: (page) => set({ currentPage: page }),

  setHydration: (path, updates) => set((state) => ({
    hydrationByPath: {
      ...state.hydrationByPath,
      [path]: {
        ...(state.hydrationByPath[path] ?? {}),
        ...updates
      }
    }
  })),

  removeRecording: (path) => set((state) => ({
    recordings: state.recordings.filter(r => r.path !== path),
    hydrationByPath: Object.fromEntries(
      Object.entries(state.hydrationByPath).filter(([key]) => key !== path)
    )
  })),

  setHydrated: (hydrated) => set({ isHydrated: hydrated }),

  reset: () => set({
    recordings: [],
    hydrationByPath: {},
    currentPage: 1,
    isHydrated: false
  }),

  // Memory management: completely clear library data
  clearLibrary: () => set({
    recordings: [],
    hydrationByPath: {},
    currentPage: 1,
    isHydrated: false
  })
}))

// Selectors
export const useFilteredRecordings = (
  page: number,
  pageSize: number
): ((state: RecordingsStore) => LibraryRecording[]) => (state) => {
  const start = (page - 1) * pageSize
  const end = start + pageSize
  return state.recordings.slice(start, end)
}
