"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { Film, Play, Trash2, Layers, RefreshCw, Loader2, Video, Sparkles, ChevronLeft, ChevronRight, Info, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HeaderButton } from '@/components/ui/header-button'
import { formatDistanceToNow } from 'date-fns'
import { cn, formatTime } from '@/lib/utils'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import { type Project } from '@/types'
import { useRecordingsLibraryStore, type LibraryRecording, type LibraryProjectInfo } from '@/stores/recordings-library-store'
import { useRecordingSessionStore } from '@/stores/recording-session-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { AppearanceControls } from '@/components/topbar/appearance-controls'
import { WindowHeader } from '@/components/ui/window-header'
import { PROJECT_EXTENSION, PROJECT_EXTENSION_REGEX } from '@/lib/storage/recording-storage'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface RecordingsLibraryProps {
  onSelectRecording: (recording: LibraryRecording) => void | Promise<void>
}

export function RecordingsLibrary({ onSelectRecording }: RecordingsLibraryProps) {
  // Fixed pagination for predictable perf/memory.
  const PAGE_SIZE = 24
  const GRID_GAP_PX = 20 // `gap-5`

  const formatBytes = (bytes?: number) => {
    if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return ''
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = bytes
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex++
    }
    const precision = unitIndex === 0 ? 0 : unitIndex <= 2 ? 1 : 2
    return `${value.toFixed(precision)} ${units[unitIndex]}`
  }

  // Use store for persistent state
  const {
    allRecordings,
    recordings: displayedRecordings,
    currentPage,
    setAllRecordings,
    setRecordings: setDisplayedRecordings,
    setCurrentPage,
    updateRecording,
    removeRecording
  } = useRecordingsLibraryStore()
  const setSettingsOpen = useWorkspaceStore((s) => s.setSettingsOpen)
  const includeAppWindows = useRecordingSessionStore((state) => state.settings.includeAppWindows)
  const showRecordButtonOptions = includeAppWindows ? { hideMainWindow: false } : undefined

  const [loading, setLoading] = useState(false)
  const [isPageHydrating, setIsPageHydrating] = useState(false)
  const [showHydrationIndicator, setShowHydrationIndicator] = useState(false)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [headerEl, setHeaderEl] = useState<HTMLDivElement | null>(null)
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null)
  const [gridCapacity, setGridCapacity] = useState<number>(0)
  const [isExpandedLayout, setIsExpandedLayout] = useState(false)
  const loadTokenRef = useRef(0)
  const hydrationIndicatorTimeoutRef = useRef<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LibraryRecording | null>(null)

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

  const recomputeGridCapacity = useCallback(() => {
    if (!scrollEl || !gridEl) return

    const gridStyle = getComputedStyle(gridEl)
    const columns = Math.max(1, gridStyle.gridTemplateColumns.split(' ').filter(Boolean).length)
    const availableWidth = gridEl.clientWidth

    const headerHeight = headerEl?.offsetHeight ?? 0
    // `p-6` padding on the grid container: 24px top + 24px bottom.
    const availableHeight = Math.max(0, scrollEl.clientHeight - headerHeight - 48)

    const cardWidth = (availableWidth - GRID_GAP_PX * (columns - 1)) / columns
    const expandedLayout = availableHeight >= 980
    const detailsHeight = expandedLayout ? 72 : 0
    const cardHeight = (cardWidth * 9) / 16 + detailsHeight // `aspect-video` + details
    const rows = Math.max(1, Math.floor((availableHeight + GRID_GAP_PX) / (cardHeight + GRID_GAP_PX)))

    setGridCapacity(columns * rows)
    setIsExpandedLayout((prev) => (prev === expandedLayout ? prev : expandedLayout))
  }, [GRID_GAP_PX, gridEl, headerEl, scrollEl])

  const generateThumbnail = useCallback(async (recording: LibraryRecording, videoPath: string) => {
    return await ThumbnailGenerator.generateThumbnail(
      videoPath,
      recording.path,
      {
        // Good quality thumbnails - these are cached and reused
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

  const loadPage = useCallback(async (page: number, sourceRecordings: LibraryRecording[] = allRecordings) => {
    const start = (page - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE
    const pageItems = sourceRecordings.slice(start, end)

    setDisplayedRecordings(pageItems)
    setCurrentPage(page)

    // Hydrate visible items (thumbnails, metadata)
    const token = ++loadTokenRef.current
    setIsPageHydrating(true)

    const hydrateRecording = async (rec: LibraryRecording, options: { includeMediaSize: boolean }) => {
      if (loadTokenRef.current !== token) return
      // Skip if already hydrated
      if (rec.thumbnailUrl && rec.projectInfo) return

      try {
        // Load project info first (lightweight)
        let info = rec.projectInfo
        let thumb = rec.thumbnailUrl

        if (!info || !thumb) {
          if (window.electronAPI?.readLocalFile) {
            const result = await window.electronAPI.readLocalFile(rec.path)
            if (result?.success && result.data) {
              const projectData = new TextDecoder().decode(result.data as ArrayBuffer)
              const project: Project = JSON.parse(projectData)

              // Extract ONLY display-needed fields - DO NOT store full project
              const duration = project.timeline?.duration || project.recordings?.[0]?.duration || 0
              info = {
                name: project.name || rec.name,
                duration,
                width: project.recordings?.[0]?.width || 0,
                height: project.recordings?.[0]?.height || 0,
                recordingCount: project.recordings?.length || 0
              }

              // Enrich with actual video file size and thumbnails
              if (project?.recordings && project.recordings.length > 0) {
                const projectDir = rec.path.substring(0, rec.path.lastIndexOf('/'))
                let videoPath = project.recordings[0].filePath

                // Handle path resolution
                let exists = false
                if (videoPath.startsWith('/') && window.electronAPI?.fileExists) {
                  exists = await window.electronAPI.fileExists(videoPath)
                }

                // If absolute path doesn't exist (e.g. migration), try relative to project
                if (!exists) {
                  // Strip directory if it was absolute
                  const basename = videoPath.split('/').pop() || videoPath

                  // Try flat structure first
                  const flatPath = `${projectDir}/${basename}`
                  if (window.electronAPI?.fileExists && await window.electronAPI.fileExists(flatPath)) {
                    videoPath = flatPath
                  } else {
                    // Try nested structure (ProjectDir/RecordingID/Video.mov)
                    const recordingId = project.recordings[0].id
                    const nestedPath = `${projectDir}/${recordingId}/${basename}`
                    if (window.electronAPI?.fileExists && await window.electronAPI.fileExists(nestedPath)) {
                      videoPath = nestedPath
                    } else {
                      // Default to flat if neither found (will likely fail but valid fallback)
                      videoPath = flatPath
                    }
                  }
                }

                // Media size (best-effort): sum recording files (usually 1).
                if (options.includeMediaSize && !rec.mediaFileSize && window.electronAPI?.getFileSize) {
                  try {
                    let total = 0
                    for (const r of project.recordings) {
                      let p = r.filePath
                      if (!p) continue

                      // Path resolution fallback
                      const isAbsolute = p.startsWith('/')
                      let exists = false
                      if (isAbsolute && window.electronAPI?.fileExists) {
                        exists = await window.electronAPI.fileExists(p)
                      }

                      // If it fails or is relative, try resolving to project dir
                      if (!exists) {
                        const basename = p.split('/').pop() || p

                        // Try flat structure
                        const flatPath = `${projectDir}/${basename}`
                        let resolvedPath = flatPath

                        if (window.electronAPI?.fileExists) {
                          if (await window.electronAPI.fileExists(flatPath)) {
                            resolvedPath = flatPath
                          } else {
                            // Try nested structure
                            const nestedPath = `${projectDir}/${r.id}/${basename}`
                            if (await window.electronAPI.fileExists(nestedPath)) {
                              resolvedPath = nestedPath
                            }
                          }
                        }

                        if (window.electronAPI?.getFileSize) {
                          const stat = await window.electronAPI.getFileSize(resolvedPath)
                          if (stat?.success && stat.data?.size) total += stat.data.size
                        }
                      } else {
                        // If absolute path exists, use it directly
                        const stat = await window.electronAPI.getFileSize(p)
                        if (stat?.success && stat.data?.size) total += stat.data.size
                      }
                    }
                    if (loadTokenRef.current === token && total > 0) {
                      updateRecording(rec.path, { mediaFileSize: total })
                    }
                  } catch (e) {
                    console.log('Could not get media size:', e)
                  }
                }

                // Thumbnail generation
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

          // Update store with hydrated data
          if (info || thumb) {
            updateRecording(rec.path, { projectInfo: info, thumbnailUrl: thumb })
          }
        }
      } catch (e) {
        console.error('Failed to hydrate recording:', rec.path, e)
      }
    }

    await runWithConcurrency(pageItems, 4, (rec) => hydrateRecording(rec, { includeMediaSize: true }))
    setIsPageHydrating(false)
    if (loadTokenRef.current === token) {
      const start = page * PAGE_SIZE
      const end = start + PAGE_SIZE
      const nextItems = sourceRecordings.slice(start, end)
      if (nextItems.length > 0) {
        void runWithConcurrency(nextItems, 3, (rec) => hydrateRecording(rec, { includeMediaSize: false }))
      }
    }
  }, [PAGE_SIZE, allRecordings, setDisplayedRecordings, setCurrentPage, updateRecording, generateThumbnail, loadThumbnailFromDisk, saveThumbnailToDisk, runWithConcurrency])

  const loadRecordings = useCallback(async (forceReload = false) => {
    if (loading) return
    // If we have data and not forcing reload, just use it
    if (!forceReload && allRecordings.length > 0) {
      return
    }

    setLoading(true)
    try {
      if (window.electronAPI?.loadRecordings) {
        const files = await window.electronAPI.loadRecordings()
        const recordingsList: LibraryRecording[] = []

        // Create map of existing recordings to preserve hydrated data
        const existingMap = new Map(allRecordings.map(r => [r.path, r]))

        for (const file of files) {
          if (!file.path.endsWith(PROJECT_EXTENSION)) continue

          const existing = existingMap.get(file.path)

          const recording: LibraryRecording = {
            name: file.name,
            path: file.path,
            timestamp: new Date(file.timestamp),
            projectFileSize: file.size,
            // Preserve expensive hydrated data
            projectInfo: existing?.projectInfo,
            thumbnailUrl: existing?.thumbnailUrl,
            mediaFileSize: existing?.mediaFileSize
          }

          recordingsList.push(recording)
        }

        // Remove duplicates by path - keep latest by timestamp
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
        setAllRecordings(uniqueRecordings)

        // Reset to first page on reload
        loadPage(1, uniqueRecordings)
      }
    } catch (error) {
      console.error('Failed to load recordings:', error)
    } finally {
      setLoading(false)
    }
  }, [allRecordings, loading, loadPage, setAllRecordings])

  // Initial load + refresh listener.
  useEffect(() => {
    if (allRecordings.length === 0) {
      loadRecordings()
    }

    const handleRefresh = () => {
      loadRecordings(true)
    }

    const removeListener = window.electronAPI?.onRefreshLibrary?.(handleRefresh)
    return () => {
      removeListener?.()
    }
  }, []) // run once

  // Keep displayed page in sync with source list.
  useEffect(() => {
    if (allRecordings.length === 0) return
    const totalPages = Math.max(1, Math.ceil(allRecordings.length / PAGE_SIZE))
    const safePage = Math.min(Math.max(1, currentPage), totalPages)
    loadPage(safePage, allRecordings)
  }, [PAGE_SIZE, allRecordings, currentPage, loadPage])

  // Compute how many tiles fit in the viewport to render lightweight placeholders,
  // keeping the page visually filled without loading extra recordings.
  useEffect(() => {
    if (!scrollEl || !gridEl) return

    let rafId: number | null = null
    const schedule = () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = null
        recomputeGridCapacity()
      })
    }

    schedule()

    const ro = new ResizeObserver(schedule)
    ro.observe(scrollEl)
    ro.observe(gridEl)
    if (headerEl) ro.observe(headerEl)

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [gridEl, headerEl, recomputeGridCapacity, scrollEl])

  // Avoid blinking hydration indicator for quick thumbnail loads.
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

  // No cleanup on unmount - keep cache for fast navigation

  const totalPages = Math.max(1, Math.ceil(allRecordings.length / PAGE_SIZE))
  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages

  const handlePrevPage = () => {
    if (canPrev) {
      loadPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (canNext) {
      loadPage(currentPage + 1)
    }
  }

  const handleSelect = async (rec: LibraryRecording) => {
    // Pass recording path to workspace - project loaded there
    onSelectRecording(rec)
  }

  const handleDeleteRecording = async (rec: LibraryRecording) => {
    try {
      if (!window.electronAPI?.deleteRecordingProject) return
      const res = await window.electronAPI.deleteRecordingProject(rec.path)
      if (!res?.success) return

      // Drop from store immediately to release memory and update UI.
      removeRecording(rec.path)

      // Reload current page slice (keeps pagination consistent).
      const nextAll = useRecordingsLibraryStore.getState().allRecordings
      const nextTotalPages = Math.max(1, Math.ceil(nextAll.length / PAGE_SIZE))
      const nextPage = Math.min(currentPage, nextTotalPages)
      loadPage(nextPage, nextAll)
    } catch (e) {
      console.error('Failed to delete recording:', e)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-hidden bg-transparent">
        <div className="h-full overflow-y-scroll scrollbar-thin scrollbar-track-transparent">
          {/* Header skeleton */}
          <WindowHeader className="sticky top-0 z-30">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="h-5 w-24 bg-muted/40 rounded-md animate-pulse" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-24 bg-muted/40 rounded-md animate-pulse" />
              </div>
            </div>
          </WindowHeader>

          {/* Grid skeleton with animated cards */}
          <div className="p-6">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="group relative"
                  style={{ opacity: 1 - i * 0.05 }}
                >
                  <div className="relative rounded-2xl overflow-hidden bg-muted/5 border border-border/40">
                    <div className="aspect-video relative">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Film className="w-6 h-6 text-muted-foreground/10" />
                      </div>
                    </div>
                    <div className="p-3 space-y-2.5">
                      <div className="h-3.5 w-3/4 bg-muted/40 rounded animate-pulse" />
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-12 bg-muted/20 rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (allRecordings.length === 0) {
    return (
      <div className="flex-1 overflow-hidden bg-transparent">
        {/* Header */}
        <WindowHeader customDragRegions className="sticky top-0 z-20">
          {/* Left Section - Not draggable */}
          <div className="flex items-center gap-3 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-md">
              <Film className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="font-bold text-[10px] text-primary uppercase tracking-wider whitespace-nowrap">
                Library
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full ring-1 ring-border/20">
              <Layers className="w-3 h-3" />
              <span className="font-mono">0</span>
            </div>
          </div>

          {/* Center - Draggable spacer */}
          <div className="flex-1" />

          {/* Right Section - Not draggable */}
          <div className="flex items-center gap-2 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <HeaderButton
              variant="default"
              className="shadow-sm hover:shadow-md active:scale-95"
              onClick={() => window.electronAPI?.showRecordButton?.(showRecordButtonOptions)}
              icon={Video}
            >
              New Recording
            </HeaderButton>
            <AppearanceControls className="flex items-center gap-1 ml-1" />
          </div>
        </WindowHeader>

        {/* Modern Empty State */}
        <div className="flex-1 flex items-center justify-center p-8 min-h-[calc(100vh-48px)]">
          <div className="text-center max-w-md animate-in fade-in zoom-in-95 duration-500 fill-mode-forwards">
            <div className="relative inline-flex items-center justify-center mb-10 group">
              {/* Glowing background effect */}
              <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full opacity-50 group-hover:opacity-75 transition-opacity duration-1000" />

              {/* Icon Container */}
              <div className="relative z-10 w-24 h-24 rounded-[2rem] bg-gradient-to-b from-muted/20 to-muted/5 border border-white/10 backdrop-blur-xl flex items-center justify-center shadow-2xl ring-1 ring-white/5 group-hover:scale-105 transition-transform duration-500 ease-out">
                <Film className="w-10 h-10 text-white/80 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" strokeWidth={1.5} />

                {/* Decorative sparkle */}
                <Sparkles className="absolute -top-3 -right-3 w-6 h-6 text-primary animate-pulse duration-[3000ms]" strokeWidth={2} />
              </div>
            </div>

            <div className="space-y-4 mb-10">
              <h2 className="text-2xl font-bold bg-gradient-to-br from-white via-white/90 to-white/70 bg-clip-text text-transparent tracking-tight">
                Your library is empty
              </h2>
              <p className="text-sm text-muted-foreground/80 leading-relaxed font-medium">
                Start creating amazing screen recordings.<br />
                Your recordings will appear here automatically.
              </p>
            </div>

            <div className="flex flex-col gap-4 max-w-[200px] mx-auto">
              <HeaderButton
                variant="default"
                className="w-full h-11 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0"
                onClick={() => window.electronAPI?.showRecordButton?.(showRecordButtonOptions)}
                icon={Video}
              >
                Start Recording
              </HeaderButton>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden bg-transparent">
      <div
        ref={setScrollEl}
        className="h-full overflow-y-scroll scrollbar-thin scrollbar-track-transparent"
      >
        {/* header */}
        <WindowHeader ref={setHeaderEl} customDragRegions className="sticky top-0 z-30">
          {/* Left Section - Not draggable */}
          <div className="flex items-center gap-3 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-md">
              <Film className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="font-bold text-[10px] text-primary uppercase tracking-wider whitespace-nowrap">
                Library
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background backdrop-blur-xl px-2 py-0.5 rounded-full ring-1 ring-border/20">
              <Layers className="w-3 h-3" />
              <span className="font-mono">{allRecordings.length}</span>
            </div>
          </div>

          {/* Center - Draggable spacer */}
          <div className="flex-1" />

          {/* Right Section - Not draggable */}
          <div className="flex items-center gap-2 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* Pagination controls */}
            <div className="flex items-center gap-1 mr-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-muted/50"
                onClick={handlePrevPage}
                disabled={!canPrev}
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-[10px] text-muted-foreground font-mono w-12 text-center">
                {currentPage} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-muted/50"
                onClick={handleNextPage}
                disabled={!canNext}
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <HeaderButton
              variant="outline"
              className="bg-muted/20 hover:bg-muted/40 border border-border/40"
              onClick={() => loadRecordings(true)}
              tooltip="Refresh Library"
              icon={RefreshCw}
            >
              Refresh
            </HeaderButton>
            {/* <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs font-medium bg-muted/20 hover:bg-muted/40 border border-border/40"
              onClick={() => useWorkspaceStore.getState().setCurrentView('plugin-creator')}
              title="Plugin Creator"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Plugins
            </Button> */}
            <HeaderButton
              variant="default"
              className="shadow-sm hover:shadow"
              onClick={() => window.electronAPI?.showRecordButton?.(showRecordButtonOptions)}
              tooltip="New Recording"
              icon={Video}
            >
              New Recording
            </HeaderButton>
            <HeaderButton
              variant="outline"
              className="bg-muted/20 hover:bg-muted/40 border border-border/40"
              onClick={() => setSettingsOpen(true)}
              tooltip="Settings"
              icon={Settings2}
            >
              Settings
            </HeaderButton>
            <AppearanceControls className="flex items-center gap-1 ml-1" />
          </div>
        </WindowHeader>

        {/* Enhanced grid with better spacing */}
        <div className="p-6">
          <div
            ref={setGridEl}
            className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5"
          >
            <TooltipProvider delayDuration={250}>
              {displayedRecordings.map((recording: LibraryRecording) => {
                const displayName = recording.projectInfo?.name || recording.name.replace(/^Recording_/, '').replace(PROJECT_EXTENSION_REGEX, '')
                const relativeTime = formatDistanceToNow(recording.timestamp, { addSuffix: true })
                  .replace('about ', '')
                  .replace('less than ', '<')
                const hasDuration = (recording.projectInfo?.duration || 0) > 0
                const resolutionLabel =
                  recording.projectInfo?.width && recording.projectInfo?.height
                    ? `${recording.projectInfo.width}x${recording.projectInfo.height}`
                    : null
                const detailsButton = (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center justify-center rounded-md p-1",
                          isExpandedLayout
                            ? "text-muted-foreground/70 hover:text-foreground hover:bg-muted/30"
                            : "bg-black/35 border border-white/10 text-white/80 backdrop-blur-md hover:bg-black/50 hover:text-white",
                          "transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        )}
                        aria-label="Recording details"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="end" className="text-xs">
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">
                          {recording.projectInfo?.name || recording.name.replace(PROJECT_EXTENSION_REGEX, '')}
                        </div>
                        <div className="text-muted-foreground">
                          Created: {recording.timestamp.toLocaleString()}
                        </div>
                        {recording.projectInfo?.width && recording.projectInfo?.height && (
                          <div className="text-muted-foreground">
                            Resolution: <span className="font-mono">{recording.projectInfo.width}×{recording.projectInfo.height}</span>
                          </div>
                        )}
                        {hasDuration && (
                          <div className="text-muted-foreground">
                            Duration: <span className="font-mono">{formatTime(recording.projectInfo?.duration || 0)}</span>
                          </div>
                        )}
                        {recording.mediaFileSize && (
                          <div className="text-muted-foreground">
                            Metadata: <span className="font-mono">{formatBytes(recording.mediaFileSize)}</span>
                          </div>
                        )}
                        {recording.projectFileSize && (
                          <div className="text-muted-foreground">
                            Project: <span className="font-mono">{formatBytes(recording.projectFileSize)}</span>
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )

                return (
                  <div
                    key={recording.path}
                    className="group relative animate-in fade-in duration-150"
                    data-library-card="true"
                  >
                    <div
                      className={cn(
                        "relative rounded-2xl overflow-hidden cursor-pointer",
                        "bg-muted/10 border border-border/40 shadow-sm",
                        "transition-transform transition-shadow duration-150 ease-out",
                        "hover:shadow-xl hover:ring-1 hover:ring-primary/20 hover:-translate-y-1"
                      )}
                      onClick={() => handleSelect(recording)}
                    >
                      {/* Enhanced thumbnail with loading state */}
                      <div className="aspect-video relative bg-muted/10 overflow-hidden">
                        {recording.thumbnailUrl ? (
                          <>
                            <img
                              src={recording.thumbnailUrl}
                              alt={recording.name}
                              className="w-full h-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
                              loading="lazy"
                            />
                            {/* Subtle gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                          </>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="relative">
                              <Film className="w-8 h-8 text-muted-foreground/20" />
                            </div>
                          </div>
                        )}

                        {/* Enhanced play button on hover */}
                        <div
                          className={cn(
                            "absolute inset-0 flex items-center justify-center",
                            "opacity-0 bg-black/10 backdrop-blur-[1px] transition-opacity duration-150",
                            "group-hover:opacity-100"
                          )}
                        >
                          <div className="w-12 h-12 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg transform scale-95 group-hover:scale-100 transition-transform duration-150 ease-out">
                            <Play className="w-5 h-5 text-black ml-0.5" fill="currentColor" />
                          </div>
                        </div>

                        {/* Bottom overlay (compact layout only) */}
                        {!isExpandedLayout && (
                          <div className="absolute inset-x-0 bottom-0">
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            <div className="relative p-2.5">
                              <div className="flex items-end justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="font-semibold text-xs text-white truncate drop-shadow-sm">
                                    {displayName}
                                  </h3>
                                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/70">
                                    {hasDuration && (
                                      <span className="font-mono px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-white/80">
                                        {formatTime(recording.projectInfo?.duration || 0)}
                                      </span>
                                    )}
                                    <span className="truncate">{relativeTime}</span>
                                    {recording.mediaFileSize && (
                                      <span className="ml-auto font-mono px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-white/70 whitespace-nowrap">
                                        {formatBytes(recording.mediaFileSize)}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {detailsButton}
                              </div>
                            </div>
                          </div>
                        )}

                        {isExpandedLayout && hasDuration && (
                          <div className="absolute bottom-2 right-2">
                            <span className="font-mono px-1.5 py-0.5 rounded-md bg-black/60 border border-white/10 text-[10px] text-white/85">
                              {formatTime(recording.projectInfo?.duration || 0)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Expanded details (spacious layout) */}
                      {isExpandedLayout && (
                        <div className="flex items-start justify-between gap-3 px-3 pt-2.5 pb-3">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-[13px] text-foreground truncate">
                              {displayName}
                            </h3>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="truncate">{relativeTime}</span>
                              {resolutionLabel && (
                                <span className="font-mono text-muted-foreground/80">{resolutionLabel}</span>
                              )}
                              {recording.mediaFileSize && (
                                <span className="font-mono text-muted-foreground/80 whitespace-nowrap">
                                  {formatBytes(recording.mediaFileSize)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-muted-foreground">
                            {detailsButton}
                          </div>
                        </div>
                      )}

                      {/* Enhanced action buttons */}
                      <div
                        className={cn(
                          "absolute top-2 right-2",
                          "opacity-0 -translate-y-1 transition-all duration-150 ease-out",
                          "group-hover:opacity-100 group-hover:translate-y-0"
                        )}
                      >
                        <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-lg p-1 shadow-lg border border-white/10">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-6 h-6 p-0 hover:bg-red-500/80 hover:text-white text-white/80 rounded-md"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPendingDelete(recording)
                            }}
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Lightweight placeholders to visually fill the viewport without loading more items */}
              {Array.from({
                length: Math.max(0, Math.min(12, gridCapacity - displayedRecordings.length))
              }).map((_, i) => (
                <div
                  key={`placeholder-${i}`}
                  aria-hidden="true"
                  className="relative rounded-2xl overflow-hidden bg-muted/5 border border-border/20"
                >
                  <div className="aspect-video relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-muted/10 via-transparent to-muted/5" />
                  </div>
                  {isExpandedLayout && (
                    <div className="min-h-[72px] px-3 pt-2.5 pb-3">
                      <div className="h-3.5 w-2/3 bg-muted/15 rounded" />
                      <div className="mt-2 h-2.5 w-3/5 bg-muted/10 rounded" />
                    </div>
                  )}
                </div>
              ))}
            </TooltipProvider>
          </div>

          {showHydrationIndicator && (
            <div className="mt-4 flex justify-center">
              <div className="bg-muted/60 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm border border-border/50">
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                <span className="text-[10px] font-medium text-muted-foreground">Loading page…</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete recording
            </DialogTitle>
            <DialogDescription>
              This can’t be undone. The project and its media will be removed from disk.
            </DialogDescription>
          </DialogHeader>
          {pendingDelete && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-sm font-medium text-foreground truncate">
                {pendingDelete.projectInfo?.name || pendingDelete.name.replace(PROJECT_EXTENSION_REGEX, '')}
              </div>
              <div className="mt-1 text-xs text-muted-foreground font-mono break-all max-h-10 overflow-hidden">
                {pendingDelete.path.split(/[\\/]/).slice(-3).join('/')}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} autoFocus>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!pendingDelete) return
                const rec = pendingDelete
                setPendingDelete(null)
                await handleDeleteRecording(rec)
              }}
              disabled={!window.electronAPI?.deleteRecordingProject}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
