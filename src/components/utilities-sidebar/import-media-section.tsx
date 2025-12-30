import React, { useState, useRef, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { Upload, Film, Music, Loader2, Check, X, Trash2, Plus, Camera, Library } from 'lucide-react'
import { cn, formatTime } from '@/shared/utils/utils'
import { useProjectStore } from '@/stores/project-store'
import { toast } from 'sonner'
import { TrackType, type Project, type Recording, type RecordingMetadata, type Clip } from '@/types/project'
import { addAssetRecording } from '@/features/timeline/timeline-operations'
import { useAssetLibraryStore, type Asset } from '@/stores/asset-library-store'
import { getVideoMetadataFromPath } from '@/shared/utils/video-metadata'
import { SUPPORTED_PROJECT_EXTENSIONS } from '@/lib/storage/recording-storage'
import { ThumbnailGenerator } from '@/shared/utils/thumbnail-generator'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useRecordingsLibraryData } from '@/components/recordings-library/hooks/use-recordings-library-data'
import { LibrarySearch } from '@/components/recordings-library/components/library-search'
import { LibrarySort } from '@/components/recordings-library/components/library-sort'
import { RecordingsGrid } from '@/components/recordings-library/components/recordings-grid'
import { type LibraryRecordingView } from '@/stores/recordings-library-store'
import { getProjectDir, getProjectFilePath, isValidFilePath, resolveRecordingMediaPath, createVideoStreamUrl } from '@/components/recordings-library/utils/recording-paths'
import { ProjectIOService } from '@/lib/storage/project-io-service'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { CommandExecutor } from '@/lib/commands/base/CommandExecutor'
import { ImportRecordingCommand } from '@/lib/commands/timeline/ImportRecordingCommand'

const EMPTY_METADATA: RecordingMetadata = {
    mouseEvents: [],
    keyboardEvents: [],
    clickEvents: [],
    scrollEvents: [],
    screenEvents: [],
}

// --- Metadata Helpers ---

async function getAudioMetadata(filePath: string): Promise<{ duration: number }> {
    return new Promise((resolve, reject) => {
        const audio = document.createElement('audio')
        audio.preload = 'metadata'
        audio.onloadedmetadata = () => {
            const duration = audio.duration * 1000
            URL.revokeObjectURL(audio.src)
            resolve({ duration })
        }
        audio.onerror = () => {
            URL.revokeObjectURL(audio.src)
            reject(new Error('Failed to load audio metadata'))
        }
        audio.src = createVideoStreamUrl(filePath) || filePath
    })
}

async function getImageMetadata(filePath: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => {
            resolve({ width: img.naturalWidth, height: img.naturalHeight })
            URL.revokeObjectURL(img.src)
        }
        img.onerror = () => {
            URL.revokeObjectURL(img.src)
            reject(new Error('Failed to load image metadata'))
        }
        img.src = createVideoStreamUrl(filePath) || filePath
    })
}

const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']
const SUPPORTED_AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac']
const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff']

function getMediaType(filename: string): 'video' | 'audio' | 'project' | 'image' | null {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    if (SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) return 'video'
    if (SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) return 'audio'
    if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) return 'image'
    if (SUPPORTED_PROJECT_EXTENSIONS.includes(ext)) return 'project'
    return null
}

interface IngestQueueItem {
    id: string
    file: File
    status: 'pending' | 'processing' | 'success' | 'error'
    error?: string
}

// --- AssetItem Component ---

interface AssetItemProps {
    asset: Asset
    onAdd: (asset: Asset, trackType?: TrackType.Video | TrackType.Webcam) => void
    onRemove: (id: string) => void
    setDraggingAsset: (asset: Asset | null) => void
}

const AssetItem = React.memo(({ asset, onAdd, onRemove, setDraggingAsset }: AssetItemProps) => {
    const [thumbnail, setThumbnail] = useState<string | null>(null)
    const [isHovered, setIsHovered] = useState(false)
    const [isLoadingThumb, setIsLoadingThumb] = useState(false)

    // Load thumbnail for video
    useEffect(() => {
        if (asset.type !== 'video') return

        const cacheKey = `thumb-${asset.id}-${asset.path}`
        const cached = ThumbnailGenerator.getCachedThumbnail(cacheKey)
        if (cached) {
            setThumbnail(cached)
            return
        }

        let mounted = true
        setIsLoadingThumb(true)

        ThumbnailGenerator.generateThumbnail(asset.path, cacheKey, { width: 200, height: 200 })
            .then(data => {
                if (mounted && data) setThumbnail(data)
            })
            .finally(() => {
                if (mounted) setIsLoadingThumb(false)
            })

        return () => { mounted = false }
    }, [asset.id, asset.path, asset.type])

    const handleDragStart = (e: React.DragEvent) => {
        setDraggingAsset(asset);
        const assetData = {
            path: asset.path,
            duration: asset.metadata.duration || 0,
            width: asset.metadata.width || 0,
            height: asset.metadata.height || 0,
            type: asset.type,
            name: asset.name
        };
        e.dataTransfer.setData('application/x-bokeh-asset', JSON.stringify(assetData));
        e.dataTransfer.effectAllowed = 'copy';
    }

    const handleAddVideo = (e?: React.MouseEvent | Event) => {
        e?.stopPropagation()
        onAdd(asset, TrackType.Video)
    }

    const handleAddWebcam = (e?: React.MouseEvent | Event) => {
        e?.stopPropagation()
        onAdd(asset, TrackType.Webcam)
    }

    return (
        <div
            draggable={true}
            onDragStart={handleDragStart}
            onDragEnd={() => setDraggingAsset(null)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="group relative aspect-square rounded-md overflow-hidden border border-border/40 bg-muted/10 hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing"
            onClick={() => onAdd(asset)}
        >
            {asset.type === 'image' ? (
                <Image
                    src={createVideoStreamUrl(asset.path) || asset.path}
                    className="object-cover"
                    alt={asset.name}
                    fill
                    unoptimized
                />
            ) : asset.type === 'video' ? (
                <div className="w-full h-full bg-black relative">
                    {/* Video Player (only on hover) */}
                    {isHovered ? (
                        <video
                            src={createVideoStreamUrl(asset.path) || asset.path}
                            className="w-full h-full object-cover"
                            autoPlay
                            muted
                            loop
                            playsInline
                        />
                    ) : (
                        /* Thumbnail Image */
                        thumbnail ? (
                            <Image
                                src={thumbnail}
                                className="object-cover opacity-80"
                                alt={asset.name}
                                fill
                                unoptimized
                            />
                        ) : (
                            /* Loading / Fallback placeholder */
                            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                                {isLoadingThumb ? (
                                    <Loader2 className="w-5 h-5 animate-spin text-white/30" />
                                ) : (
                                    <Film className="w-8 h-8 text-white/20" />
                                )}
                            </div>
                        )
                    )}

                    {/* Overlay Icon (only when not playing) */}
                    {!isHovered && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <Film className="w-6 h-6 text-white/50" />
                        </div>
                    )}

                    {asset.metadata.duration && (
                        <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-mono text-white pointer-events-none">
                            {formatTime(asset.metadata.duration)}
                        </div>
                    )}
                </div>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-muted/20">
                    <Music className="w-8 h-8 text-muted-foreground/60 mb-2" />
                    <span className="text-[11px] text-muted-foreground line-clamp-2 break-all leading-tight">{asset.name}</span>
                </div>
            )}

            {/* Hover Actions */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                {asset.type === 'video' ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className="rounded-md bg-white/10 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20 pointer-events-auto"
                                title="Add to Project"
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="center"
                            side="bottom"
                            className="text-xs"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <DropdownMenuItem onSelect={handleAddVideo}>
                                <Film className="h-3.5 w-3.5" />
                                Add as video
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={handleAddWebcam}>
                                <Camera className="h-3.5 w-3.5" />
                                Add as webcam
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <button
                        className="rounded-md bg-white/10 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20 pointer-events-auto"
                        title="Add to Project"
                        onClick={(e) => {
                            e.stopPropagation()
                            onAdd(asset)
                        }}
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemove(asset.id)
                    }}
                    className="rounded-md bg-red-500/20 p-1.5 text-red-200 backdrop-blur-sm transition-colors hover:bg-red-500/40 pointer-events-auto"
                    title="Remove from Library"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
})

AssetItem.displayName = 'AssetItem'

export function ImportMediaSection() {
    const [isDragOver, setIsDragOver] = useState(false)
    const [ingestQueue, setIngestQueue] = useState<IngestQueueItem[]>([])
    const [isLibraryDialogOpen, setIsLibraryDialogOpen] = useState(false)
    const ingestCleanupTimeoutRef = useRef<number | null>(null)

    // Asset Library Store
    const assets = useAssetLibraryStore((s) => s.assets)
    const addAsset = useAssetLibraryStore((s) => s.addAsset)
    const removeAsset = useAssetLibraryStore((s) => s.removeAsset)
    const setDraggingAsset = useAssetLibraryStore((s) => s.setDraggingAsset)

    const fileInputRef = useRef<HTMLInputElement>(null)

    const currentProject = useProjectStore((s) => s.currentProject)
    const updateProjectData = useProjectStore((s) => s.updateProjectData)

    const {
        searchQuery,
        setSearchQuery,
        sortKey,
        sortDirection,
        setSort,
        recordings: libraryRecordings,
        displayedRecordings,
        currentPage,
        totalPages,
        loading: libraryLoading,
        loadRecordings,
        showHydrationIndicator,
        handlePrevPage,
        handleNextPage,
        canPrev,
        canNext
    } = useRecordingsLibraryData(18)

    useEffect(() => {
        return () => {
            if (ingestCleanupTimeoutRef.current !== null) {
                window.clearTimeout(ingestCleanupTimeoutRef.current)
                ingestCleanupTimeoutRef.current = null
            }
        }
    }, [])

    // --- Asset Ingestion Logic ---

    const ingestFile = useCallback(async (file: File) => {
        const type = getMediaType(file.name)
        if (!type || type === 'project') return

        const path = (file as File & { path?: string }).path || file.name
        const assetId = `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        try {
            let metadata: { width?: number; height?: number; duration?: number } = {}

            if (type === 'video') {
                const vidMeta = await getVideoMetadataFromPath(path)
                metadata = {
                    width: vidMeta.width,
                    height: vidMeta.height,
                    duration: vidMeta.duration
                }
            } else if (type === 'image') {
                const imgMeta = await getImageMetadata(path)
                metadata = {
                    width: imgMeta.width,
                    height: imgMeta.height,
                    duration: 5000
                }
            } else if (type === 'audio') {
                const audioMeta = await getAudioMetadata(path)
                metadata = {
                    duration: audioMeta.duration
                }
            }

            const asset: Asset = {
                id: assetId,
                type,
                path,
                name: file.name,
                timestamp: Date.now(),
                metadata
            }

            addAsset(asset)
        } catch (error) {
            console.error('Failed to ingest file:', error)
            throw error
        }
    }, [addAsset])


    const processFiles = useCallback(async (files: FileList | File[]) => {
        const fileArray = Array.from(files)
        const validFiles = fileArray.filter(file => {
            const mediaType = getMediaType(file.name)
            return mediaType !== null && mediaType !== 'project'
        })

        if (validFiles.length === 0) {
            const projectFiles = fileArray.filter(file => getMediaType(file.name) === 'project')
            if (projectFiles.length > 0) {
                toast.error('Project import requires using the Project Manager or dedicated import dialog')
                return
            }

            toast.error('No supported media files found')
            return
        }

        const newItems: IngestQueueItem[] = validFiles.map(file => ({
            id: `ingest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            file,
            status: 'pending'
        }))

        setIngestQueue(prev => [...prev, ...newItems])

        for (const item of newItems) {
            setIngestQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'processing' } : i))
            try {
                await ingestFile(item.file)
                setIngestQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'success' } : i))
            } catch (error) {
                setIngestQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: String(error) } : i))
            }
        }

        if (ingestCleanupTimeoutRef.current !== null) {
            window.clearTimeout(ingestCleanupTimeoutRef.current)
        }
        ingestCleanupTimeoutRef.current = window.setTimeout(() => {
            setIngestQueue(prev => prev.filter(i => i.status !== 'success'))
        }, 2000)

    }, [ingestFile])

    const handleImportFromLibrary = useCallback(async (recording: LibraryRecordingView) => {
        if (!currentProject) {
            toast.error('Open a project to add a recording')
            return
        }

        try {
            const sourceProject = await ProjectIOService.loadProject(recording.path)
            const sourceRecordings = (sourceProject.recordings ?? []).filter(rec => rec.sourceType === 'video')
            const sourceEffects = sourceProject.timeline.effects ?? []
            const sourceClips = sourceProject.timeline.tracks.flatMap(track => track.clips)

            if (sourceRecordings.length === 0) {
                toast.error('No video recordings found in this library item')
                return
            }

            const projectFilePath = await getProjectFilePath(recording.path, window.electronAPI?.fileExists)
            const projectDir = getProjectDir(recording.path, projectFilePath)
            const toImport: Array<{
                recording: Recording
                trackType: TrackType
                sourceClip?: Clip
            }> = []
            let missingMetadataCount = 0

            for (const rec of sourceRecordings) {
                if (!rec.filePath || !isValidFilePath(rec.filePath)) continue

                const cloned = structuredClone(rec) as Recording
                if (!cloned.filePath) continue
                const sourceId = cloned.id
                const sourceClip = sourceClips
                    .filter(clip => clip.recordingId === sourceId)
                    .sort((a, b) => a.startTime - b.startTime)[0]

                const resolvedPath = await resolveRecordingMediaPath({
                    projectDir,
                    filePath: cloned.filePath,
                    recordingId: sourceId,
                    fileExists: window.electronAPI?.fileExists
                })

                if (!resolvedPath) continue
                cloned.filePath = resolvedPath

                if (cloned.folderPath && !cloned.folderPath.startsWith('/')) {
                    cloned.folderPath = `${projectDir}/${cloned.folderPath}`
                }

                if (!cloned.folderPath || !cloned.metadataChunks) {
                    cloned.metadata = cloned.metadata ?? EMPTY_METADATA
                    missingMetadataCount += 1
                } else if (!cloned.metadata) {
                    try {
                        cloned.metadata = await RecordingStorage.loadMetadataChunks(cloned.folderPath, cloned.metadataChunks)
                    } catch (error) {
                        console.warn('Failed to load recording metadata during import:', error)
                    }
                }

                if (cloned.metadata && cloned.captureArea && !cloned.metadata.captureArea) {
                    cloned.metadata = { ...cloned.metadata, captureArea: cloned.captureArea }
                }

                if (!cloned.effects) {
                    cloned.effects = []
                }

                cloned.id = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                if (cloned.metadata) {
                    RecordingStorage.setMetadata(cloned.id, cloned.metadata)
                }

                const isWebcam = sourceId.startsWith('webcam-') || cloned.filePath.includes('/webcam-')
                const trackType = isWebcam ? TrackType.Webcam : TrackType.Video
                toImport.push({ recording: cloned, trackType, sourceClip })
            }

            if (toImport.length === 0) {
                toast.error('No importable recordings found in this library item')
                return
            }

            if (!CommandExecutor.isInitialized()) {
                toast.error('Undo/redo is unavailable right now')
                return
            }

            const executor = CommandExecutor.getInstance()
            if (toImport.length > 1) {
                executor.beginGroup('import-recordings')
            }

            for (const entry of toImport) {
                const result = await executor.execute(ImportRecordingCommand, {
                    recording: entry.recording,
                    trackType: entry.trackType,
                    sourceClip: entry.sourceClip,
                    sourceEffects
                })
                if (!result.success) {
                    const errorMessage = result.error instanceof Error ? result.error.message : result.error
                    throw new Error(errorMessage || 'Failed to import recording')
                }
            }

            if (toImport.length > 1) {
                await executor.endGroup()
            }

            const importedCount = toImport.length
            toast.success(`Added ${importedCount} recording${importedCount === 1 ? '' : 's'} to your timeline`)
            if (missingMetadataCount > 0) {
                toast.warning(`Imported ${missingMetadataCount} clip${missingMetadataCount === 1 ? '' : 's'} without metadata`)
            }
        } catch (error) {
            console.error('Failed to import from library:', error)
            toast.error('Failed to import from library')
        }
    }, [currentProject])

    // --- Add Asset To Project Logic ---

    const addAssetToProject = useCallback(async (asset: Asset, trackType?: TrackType.Video | TrackType.Webcam) => {
        if (!currentProject) {
            toast.error('Open a project to add media')
            return
        }

        if (window.electronAPI?.fileExists) {
            const exists = await window.electronAPI.fileExists(asset.path)
            if (!exists) {
                toast.error(`File not found: ${asset.path}`)
                return
            }
        }

        updateProjectData((project: Project) => {
            const updatedProject = { ...project }
            const targetTrackType = asset.type === 'video' ? trackType : undefined
            addAssetRecording(updatedProject, {
                path: asset.path,
                duration: asset.metadata.duration || 0,
                width: asset.metadata.width || 0,
                height: asset.metadata.height || 0,
                type: asset.type as 'video' | 'audio' | 'image',
                name: asset.name
            }, targetTrackType ? { trackType: targetTrackType } : undefined)
            return updatedProject
        })
    }, [currentProject, updateProjectData])


    // --- Drag & Drop Handlers ---
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
        if (e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files)
        }
    }, [processFiles])

    const handleBrowse = useCallback(async () => {
        if (!window.electronAPI?.showOpenDialog) return
        try {
            const result = await window.electronAPI.showOpenDialog({
                properties: ['openFile', 'multiSelections'],
                filters: [{ name: 'Media', extensions: [...SUPPORTED_VIDEO_EXTENSIONS, ...SUPPORTED_AUDIO_EXTENSIONS, ...SUPPORTED_IMAGE_EXTENSIONS] }]
            })
            if (!result.canceled && result.filePaths.length > 0) {
                const fakeFiles = result.filePaths.map(path => ({
                    name: path.split('/').pop() || 'unknown',
                    path: path
                } as unknown as File))
                processFiles(fakeFiles as any)
            }
        } catch (e) {
            console.error(e)
        }
    }, [processFiles])

    const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files)
        }
        e.target.value = ''
    }, [processFiles])


    // --- Pagination ---
    const PAGE_SIZE = 20
    const [page, setPage] = useState(1)

    const visibleAssets = assets.slice(0, page * PAGE_SIZE)
    const hasMore = assets.length > visibleAssets.length

    const handleLoadMore = () => {
        setPage(prev => prev + 1)
    }

    return (
        <>
            <Dialog open={isLibraryDialogOpen} onOpenChange={setIsLibraryDialogOpen}>
                <DialogContent className="max-w-5xl w-[min(92vw,1100px)] p-0 gap-0 overflow-hidden">
                    <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/50">
                        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Library className="h-4 w-4" />
                            </span>
                            Import from Library
                        </DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground">
                            Choose a recording to add it directly to your timeline.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="px-5 py-3 border-b border-border/40 flex flex-wrap items-center justify-between gap-3 bg-muted/20">
                        <div className="flex items-center gap-3">
                            <LibrarySearch query={searchQuery} onQueryChange={setSearchQuery} />
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="rounded-full bg-muted/40 px-2 py-0.5 font-mono">
                                    {libraryRecordings.length}
                                </span>
                                recordings
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <LibrarySort sortKey={sortKey} sortDirection={sortDirection} onSortChange={setSort} />
                            <Button variant="outline" size="sm" onClick={() => loadRecordings(true)}>
                                Refresh
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-4 min-h-[320px] max-h-[65vh]">
                        {libraryLoading ? (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Loading recordings…
                            </div>
                        ) : libraryRecordings.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
                                <div className="mb-2 h-10 w-10 rounded-full bg-muted/40 flex items-center justify-center">
                                    <Film className="h-5 w-5" />
                                </div>
                                No recordings found yet.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-[11px] text-muted-foreground">
                                    Tip: Click a recording to add it as a full clip.
                                </p>
                                <RecordingsGrid
                                    recordings={displayedRecordings}
                                    gridCapacity={displayedRecordings.length}
                                    isExpandedLayout={true}
                                    onSelect={handleImportFromLibrary}
                                    showDeleteAction={false}
                                />
                                {showHydrationIndicator && (
                                    <div className="flex justify-center pt-2">
                                        <div className="bg-muted/60 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm border border-border/50">
                                            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                                            <span className="text-[10px] font-medium text-muted-foreground">Loading page…</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between">
                        <div className="text-[11px] text-muted-foreground">
                            Page {currentPage} of {totalPages}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" disabled={!canPrev} onClick={handlePrevPage}>
                                Previous
                            </Button>
                            <Button variant="outline" size="sm" disabled={!canNext} onClick={handleNextPage}>
                                Next
                            </Button>
                            <Button size="sm" onClick={() => setIsLibraryDialogOpen(false)}>
                                Done
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex flex-col h-full bg-transparent">
                {/* Import Drop Area */}
                <div className="p-2.5 bg-transparent shrink-0">
                    <button
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={handleBrowse}
                        className={cn(
                            "relative w-full text-left rounded-md transition-all duration-200 group bg-transparent",
                            "flex items-center gap-2.5 p-2.5",
                            "border border-border/50 hover:border-border/80 border-dashed",
                            isDragOver
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "hover:bg-muted/10",
                        )}
                    >
                        <div className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0",
                            isDragOver ? "bg-primary/20 text-primary" : "bg-muted/20 text-muted-foreground group-hover:text-foreground group-hover:scale-105"
                        )}>
                            <Upload className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[12px] font-semibold text-foreground/90">Import Media</p>
                            <p className="text-[11px] text-muted-foreground">Images, Videos, Audio</p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsLibraryDialogOpen(true)}
                        className={cn(
                            "mt-2 w-full rounded-md border border-border/50 text-left transition-all duration-200",
                            "flex items-center gap-2.5 p-2.5 bg-muted/10 hover:bg-muted/20 hover:border-border/70"
                        )}
                    >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted/30 text-muted-foreground">
                            <Library className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[12px] font-semibold text-foreground/90">From Library</p>
                            <p className="text-[11px] text-muted-foreground">Your recordings, ready to reuse</p>
                        </div>
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileInputChange}
                    />
                </div>

                {/* Ingest Progress */}
                {ingestQueue.length > 0 && (
                    <div className="px-2.5 pb-2 space-y-1 shrink-0">
                        {ingestQueue.map(item => (
                            <div key={item.id} className="flex items-center justify-between rounded bg-muted/20 px-2 py-1 text-[11px]">
                                <span className="truncate max-w-[150px]">{item.file.name}</span>
                                {item.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                                {item.status === 'success' && <Check className="w-3 h-3 text-green-500" />}
                                {item.status === 'error' && <X className="w-3 h-3 text-red-500" />}
                            </div>
                        ))}
                    </div>
                )}

                {/* Asset Library Grid */}
                <div className="flex-1 overflow-y-auto min-h-0 bg-transparent">
                    <div className="px-2.5 py-2 bg-transparent">
                        <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your Assets ({assets.length})</h3>

                        {assets.length === 0 ? (
                            <div className="text-center py-8 px-4 text-[11px] text-muted-foreground/50">
                                No imported assets yet.
                            </div>
                        ) : (
                            <div className="flex flex-col pb-10 gap-4">
                                <div className="grid grid-cols-2 gap-2">
                                    {visibleAssets.map(asset => (
                                        <AssetItem
                                            key={asset.id}
                                            asset={asset}
                                            onAdd={addAssetToProject}
                                            onRemove={removeAsset}
                                            setDraggingAsset={setDraggingAsset}
                                        />
                                    ))}
                                </div>

                                {hasMore && (
                                    <button
                                        onClick={handleLoadMore}
                                        className="w-full rounded-md bg-muted/10 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
                                    >
                                        Load More
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
