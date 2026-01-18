"use client"

import { useState, useRef, useEffect } from 'react'
import {
  Save,
  Download,
  PanelRightClose,
  PanelRight,
  PanelLeftClose,
  PanelLeft,
  ArrowLeft,
  Info,
  Camera,
  Loader2,
  Settings2,
  Search,
  Video,
  X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRecordingSessionStore } from '@/features/media/recording/store/session-store'
import { cn } from '@/shared/utils/utils'
import { formatTime } from '@/shared/utils/time'
import type { Project } from '@/types/project'
import { AppearanceToggle } from '@/components/topbar/appearance-toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { getActiveClipDataAtFrame } from '@/features/rendering/renderer/utils/get-active-clip-data-at-frame'
import { EffectStore } from '@/features/effects/core/effects-store'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'

import { springSnappy as springConfig } from '@/shared/constants/animations'

// Pill button component - compact and minimal
interface PillButtonProps {
  onClick?: () => void
  disabled?: boolean
  tooltip?: string
  shortcut?: string
  active?: boolean
  primary?: boolean
  className?: string
  children: React.ReactNode
}

function PillButton({
  onClick,
  disabled,
  tooltip,
  shortcut,
  active,
  primary,
  className,
  children
}: PillButtonProps) {
  const button = (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex items-center justify-center gap-1.5",
        "h-7 px-3 rounded-full",
        "text-2xs font-medium",
        "transition-colors duration-100",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        primary ? [
          "bg-foreground text-background",
          "hover:bg-foreground/90",
        ] : [
          "text-muted-foreground",
          "hover:text-foreground hover:bg-foreground/10",
          active && "text-foreground bg-foreground/10",
        ],
        className
      )}
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      transition={springConfig}
    >
      {children}
    </motion.button>
  )

  if (!tooltip) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs flex items-center gap-2">
        <span>{tooltip}</span>
        {shortcut && (
          <span className="text-3xs text-muted-foreground/70 font-mono bg-muted/30 px-1 py-0.5 rounded">
            {shortcut}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

// Icon-only button variant
interface PillIconButtonProps {
  onClick?: () => void
  disabled?: boolean
  tooltip?: string
  active?: boolean
  className?: string
  children: React.ReactNode
}

function PillIconButton({
  onClick,
  disabled,
  tooltip,
  active,
  className,
  children
}: PillIconButtonProps) {
  const button = (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex items-center justify-center",
        "w-7 h-7 rounded-full",
        "text-muted-foreground",
        "transition-colors duration-100",
        "hover:text-foreground hover:bg-foreground/10",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        active && "text-foreground bg-foreground/10",
        className
      )}
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      transition={springConfig}
    >
      {children}
    </motion.button>
  )

  if (!tooltip) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

// Subtle divider for visual grouping
function ToolbarDivider() {
  return (
    <div className="h-4 w-px bg-foreground/10 mx-0.5" />
  )
}

// Expandable search component
interface ExpandableSearchProps {
  query: string
  onQueryChange: (query: string) => void
}

function ExpandableSearch({ query, onQueryChange }: ExpandableSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus()
    }
  }, [isExpanded])

  // Collapse when query is cleared externally (e.g., "Clear filters" button)
  useEffect(() => {
    if (!query && isExpanded && inputRef.current !== document.activeElement) {
      setIsExpanded(false)
    }
  }, [query, isExpanded])

  const handleClose = () => {
    setIsExpanded(false)
    onQueryChange('')
  }

  return (
    <motion.div
      className="relative flex items-center h-7"
      animate={{ width: isExpanded ? 180 : 28 }}
      transition={springConfig}
    >
      <AnimatePresence>
        {isExpanded ? (
          <motion.div
            key="search-field"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center gap-2 h-7 px-2.5 rounded-full hover:bg-foreground/5 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-2xs text-foreground placeholder:text-muted-foreground/40 outline-none min-w-0"
              onBlur={() => {
                if (!query) setIsExpanded(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') handleClose()
              }}
            />
            {query && (
              <motion.button
                onClick={handleClose}
                className="text-muted-foreground/50 hover:text-foreground transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={springConfig}
              >
                <X className="w-3 h-3" />
              </motion.button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="search-icon"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <PillIconButton
              onClick={() => setIsExpanded(true)}
              tooltip="Search"
            >
              <Search className="w-3.5 h-3.5" />
            </PillIconButton>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Library mode props
interface LibraryModeProps {
  totalRecordings: number
  searchQuery: string
  onSearchChange: (query: string) => void
  onNewRecording: () => void
}

// Editor mode props
interface EditorModeProps {
  project: Project
  hasUnsavedChanges: boolean
  onSaveProject: () => Promise<void>
  onExport: () => void
  onToggleProperties: () => void
  onBackToLibrary: () => void
}

// Main toolbar props
interface ToolbarProps {
  mode: 'library' | 'editor'
  libraryProps?: LibraryModeProps
  editorProps?: EditorModeProps
}

export function Toolbar({ mode, libraryProps, editorProps }: ToolbarProps) {
  const {
    isRecording,
    duration,
    isPaused
  } = useRecordingSessionStore()
  const status = isRecording ? (isPaused ? 'paused' : 'recording') : 'idle'

  const [propertiesOpen, setPropertiesOpen] = useState(true)
  const [isSnapshotting, setIsSnapshotting] = useState(false)

  // PERF: Selective subscription - only re-render when these specific values change
  const { isUtilitiesOpen, toggleUtilities, setSettingsOpen, isPropertiesOpen } = useWorkspaceStore(
    useShallow((s) => ({
      isUtilitiesOpen: s.isUtilitiesOpen,
      toggleUtilities: s.toggleUtilities,
      setSettingsOpen: s.setSettingsOpen,
      isPropertiesOpen: s.isPropertiesOpen,
    }))
  )

  const project = editorProps?.project ?? null

  const hasVideoClips = project
    ? TimelineDataService.getVideoClips(project).length > 0
    : false

  const handleToggleProperties = () => {
    setPropertiesOpen(!propertiesOpen)
    editorProps?.onToggleProperties()
  }

  const handleSnapshot = async () => {
    if (!project || !window.electronAPI?.generateThumbnail) return

    useProjectStore.getState().pause()

    const videoClips = TimelineDataService.getVideoClips(project)
    if (!videoClips.length) {
      toast.error('No video clips to snapshot')
      return
    }

    const currentTime = useProjectStore.getState().currentTime
    const fps = project.settings.frameRate
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
    const toastId = toast.loading('Generating snapshot...')
    await new Promise(resolve => setTimeout(resolve, 0))

    try {
      const recordingsMap = TimelineDataService.getRecordingsMap(project)
      const frameLayout = TimelineDataService.getFrameLayout(project, fps, videoClips)
      const allEffects = EffectStore.getAll(project)

      const active = getActiveClipDataAtFrame({
        frame,
        frameLayout,
        fps,
        effects: allEffects,
        getRecording: (recordingId) => recordingsMap.get(recordingId)
      })

      if (!active) {
        throw new Error('No active video clip at the current time')
      }

      const snapshotResolution = active.recording.width && active.recording.height
        ? { width: active.recording.width, height: active.recording.height }
        : project.settings.resolution

      const segments = videoClips.map(c => ({
        clips: [{ clip: c }],
        effects: [] as any
      }))

      if (segments.length > 0 && allEffects.length > 0) {
        segments[0].effects = allEffects
      }

      const result = await window.electronAPI.generateThumbnail({
        segments,
        recordings: project.recordings.map(r => [r.id, r]),
        metadata: new Map(),
        settings: {
          resolution: snapshotResolution,
          framerate: fps,
        },
        projectFilePath: project.filePath,
        frame,
        outputPath,
        preferOffthreadVideo: true,
        cleanupAfterRender: true
      })

      if (result.success) {
        toast.success('Snapshot saved!', { id: toastId })
      } else if (result.canceled) {
        toast.dismiss(toastId)
      } else {
        toast.error(`Failed: ${result.error}`, { id: toastId })
      }
    } catch (error) {
      console.error('Snapshot failed:', error)
      toast.error('Failed to generate snapshot', { id: toastId })
    } finally {
      setIsSnapshotting(false)
    }
  }

  return (
    <div
      className="h-14 pt-4 flex items-start justify-center"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest?.('[data-titlebar-no-doubleclick=\"true\"]')) return
        window.electronAPI?.doubleClickTitleBar?.()
      }}
    >
      {/* Floating Pill */}
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5",
          "rounded-full",
          "bg-background/80 backdrop-blur-2xl",
          "border border-border/50",
          "shadow-lg shadow-black/10 dark:shadow-black/20",
          "pointer-events-auto",
        )}
        style={{
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        data-titlebar-no-doubleclick="true"
      >
        {mode === 'library' ? (
          /* ===== LIBRARY MODE ===== */
          <>
            {/* Search */}
            {libraryProps && (
              <ExpandableSearch
                query={libraryProps.searchQuery}
                onQueryChange={libraryProps.onSearchChange}
              />
            )}

            <ToolbarDivider />

            {/* Record - Primary CTA */}
            {libraryProps && (
              <PillButton
                primary
                onClick={libraryProps.onNewRecording}
                tooltip="Start Recording"
                className="tracking-tight"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Record</span>
              </PillButton>
            )}

            <ToolbarDivider />

            {/* Settings */}
            <PillIconButton
              onClick={() => setSettingsOpen(true)}
              tooltip="Settings"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </PillIconButton>

            {/* Theme */}
            <AppearanceToggle className="flex items-center" />
          </>
        ) : (
          /* ===== EDITOR MODE ===== */
          <>
            {/* Left: Navigation */}
            <PillIconButton
              onClick={toggleUtilities}
              tooltip={isUtilitiesOpen ? "Hide Utilities" : "Show Utilities"}
              active={isUtilitiesOpen}
            >
              {isUtilitiesOpen ? (
                <PanelLeftClose className="w-3.5 h-3.5" />
              ) : (
                <PanelLeft className="w-3.5 h-3.5" />
              )}
            </PillIconButton>

            {/* Back to Library */}
            {editorProps?.onBackToLibrary && (
              <PillIconButton
                onClick={editorProps.onBackToLibrary}
                tooltip="Back to Library"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </PillIconButton>
            )}

            <ToolbarDivider />

            {/* Center: Project info */}
            {project && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2 h-7 rounded-full cursor-default">
                    <span className="text-2xs font-medium text-foreground/80 max-w-[140px] truncate">
                      {project.name}
                    </span>
                    <Info className="w-3 h-3 text-muted-foreground/40" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="text-xs">
                  <div className="space-y-1">
                    <div className="font-medium">{project.name}</div>
                    {project.timeline?.duration && project.timeline.duration > 0 && (
                      <div className="text-muted-foreground">
                        Duration: <span className="font-mono">{formatTime(project.timeline.duration)}</span>
                      </div>
                    )}
                    {project.recordings?.[0]?.width && project.recordings?.[0]?.height && (
                      <div className="text-muted-foreground">
                        {project.recordings[0].width}×{project.recordings[0].height}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Recording Status */}
            {status !== 'idle' && (
              <div className="flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-red-500/20">
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  status === 'recording' && "bg-red-500 animate-pulse",
                  status === 'paused' && "bg-yellow-500"
                )} />
                <span className="text-3xs font-medium text-red-400 uppercase tracking-wide">
                  {status}
                </span>
                {isRecording && (
                  <span className="font-mono text-3xs text-red-400/70">
                    {formatTime(duration / 1000)}
                  </span>
                )}
              </div>
            )}

            <ToolbarDivider />

            {/* Actions */}
            <PillButton
              onClick={editorProps?.onSaveProject}
              disabled={!project}
              tooltip="Save"
              shortcut="⌘S"
            >
              <Save className="w-3.5 h-3.5" />
              {editorProps?.hasUnsavedChanges && (
                <span className="w-1.5 h-1.5 bg-primary rounded-full" />
              )}
            </PillButton>

            <PillIconButton
              disabled={!project || !hasVideoClips || isSnapshotting}
              onClick={handleSnapshot}
              tooltip="Snapshot"
            >
              {isSnapshotting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
            </PillIconButton>

            <PillButton
              primary
              disabled={!project || !hasVideoClips}
              onClick={editorProps?.onExport}
              tooltip="Export"
              className="tracking-tight"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </PillButton>

            <ToolbarDivider />

            {/* Preferences */}
            <PillIconButton
              onClick={() => setSettingsOpen(true)}
              tooltip="Settings"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </PillIconButton>

            <AppearanceToggle className="flex items-center" />

            <PillIconButton
              onClick={handleToggleProperties}
              tooltip={isPropertiesOpen ? "Hide Properties" : "Show Properties"}
              active={isPropertiesOpen}
            >
              {isPropertiesOpen ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRight className="w-3.5 h-3.5" />
              )}
            </PillIconButton>
          </>
        )}
      </motion.div>
    </div>
  )
}

export type { ToolbarProps, LibraryModeProps, EditorModeProps }
