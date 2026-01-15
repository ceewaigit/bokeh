import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Project } from '@/types'
import { useRecordingsLibraryStore, type LibraryRecording, type LibraryRecordingHydration, type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { ThumbnailGenerator } from '@/shared/utils/thumbnail-generator'
import { PROJECT_EXTENSION, PROJECT_EXTENSION_REGEX } from '@/features/core/storage/project-paths'
import { getProjectDir, getProjectFilePath, isValidFilePath, resolveRecordingMediaPath } from '../utils/recording-paths'
import { markModified } from '@/features/core/stores/store-utils'
import {
  groupByDateCategory,
  getCategoryCounts,
  getNonEmptyCategories,
} from '../utils/date-grouping'

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

interface HydrationOptions {
  includeMediaSize: boolean
}

type ThumbnailVariant = 'default' | 'large'

interface ThumbnailSpec {
  width: number
  height: number
  variant: ThumbnailVariant
  quality: number
}

interface HydrationContext {
  loadToken: number
  loadTokenRef: React.MutableRefObject<number>
  hydrationRef: React.MutableRefObject<Record<string, LibraryRecordingHydration>>
  setHydration: (path: string, hydration: LibraryRecordingHydration) => void
  generateThumbnail: (rec: LibraryRecording, videoPath: string, options: { width: number; height: number; quality: number; variant: ThumbnailVariant }) => Promise<string | null>
  loadThumbnailFromDisk: (projectDir: string, variant: ThumbnailVariant) => Promise<string | null>
  saveThumbnailToDisk: (projectDir: string, dataUrl: string, variant: ThumbnailVariant) => Promise<void>
  resolveThumbnailSpec: (index: number) => ThumbnailSpec
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const normalizeSearchValue = (value: string) => (
  value
    .toLowerCase()
    .replace(PROJECT_EXTENSION_REGEX, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
)

const getThumbnailFileName = (variant: ThumbnailVariant) =>
  variant === 'large' ? 'thumbnail-large.jpg' : 'thumbnail.jpg'

const getDeviceScale = () => {
  if (typeof window === 'undefined') return 1
  return Math.min(2, window.devicePixelRatio || 1)
}

/** Run tasks with concurrency limit */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const next = items[index]
      index += 1
      if (!next) return
      await worker(next)
    }
  })
  await Promise.all(workers)
}

/** Hydrate a single recording with project info and thumbnail */
async function hydrateRecording(
  rec: LibraryRecording,
  options: HydrationOptions,
  index: number,
  ctx: HydrationContext
): Promise<void> {
  if (ctx.loadTokenRef.current !== ctx.loadToken) return

  const existingHydration = ctx.hydrationRef.current[rec.path]
  const thumbSpec = ctx.resolveThumbnailSpec(index)
  const matchingThumb = existingHydration?.thumbnailVariant === thumbSpec.variant
    ? existingHydration?.thumbnailUrl
    : undefined

  if (matchingThumb && existingHydration?.projectInfo) return

  try {
    let info = existingHydration?.projectInfo
    let thumb = matchingThumb

    if (!info || !thumb) {
      if (window.electronAPI?.readLocalFile) {
        const projectFilePath = await getProjectFilePath(rec.path, window.electronAPI?.fileExists)
        const result = await window.electronAPI.readLocalFile(projectFilePath)
        if (result?.success && result.data) {
          const projectData = new TextDecoder().decode(result.data as ArrayBuffer)
          const project: Project = JSON.parse(projectData)

          const duration = project.timeline?.duration || project.recordings?.[0]?.duration || 0
          info = {
            name: project.name || rec.name,
            duration,
            width: project.recordings?.[0]?.width || 0,
            height: project.recordings?.[0]?.height || 0,
            recordingCount: project.recordings?.length || 0
          }

          if (project?.recordings && project.recordings.length > 0) {
            const projectDir = getProjectDir(rec.path, projectFilePath)
            const firstRecording = project.recordings[0]
            let videoPath = firstRecording.filePath

            if (!videoPath || !isValidFilePath(videoPath)) {
              if (info) {
                ctx.setHydration(rec.path, { projectInfo: info })
              }
              return
            }

            const resolvedPath = await resolveRecordingMediaPath({
              projectDir,
              filePath: videoPath,
              recordingId: firstRecording.id,
              fileExists: window.electronAPI?.fileExists
            })
            if (resolvedPath) {
              videoPath = resolvedPath
            }

            // Load media file sizes if requested
            if (options.includeMediaSize && !existingHydration?.mediaFileSize && window.electronAPI?.getFileSize) {
              try {
                let total = 0
                for (const r of project.recordings) {
                  const filePath = r.filePath
                  if (!filePath || !isValidFilePath(filePath)) continue

                  const resolvedFilePath = await resolveRecordingMediaPath({
                    projectDir,
                    filePath,
                    recordingId: r.id,
                    fileExists: window.electronAPI?.fileExists
                  })
                  if (!resolvedFilePath || !window.electronAPI?.getFileSize) continue
                  const stat = await window.electronAPI.getFileSize(resolvedFilePath)
                  if (stat?.success && stat.data?.size) total += stat.data.size
                }

                if (ctx.loadTokenRef.current === ctx.loadToken && total > 0) {
                  ctx.setHydration(rec.path, { mediaFileSize: total })
                }
              } catch (e) {
                console.log('Could not get media size:', e)
              }
            }

            // Generate or load thumbnail
            if (!thumb) {
              try {
                const savedThumbnail = await ctx.loadThumbnailFromDisk(projectDir, thumbSpec.variant)
                if (ctx.loadTokenRef.current !== ctx.loadToken) return
                if (savedThumbnail) {
                  thumb = savedThumbnail
                } else if (videoPath) {
                  const thumbnailUrl = await ctx.generateThumbnail(rec, videoPath, {
                    width: thumbSpec.width,
                    height: thumbSpec.height,
                    quality: thumbSpec.quality,
                    variant: thumbSpec.variant
                  })
                  if (ctx.loadTokenRef.current !== ctx.loadToken) return
                  if (thumbnailUrl) {
                    thumb = thumbnailUrl
                    await ctx.saveThumbnailToDisk(projectDir, thumbnailUrl, thumbSpec.variant)
                  }
                }
              } catch (error) {
                console.error('Failed to generate thumbnail for', rec.name, error)
              }
            }
          }
        }
      }

      if (info || thumb) {
        const hydrationUpdate: LibraryRecordingHydration = {}
        if (info) hydrationUpdate.projectInfo = info
        if (thumb) {
          hydrationUpdate.thumbnailUrl = thumb
          hydrationUpdate.thumbnailVariant = thumbSpec.variant
        }
        if (Object.keys(hydrationUpdate).length > 0) {
          ctx.setHydration(rec.path, hydrationUpdate)
        }
      }
    }
  } catch (e) {
    console.error('Failed to hydrate recording:', rec.path, e)
  }
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export const useRecordingsLibraryData = () => {
  const {
    recordings,
    hydrationByPath,
    displayedCount,
    searchQuery,
    sortKey,
    sortDirection,
    setRecordings,
    incrementDisplayed,
    resetDisplayed,
    setHydration,
    removeRecording,
    setSearchQuery,
    setSort
  } = useRecordingsLibraryStore()

  const [loading, setLoading] = useState(false)
  const [isPageHydrating, setIsPageHydrating] = useState(false)
  const [showHydrationIndicator, setShowHydrationIndicator] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<LibraryRecordingView | null>(null)
  const loadTokenRef = useRef(0)
  const hydrationIndicatorTimeoutRef = useRef<number | null>(null)
  const loadMoreTimeoutRef = useRef<number | null>(null)
  const recordingsRef = useRef(recordings)
  const hydrationRef = useRef(hydrationByPath)

  const filteredAndSortedRecordings = useMemo(() => {
    let result = [...recordings]

    // Filter
    if (searchQuery) {
      const query = normalizeSearchValue(searchQuery)
      if (query) {
        const tokens = query.split(' ').filter(Boolean)
        const getSearchText = (rec: LibraryRecording) => {
          const hydratedName = hydrationByPath[rec.path]?.projectInfo?.name
          const fallbackName = rec.name.replace(/^Recording_/, '').replace(PROJECT_EXTENSION_REGEX, '')
          const displayName = hydratedName || fallbackName
          return normalizeSearchValue([displayName, rec.name, rec.path].filter(Boolean).join(' '))
        }
        result = result.filter((rec) => {
          const searchText = getSearchText(rec)
          return tokens.every((token) => searchText.includes(token))
        })
      }
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'size':
          cmp = (a.projectFileSize || 0) - (b.projectFileSize || 0)
          break
        case 'duration':
          // Duration requires hydration, so we might not be able to sort accurately
          // without loading everything. For now, treat as equal (stable sort) or 0.
          // In a real implementation we might need to pre-load metadata for sorting.
          cmp = 0
          break
        case 'date':
        default:
          cmp = a.timestamp.getTime() - b.timestamp.getTime()
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return result
  }, [recordings, searchQuery, sortKey, sortDirection, hydrationByPath])

  // For infinite scroll - show items up to displayedCount
  const displayedRecordings = useMemo(() => {
    return filteredAndSortedRecordings.slice(0, displayedCount)
  }, [filteredAndSortedRecordings, displayedCount])

  // Whether there are more items to load
  const hasMore = displayedCount < filteredAndSortedRecordings.length

  // Loading more state (for infinite scroll indicator)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const displayedRecordingsHydrated = useMemo(() => {
    return displayedRecordings.map((rec) => ({
      ...rec,
      ...(hydrationByPath[rec.path] ?? {})
    }))
  }, [displayedRecordings, hydrationByPath])

  const _pageKey = useMemo(() => {
    return displayedRecordings.map((rec) => `${rec.path}:${rec.timestamp.getTime()}`).join('|')
  }, [displayedRecordings])

  // Stable key that only changes when the source recordings list or display parameters change,
  // NOT when hydration updates. This prevents infinite loops during hydration.
  const hydrationTriggerKey = useMemo(() => {
    // Use only stable values that don't change during hydration
    const recordingIds = recordings.map(r => r.path).join(',')
    return `${recordingIds}|${searchQuery}|${sortKey}|${sortDirection}|${displayedCount}`
  }, [recordings, searchQuery, sortKey, sortDirection, displayedCount])

  const filteredAndSortedRef = useRef(filteredAndSortedRecordings)
  const displayedRecordingsRef = useRef(displayedRecordings)
  const displayedCountRef = useRef(displayedCount)

  useEffect(() => {
    recordingsRef.current = recordings
  }, [recordings])

  useEffect(() => {
    hydrationRef.current = hydrationByPath
  }, [hydrationByPath])

  useEffect(() => {
    filteredAndSortedRef.current = filteredAndSortedRecordings
  }, [filteredAndSortedRecordings])

  useEffect(() => {
    displayedRecordingsRef.current = displayedRecordings
  }, [displayedRecordings])

  useEffect(() => {
    displayedCountRef.current = displayedCount
  }, [displayedCount])

  // ──────────────────────────────────────────────────────────────────────────
  // THUMBNAIL HELPERS
  // ──────────────────────────────────────────────────────────────────────────

  const resolveThumbnailSpec = useCallback((_index: number): ThumbnailSpec => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
    const baseWidth = Math.min(800, Math.max(400, Math.round(viewportWidth * 0.25)))
    const dpr = getDeviceScale()
    const width = Math.min(Math.round(baseWidth * dpr), 1600)
    const height = Math.round((width * 9) / 16)
    return { width, height, variant: 'default', quality: 0.8 }
  }, [])

  const generateThumbnail = useCallback(async (
    recording: LibraryRecording,
    videoPath: string,
    options: { width: number; height: number; quality: number; variant: ThumbnailVariant }
  ) => {
    return await ThumbnailGenerator.generateThumbnail(
      videoPath,
      `${recording.path}:${options.variant}`,
      { width: options.width, height: options.height, quality: options.quality, timestamp: 0.1 }
    )
  }, [])

  const loadThumbnailFromDisk = useCallback(async (projectDir: string, variant: ThumbnailVariant) => {
    if (!window.electronAPI?.fileExists || !window.electronAPI?.readLocalFile) return null
    const thumbnailPath = `${projectDir}/${getThumbnailFileName(variant)}`
    const exists = await window.electronAPI.fileExists(thumbnailPath)
    if (!exists) return null
    // Read the file as binary and convert to data URL
    const result = await window.electronAPI.readLocalFile(thumbnailPath)
    if (!result?.success || !result.data) return null
    const bytes = new Uint8Array(result.data as ArrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64 = btoa(binary)
    // Thumbnails are always JPEG format
    return `data:image/jpeg;base64,${base64}`
  }, [])

  const saveThumbnailToDisk = useCallback(async (projectDir: string, dataUrl: string, variant: ThumbnailVariant) => {
    if (!window.electronAPI?.saveRecording) return
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return
    try {
      const base64 = match[2]
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      await window.electronAPI.saveRecording(`${projectDir}/${getThumbnailFileName(variant)}`, bytes.buffer)
    } catch (error) {
      console.warn('Failed to save thumbnail to disk:', error)
    }
  }, [])

  // ──────────────────────────────────────────────────────────────────────────
  // HYDRATION EFFECT
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Use refs to get current values without creating dependencies that change during hydration
    const currentDisplayed = displayedRecordingsRef.current
    const pageItems = currentDisplayed.map((rec, index) => ({ rec, index }))
    const needsHydration = pageItems.filter(({ rec, index }) => {
      const hydration = hydrationRef.current[rec.path]
      const desiredVariant = resolveThumbnailSpec(index).variant
      const hasMatchingThumb = hydration?.thumbnailUrl && hydration.thumbnailVariant === desiredVariant
      return !hasMatchingThumb || !hydration?.projectInfo
    })

    if (needsHydration.length === 0) {
      setIsPageHydrating(false)
      return
    }

    const token = ++loadTokenRef.current
    setIsPageHydrating(true)

    // Create hydration context for the extracted function
    const ctx: HydrationContext = {
      loadToken: token,
      loadTokenRef,
      hydrationRef,
      setHydration,
      generateThumbnail,
      loadThumbnailFromDisk,
      saveThumbnailToDisk,
      resolveThumbnailSpec
    }

    const run = async () => {
      // Hydrate current page
      await runWithConcurrency(needsHydration, 4, ({ rec, index }) =>
        hydrateRecording(rec, { includeMediaSize: true }, index, ctx)
      )

      if (loadTokenRef.current === token) {
        setIsPageHydrating(false)
      }

      // Pre-load next batch for smooth infinite scroll
      if (loadTokenRef.current === token) {
        const start = displayedCountRef.current
        const currentFiltered = filteredAndSortedRef.current
        const nextItems = currentFiltered.slice(start, start + 24).map((rec, i) => ({
          rec,
          index: start + i
        }))
        if (nextItems.length > 0) {
          await runWithConcurrency(nextItems, 3, ({ rec, index }) =>
            hydrateRecording(rec, { includeMediaSize: false }, index, ctx)
          )
        }
      }
    }

    run().catch((error) => {
      console.error('Failed to hydrate recordings page:', error)
    })
   
  }, [
    // Use stable trigger key that doesn't change during hydration
    hydrationTriggerKey,
    // Stable callback references (from useCallback)
    setHydration,
    generateThumbnail,
    loadThumbnailFromDisk,
    saveThumbnailToDisk,
    resolveThumbnailSpec
  ])

  const loadRecordings = useCallback(async (forceReload = false) => {
    if (loading) return
    if (!forceReload && recordings.length > 0) {
      return
    }

    setLoading(true)
    try {
      if (window.electronAPI?.loadRecordings) {
        const files = await window.electronAPI.loadRecordings()
        const recordingsList: LibraryRecording[] = []

        for (const file of files) {
          if (!file.path.endsWith(PROJECT_EXTENSION)) continue

          const recording: LibraryRecording = {
            name: file.name,
            path: file.path,
            timestamp: new Date(file.timestamp),
            projectFileSize: file.size
          }

          recordingsList.push(recording)
        }

        const uniqueMap = new Map<string, LibraryRecording>()
        recordingsList.forEach(rec => {
          const key = rec.path
          const existing = uniqueMap.get(key)
          if (!existing || rec.timestamp > existing.timestamp) {
            uniqueMap.set(key, rec)
          }
        })
        const uniqueRecordings = Array.from(uniqueMap.values())

        uniqueRecordings.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        setRecordings(uniqueRecordings)
        resetDisplayed()
      }
    } catch (error) {
      console.error('Failed to load recordings:', error)
    } finally {
      setLoading(false)
    }
  }, [recordings, loading, setRecordings, resetDisplayed])

  useEffect(() => {
    if (recordings.length === 0) {
      loadRecordings()
    }

    const handleRefresh = () => {
      loadRecordings(true)
    }

    const removeListener = window.electronAPI?.onRefreshLibrary?.(handleRefresh)
    return () => {
      removeListener?.()
    }
  }, [loadRecordings, recordings.length])

  // Load more function for infinite scroll
  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return
    setIsLoadingMore(true)
    // Clear any existing timeout to prevent accumulation
    if (loadMoreTimeoutRef.current !== null) {
      window.clearTimeout(loadMoreTimeoutRef.current)
    }
    // Small delay to allow hydration to start
    loadMoreTimeoutRef.current = window.setTimeout(() => {
      loadMoreTimeoutRef.current = null
      incrementDisplayed()
      setIsLoadingMore(false)
    }, 100)
  }, [isLoadingMore, hasMore, incrementDisplayed])

  // Cleanup loadMore timeout on unmount
  useEffect(() => {
    return () => {
      if (loadMoreTimeoutRef.current !== null) {
        window.clearTimeout(loadMoreTimeoutRef.current)
        loadMoreTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (hydrationIndicatorTimeoutRef.current !== null) {
      window.clearTimeout(hydrationIndicatorTimeoutRef.current)
      hydrationIndicatorTimeoutRef.current = null
    }

    if (isPageHydrating) {
      hydrationIndicatorTimeoutRef.current = window.setTimeout(() => {
        setShowHydrationIndicator(true)
        hydrationIndicatorTimeoutRef.current = null
      }, 250)
    } else {
      setShowHydrationIndicator(false)
    }

    return () => {
      if (hydrationIndicatorTimeoutRef.current !== null) {
        window.clearTimeout(hydrationIndicatorTimeoutRef.current)
        hydrationIndicatorTimeoutRef.current = null
      }
    }
  }, [isPageHydrating])

  const handleDeleteRecording = useCallback(async (rec: LibraryRecordingView) => {
    try {
      if (!window.electronAPI?.deleteRecordingProject) return
      const res = await window.electronAPI.deleteRecordingProject(rec.path)
      if (!res?.success) return
      removeRecording(rec.path)
    } catch (e) {
      console.error('Failed to delete recording:', e)
    }
  }, [removeRecording])

  const handleRenameRecording = useCallback(async (rec: LibraryRecordingView, name: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    if (!window.electronAPI?.readLocalFile || !window.electronAPI?.saveRecording) return

    try {
      const projectFilePath = await getProjectFilePath(rec.path, window.electronAPI?.fileExists)
      const result = await window.electronAPI.readLocalFile(projectFilePath)
      if (!result?.success || !result.data) return

      const projectData = new TextDecoder().decode(result.data as ArrayBuffer)
      const project: Project = JSON.parse(projectData)
      project.name = trimmedName
      markModified(project)

      const updatedData = JSON.stringify(project)
      await window.electronAPI.saveRecording(projectFilePath, new TextEncoder().encode(updatedData).buffer)

      const existingInfo = hydrationRef.current[rec.path]?.projectInfo || rec.projectInfo
      setHydration(rec.path, {
        projectInfo: {
          name: trimmedName,
          duration: existingInfo?.duration || 0,
          width: existingInfo?.width || 0,
          height: existingInfo?.height || 0,
          recordingCount: existingInfo?.recordingCount || 0
        }
      })
    } catch (e) {
      console.error('Failed to rename recording:', e)
    }
  }, [setHydration])

  const handleDuplicateRecording = useCallback(async (rec: LibraryRecordingView, name: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    if (!window.electronAPI?.duplicateRecordingProject) return

    try {
      const result = await window.electronAPI.duplicateRecordingProject(rec.path, trimmedName)
      if (!result?.success) return
      await loadRecordings(true)
    } catch (e) {
      console.error('Failed to duplicate recording:', e)
    }
  }, [loadRecordings])

  // ──────────────────────────────────────────────────────────────────────────
  // DATE GROUPING
  // ──────────────────────────────────────────────────────────────────────────

  /** Group displayed recordings by date category */
  const groupedRecordings = useMemo(() => {
    return groupByDateCategory(displayedRecordingsHydrated)
  }, [displayedRecordingsHydrated])

  /** Category counts for sidebar (from ALL filtered recordings, not just displayed) */
  const categoryCounts = useMemo(() => {
    return getCategoryCounts(filteredAndSortedRecordings)
  }, [filteredAndSortedRecordings])

  /** Non-empty categories for sidebar navigation */
  const nonEmptyCategories = useMemo(() => {
    return getNonEmptyCategories(filteredAndSortedRecordings)
  }, [filteredAndSortedRecordings])

  // ──────────────────────────────────────────────────────────────────────────
  // LIBRARY STATS
  // ──────────────────────────────────────────────────────────────────────────

  /** Calculate total duration from all hydrated recordings */
  const totalDurationMs = useMemo(() => {
    return displayedRecordingsHydrated.reduce((sum, rec) => {
      return sum + (rec.projectInfo?.duration ?? 0)
    }, 0)
  }, [displayedRecordingsHydrated])

  /** Calculate total storage from all hydrated recordings */
  const totalStorageBytes = useMemo(() => {
    return displayedRecordingsHydrated.reduce((sum, rec) => {
      return sum + (rec.mediaFileSize ?? 0)
    }, 0)
  }, [displayedRecordingsHydrated])

  /** Get the most recent recording date */
  const lastRecordedDate = useMemo(() => {
    if (recordings.length === 0) return null
    return recordings.reduce((latest, rec) => {
      return rec.timestamp > latest ? rec.timestamp : latest
    }, recordings[0].timestamp)
  }, [recordings])

  return {
    searchQuery,
    setSearchQuery,
    sortKey,
    sortDirection,
    setSort,

    recordings: filteredAndSortedRecordings,
    displayedRecordings: displayedRecordingsHydrated,
    loading,
    loadRecordings,
    showHydrationIndicator,

    // Infinite scroll
    hasMore,
    isLoadingMore,
    loadMore,

    // Date grouping
    groupedRecordings,
    categoryCounts,
    nonEmptyCategories,

    pendingDelete,
    setPendingDelete,
    handleDeleteRecording,
    handleRenameRecording,
    handleDuplicateRecording,
    totalRecordingsCount: recordings.length,

    // Library stats
    totalDurationMs,
    totalStorageBytes,
    lastRecordedDate,
  }
}
