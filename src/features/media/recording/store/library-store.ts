import { create } from 'zustand'

// BATTERY OPTIMIZATION: Batch hydration updates to reduce React rerenders
// Instead of triggering a state update for each individual recording hydration,
// we accumulate updates and flush them periodically
let pendingHydrationUpdates: Map<string, LibraryRecordingHydration> = new Map()
let hydrationFlushTimeoutId: ReturnType<typeof setTimeout> | null = null
let hydrationFlushScheduled = false
let flushCallback: (() => void) | null = null

const HYDRATION_BATCH_DELAY_MS = 50 // Flush after 50ms of inactivity

/** Immediately flush any pending hydration updates. Useful for tests. */
export function flushHydrationUpdates(): void {
  if (hydrationFlushTimeoutId !== null) {
    clearTimeout(hydrationFlushTimeoutId)
    hydrationFlushTimeoutId = null
  }
  hydrationFlushScheduled = false
  if (flushCallback) {
    flushCallback()
    flushCallback = null
  }
}

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
  displayedCount: number  // For infinite scroll - how many items are visible
  isHydrated: boolean

  // Filter & Sort State
  searchQuery: string
  sortKey: SortKey
  sortDirection: SortDirection

  // Actions
  setRecordings: (recordings: LibraryRecording[]) => void
  incrementDisplayed: (by?: number) => void  // For infinite scroll - load more items
  resetDisplayed: () => void  // Reset to initial batch
  setHydration: (path: string, updates: LibraryRecordingHydration) => void
  removeRecording: (path: string) => void
  setHydrated: (hydrated: boolean) => void

  // Filter & Sort Actions
  setSearchQuery: (query: string) => void
  setSort: (key: SortKey, direction: SortDirection) => void

  reset: () => void
}

const INITIAL_BATCH_SIZE = 24
const LOAD_MORE_BATCH_SIZE = 24

export const useRecordingsLibraryStore = create<RecordingsStore>((set) => ({
  recordings: [],
  hydrationByPath: {},
  displayedCount: INITIAL_BATCH_SIZE,
  isHydrated: false,

  searchQuery: '',
  sortKey: 'date',
  sortDirection: 'desc',

  setRecordings: (recordings) => set({ recordings }),
  incrementDisplayed: (by = LOAD_MORE_BATCH_SIZE) => set((state) => ({
    displayedCount: state.displayedCount + by
  })),
  resetDisplayed: () => set({ displayedCount: INITIAL_BATCH_SIZE }),

  setHydration: (path, updates) => {
    // BATTERY OPTIMIZATION: Batch hydration updates to reduce rerenders
    // Accumulate updates and flush them after a short delay
    const existing = pendingHydrationUpdates.get(path)
    pendingHydrationUpdates.set(path, { ...existing, ...updates })

    // Create the flush function that will be called either on schedule or manually
    const doFlush = () => {
      hydrationFlushScheduled = false
      hydrationFlushTimeoutId = null
      flushCallback = null

      // Flush all pending updates in a single state update
      if (pendingHydrationUpdates.size > 0) {
        const batchedUpdates = pendingHydrationUpdates
        pendingHydrationUpdates = new Map()

        set((state) => {
          const newHydration = { ...state.hydrationByPath }
          for (const [p, u] of batchedUpdates) {
            newHydration[p] = { ...(newHydration[p] ?? {}), ...u }
          }
          return { hydrationByPath: newHydration }
        })
      }
    }

    // Store the flush callback so it can be called manually via flushHydrationUpdates()
    flushCallback = doFlush

    // Schedule a flush if not already scheduled
    if (!hydrationFlushScheduled) {
      hydrationFlushScheduled = true

      // Clear any existing timeout
      if (hydrationFlushTimeoutId !== null) {
        clearTimeout(hydrationFlushTimeoutId)
      }

      // Use requestIdleCallback for better battery performance, fallback to setTimeout
      const scheduleFlush = (callback: () => void) => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(callback, { timeout: HYDRATION_BATCH_DELAY_MS * 2 })
        } else {
          hydrationFlushTimeoutId = setTimeout(callback, HYDRATION_BATCH_DELAY_MS)
        }
      }

      scheduleFlush(doFlush)
    }
  },

  removeRecording: (path) => set((state) => ({
    recordings: state.recordings.filter(r => r.path !== path),
    hydrationByPath: Object.fromEntries(
      Object.entries(state.hydrationByPath).filter(([key]) => key !== path)
    )
  })),

  setHydrated: (hydrated) => set({ isHydrated: hydrated }),

  setSearchQuery: (query) => set({ searchQuery: query, displayedCount: INITIAL_BATCH_SIZE }),
  setSort: (key, direction) => set({ sortKey: key, sortDirection: direction, displayedCount: INITIAL_BATCH_SIZE }),

  reset: () => set({
    recordings: [],
    hydrationByPath: {},
    displayedCount: INITIAL_BATCH_SIZE,
    isHydrated: false,
    searchQuery: '',
    sortKey: 'date',
    sortDirection: 'desc'
  })
}))

// Selectors
export const selectDisplayedRecordings = (state: RecordingsStore): LibraryRecording[] => {
  return state.recordings.slice(0, state.displayedCount)
}

export const selectHasMore = (state: RecordingsStore): boolean => {
  return state.displayedCount < state.recordings.length
}
