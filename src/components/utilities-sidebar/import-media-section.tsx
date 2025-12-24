import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Film, Music, Loader2, Check, X, Trash2, Plus } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import { useProjectStore } from '@/stores/project-store'
import { toast } from 'sonner'
import type { Project } from '@/types/project'
import { addAssetRecording } from '@/lib/timeline/timeline-operations'
import { useAssetLibraryStore, type Asset } from '@/stores/asset-library-store'
import { getVideoMetadataFromPath } from '@/lib/utils/video-metadata'
import { SUPPORTED_PROJECT_EXTENSIONS } from '@/lib/storage/recording-storage'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'

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
        audio.src = `video-stream://local/${encodeURIComponent(filePath)}`
    })
}

async function getImageMetadata(filePath: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
            resolve({ width: img.naturalWidth, height: img.naturalHeight })
            URL.revokeObjectURL(img.src)
        }
        img.onerror = () => {
            URL.revokeObjectURL(img.src)
            reject(new Error('Failed to load image metadata'))
        }
        img.src = `video-stream://local/${encodeURIComponent(filePath)}`
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
    onAdd: (asset: Asset) => void
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

    return (
        <div
            draggable={true}
            onDragStart={handleDragStart}
            onDragEnd={() => setDraggingAsset(null)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="group relative aspect-square rounded-lg overflow-hidden border border-border/40 bg-muted/10 hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing"
            onClick={() => onAdd(asset)}
        >
            {asset.type === 'image' ? (
                <img
                    src={`video-stream://local/${encodeURIComponent(asset.path)}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    alt={asset.name}
                />
            ) : asset.type === 'video' ? (
                <div className="w-full h-full bg-black relative">
                    {/* Video Player (only on hover) */}
                    {isHovered ? (
                        <video
                            src={`video-stream://local/${encodeURIComponent(asset.path)}`}
                            className="w-full h-full object-cover"
                            autoPlay
                            muted
                            loop
                            playsInline
                        />
                    ) : (
                        /* Thumbnail Image */
                        thumbnail ? (
                            <img
                                src={thumbnail}
                                className="w-full h-full object-cover opacity-80"
                                alt={asset.name}
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
                        <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/60 rounded text-[9px] text-white font-mono pointer-events-none">
                            {formatTime(asset.metadata.duration)}
                        </div>
                    )}
                </div>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-muted/20">
                    <Music className="w-8 h-8 text-muted-foreground/60 mb-2" />
                    <span className="text-[10px] text-muted-foreground line-clamp-2 break-all leading-tight">{asset.name}</span>
                </div>
            )}

            {/* Hover Actions */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                <button
                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors pointer-events-auto"
                    title="Add to Project"
                >
                    <Plus className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemove(asset.id)
                    }}
                    className="p-1.5 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-200 backdrop-blur-sm transition-colors pointer-events-auto"
                    title="Remove from Library"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
})

export function ImportMediaSection() {
    const [isDragOver, setIsDragOver] = useState(false)
    const [ingestQueue, setIngestQueue] = useState<IngestQueueItem[]>([])

    // Asset Library Store
    const assets = useAssetLibraryStore((s) => s.assets)
    const addAsset = useAssetLibraryStore((s) => s.addAsset)
    const removeAsset = useAssetLibraryStore((s) => s.removeAsset)
    const setDraggingAsset = useAssetLibraryStore((s) => s.setDraggingAsset)

    const fileInputRef = useRef<HTMLInputElement>(null)

    const currentProject = useProjectStore((s) => s.currentProject)
    const updateProjectData = useProjectStore((s) => s.updateProjectData)

    // --- Asset Ingestion Logic ---

    const ingestFile = useCallback(async (file: File) => {
        const type = getMediaType(file.name)
        if (!type || type === 'project') return

        const path = (file as any).path || file.name
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

        setTimeout(() => {
            setIngestQueue(prev => prev.filter(i => i.status !== 'success'))
        }, 2000)

    }, [ingestFile])


    // --- Add Asset To Project Logic ---

    const addAssetToProject = useCallback(async (asset: Asset) => {
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
            addAssetRecording(updatedProject, {
                path: asset.path,
                duration: asset.metadata.duration || 0,
                width: asset.metadata.width || 0,
                height: asset.metadata.height || 0,
                type: asset.type as 'video' | 'audio' | 'image',
                name: asset.name
            })
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
        <div className="flex flex-col h-full bg-transparent">
            {/* Import Drop Area */}
            <div className="p-3 bg-transparent shrink-0">
                <button
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={handleBrowse}
                    className={cn(
                        "relative w-full text-left rounded-lg transition-all duration-200 group bg-transparent",
                        "flex items-center gap-3 p-3",
                        "border border-border/50 hover:border-border/80 border-dashed",
                        isDragOver
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "hover:bg-muted/10",
                    )}
                >
                    <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0",
                        isDragOver ? "bg-primary/20 text-primary" : "bg-muted/20 text-muted-foreground group-hover:text-foreground group-hover:scale-105"
                    )}>
                        <Upload className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-foreground/90">Import Media</p>
                        <p className="text-xs text-muted-foreground">Images, Videos, Audio</p>
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
                <div className="px-3 pb-2 space-y-1 shrink-0">
                    {ingestQueue.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/20">
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
                <div className="px-3 py-2 bg-transparent">
                    <h3 className="text-xs font-medium text-muted-foreground mb-3 px-1 uppercase tracking-wider">Your Assets ({assets.length})</h3>

                    {assets.length === 0 ? (
                        <div className="text-center py-10 px-4 text-muted-foreground/50 text-xs">
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
                                    className="w-full py-2 text-xs text-muted-foreground hover:text-foreground bg-muted/10 hover:bg-muted/20 rounded transition-colors"
                                >
                                    Load More
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
