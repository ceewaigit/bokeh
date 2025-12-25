import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Project } from '@/types'
import { useRecordingsLibraryStore, type LibraryRecording, type LibraryRecordingHydration, type LibraryRecordingView } from '@/stores/recordings-library-store'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import { PROJECT_EXTENSION } from '@/lib/storage/recording-storage'
import { getProjectDir, isValidFilePath, resolveRecordingMediaPath } from '../utils/recording-paths'

interface HydrationOptions {
  includeMediaSize: boolean
}

export const useRecordingsLibraryData = (pageSize: number) => {
  const {
    recordings,
    hydrationByPath,
    currentPage,
    setRecordings,
    setCurrentPage,
    setHydration,
    removeRecording
  } = useRecordingsLibraryStore()

  const [loading, setLoading] = useState(false)
  const [isPageHydrating, setIsPageHydrating] = useState(false)
  const [showHydrationIndicator, setShowHydrationIndicator] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<LibraryRecordingView | null>(null)
  const loadTokenRef = useRef(0)
  const hydrationIndicatorTimeoutRef = useRef<number | null>(null)
  const recordingsRef = useRef(recordings)
  const hydrationRef = useRef(hydrationByPath)

  const displayedRecordings = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return recordings.slice(start, end)
  }, [recordings, currentPage, pageSize])
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

  const generateThumbnail = useCallback(async (recording: LibraryRecording, videoPath: string) => {
    return await ThumbnailGenerator.generateThumbnail(
      videoPath,
      recording.path,
      {
        width: 240,
        height: 135,
        quality: 0.5,
        timestamp: 0.1
      }
    )
  }, [])

  const loadThumbnailFromDisk = useCallback(async (projectDir: string) => {
    if (!window.electronAPI?.fileExists || !window.electronAPI?.loadImageAsDataUrl) return null
    const thumbnailPath = `${projectDir}/thumbnail.jpg`
    const exists = await window.electronAPI.fileExists(thumbnailPath)
    if (!exists) return null
    return await window.electronAPI.loadImageAsDataUrl(thumbnailPath)
  }, [])

  const saveThumbnailToDisk = useCallback(async (projectDir: string, dataUrl: string) => {
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
      const thumbnailPath = `${projectDir}/thumbnail.jpg`
      await window.electronAPI.saveRecording(thumbnailPath, bytes.buffer)
    } catch (error) {
      console.warn('Failed to save thumbnail to disk:', error)
    }
  }, [])

  useEffect(() => {
    const pageItems = displayedRecordings
    const needsHydration = pageItems.filter((rec) => {
      const hydration = hydrationRef.current[rec.path]
      return !hydration?.thumbnailUrl || !hydration?.projectInfo
    })
    if (needsHydration.length === 0) {
      setIsPageHydrating(false)
      return
    }
    const token = ++loadTokenRef.current
    setIsPageHydrating(true)

    const hydrateRecording = async (rec: LibraryRecording, options: HydrationOptions) => {
      if (loadTokenRef.current !== token) return
      const existingHydration = hydrationRef.current[rec.path]
      if (existingHydration?.thumbnailUrl && existingHydration?.projectInfo) return

      try {
        let info = existingHydration?.projectInfo
        let thumb = existingHydration?.thumbnailUrl

        if (!info || !thumb) {
          if (window.electronAPI?.readLocalFile) {
            const result = await window.electronAPI.readLocalFile(rec.path)
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
                const projectDir = getProjectDir(rec.path)
                const firstRecording = project.recordings[0]
                let videoPath = firstRecording.filePath

                if (!isValidFilePath(videoPath)) {
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
                    const savedThumbnail = await loadThumbnailFromDisk(projectDir)
                    if (loadTokenRef.current !== token) return
                    if (savedThumbnail) {
                      thumb = savedThumbnail
                    } else {
                      const thumbnailUrl = await generateThumbnail(rec, videoPath)
                      if (loadTokenRef.current !== token) return
                      if (thumbnailUrl) {
                        thumb = thumbnailUrl
                        void saveThumbnailToDisk(projectDir, thumbnailUrl)
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
            if (thumb) hydrationUpdate.thumbnailUrl = thumb
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
      await runWithConcurrency<LibraryRecording>(needsHydration, 4, (rec) => hydrateRecording(rec, { includeMediaSize: true }))
      setIsPageHydrating(false)

      if (loadTokenRef.current === token) {
        const start = currentPage * pageSize
        const end = start + pageSize
        const nextItems = recordingsRef.current.slice(start, end)
        if (nextItems.length > 0) {
          void runWithConcurrency<LibraryRecording>(nextItems, 3, (rec) => hydrateRecording(rec, { includeMediaSize: false }))
        }
      }
    }

    run()
  }, [
    pageKey,
    currentPage,
    pageSize,
    setHydration,
    generateThumbnail,
    loadThumbnailFromDisk,
    saveThumbnailToDisk,
    runWithConcurrency
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
  }, [])

  useEffect(() => {
    if (recordings.length === 0) return
    const totalPages = Math.max(1, Math.ceil(recordings.length / pageSize))
    const safePage = Math.min(Math.max(1, currentPage), totalPages)
    if (safePage !== currentPage) {
      setCurrentPage(safePage)
    }
  }, [pageSize, recordings, currentPage, setCurrentPage])

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

  const totalPages = Math.max(1, Math.ceil(recordings.length / pageSize))
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
    recordings,
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
    handleDeleteRecording
  }
}
