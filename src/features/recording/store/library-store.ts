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
  thumbnailVariant?: 'default' | 'large'
}

export type LibraryRecordingView = LibraryRecording & LibraryRecordingHydration

export type SortKey = 'date' | 'name' | 'size' | 'duration'
export type SortDirection = 'asc' | 'desc'

interface RecordingsStore {
  // Single source of truth
  recordings: LibraryRecording[]
  hydrationByPath: Record<string, LibraryRecordingHydration>
  currentPage: number
  isHydrated: boolean

  // Filter & Sort State
  searchQuery: string
  sortKey: SortKey
  sortDirection: SortDirection

  // Actions
  setRecordings: (recordings: LibraryRecording[]) => void
  setCurrentPage: (page: number) => void
  setHydration: (path: string, updates: LibraryRecordingHydration) => void
  removeRecording: (path: string) => void
  setHydrated: (hydrated: boolean) => void

  // Filter & Sort Actions
  setSearchQuery: (query: string) => void
  setSort: (key: SortKey, direction: SortDirection) => void

  reset: () => void

  // Memory management
  clearLibrary: () => void
}

export const useRecordingsLibraryStore = create<RecordingsStore>((set) => ({
  recordings: [],
  hydrationByPath: {},
  currentPage: 1,
  isHydrated: false,

  searchQuery: '',
  sortKey: 'date',
  sortDirection: 'desc',

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

  setSearchQuery: (query) => set({ searchQuery: query, currentPage: 1 }),
  setSort: (key, direction) => set({ sortKey: key, sortDirection: direction, currentPage: 1 }),

  reset: () => set({
    recordings: [],
    hydrationByPath: {},
    currentPage: 1,
    isHydrated: false,
    searchQuery: '',
    sortKey: 'date',
    sortDirection: 'desc'
  }),

  // Memory management: completely clear library data
  clearLibrary: () => set({
    recordings: [],
    hydrationByPath: {},
    currentPage: 1,
    isHydrated: false,
    searchQuery: '',
    sortKey: 'date',
    sortDirection: 'desc'
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
