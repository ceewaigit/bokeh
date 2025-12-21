"use client"

import { useState } from 'react'
import {
  Folder,
  Save,
  Download,
  FolderOpen,
  FileVideo,
  PanelRightClose,
  PanelRight,
  PanelLeftClose,
  PanelLeft,
  Library,
  Info,
  Sparkles,
  Camera,
  Loader2,
  Settings2
} from 'lucide-react'
import { Button } from './ui/button'
import { HeaderButton } from './ui/header-button'
import { WindowHeader } from './ui/window-header'
import { useRecordingSessionStore } from '@/stores/recording-session-store'
import { cn, formatTime } from '@/lib/utils'
import type { Project } from '@/types/project'
import { TrackType } from '@/types/project'
import { AppearanceControls } from '@/components/topbar/appearance-controls'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useProjectStore } from '@/stores/project-store'
import { toast } from 'sonner'
import { buildFrameLayout } from '@/lib/timeline/frame-layout'
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame'

interface ToolbarProps {
  project: Project | null
  onToggleProperties: () => void
  onExport: () => void
  onNewProject?: () => void | Promise<void>
  onSaveProject: () => Promise<void>
  onOpenProject?: (path: string) => Promise<void>
  onBackToLibrary: () => void
  hasUnsavedChanges?: boolean
}


export function Toolbar({
  project,
  onToggleProperties,
  onExport,
  onNewProject,
  onSaveProject,
  onOpenProject,
  onBackToLibrary,
  hasUnsavedChanges = false
}: ToolbarProps) {
  const {
    isRecording,
    duration,
    status
  } = useRecordingSessionStore()

  const [propertiesOpen, setPropertiesOpen] = useState(true)
  const [isSnapshotting, setIsSnapshotting] = useState(false)

  const { isUtilitiesOpen, toggleUtilities, setSettingsOpen } = useWorkspaceStore()
  const videoTrack = project?.timeline.tracks.find((t) => t.type === TrackType.Video)

  const handleToggleProperties = () => {
    setPropertiesOpen(!propertiesOpen)
    onToggleProperties()
  }

  return (
    <WindowHeader customDragRegions className="gap-2 overflow-hidden">
      {/* Left Section - Project Controls */}
      <div className="flex items-center gap-2 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Logo/Brand */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-md">
          <FileVideo className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="font-bold text-[10px] text-primary uppercase tracking-wider whitespace-nowrap">
            Studio
          </span>
        </div>

        <div className="w-px h-5 bg-muted-foreground/20" />

        {/* Left Sidebar Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleUtilities}
          className="h-7 w-7 hover:bg-muted/30"
        >
          {isUtilitiesOpen ?
            <PanelLeftClose className="w-3.5 h-3.5" /> :
            <PanelLeft className="w-3.5 h-3.5" />
          }
        </Button>

        <div className="w-px h-5 bg-muted-foreground/20" />

        {/* Back to Library Button */}
        {onBackToLibrary && (
          <>
            <HeaderButton
              onClick={onBackToLibrary}
              icon={Library}
            >
              Library
            </HeaderButton>
            <div className="w-px h-5 bg-muted-foreground/20" />
          </>
        )}

        {/* Project Actions */}
        {onNewProject && (
          <HeaderButton
            onClick={onNewProject}
            icon={Folder}
          >
            New
          </HeaderButton>
        )}

        {onOpenProject && (
          <HeaderButton
            onClick={async () => {
              if (window.electronAPI?.showOpenDialog) {
                try {
                  const result = await window.electronAPI.showOpenDialog({
                    properties: ['openFile'],
                    filters: [
                      { name: 'Bokeh Projects', action: 'projects' },
                      { name: 'All Files', extensions: ['*'] }
                    ]
                  })

                  if (!result.canceled && result.filePaths?.length > 0) {
                    const projectPath = result.filePaths[0]
                    await onOpenProject(projectPath)
                  }
                } catch (error) {
                  console.error('Failed to open project:', error)
                }
              }
            }}
            icon={FolderOpen}
          >
            Open
          </HeaderButton>
        )}

        <HeaderButton
          variant={hasUnsavedChanges ? "default" : "ghost"}
          onClick={onSaveProject}
          disabled={!project}
          className={cn(
            hasUnsavedChanges ? "bg-primary/20 hover:bg-primary/30" : "hover:bg-muted/30"
          )}
          icon={Save}
          shortcut="⌘S"
        >
          Save
          {hasUnsavedChanges && (
            <span className="ml-1 w-1.5 h-1.5 bg-primary rounded-full animate-pulse flex-shrink-0" />
          )}
        </HeaderButton>
      </div>

      {/* Center Section - Project Info and Status - This area is draggable */}
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0 overflow-hidden">
        {/* Project Name with Metadata Tooltip */}
        {project && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex items-center gap-1.5 px-3 py-1 window-surface rounded-md flex-shrink-0 border border-border/50 cursor-default"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  <span className="text-[11px] font-semibold text-foreground/90">{project.name}</span>
                  <Info className="w-3 h-3 text-muted-foreground/50" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center" className="text-xs">
                <div className="space-y-1">
                  <div className="font-medium text-foreground">{project.name}</div>
                  {project.timeline?.duration && project.timeline.duration > 0 && (
                    <div className="text-muted-foreground">
                      Duration: <span className="font-mono">{formatTime(project.timeline.duration)}</span>
                    </div>
                  )}
                  {project.recordings?.[0]?.width && project.recordings?.[0]?.height && (
                    <div className="text-muted-foreground">
                      Resolution: <span className="font-mono">{project.recordings[0].width}×{project.recordings[0].height}</span>
                    </div>
                  )}
                  {project.recordings && project.recordings.length > 0 && (
                    <div className="text-muted-foreground">
                      Recordings: <span className="font-mono">{project.recordings.length}</span>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Recording Status */}
        {status !== 'idle' && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-destructive/10 rounded-md flex-shrink-0">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              status === 'recording' && "bg-red-500 animate-pulse",
              status === 'processing' && "bg-yellow-500 animate-pulse",
              status === 'preparing' && "bg-blue-500 animate-pulse"
            )} />
            <span className="text-[10px] font-medium uppercase tracking-wider">
              {status === 'processing' ? 'Saving' : status}
            </span>
            {isRecording && (
              <span className="font-mono text-[10px] text-muted-foreground/70">
                {formatTime(duration / 1000)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right Section - Export and Settings - Not draggable */}
      <div className="flex items-center gap-2 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="w-px h-5 bg-muted-foreground/20" />

        {/* Plugin Creator Button */}
        {/* <Button
          variant="ghost"
          size="sm"
          onClick={() => useWorkspaceStore.getState().setCurrentView('plugin-creator')}
          className="h-7 px-2 text-[11px] font-medium hover:bg-muted/30"
        >
          <Sparkles className="w-3 h-3 mr-1 flex-shrink-0 text-amber-400" />
          <span className="whitespace-nowrap">Plugins</span>
        </Button> */}

        {/* Export Button */}
        <HeaderButton
          variant="default"
          disabled={!project || !videoTrack?.clips?.length}
          onClick={onExport}
          className="bg-primary hover:bg-primary/90 shadow-sm"
          icon={Download}
        >
          Export
        </HeaderButton>

        {/* Snapshot Button */}
        <HeaderButton
          disabled={!project || !videoTrack?.clips?.length || isSnapshotting}
          onClick={async () => {
            if (!project || !window.electronAPI?.generateThumbnail) return

            // Pause playback first
            useProjectStore.getState().pause()

            const videoClips = videoTrack?.clips || []
            if (!videoClips.length) {
              toast.error('No video clips to snapshot')
              return
            }

            const currentTime = useProjectStore.getState().currentTime
            const fps = project.settings.frameRate || 30
            const frame = Math.round((currentTime / 1000) * fps)

            let outputPath: string | undefined
            if (window.electronAPI?.showSaveDialog) {
              const result = await window.electronAPI.showSaveDialog({
                title: 'Save Snapshot',
                defaultPath: `thumbnail-${Date.now()}`,
                filters: [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }]
              })
              if (result.canceled || !result.filePath) {
                return
              }
              outputPath = result.filePath
            }

            setIsSnapshotting(true)
            const toastId = toast.loading('Generating high-quality snapshot...')
            await new Promise(resolve => setTimeout(resolve, 0))

            try {
              const sortedClips = [...videoClips].sort((a, b) => a.startTime - b.startTime)
              const frameLayout = buildFrameLayout(sortedClips, fps)
              const active = getActiveClipDataAtFrame({
                frame,
                frameLayout,
                fps,
                effects: project.timeline.effects || [],
                getRecording: (recordingId) => project.recordings.find(r => r.id === recordingId)
              })

              if (!active) {
                throw new Error('No active video clip at the current time')
              }

              const snapshotResolution = active.recording.width && active.recording.height
                ? { width: active.recording.width, height: active.recording.height }
                : project.settings?.resolution?.width && project.settings?.resolution?.height
                  ? project.settings.resolution
                  : { width: project.recordings[0]?.width || 1920, height: project.recordings[0]?.height || 1080 }

              // Construct segments from timeline tracks
              const segments = videoClips.map(c => ({
                clips: [{ clip: c }],
                effects: [] as any[]
              }))

              // Attach global timeline effects to the first segment if they exist
              if (segments.length > 0 && project.timeline.effects) {
                segments[0].effects = project.timeline.effects
              }

              const result = await window.electronAPI.generateThumbnail({
                segments,
                recordings: project.recordings.map(r => [r.id, r]),
                metadata: new Map(), // Metadata is handled by backend resolution
                settings: {
                  resolution: snapshotResolution,
                  framerate: fps,
                },
                projectFilePath: project.filePath,
                frame,
                outputPath,
                preferOffthreadVideo: false,
                cleanupAfterRender: true
              })

              if (result.success) {
                toast.success('Snapshot saved!', { id: toastId })
              } else if (result.canceled) {
                toast.dismiss(toastId)
              } else {
                toast.error(`Failed to save snapshot: ${result.error}`, { id: toastId })
              }
            } catch (error) {
              console.error('Snapshot failed:', error)
              toast.error('Failed to generate snapshot', { id: toastId })
            } finally {
              setIsSnapshotting(false)
            }
          }}
          tooltip="Save Snapshot"
          icon={isSnapshotting ? Loader2 : Camera}
          className={cn(isSnapshotting && "animate-spin")}
        />

        {/* Settings Button */}
        <HeaderButton
          onClick={() => setSettingsOpen(true)}
          tooltip="Settings"
          icon={Settings2}
        />

        {/* Appearance Controls */}
        <AppearanceControls />

        {/* Properties Toggle */}
        <HeaderButton
          onClick={handleToggleProperties}
          tooltip={propertiesOpen ? "Hide Properties" : "Show Properties"}
          icon={propertiesOpen ? PanelRightClose : PanelRight}
        />
      </div>
    </WindowHeader>
  )
}
