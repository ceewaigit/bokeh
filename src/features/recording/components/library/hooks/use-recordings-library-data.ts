import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Project } from '@/types'
import { useRecordingsLibraryStore, type LibraryRecording, type LibraryRecordingHydration, type LibraryRecordingView } from '@/features/recording/store/library-store'
import { ThumbnailGenerator } from '@/shared/utils/thumbnail-generator'
import { PROJECT_EXTENSION, PROJECT_EXTENSION_REGEX } from '@/features/storage/recording-storage'
import { getProjectDir, getProjectFilePath, isValidFilePath, resolveRecordingMediaPath } from '../utils/recording-paths'

interface HydrationOptions {
  includeMediaSize: boolean
}

type ThumbnailVariant = 'default' | 'large'

const normalizeSearchValue = (value: string) => (
  value
    .toLowerCase()
    .replace(PROJECT_EXTENSION_REGEX, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
)

export const useRecordingsLibraryData = (pageSize: number) => {
  const {
    recordings,
    hydrationByPath,
    currentPage,
    searchQuery,
    sortKey,
    sortDirection,
    setRecordings,
    setCurrentPage,
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

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRecordings.length / pageSize))

  const displayedRecordings = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return filteredAndSortedRecordings.slice(start, end)
  }, [filteredAndSortedRecordings, currentPage, pageSize])

  const displayedRecordingsHydrated = useMemo(() => {
    return displayedRecordings.map((rec) => ({
      ...rec,
      ...(hydrationByPath[rec.path] ?? {})
    }))
  }, [displayedRecordings, hydrationByPath])

  const pageKey = useMemo(() => {
    return displayedRecordings.map((rec) => `${rec.path}:${rec.timestamp.getTime()}`).join('|')
  }, [displayedRecordings])

  useEffect(() => {
    recordingsRef.current = recordings
  }, [recordings])

  useEffect(() => {
    hydrationRef.current = hydrationByPath
  }, [hydrationByPath])

  const runWithConcurrency = useCallback(async <T,>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>
  ) => {
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
  }, [])

  const getDeviceScale = () => {
    if (typeof window === 'undefined') return 1
    return Math.min(2, window.devicePixelRatio || 1)
  }

  const resolveThumbnailSpec = useCallback((index: number) => {
    const isRecentLayout = !searchQuery
      && currentPage === 1
      && sortKey === 'date'
      && sortDirection === 'desc'
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
    let baseWidth = 720
    if (isRecentLayout && index === 0) {
      baseWidth = Math.min(2000, Math.max(1200, Math.round(viewportWidth * 0.65)))
    } else if (isRecentLayout && index < 4) {
      baseWidth = Math.min(1400, Math.max(900, Math.round(viewportWidth * 0.4)))
    }
    const dpr = getDeviceScale()
    const width = Math.min(Math.round(baseWidth * dpr), 2400)
    const height = Math.round((width * 9) / 16)
    const variant: ThumbnailVariant = baseWidth >= 900 ? 'large' : 'default'
    const quality = variant === 'large' ? 0.9 : 0.8
    return { width, height, variant, quality }
  }, [currentPage, searchQuery, sortDirection, sortKey])

  const getThumbnailFileName = (variant: ThumbnailVariant) =>
    variant === 'large' ? 'thumbnail-large.jpg' : 'thumbnail.jpg'

  const generateThumbnail = useCallback(async (
    recording: LibraryRecording,
    videoPath: string,
    options: { width: number; height: number; quality: number; variant: ThumbnailVariant }
  ) => {
    return await ThumbnailGenerator.generateThumbnail(
      videoPath,
      `${recording.path}:${options.variant}`,
      {
        width: options.width,
        height: options.height,
        quality: options.quality,
        timestamp: 0.1
      }
    )
  }, [])

  const loadThumbnailFromDisk = useCallback(async (projectDir: string, variant: ThumbnailVariant) => {
    if (!window.electronAPI?.fileExists || !window.electronAPI?.loadImageAsDataUrl) return null
    const thumbnailPath = `${projectDir}/${getThumbnailFileName(variant)}`
    const exists = await window.electronAPI.fileExists(thumbnailPath)
    if (!exists) return null
    return await window.electronAPI.loadImageAsDataUrl(thumbnailPath)
  }, [])

  const saveThumbnailToDisk = useCallback(async (projectDir: string, dataUrl: string, variant: ThumbnailVariant) => {
    if (!window.electronAPI?.saveRecording) return
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return
    try {
      const base64 = match[2]
      const binary = atob(base64)
      const len = binary.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      const thumbnailPath = `${projectDir}/${getThumbnailFileName(variant)}`
      await window.electronAPI.saveRecording(thumbnailPath, bytes.buffer)
    } catch (error) {
      console.warn('Failed to save thumbnail to disk:', error)
    }
  }, [])

  useEffect(() => {
    const pageStartIndex = (currentPage - 1) * pageSize
    const pageItems = displayedRecordings.map((rec, index) => ({
      rec,
      index: pageStartIndex + index
    }))
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

    const hydrateRecording = async (
      rec: LibraryRecording,
      options: HydrationOptions,
      index: number
    ) => {
      if (loadTokenRef.current !== token) return
      const existingHydration = hydrationRef.current[rec.path]
      const thumbSpec = resolveThumbnailSpec(index)
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
                    setHydration(rec.path, { projectInfo: info })
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

                    if (loadTokenRef.current === token && total > 0) {
                      setHydration(rec.path, { mediaFileSize: total })
                    }
                  } catch (e) {
                    console.log('Could not get media size:', e)
                  }
                }

                if (!thumb) {
                  try {
                    const savedThumbnail = await loadThumbnailFromDisk(projectDir, thumbSpec.variant)
                    if (loadTokenRef.current !== token) return
                    if (savedThumbnail) {
                      thumb = savedThumbnail
                    } else if (videoPath) {
                      const thumbnailUrl = await generateThumbnail(rec, videoPath, {
                        width: thumbSpec.width,
                        height: thumbSpec.height,
                        quality: thumbSpec.quality,
                        variant: thumbSpec.variant
                      })
                      if (loadTokenRef.current !== token) return
                      if (thumbnailUrl) {
                        thumb = thumbnailUrl
                        await saveThumbnailToDisk(projectDir, thumbnailUrl, thumbSpec.variant)
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
              setHydration(rec.path, hydrationUpdate)
            }
          }
        }
      } catch (e) {
        console.error('Failed to hydrate recording:', rec.path, e)
      }
    }

    const run = async () => {
      await runWithConcurrency<{ rec: LibraryRecording; index: number }>(
        needsHydration,
        4,
        ({ rec, index }) => hydrateRecording(rec, { includeMediaSize: true }, index)
      )
      if (loadTokenRef.current === token) {
        setIsPageHydrating(false)
      }

      if (loadTokenRef.current === token) {
        const start = currentPage * pageSize
        const end = start + pageSize
        const nextItems = recordingsRef.current.slice(start, end).map((rec, index) => ({
          rec,
          index: start + index
        }))
        if (nextItems.length > 0) {
          await runWithConcurrency<{ rec: LibraryRecording; index: number }>(
            nextItems,
            3,
            ({ rec, index }) => hydrateRecording(rec, { includeMediaSize: false }, index)
          )
        }
      }
    }

    run().catch((error) => {
      console.error('Failed to hydrate recordings page:', error)
    })
  }, [
    pageKey,
    currentPage,
    pageSize,
    setHydration,
    generateThumbnail,
    loadThumbnailFromDisk,
    saveThumbnailToDisk,
    runWithConcurrency,
    displayedRecordings,
    resolveThumbnailSpec,
    searchQuery,
    sortKey,
    sortDirection
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
        setCurrentPage(1)
      }
    } catch (error) {
      console.error('Failed to load recordings:', error)
    } finally {
      setLoading(false)
    }
  }, [recordings, loading, setRecordings, setCurrentPage])

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

  useEffect(() => {
    // If listings change (due to filter/sort) and we are on an invalid page, reset to page 1
    // or clamp to last page.
    if (filteredAndSortedRecordings.length === 0 && currentPage !== 1) {
      setCurrentPage(1)
      return
    }
    const safePage = Math.min(Math.max(1, currentPage), totalPages)
    if (safePage !== currentPage) {
      setCurrentPage(safePage)
    }
  }, [pageSize, filteredAndSortedRecordings.length, currentPage, setCurrentPage, totalPages])

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
      project.modifiedAt = new Date().toISOString()

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

  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages

  const handlePrevPage = () => {
    if (canPrev) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (canNext) {
      setCurrentPage(currentPage + 1)
    }
  }

  return {
    searchQuery,
    setSearchQuery,
    sortKey,
    sortDirection,
    setSort,

    recordings: filteredAndSortedRecordings,
    displayedRecordings: displayedRecordingsHydrated,
    currentPage,
    totalPages,
    loading,
    loadRecordings,
    showHydrationIndicator,
    handlePrevPage,
    handleNextPage,
    canPrev,
    canNext,
    pendingDelete,
    setPendingDelete,
    handleDeleteRecording,
    handleRenameRecording,
    handleDuplicateRecording,
    totalRecordingsCount: recordings.length,
  }
}
