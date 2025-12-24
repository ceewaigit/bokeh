import { useEffect, useState, useCallback, useRef } from 'react'
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
  Mic,
  MicOff,
  Square,
  Pause,
  Play,
  Monitor,
  Crop,
  AppWindow,
  EyeOff,
  Eye,
  Circle,
  FolderOpen,
  ChevronDown,
  Search,
  X
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
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [sources, setSources] = useState<Source[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [hideDesktopIcons, setHideDesktopIcons] = useState(false)
  const [includeAppWindows] = useState(false)
  const [isLoadingSources, setIsLoadingSources] = useState(true)
  const [showWindowPicker, setShowWindowPicker] = useState(false)
  const [windowSearch, setWindowSearch] = useState('')

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

    return () => {
      const { isRecording } = useRecordingSessionStore.getState()
      if (isRecording) {
        logger.warn('RecordButtonDock unmounting while recording - forcing stop')
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
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height)
      })
    }

    // Small delay to ensure DOM is settled
    const timer = setTimeout(updateSize, 16)
    const observer = new ResizeObserver(() => setTimeout(updateSize, 16))
    observer.observe(container)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [isRecording, showWindowPicker])

  useEffect(() => {
    if (showWindowPicker && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
    if (!showWindowPicker) {
      setWindowSearch('')
    }
  }, [showWindowPicker])

  const loadSources = useCallback(async () => {
    if (!window.electronAPI?.getDesktopSources) return
    setIsLoadingSources(true)
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
        if (n.includes('dock') || n.includes('menubar') || n.includes('notification')) return false
        if (!includeAppWindows && n.includes('bokeh')) return false
        return true
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
    } finally {
      setIsLoadingSources(false)
    }
  }, [includeAppWindows])

  useEffect(() => { loadSources() }, [loadSources])
  useEffect(() => { updateSettings({ audioInput: audioEnabled ? AudioInput.System : AudioInput.None }) }, [audioEnabled, updateSettings])

  const handleSourceSelect = (source: Source) => {
    window.electronAPI?.hideMonitorOverlay?.()
    setSelectedSourceId(source.id)
    setShowWindowPicker(false)

    if (source.type === RecordingSourceType.Screen && source.displayInfo?.id !== undefined) {
      window.electronAPI?.showMonitorOverlay?.(source.displayInfo.id)
    } else if (source.type === RecordingSourceType.Window) {
      window.electronAPI?.showWindowOverlay?.(source.id)
    }
  }

  const handleWindowModeClick = () => {
    const newState = !showWindowPicker
    setShowWindowPicker(newState)
    if (newState) {
      window.electronAPI?.hideMonitorOverlay?.()
    }
  }

  const handleAreaClick = async () => {
    window.electronAPI?.hideMonitorOverlay?.()
    setShowWindowPicker(false)

    const result = await window.electronAPI?.selectScreenArea?.()
    const area = result?.area
    if (result?.success && area) {
      setSelectedSourceId(createAreaSourceId(area))
      window.electronAPI?.showRecordingOverlay?.(
        { x: area.x, y: area.y, width: area.width, height: area.height },
        'Selected Area'
      )
    }
  }

  const handleStartRecording = async () => {
    if (permissionStatus === 'denied') {
      requestScreenRecording()
      return
    }
    if (!selectedSourceId) return

    const source = sources.find(s => s.id === selectedSourceId)
    const displayId = source?.displayInfo?.id

    window.electronAPI?.hideMonitorOverlay?.()
    window.electronAPI?.hideRecordingOverlay?.()
    setShowWindowPicker(false)
    await initializeDefaultWallpaper()

    if (hideDesktopIcons) {
      await window.electronAPI?.hideDesktopIcons?.()
    }

    updateSettings({ includeAppWindows })

    if (selectedSourceId.startsWith('area:')) {
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
    } else {
      prepareRecording(selectedSourceId, displayId)
      setTimeout(() => startCountdown(startRecording, displayId), 50)
    }
  }

  const handleStop = async () => {
    if (hideDesktopIcons) {
      await window.electronAPI?.showDesktopIcons?.()
    }
    await stopRecording()
    window.electronAPI?.openWorkspace?.()
  }

  const screens = sources.filter(s => s.type === RecordingSourceType.Screen)
  const windows = sources.filter(s => s.type === RecordingSourceType.Window)
  const filteredWindows = windowSearch
    ? windows.filter(w => w.name.toLowerCase().includes(windowSearch.toLowerCase()))
    : windows
  const areaOption = sources.find(s => s.type === RecordingSourceType.Area)
  const isWindowSelected = selectedSourceId ? sources.find(s => s.id === selectedSourceId)?.type === RecordingSourceType.Window : false

  // ═══════════════════════════════════════════════════════════════════════════
  // STYLES - Refined typography and spacing
  // ═══════════════════════════════════════════════════════════════════════════

  const barStyle = cn(
    "flex items-center gap-1 px-1.5 py-1.5 rounded-[14px]",
    "bg-[#1c1c1e]/95 backdrop-blur-xl",
    "border border-white/[0.08]"
  )

  // Horizontal icon+text buttons - prevents text wrapping
  const sourceButtonStyle = (isSelected: boolean) => cn(
    "flex items-center gap-1.5 h-[36px] px-3 rounded-[8px] whitespace-nowrap",
    "transition-all duration-100 ease-out",
    "text-[11px] font-medium tracking-[-0.01em]",
    isSelected
      ? "bg-white/[0.12] text-white"
      : "text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
  )

  const optionButtonStyle = (isActive: boolean) => cn(
    "flex items-center gap-1.5 h-[32px] px-2.5 rounded-[6px] whitespace-nowrap",
    "text-[10px] font-medium tracking-[-0.01em]",
    "transition-all duration-100 ease-out",
    isActive
      ? "text-white/80"
      : "text-white/35 hover:text-white/55"
  )

  // Skeleton matches horizontal button layout
  const SkeletonButton = () => (
    <div className="flex items-center gap-1.5 h-[36px] px-3">
      <div className="w-[16px] h-[16px] rounded-[4px] bg-white/[0.06]" />
      <div className="w-[40px] h-[10px] rounded-[3px] bg-white/[0.06]" />
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // RECORDING STATE
  // ═══════════════════════════════════════════════════════════════════════════
  if (isRecording) {
    return (
      <div ref={containerRef} className="inline-block p-1">
        <div className={barStyle} style={{ ['WebkitAppRegion' as any]: 'drag' }}>
          <div className="flex items-center gap-2 px-3 h-[44px]">
            <span className="relative flex h-[6px] w-[6px]">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff3b30] opacity-60" />
              <span className="relative inline-flex rounded-full h-[6px] w-[6px] bg-[#ff3b30]" />
            </span>
            <span className="text-white/90 text-[13px] font-mono font-medium tabular-nums tracking-tight">
              {formatTime(duration)}
            </span>
          </div>

          <div className="w-px h-6 bg-white/[0.08]" />

          {(canPause() || canResume()) && (
            <button
              type="button"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              onClick={isPaused ? resumeRecording : pauseRecording}
              className="flex items-center justify-center w-[36px] h-[36px] rounded-[8px] text-white/50 hover:text-white hover:bg-white/[0.08] transition-all duration-100"
            >
              {isPaused ? <Play className="w-[14px] h-[14px] fill-current" /> : <Pause className="w-[14px] h-[14px]" />}
            </button>
          )}

          <button
            type="button"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onClick={handleStop}
            className={cn(
              "flex items-center gap-1.5 h-[36px] px-3.5 rounded-[8px]",
              "bg-white/[0.08] hover:bg-white/[0.12]",
              "text-white/85 text-[12px] font-medium",
              "transition-all duration-100"
            )}
          >
            <Square className="w-[10px] h-[10px] fill-current" />
            <span>Stop</span>
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IDLE STATE
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div ref={containerRef} className="inline-flex flex-col items-center gap-1.5 p-1">
      {/* Window Picker - renders ABOVE the dock bar */}
      {showWindowPicker && windows.length > 0 && (
        <div
          className={cn(
            "w-[300px] p-2 rounded-[12px]",
            "bg-[#1c1c1e]/95 backdrop-blur-xl",
            "border border-white/[0.08]"
          )}
        >
          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-[12px] h-[12px] text-white/25 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search windows..."
              value={windowSearch}
              onChange={(e) => setWindowSearch(e.target.value)}
              className={cn(
                "w-full h-[32px] pl-7 pr-7 rounded-[8px]",
                "bg-white/[0.06] border-none",
                "text-white/90 text-[12px] placeholder:text-white/25",
                "font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text',sans-serif]",
                "focus:outline-none focus:ring-1 focus:ring-white/[0.15]",
                "transition-all duration-100"
              )}
            />
            {windowSearch && (
              <button
                type="button"
                onClick={() => setWindowSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
              >
                <X className="w-[12px] h-[12px]" />
              </button>
            )}
          </div>

          {/* Window List */}
          <div className="max-h-[160px] overflow-y-auto">
            {filteredWindows.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-white/30 font-medium">
                No windows found
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredWindows.slice(0, 20).map(win => (
                  <button
                    type="button"
                    key={win.id}
                    onClick={() => handleSourceSelect(win)}
                    className={cn(
                      "w-full px-2.5 py-2 rounded-[6px] text-[11px] truncate text-left",
                      "font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text',sans-serif]",
                      "transition-all duration-100",
                      selectedSourceId === win.id
                        ? "bg-white/[0.12] text-white font-medium"
                        : "text-white/60 hover:bg-white/[0.06] hover:text-white/80"
                    )}
                    title={win.name}
                  >
                    {win.name.length > 45 ? win.name.slice(0, 45) + '…' : win.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Bar */}
      <div className={barStyle} style={{ ['WebkitAppRegion' as any]: 'drag' }}>
        {/* Source Buttons */}
        {isLoadingSources ? (
          <>
            <SkeletonButton />
            <SkeletonButton />
            <SkeletonButton />
          </>
        ) : (
          <>
            {screens.map((screen, idx) => (
              <button
                type="button"
                key={screen.id}
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={() => handleSourceSelect(screen)}
                className={sourceButtonStyle(selectedSourceId === screen.id)}
              >
                <Monitor className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                <span>
                  {screens.length > 1
                    ? (screen.displayInfo?.isPrimary ? 'Main' : `Display ${idx + 1}`)
                    : 'Display'}
                </span>
              </button>
            ))}

            {windows.length > 0 && (
              <button
                type="button"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={handleWindowModeClick}
                className={sourceButtonStyle(isWindowSelected || showWindowPicker)}
              >
                <AppWindow className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                <span>Window</span>
                <ChevronDown className={cn(
                  "w-3 h-3 opacity-50 transition-transform duration-100 -ml-0.5",
                  showWindowPicker && "rotate-180"
                )} />
              </button>
            )}

            {areaOption && (
              <button
                type="button"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={handleAreaClick}
                className={sourceButtonStyle(selectedSourceId?.startsWith('area:') ?? false)}
              >
                <Crop className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                <span>Area</span>
              </button>
            )}
          </>
        )}

        <div className="w-px h-6 bg-white/[0.08] mx-1" />

        {/* Options */}
        <div className="flex items-center">
          <button
            type="button"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={optionButtonStyle(audioEnabled)}
            title={audioEnabled ? 'System audio enabled' : 'System audio muted'}
          >
            {audioEnabled ? <Mic className="w-[12px] h-[12px]" strokeWidth={1.75} /> : <MicOff className="w-[12px] h-[12px]" strokeWidth={1.75} />}
            <span>{audioEnabled ? 'System' : 'Muted'}</span>
          </button>

          <button
            type="button"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onClick={() => setHideDesktopIcons(!hideDesktopIcons)}
            className={optionButtonStyle(hideDesktopIcons)}
            title={hideDesktopIcons ? 'Desktop icons hidden' : 'Desktop icons visible'}
          >
            {hideDesktopIcons ? <EyeOff className="w-[12px] h-[12px]" strokeWidth={1.75} /> : <Eye className="w-[12px] h-[12px]" strokeWidth={1.75} />}
            <span>{hideDesktopIcons ? 'Clean' : 'Desktop'}</span>
          </button>
        </div>

        <div className="w-px h-6 bg-white/[0.08] mx-1" />

        {/* Library */}
        <button
          type="button"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          onClick={() => window.electronAPI?.openWorkspace?.()}
          className="flex items-center justify-center w-[36px] h-[36px] rounded-[8px] text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all duration-100"
          title="Open Library"
        >
          <FolderOpen className="w-[15px] h-[15px]" strokeWidth={1.75} />
        </button>

        {/* Record Button */}
        <button
          type="button"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          onClick={handleStartRecording}
          disabled={!selectedSourceId}
          className={cn(
            "flex items-center justify-center gap-2 h-[40px] px-5 rounded-[10px]",
            "text-[11px] font-semibold uppercase tracking-[0.08em]",
            "transition-all duration-150 ease-out",
            selectedSourceId
              ? "bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_1px_3px_rgba(0,0,0,0.2)] hover:brightness-110 active:scale-[0.97]"
              : "bg-white/[0.04] text-white/20 cursor-not-allowed"
          )}
        >
          <span className={cn(
            "w-[7px] h-[7px] rounded-full",
            selectedSourceId
              ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
              : "bg-white/30"
          )} />
          <span>Record</span>
        </button>
      </div>
    </div>
  )
}
