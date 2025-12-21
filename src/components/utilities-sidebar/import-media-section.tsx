import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Film, Music, FolderOpen, Loader2, Check, X, FileAudio, FileVideo, FileBox } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn, formatTime } from '@/lib/utils'
import { useProjectStore } from '@/stores/project-store'
import { toast } from 'sonner'
import type { Recording, Clip, Track, Project } from '@/types/project'
import { TrackType } from '@/types/project'
import { addRecordingToProject, calculateTimelineDuration } from '@/lib/timeline/timeline-operations'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { useRecordingsLibraryStore, type LibraryRecording } from '@/stores/recordings-library-store'
import { getVideoMetadataFromPath } from '@/lib/utils/video-metadata'
import { SUPPORTED_PROJECT_EXTENSIONS, PROJECT_EXTENSION, PROJECT_EXTENSION_REGEX } from '@/lib/storage/recording-storage'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

interface ImportedMedia {
    id: string
    name: string
    type: 'video' | 'audio' | 'project'
    path: string
    duration: number
    status: 'pending' | 'importing' | 'success' | 'error'
    error?: string
}

// VideoMetadata and getVideoMetadata are now imported from '@/lib/utils/video-metadata'

async function getAudioMetadata(filePath: string): Promise<{ duration: number }> {
    return new Promise((resolve, reject) => {
        const audio = document.createElement('audio')
        audio.preload = 'metadata'

        audio.onloadedmetadata = () => {
            const duration = audio.duration * 1000 // Convert to ms
            URL.revokeObjectURL(audio.src)
            resolve({ duration })
        }

        audio.onerror = () => {
            URL.revokeObjectURL(audio.src)
            reject(new Error('Failed to load audio metadata'))
        }

        // Use video-stream protocol for Electron
        audio.src = `video-stream://local/${encodeURIComponent(filePath)}`
    })
}

const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']
const SUPPORTED_AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac']

function getMediaType(filename: string): 'video' | 'audio' | 'project' | null {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    if (SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) return 'video'
    if (SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) return 'audio'
    if (SUPPORTED_PROJECT_EXTENSIONS.includes(ext)) return 'project'
    return null
}

export function ImportMediaSection() {
    const [isDragOver, setIsDragOver] = useState(false)
    const [importQueue, setImportQueue] = useState<ImportedMedia[]>([])
    const [isImporting, setIsImporting] = useState(false)
    const [showRecordingPicker, setShowRecordingPicker] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const currentProject = useProjectStore((s) => s.currentProject)
    const updateProjectData = useProjectStore((s) => s.updateProjectData)
    const libraryRecordings = useRecordingsLibraryStore((s) => s.allRecordings)
    const setAllRecordings = useRecordingsLibraryStore((s) => s.setAllRecordings)
    const updateRecording = useRecordingsLibraryStore((s) => s.updateRecording)

    // Ensure recordings are loaded if store is empty (e.g. direct load into project)
    useEffect(() => {
        const loadAndHydrate = async () => {
            if (!window.electronAPI?.loadRecordings) return
            try {
                const files = await window.electronAPI.loadRecordings()
                const recordingsList: LibraryRecording[] = []

                // First pass: Basic file info
                for (const file of files) {
                    if (!file.path.endsWith(PROJECT_EXTENSION)) continue
                    recordingsList.push({
                        name: file.name,
                        path: file.path,
                        timestamp: new Date(file.timestamp),
                        projectFileSize: file.size
                    })
                }

                // Sort by newest
                recordingsList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                setAllRecordings(recordingsList)

                // Second pass: Hydrate metadata (Name & Duration)
                // We do this in chunks to avoid blocking UI
                const chunkSize = 3
                for (let i = 0; i < recordingsList.length; i += chunkSize) {
                    const chunk = recordingsList.slice(i, i + chunkSize)

                    await Promise.all(chunk.map(async (rec) => {
                        if (!window.electronAPI?.readLocalFile) return

                        try {
                            const result = await window.electronAPI.readLocalFile(rec.path)
                            if (result?.success && result.data) {
                                const projectData = new TextDecoder().decode(result.data as ArrayBuffer)
                                const project = JSON.parse(projectData) as Project

                                const duration = project.timeline?.duration || project.recordings?.[0]?.duration || 0
                                const info: any = {
                                    name: project.name || rec.name,
                                    duration,
                                    width: project.recordings?.[0]?.width || 0,
                                    height: project.recordings?.[0]?.height || 0,
                                    recordingCount: project.recordings?.length || 0
                                }

                                updateRecording(rec.path, { projectInfo: info })
                            }
                        } catch (e) {
                            console.warn('Failed to hydrate', rec.name, e)
                        }
                    }))

                    // Small delay to yield to main thread
                    await new Promise(r => setTimeout(r, 10))
                }

            } catch (err) {
                console.error('[ImportMediaSection] Failed to load recordings:', err)
            }
        }

        if (libraryRecordings.length === 0) {
            loadAndHydrate()
        }
    }, [libraryRecordings.length, setAllRecordings, updateRecording])

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

    const importVideoToProject = useCallback(async (item: ImportedMedia) => {
        if (!currentProject) {
            throw new Error('No project open')
        }

        // Validate file exists
        if (window.electronAPI?.fileExists) {
            const exists = await window.electronAPI.fileExists(item.path)
            if (!exists) {
                throw new Error(`File not found: ${item.path}`)
            }
        }

        const metadata = await getVideoMetadataFromPath(item.path)

        const recording: Recording = {
            id: `recording-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            filePath: item.path,
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            frameRate: metadata.frameRate,
            hasAudio: metadata.hasAudio,
            isExternal: true, // Mark as external import
            effects: []
        }

        // Add recording and create clip using updateProjectData
        updateProjectData((project: Project) => {
            const updatedProject = { ...project }

            addRecordingToProject(
                updatedProject,
                recording,
                () => { } // No effects for imported videos
            )

            // Update duration
            updatedProject.timeline.duration = calculateTimelineDuration(updatedProject)

            return updatedProject
        })
    }, [currentProject, updateProjectData])

    const importAudioToProject = useCallback(async (item: ImportedMedia) => {
        if (!currentProject) {
            throw new Error('No project open')
        }

        // Validate file exists
        if (window.electronAPI?.fileExists) {
            const exists = await window.electronAPI.fileExists(item.path)
            if (!exists) {
                throw new Error(`File not found: ${item.path}`)
            }
        }

        const metadata = await getAudioMetadata(item.path)

        // For audio, we create a recording-like entry but mark it as audio
        const recording: Recording = {
            id: `recording-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            filePath: item.path,
            duration: metadata.duration,
            width: 0, // Audio doesn't have dimensions
            height: 0,
            frameRate: 0,
            hasAudio: true,
            isExternal: true, // Mark as external import
            effects: []
        }

        // Pre-load the audio file into the blob manager for playback
        try {
            await globalBlobManager.loadVideos({
                id: recording.id,
                filePath: recording.filePath
            })
        } catch (error) {
            console.warn('Failed to pre-load audio file, will use video-stream protocol:', error)
        }

        // Add to audio track using updateProjectData
        updateProjectData((project: Project) => {
            const updatedProject = { ...project }

            // Add to recordings array
            updatedProject.recordings = [...updatedProject.recordings, recording]

            // Find or create audio track
            let audioTrack = updatedProject.timeline.tracks.find((t: Track) => t.type === TrackType.Audio)
            if (!audioTrack) {
                audioTrack = {
                    id: `track-audio-${Date.now()}`,
                    name: 'Audio',
                    type: TrackType.Audio,
                    clips: [],
                    muted: false,
                    locked: false
                }
                updatedProject.timeline.tracks = [...updatedProject.timeline.tracks, audioTrack]
            }

            // Calculate start time - add at end of existing audio clips or at timeline start if empty
            let audioStartTime = 0
            if (audioTrack.clips.length > 0) {
                // Find the end of the last audio clip
                const lastClipEnd = Math.max(...audioTrack.clips.map(c => c.startTime + c.duration))
                audioStartTime = lastClipEnd
            }

            // Create clip for audio
            const clip: Clip = {
                id: `clip-${Date.now()}`,
                recordingId: recording.id,
                startTime: audioStartTime,
                duration: metadata.duration,
                sourceIn: 0,
                sourceOut: metadata.duration
            }

            // Update the audio track with the new clip
            updatedProject.timeline.tracks = updatedProject.timeline.tracks.map((t: Track) =>
                t.id === audioTrack!.id
                    ? { ...t, clips: [...t.clips, clip] }
                    : t
            )

            return updatedProject
        })
    }, [currentProject, updateProjectData])

    // Import a recording from another project file with full metadata
    const importProjectToProject = useCallback(async (item: ImportedMedia) => {
        if (!currentProject) {
            throw new Error('No project open')
        }

        // Read the source project file
        if (!window.electronAPI?.readLocalFile) {
            throw new Error('File reading not available')
        }

        const result = await window.electronAPI.readLocalFile(item.path)
        if (!result?.success || !result.data) {
            throw new Error('Failed to read project file')
        }

        const sourceProject = JSON.parse(new TextDecoder().decode(result.data as ArrayBuffer)) as Project

        if (!sourceProject.recordings || sourceProject.recordings.length === 0) {
            throw new Error('Source project has no recordings')
        }

        // Get the project directory for resolving relative paths
        const projectDir = item.path.substring(0, item.path.lastIndexOf('/'))

        // Import each recording from the source project
        for (const sourceRecording of sourceProject.recordings) {
            // Resolve video path relative to source project
            let videoPath = sourceRecording.filePath
            if (!videoPath.startsWith('/')) {
                videoPath = `${projectDir}/${videoPath}`
            }

            // Validate video file exists
            if (window.electronAPI?.fileExists) {
                const exists = await window.electronAPI.fileExists(videoPath)
                if (!exists) {
                    throw new Error(`Recording video not found: ${videoPath}`)
                }
            }

            // Resolve folderPath if it exists (for metadata chunks)
            let resolvedFolderPath = sourceRecording.folderPath
            if (resolvedFolderPath && !resolvedFolderPath.startsWith('/')) {
                resolvedFolderPath = `${projectDir}/${resolvedFolderPath}`
            }

            // Create new recording with preserved metadata references
            const recording: Recording = {
                id: `recording-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                filePath: videoPath,
                duration: sourceRecording.duration,
                width: sourceRecording.width,
                height: sourceRecording.height,
                frameRate: sourceRecording.frameRate,
                hasAudio: sourceRecording.hasAudio,
                captureArea: sourceRecording.captureArea,
                isExternal: false, // Has our metadata, not external!
                effects: [], // Will regenerate below
                folderPath: resolvedFolderPath,
                metadataChunks: sourceRecording.metadataChunks
            }

            // Load metadata from chunks if available
            if (recording.folderPath && recording.metadataChunks) {
                try {
                    const loadedMetadata = await RecordingStorage.loadMetadataChunks(
                        recording.folderPath,
                        recording.metadataChunks
                    )
                    recording.metadata = loadedMetadata
                    RecordingStorage.setMetadata(recording.id, loadedMetadata)
                } catch (error) {
                    console.warn('Failed to load metadata chunks:', error)
                }
            }

            // Pre-load the video into blob manager
            try {
                await globalBlobManager.loadVideos({
                    id: recording.id,
                    filePath: recording.filePath,
                    folderPath: recording.folderPath,
                    metadata: recording.metadata
                })
            } catch (error) {
                console.warn('Failed to pre-load video:', error)
            }

            // Add to project and generate effects
            updateProjectData((project: Project) => {
                const updatedProject = { ...project }

                addRecordingToProject(
                    updatedProject,
                    recording,
                    EffectsFactory.createInitialEffectsForRecording
                )

                updatedProject.timeline.duration = calculateTimelineDuration(updatedProject)

                return updatedProject
            })
        }
    }, [currentProject, updateProjectData])

    const processFiles = useCallback(async (files: FileList | File[]) => {
        const fileArray = Array.from(files)
        const validFiles = fileArray.filter(file => {
            const mediaType = getMediaType(file.name)
            return mediaType !== null
        })

        if (validFiles.length === 0) {
            toast.error('No supported media files found', {
                description: `Supported formats: MP4, MOV, WebM, MKV, AVI, MP3, WAV, AAC, M4A, OGG, FLAC, ${PROJECT_EXTENSION.toUpperCase().replace('.', '')}`
            })
            return
        }

        // Add to import queue
        const newItems: ImportedMedia[] = validFiles.map(file => ({
            id: `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            type: getMediaType(file.name) as 'video' | 'audio' | 'project',
            path: (file as any).path || file.name,
            duration: 0,
            status: 'pending' as const
        }))

        setImportQueue(prev => [...prev, ...newItems])

        // Process imports
        setIsImporting(true)
        for (const item of newItems) {
            try {
                setImportQueue(prev => prev.map(i =>
                    i.id === item.id ? { ...i, status: 'importing' } : i
                ))

                if (item.type === 'video') {
                    await importVideoToProject(item)
                } else if (item.type === 'audio') {
                    await importAudioToProject(item)
                } else if (item.type === 'project') {
                    await importProjectToProject(item)
                }

                setImportQueue(prev => prev.map(i =>
                    i.id === item.id ? { ...i, status: 'success' } : i
                ))

                toast.success(`Imported ${item.name}`)
            } catch (error) {
                console.error('Import failed:', error)
                setImportQueue(prev => prev.map(i =>
                    i.id === item.id ? { ...i, status: 'error', error: String(error) } : i
                ))
                toast.error(`Failed to import ${item.name}`)
            }
        }
        setIsImporting(false)

        // Clear successful imports after a delay
        setTimeout(() => {
            setImportQueue(prev => prev.filter(i => i.status !== 'success'))
        }, 3000)
    }, [importVideoToProject, importAudioToProject, importProjectToProject])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)

        const files = e.dataTransfer.files
        if (files.length > 0) {
            processFiles(files)
        }
    }, [processFiles])

    const handleBrowse = useCallback(async () => {
        try {
            console.log('Browse clicked, checking electronAPI...')
            if (!window.electronAPI) {
                console.error('electronAPI is missing')
                toast.error('System interface not available')
                return
            }

            if (!window.electronAPI.showOpenDialog) {
                console.error('showOpenDialog is missing on electronAPI')
                toast.error('File dialog not available')
                return
            }

            console.log('Opening file dialog...')
            const result = await window.electronAPI.showOpenDialog({
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: 'All Supported', extensions: [...SUPPORTED_VIDEO_EXTENSIONS, ...SUPPORTED_AUDIO_EXTENSIONS, ...SUPPORTED_PROJECT_EXTENSIONS] },
                    { name: 'Video Files', extensions: SUPPORTED_VIDEO_EXTENSIONS },
                    { name: 'Audio Files', extensions: SUPPORTED_AUDIO_EXTENSIONS },
                    { name: 'Project Files', extensions: SUPPORTED_PROJECT_EXTENSIONS },
                    { name: 'All Files', extensions: ['*'] }
                ]
            })

            console.log('File dialog result:', result)

            if (!result.canceled && result.filePaths?.length > 0) {
                // Convert paths to fake File objects with path property
                const fakeFiles = result.filePaths.map(path => ({
                    name: path.split('/').pop() || 'unknown',
                    path: path
                } as unknown as File))
                processFiles(fakeFiles as any)
            }
        } catch (error) {
            console.error('Failed to open file dialog:', error)
            toast.error('Failed to open file browser', {
                description: String(error)
            })
        }
    }, [processFiles])

    const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (files && files.length > 0) {
            processFiles(files)
        }
        // Reset input
        e.target.value = ''
    }, [processFiles])

    const clearItem = useCallback((id: string) => {
        setImportQueue(prev => prev.filter(i => i.id !== id))
    }, [])

    // Handle selecting a recording from the library to import
    const handleSelectLibraryRecording = useCallback(async (rec: LibraryRecording) => {
        setShowRecordingPicker(false)

        // Create a fake ImportedMedia item and process it
        const item: ImportedMedia = {
            id: `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: rec.name,
            type: 'project',
            path: rec.path,
            duration: rec.projectInfo?.duration || 0,
            status: 'pending'
        }

        setImportQueue(prev => [...prev, item])
        setIsImporting(true)

        try {
            setImportQueue(prev => prev.map(i =>
                i.id === item.id ? { ...i, status: 'importing' } : i
            ))

            await importProjectToProject(item)

            setImportQueue(prev => prev.map(i =>
                i.id === item.id ? { ...i, status: 'success' } : i
            ))
            toast.success(`Imported recording: ${rec.name}`)
        } catch (error) {
            console.error('Import failed:', error)
            setImportQueue(prev => prev.map(i =>
                i.id === item.id ? { ...i, status: 'error', error: String(error) } : i
            ))
            toast.error(`Failed to import ${rec.name}`)
        }

        setIsImporting(false)

        // Clear successful imports after a delay
        setTimeout(() => {
            setImportQueue(prev => prev.filter(i => i.status !== 'success'))
        }, 3000)
    }, [importProjectToProject])

    const hasProject = !!currentProject

    return (
        <div className="space-y-3 p-1">
            {/* Compact Drop Zone */}
            <button
                // Valid HTML: Input cannot be inside button. Moving input out.
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={(e) => {
                    if (hasProject) {
                        handleBrowse()
                    } else {
                        console.warn('[ImportMediaSection] Clicked but hasProject is false')
                        toast.error('No project appears to be active')
                    }
                }}
                disabled={false}
                className={cn(
                    "relative w-full text-left rounded-lg transition-all duration-200 group",
                    "flex items-center gap-3 p-3",
                    "border border-border/50 hover:border-border",
                    isDragOver
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "bg-muted/20 hover:bg-muted/40",
                )}
            >
                <div className={cn(
                    "w-9 h-9 rounded-md flex items-center justify-center transition-all shrink-0",
                    isDragOver
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/60 text-muted-foreground group-hover:bg-muted group-hover:text-foreground"
                )}>
                    <Upload className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                    <p className={cn(
                        "text-xs font-medium transition-colors",
                        isDragOver ? "text-primary" : "text-foreground"
                    )}>
                        {isDragOver ? "Release to import" : "Import Media"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                        Drop files or click to browse
                    </p>
                </div>
            </button>

            {/* Hidden file input moved OUTSIDE button */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={[
                    ...SUPPORTED_VIDEO_EXTENSIONS.map(e => `.${e}`),
                    ...SUPPORTED_AUDIO_EXTENSIONS.map(e => `.${e}`)
                ].join(',')}
                className="hidden"
                onChange={handleFileInputChange}
            />

            {/* No Project Warning */}
            {!hasProject && (
                <p className="text-[10px] text-muted-foreground text-center py-1.5 px-2">
                    Open a project to import media
                </p>
            )}

            {/* Import Queue - only show when active */}
            {importQueue.length > 0 && (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                            Queue
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                            {importQueue.filter(i => i.status === 'success').length}/{importQueue.length}
                        </span>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto px-1">
                        <AnimatePresence mode="popLayout" initial={false}>
                            {importQueue.map(item => (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                                    transition={{ duration: 0.2 }}
                                    key={item.id}
                                    className={cn(
                                        "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px]",
                                        "bg-muted/30 border border-transparent",
                                        item.status === 'success' && "border-green-500/20 bg-green-500/5",
                                        item.status === 'error' && "border-destructive/20 bg-destructive/5",
                                        item.status === 'importing' && "border-primary/20 bg-primary/5"
                                    )}
                                >
                                    {/* Status indicator */}
                                    <div className="shrink-0">
                                        {item.status === 'importing' ? (
                                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                        ) : item.status === 'success' ? (
                                            <Check className="w-3 h-3 text-green-500" />
                                        ) : item.status === 'error' ? (
                                            <X className="w-3 h-3 text-destructive" />
                                        ) : (
                                            <div className="w-3 h-3 rounded-full border border-muted-foreground/30" />
                                        )}
                                    </div>

                                    {/* File info */}
                                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                        {item.type === 'video' ? (
                                            <Film className="w-3 h-3 text-blue-400 shrink-0" />
                                        ) : item.type === 'audio' ? (
                                            <Music className="w-3 h-3 text-green-400 shrink-0" />
                                        ) : (
                                            <FileBox className="w-3 h-3 text-orange-400 shrink-0" />
                                        )}
                                        <span className="truncate text-muted-foreground">{item.name}</span>
                                    </div>

                                    {/* Clear button for errors/success */}
                                    {(item.status === 'error' || item.status === 'success') && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                clearItem(item.id)
                                            }}
                                            className="shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            )}

            {/* Quick Import Buttons */}
            <div className="flex gap-1.5">
                <button
                    onClick={handleBrowse}
                    disabled={!hasProject}
                    title="Video"
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs",
                        "bg-muted/30 hover:bg-muted/50 border border-border/50 hover:border-border",
                        "transition-all duration-150",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                >
                    <Film className="w-4 h-4 text-blue-400" />
                </button>
                <button
                    onClick={handleBrowse}
                    disabled={!hasProject}
                    title="Audio"
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs",
                        "bg-muted/30 hover:bg-muted/50 border border-border/50 hover:border-border",
                        "transition-all duration-150",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                >
                    <Music className="w-4 h-4 text-green-400" />
                </button>
                <button
                    onClick={() => setShowRecordingPicker(true)}
                    disabled={!hasProject}
                    title={libraryRecordings.length === 0 ? "No recordings in library" : "Import from library"}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs",
                        "bg-muted/30 hover:bg-muted/50 border border-border/50 hover:border-border",
                        "transition-all duration-150",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                >
                    <FileBox className="w-4 h-4 text-orange-400" />
                </button>
            </div>

            {/* Supported formats - collapsible/minimal */}
            <details className="group">
                <summary className="text-[10px] text-muted-foreground/60 cursor-pointer hover:text-muted-foreground transition-colors list-none flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform">›</span>
                    Supported formats
                </summary>
                <div className="mt-1.5 text-[10px] text-muted-foreground/50 pl-3 space-y-0.5">
                    <p><span className="text-blue-400/70">Video:</span> MP4, MOV, WebM, MKV, AVI, M4V</p>
                    <p><span className="text-green-400/70">Audio:</span> MP3, WAV, AAC, M4A, OGG, FLAC</p>
                    <p><span className="text-orange-400/70">Recording:</span> From your library</p>
                </div>
            </details>

            {/* Recording Picker Dialog */}
            <Dialog open={showRecordingPicker} onOpenChange={setShowRecordingPicker}>
                <DialogContent className="max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Import Recording</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto space-y-2 py-2">
                        {libraryRecordings.length === 0 ? (
                            <p className="text-center text-muted-foreground text-sm py-8">
                                No recordings in library
                            </p>
                        ) : (
                            libraryRecordings
                                .filter(rec => rec.path !== currentProject?.filePath) // Don't show current project
                                .map(rec => (
                                    <button
                                        key={rec.path}
                                        onClick={() => handleSelectLibraryRecording(rec)}
                                        className={cn(
                                            "w-full flex items-center gap-3 p-2 rounded-lg text-left",
                                            "bg-muted/30 hover:bg-muted/50 border border-border/50 hover:border-border",
                                            "transition-all duration-150 group"
                                        )}
                                    >
                                        {/* Thumbnail */}
                                        <div className="w-24 h-14 rounded-md overflow-hidden bg-muted/50 shrink-0 relative">
                                            {rec.thumbnailUrl ? (
                                                <img
                                                    src={rec.thumbnailUrl}
                                                    alt={rec.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150"
                                                />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Film className="w-6 h-6 text-muted-foreground/30" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate text-sm">
                                                {rec.projectInfo?.name || rec.name.replace(PROJECT_EXTENSION_REGEX, '')}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {rec.projectInfo?.duration
                                                    ? `${(rec.projectInfo.duration / 1000).toFixed(1)}s`
                                                    : 'Unknown duration'}
                                                {rec.projectInfo?.width && rec.projectInfo?.height
                                                    ? ` • ${rec.projectInfo.width}×${rec.projectInfo.height}`
                                                    : ''}
                                            </p>
                                        </div>
                                    </button>
                                ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

