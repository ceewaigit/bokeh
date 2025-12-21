import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRecording } from '@/hooks/use-recording'
import { usePermissions } from '@/hooks/use-permissions'
import { useRecordingSessionStore } from '@/stores/recording-session-store'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/utils/logger'
import { initializeDefaultWallpaper } from '@/lib/constants/default-effects'
import { createAreaSourceId } from '@/lib/recording/utils/area-source-parser'
import { RecordingSourceType } from '@/types/project'
import { AudioInput } from '@/types'
import {
  Volume2,
  VolumeX,
  Square,
  Pause,
  Play,
  Monitor,
  Crop,
  ChevronDown,
  FolderOpen,
  Search,
  X,
  EyeOff,
  Settings2
} from 'lucide-react'

interface Source {
  id: string
  name: string
  type: RecordingSourceType
  displayInfo?: {
    id: number
    isPrimary: boolean
    isInternal: boolean
    bounds: { x: number; y: number; width: number; height: number }
    workArea: { x: number; y: number; width: number; height: number }
    scaleFactor: number
  }
}

export function RecordButtonDock() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [sources, setSources] = useState<Source[]>([])
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [includeAppWindows, setIncludeAppWindows] = useState(false)
  const [hideDesktopIcons, setHideDesktopIcons] = useState(false)

  const { screenRecording, requestScreenRecording } = usePermissions()
  const permissionStatus = screenRecording ? 'granted' : 'denied'

  const { startRecording, stopRecording, pauseRecording, resumeRecording, canPause, canResume } = useRecording()
  const { isRecording, isPaused, duration, updateSettings, startCountdown, prepareRecording } = useRecordingSessionStore()

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.margin = '0'
    document.body.style.padding = '0'
    document.body.style.overflow = 'hidden'
    document.body.style.userSelect = 'none'
    const root = document.getElementById('root')
    if (root) root.style.background = 'transparent'

    // Cleanup on unmount: if still recording, force stop to prevent orphaned recording state
    return () => {
      const { isRecording } = useRecordingSessionStore.getState()
      if (isRecording) {
        logger.warn('RecordButtonDock unmounting while recording - forcing stop')
        // stopRecording is async but we can't await in cleanup. 
        // We fire-and-forget, trusting the hook/store logic to cleanup.
        // We can't access `stopRecording` from closure safely if it changes, 
        // but we can use the store or electron API directly if needed.
        // For now, rely on Electron's own window-close cleanup which usually handles this,
        // but adding a proactive state reset is good safety.
        useRecordingSessionStore.getState().setRecording(false)
        useRecordingSessionStore.getState().setStatus('idle')
      }
    }
  }, [])

  useEffect(() => { initializeDefaultWallpaper() }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !window.electronAPI?.setWindowContentSize) return

    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      window.electronAPI?.setWindowContentSize?.({
        width: Math.ceil(rect.width) + 16,
        height: Math.ceil(rect.height) + 16
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [showSourcePicker, isRecording])

  const loadSources = useCallback(async () => {
    if (!window.electronAPI?.getDesktopSources) return
    try {
      const desktopSources = await window.electronAPI.getDesktopSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 }
      })

      const mappedSources: Source[] = desktopSources.map(source => ({
        id: source.id,
        name: source.name,
        type: source.id.startsWith('screen:') ? RecordingSourceType.Screen : RecordingSourceType.Window,
        displayInfo: source.displayInfo
      }))

      const filteredSources = mappedSources.filter(source => {
        const n = source.name.toLowerCase()
        return !n.includes('dock') && !n.includes('menubar') && !n.includes('notification') && !n.includes('bokeh')
      })

      const allSources: Source[] = [
        { id: 'area:selection', name: 'Area', type: RecordingSourceType.Area },
        ...filteredSources
      ]

      setSources(allSources)
      const primary = allSources.find(s => s.type === RecordingSourceType.Screen && s.displayInfo?.isPrimary)
      setSelectedSourceId(primary?.id || allSources.find(s => s.type === RecordingSourceType.Screen)?.id || null)
    } catch (error) {
      logger.error('Failed to load sources:', error)
    }
  }, [])

  useEffect(() => { loadSources() }, [loadSources])
  useEffect(() => { updateSettings({ audioInput: audioEnabled ? AudioInput.System : AudioInput.None }) }, [audioEnabled, updateSettings])

  const handleRecord = () => {
    if (permissionStatus === 'denied') {
      requestScreenRecording()
      return
    }
    setShowSourcePicker(true)
    setSearchQuery('')
  }

  const handleSourceSelect = (source: Source) => {
    window.electronAPI?.hideMonitorOverlay?.()
    setSelectedSourceId(source.id)
    if (source.type === RecordingSourceType.Screen && source.displayInfo?.id !== undefined) {
      window.electronAPI?.showMonitorOverlay?.(source.displayInfo.id)
    } else if (source.type === RecordingSourceType.Window) {
      window.electronAPI?.showWindowOverlay?.(source.id)
    }
  }

  const handleStartRecording = async () => {
    if (!selectedSourceId) return
    const source = sources.find(s => s.id === selectedSourceId)
    const displayId = source?.displayInfo?.id

    window.electronAPI?.hideMonitorOverlay?.()
    await initializeDefaultWallpaper()
    setShowSourcePicker(false)

    // Hide desktop icons if the option is enabled
    if (hideDesktopIcons) {
      await window.electronAPI?.hideDesktopIcons?.()
    }

    // Save the "include app windows" setting
    updateSettings({ includeAppWindows })

    if (selectedSourceId === 'area:selection') {
      const result = await window.electronAPI?.selectScreenArea?.()
      const area = result?.area
      if (result?.success && area) {
        prepareRecording(createAreaSourceId(area), area.displayId)
        setTimeout(() => startCountdown(startRecording, area.displayId), 50)
      }
    } else {
      prepareRecording(selectedSourceId, displayId)
      setTimeout(() => startCountdown(startRecording, displayId), 50)
    }
  }

  const handleStop = async () => {
    // Restore desktop icons when stopping recording
    if (hideDesktopIcons) {
      await window.electronAPI?.showDesktopIcons?.()
    }
    await stopRecording()
    window.electronAPI?.openWorkspace?.()
  }

  const screens = sources.filter(s => s.type === RecordingSourceType.Screen)
  const windows = sources.filter(s => s.type === RecordingSourceType.Window)
  const areaOption = sources.find(s => s.type === RecordingSourceType.Area)

  const filteredWindows = useMemo(() => {
    if (!searchQuery.trim()) return windows
    return windows.filter(w => w.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [windows, searchQuery])

  return (
    <div ref={containerRef} className="inline-block">
      <div
        className={cn(
          "flex flex-col rounded-2xl",
          "bg-black/80 backdrop-blur-xl",
          "border border-white/10",
          "shadow-2xl"
        )}
        style={{ ['WebkitAppRegion' as any]: 'drag' }}
      >
        {/* Main Bar */}
        <div className="flex items-center justify-center gap-1.5 px-3 py-2">
          {!isRecording ? (
            <>
              {/* Audio Toggle */}
              <button
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  audioEnabled ? "text-white/90" : "text-white/30"
                )}
                title={audioEnabled ? 'Audio On' : 'Audio Off'}
              >
                {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              {/* Record Button */}
              <button
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={handleRecord}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full",
                  "bg-red-500 hover:bg-red-600 text-white",
                  "text-xs font-medium transition-all",
                  "hover:scale-105 active:scale-95"
                )}
              >
                <span className="w-2 h-2 rounded-full bg-white" />
                Record
              </button>

              {/* Library */}
              <button
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={() => window.electronAPI?.openWorkspace?.()}
                className="p-1.5 rounded-lg text-white/30 hover:text-white/70 transition-colors"
                title="Library"
              >
                <FolderOpen className="w-4 h-4" />
              </button>

              {/* Settings */}
              <button
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={() => {
                  if (window.electronAPI?.openWorkspaceSettings) {
                    window.electronAPI.openWorkspaceSettings()
                  } else {
                    window.electronAPI?.openWorkspace?.()
                  }
                }}
                className="p-1.5 rounded-lg text-white/30 hover:text-white/70 transition-colors"
                title="Settings"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              {/* Recording State */}
              <div className="flex items-center gap-2 px-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white/90 text-xs font-mono tabular-nums">{formatTime(duration)}</span>
              </div>

              {(canPause() || canResume()) && (
                <button
                  style={{ WebkitAppRegion: 'no-drag' } as any}
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white transition-colors"
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
              )}

              <button
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={handleStop}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-lg",
                  "bg-white/10 hover:bg-white/20 text-white/90",
                  "text-xs font-medium transition-colors"
                )}
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </button>
            </>
          )}
        </div>

        {/* Source Picker Dropdown */}
        <AnimatePresence mode="wait">
          {showSourcePicker && (
            <motion.div
              initial={{ opacity: 0, scaleY: 0.95, originY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, scaleY: 0.95 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="overflow-hidden"
            >
              <div className="px-2 pb-2 pt-1 border-t border-white/10" style={{ width: 280 }}>
                {/* Source Type Tabs */}
                <div className="flex gap-1 mb-2">
                  {areaOption && (
                    <button
                      style={{ WebkitAppRegion: 'no-drag' } as any}
                      onClick={() => handleSourceSelect(areaOption)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors",
                        selectedSourceId === areaOption.id
                          ? "bg-white/20 text-white"
                          : "text-white/50 hover:text-white/80"
                      )}
                    >
                      <Crop className="w-3 h-3" />
                      Area
                    </button>
                  )}
                  {screens.map(screen => (
                    <button
                      key={screen.id}
                      style={{ WebkitAppRegion: 'no-drag' } as any}
                      onClick={() => handleSourceSelect(screen)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors",
                        selectedSourceId === screen.id
                          ? "bg-white/20 text-white"
                          : "text-white/50 hover:text-white/80"
                      )}
                    >
                      <Monitor className="w-3 h-3" />
                      {screen.name}
                    </button>
                  ))}
                </div>

                {/* Apps */}
                {windows.length > 0 && (
                  <>
                    <div className="relative mb-1.5">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
                      <input
                        type="text"
                        placeholder="Search apps..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ WebkitAppRegion: 'no-drag' } as any}
                        className="w-full pl-7 pr-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-1 max-h-24 overflow-y-auto">
                      {filteredWindows.slice(0, 12).map(source => (
                        <button
                          key={source.id}
                          style={{ WebkitAppRegion: 'no-drag' } as any}
                          onClick={() => handleSourceSelect(source)}
                          className={cn(
                            "px-2 py-1 rounded-lg text-[10px] truncate text-left transition-colors",
                            selectedSourceId === source.id
                              ? "bg-white/20 text-white"
                              : "text-white/50 hover:bg-white/10 hover:text-white/80"
                          )}
                          title={source.name}
                        >
                          {source.name.split(' - ')[0]}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <button
                      style={{ WebkitAppRegion: 'no-drag' } as any}
                      onClick={() => {
                        window.electronAPI?.hideMonitorOverlay?.()
                        setShowSourcePicker(false)
                      }}
                      className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
                    >
                      Cancel
                    </button>

                    {/* Include App Windows Toggle */}
                    <button
                      style={{ WebkitAppRegion: 'no-drag' } as any}
                      onClick={() => setIncludeAppWindows(!includeAppWindows)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] transition-colors border",
                        includeAppWindows
                          ? "bg-blue-500/20 border-blue-500/50 text-blue-200"
                          : "bg-transparent border-white/10 text-white/40 hover:text-white/70"
                      )}
                      title="Keep Screenstudio windows visible during recording"
                    >
                      Include App Windows
                    </button>

                    {/* Hide Desktop Toggle */}
                    <button
                      style={{ WebkitAppRegion: 'no-drag' } as any}
                      onClick={() => setHideDesktopIcons(!hideDesktopIcons)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors border",
                        hideDesktopIcons
                          ? "bg-purple-500/20 border-purple-500/50 text-purple-200"
                          : "bg-transparent border-white/10 text-white/40 hover:text-white/70"
                      )}
                      title="Hide desktop icons and widgets during recording"
                    >
                      <EyeOff className="w-3 h-3" />
                      Hide Desktop
                    </button>
                  </div>

                  <button
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                    onClick={handleStartRecording}
                    disabled={!selectedSourceId}
                    className={cn(
                      "px-3 py-1 rounded-lg text-[10px] font-medium transition-all",
                      selectedSourceId
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : "bg-white/10 text-white/30 cursor-not-allowed"
                    )}
                  >
                    Start
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
