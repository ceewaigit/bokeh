import { useEffect, useState, useCallback, useRef } from 'react'
import { useRecording } from '@/features/media/recording/hooks/use-recording'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useRecordingSessionStore } from '@/features/media/recording/store/session-store'
import { useDeviceStore } from '@/features/core/stores/device-store'
import { cn } from '@/shared/utils/utils'
import { formatTime } from '@/shared/utils/time'
import { logger } from '@/shared/utils/logger'
import { initializeDefaultWallpaper } from '@/features/effects/background'
import { createAreaSourceId } from '@/features/media/recording/logic/area-source-parser'
import { RecordingSourceType } from '@/types/project'
import { AudioInput } from '@/types'
import { useProjectStore } from '@/features/core/stores/project-store'
import { AnimatePresence, motion } from 'framer-motion'
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
  FolderOpen,
  ChevronDown,
  Search,
  X,
  Camera,
  CameraOff,
  Volume2,
  NotebookText
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

type BodyStyleSnapshot = {
  background: string
  margin: string
  padding: string
  overflow: string
  userSelect: string
  display: string
  justifyContent: string
  alignItems: string
  height: string
}

type DockPanel = 'windows' | 'devices'

export function RecordButtonDock() {
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const lastRequestedWindowSizeRef = useRef<{ width: number; height: number } | null>(null)
  const windowResizeInFlightRef = useRef(false)
  const focusTimeoutRef = useRef<number | null>(null)
  const prevBodyStylesRef = useRef<BodyStyleSnapshot | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [sources, setSources] = useState<Source[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [hideDesktopIcons, setHideDesktopIcons] = useState(false)
  const [includeAppWindows] = useState(false)
  const [isLoadingSources, setIsLoadingSources] = useState(true)
  const [panel, setPanel] = useState<DockPanel | null>(null)
  const [panelPhase, setPanelPhase] = useState<'closed' | 'opening' | 'open' | 'closing'>('closed')
  const [windowSearch, setWindowSearch] = useState('')
  const showWindowPicker = panel === 'windows'
  const showDevicePicker = panel === 'devices'

  // Local timer state for recording dock (independent of main window store)
  const [localDuration, setLocalDuration] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Centralized permissions
  const {
    screenRecording,
    camera: cameraPermission,
    microphone: microphonePermission,
    isLoading: isPermissionsLoading,
    requestScreenRecording,
    requestCamera,
    requestMicrophone
  } = usePermissions()

  // Auto-open workspace if permissions are missing (Screen Recording is critical)
  useEffect(() => {
    if (!isPermissionsLoading && !screenRecording) {
      logger.info('[RecordButtonDock] Missing permissions, opening workspace setup')
      window.electronAPI?.openWorkspace?.()
    }
  }, [isPermissionsLoading, screenRecording])

  const { startRecording, stopRecording, isStartingRecording } = useRecording()
  const { isRecording, isPaused, duration, updateSettings, startCountdown, prepareRecording } = useRecordingSessionStore()
  const setRecordingSettings = useProjectStore((s) => s.setRecordingSettings)

  // Device store - only for device enumeration, not permissions
  const {
    webcams,
    microphones,
    settings: deviceSettings,
    isInitialized: devicesInitialized,
    initialize: initializeDevices,
    toggleWebcam,
    toggleMicrophone,
    selectWebcam,
    selectMicrophone
  } = useDeviceStore()

  useEffect(() => {
    prevBodyStylesRef.current = {
      background: document.body.style.background,
      margin: document.body.style.margin,
      padding: document.body.style.padding,
      overflow: document.body.style.overflow,
      userSelect: document.body.style.userSelect,
      display: document.body.style.display,
      justifyContent: document.body.style.justifyContent,
      alignItems: document.body.style.alignItems,
      height: document.body.style.height,
    }

    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.margin = '0'
    document.body.style.padding = '0'
    document.body.style.overflow = 'hidden'
    document.body.style.userSelect = 'none'
    // Keep the dock visually anchored even if the BrowserWindow is briefly larger than content.
    document.body.style.display = 'flex'
    document.body.style.justifyContent = 'center'
    document.body.style.alignItems = 'flex-end'
    document.body.style.height = '100vh'
    const root = document.getElementById('root')
    if (root) root.style.background = 'transparent'

    return () => {
      const { isRecording } = useRecordingSessionStore.getState()
      if (isRecording) {
        logger.warn('RecordButtonDock unmounting while recording - forcing stop')
        useRecordingSessionStore.getState().setRecording(false)
        useRecordingSessionStore.getState().setPaused(false)
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }

      const prev = prevBodyStylesRef.current
      if (prev) {
        document.body.style.background = prev.background
        document.body.style.margin = prev.margin
        document.body.style.padding = prev.padding
        document.body.style.overflow = prev.overflow
        document.body.style.userSelect = prev.userSelect
        document.body.style.display = prev.display
        document.body.style.justifyContent = prev.justifyContent
        document.body.style.alignItems = prev.alignItems
        document.body.style.height = prev.height
      }
    }
  }, [])

  // Local timer logic
  useEffect(() => {
    if (isRecording && !isPaused) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now() - duration // Resume from current duration
      }

      timerIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setLocalDuration(Date.now() - startTimeRef.current)
        }
      }, 100)
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      if (!isRecording) {
        setLocalDuration(0)
        startTimeRef.current = null
      } else if (isPaused) {
        // Keep current duration but stop updating
        // Adjust start time so resuming works correctly
        // (Handled by calculating start time on resume)
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
    }
  }, [isRecording, isPaused, duration])

  // Sync initial duration if needed
  useEffect(() => {
    if (duration > localDuration && Math.abs(duration - localDuration) > 1000) {
      setLocalDuration(duration)
      if (isRecording && !isPaused) {
        startTimeRef.current = Date.now() - duration
      }
    }
  }, [duration, isRecording, isPaused, localDuration])

  useEffect(() => { initializeDefaultWallpaper() }, [])

  // Initialize device manager
  useEffect(() => {
    if (!devicesInitialized) {
      initializeDevices()
    }
  }, [devicesInitialized, initializeDevices])

  // Show webcam preview when recording with webcam enabled
  useEffect(() => {
    if (isRecording && deviceSettings.webcam.enabled && deviceSettings.webcam.deviceId) {
      window.electronAPI?.showWebcamPreview?.(deviceSettings.webcam.deviceId)
    } else {
      window.electronAPI?.hideWebcamPreview?.()
    }
  }, [isRecording, deviceSettings.webcam.enabled, deviceSettings.webcam.deviceId])

  // Notify main process of recording state for window management guards
  useEffect(() => {
    window.electronAPI?.setRecordingState?.(isRecording)
  }, [isRecording])

  useEffect(() => {
    if (showWindowPicker && searchInputRef.current) {
      if (focusTimeoutRef.current !== null) {
        window.clearTimeout(focusTimeoutRef.current)
      }
      focusTimeoutRef.current = window.setTimeout(() => searchInputRef.current?.focus(), 100)
    }
    if (!showWindowPicker) {
      setWindowSearch('')
    }
    return () => {
      if (focusTimeoutRef.current !== null) {
        window.clearTimeout(focusTimeoutRef.current)
        focusTimeoutRef.current = null
      }
    }
  }, [showWindowPicker])

  const measureContentSize = useCallback(() => {
    const container = containerRef.current
    if (!container) return null
    const rect = container.getBoundingClientRect()
    return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) }
  }, [])

  const setRecordButtonWindowSize = useCallback(async (size: { width: number; height: number }) => {
    if (!window.electronAPI?.setWindowContentSize) return
    const last = lastRequestedWindowSizeRef.current
    if (last && last.width === size.width && last.height === size.height) return
    lastRequestedWindowSizeRef.current = size
    await window.electronAPI.setWindowContentSize(size)
  }, [])

  const fitWindowToCurrentContent = useCallback(async () => {
    const size = measureContentSize()
    if (!size) return
    await setRecordButtonWindowSize(size)
  }, [measureContentSize, setRecordButtonWindowSize])

  // Keep the BrowserWindow sized to content for major state changes.
  useEffect(() => {
    if (panelPhase !== 'closed') return
    if (windowResizeInFlightRef.current) return
    void fitWindowToCurrentContent()
  }, [panelPhase, isRecording, isLoadingSources, fitWindowToCurrentContent])

  const openDockPanel = useCallback((nextPanel: DockPanel) => {
    if (panelPhase === 'opening' || panelPhase === 'closing') return
    if (panel === nextPanel && panelPhase === 'open') {
      setPanelPhase('closing')
      return
    }
    setPanel(nextPanel)
    setPanelPhase('opening')
  }, [panel, panelPhase])

  const closeDockPanel = useCallback(() => {
    if (panelPhase !== 'open') return
    setPanelPhase('closing')
  }, [panelPhase])

  useEffect(() => {
    if (panelPhase !== 'opening') return
    if (windowResizeInFlightRef.current) return

    const run = async () => {
      windowResizeInFlightRef.current = true
      try {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
        await fitWindowToCurrentContent()
        setPanelPhase('open')
      } finally {
        windowResizeInFlightRef.current = false
      }
    }

    void run()
  }, [panelPhase, fitWindowToCurrentContent])

  useEffect(() => {
    if (panelPhase !== 'closing') return

    const timeout = window.setTimeout(() => {
      setPanel(null)
      setPanelPhase('closed')
    }, 120)

    return () => window.clearTimeout(timeout)
  }, [panelPhase])

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
        // Keep our own app window hidden unless explicitly enabled (use includeAppWindows to record Bokeh briefly).
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
    closeDockPanel()

    if (source.type === RecordingSourceType.Screen && source.displayInfo?.id !== undefined) {
      window.electronAPI?.showMonitorOverlay?.(source.displayInfo.id)
    } else if (source.type === RecordingSourceType.Window) {
      window.electronAPI?.showWindowOverlay?.(source.id)
    }
  }

  const handleWindowModeClick = () => {
    window.electronAPI?.hideMonitorOverlay?.()
    openDockPanel('windows')
  }

  const handleAreaClick = async () => {
    window.electronAPI?.hideMonitorOverlay?.()
    closeDockPanel()

    const result = await window.electronAPI?.selectScreenArea?.()
    const area = result?.area
    if (result?.success && area) {
      setSelectedSourceId(createAreaSourceId(area))
      window.electronAPI?.showRecordingOverlay?.(
        { x: area.x, y: area.y, width: area.width, height: area.height },
        'Selected Area',
        { displayId: area.displayId, relativeToDisplay: true }
      )
    }
  }

  const handleStartRecording = async () => {
    if (!screenRecording) {
      requestScreenRecording()
      return
    }
    if (!selectedSourceId) return

    window.electronAPI?.hideMonitorOverlay?.()
    window.electronAPI?.hideRecordingOverlay?.()
    closeDockPanel()

    if (hideDesktopIcons) {
      await window.electronAPI?.hideDesktopIcons?.()
    }

    setRecordingSettings({ includeAppWindows })

    // Resolve source details (area selection is interactive).
    let finalSourceId = selectedSourceId
    let finalDisplayId: number | undefined = sources.find(s => s.id === selectedSourceId)?.displayInfo?.id

    if (selectedSourceId === 'area:selection') {
      const result = await window.electronAPI?.selectScreenArea?.()
      const area = result?.area
      if (!result?.success || !area) return
      finalSourceId = createAreaSourceId(area)
      finalDisplayId = area.displayId
    }

    prepareRecording(finalSourceId, finalDisplayId)
    startCountdown(startRecording, finalDisplayId)
  }

  const handleStop = async () => {
    // Hide webcam preview when recording stops
    window.electronAPI?.hideWebcamPreview?.()

    if (hideDesktopIcons) {
      await window.electronAPI?.showDesktopIcons?.()
    }
    await stopRecording()
    window.electronAPI?.openWorkspace?.()
  }

  const handleToggleRecord = async () => {
    if (isPaused) {
      await window.electronAPI?.resumeRecording?.()
    } else {
      await window.electronAPI?.pauseRecording?.()
    }
  }

  // Device toggle handlers - use centralized permissions
  const handleToggleWebcam = async () => {
    if (!deviceSettings.webcam.enabled && !cameraPermission) {
      const granted = await requestCamera()
      if (!granted) {
        logger.warn('[RecordButtonDock] Camera permission denied')
        return
      }
    }
    toggleWebcam()
  }

  const handleToggleMicrophone = async () => {
    if (!deviceSettings.microphone.enabled && !microphonePermission) {
      const granted = await requestMicrophone()
      if (!granted) {
        logger.warn('[RecordButtonDock] Microphone permission denied')
        return
      }
    }
    toggleMicrophone()
  }

  const handleDevicePickerToggle = () => {
    openDockPanel('devices')
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

  const springConfig = { type: 'spring', stiffness: 400, damping: 30 } as const

  const barStyle = cn(
    "flex items-center gap-1 px-1.5 py-1.5 rounded-14",
    "bg-popover/95 backdrop-blur-xl",
    "border border-border/50"
  )

  // Horizontal icon+text buttons - Apple-like snappy animations
  const sourceButtonStyle = (isSelected: boolean) => cn(
    "relative flex items-center gap-1.5 h-9 px-3 rounded-lg whitespace-nowrap",
    "transition-colors duration-150",
    "text-2xs font-medium tracking-[-0.01em]",
    "active:scale-[0.97]",
    isSelected
      ? "text-accent-foreground"
      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
  )

  const optionButtonStyle = (isActive: boolean) => cn(
    "relative flex items-center gap-1.5 h-8 px-2.5 rounded-md whitespace-nowrap",
    "text-3xs font-medium tracking-[-0.01em]",
    "transition-[color,background] duration-80 ease-standard",
    "active:opacity-70",
    isActive
      ? "text-accent-foreground"
      : "text-muted-foreground/60 hover:text-muted-foreground"
  )

  // Skeleton matches horizontal button layout - width matches actual source buttons
  const SkeletonButton = () => (
    <div className="flex items-center gap-1.5 h-9 px-3">
      <div className="w-4 h-4 rounded-sm bg-muted/20 animate-pulse" />
      <div className="w-12 h-2.5 rounded-sm bg-muted/20 animate-pulse" />
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // RECORDING STATE
  // ═══════════════════════════════════════════════════════════════════════════
  if (isRecording) {
    return (
      <div ref={containerRef} className="inline-block p-1">
        <div className={barStyle} style={{ ['WebkitAppRegion' as any]: 'drag' }}>
          <div className="flex items-center gap-2 px-3 h-11">
            {/* Recording dot - both layers absolutely positioned for perfect centering */}
            <span className="relative flex-shrink-0 w-1.5 h-1.5">
              <span className="absolute inset-0 animate-ping rounded-pill bg-destructive opacity-60 will-change-transform" />
              <span className="absolute inset-0 rounded-pill bg-destructive" />
            </span>
            {/* Timer - fixed width to prevent layout shift */}
            <span className="text-foreground/90 text-ui-sm font-mono font-medium tabular-nums tracking-tight min-w-[52px]">
              {formatTime(localDuration)}
            </span>
          </div>

          <div className="w-px h-6 bg-border/50" />

          <motion.button
            type="button"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onClick={handleToggleRecord}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
              "text-foreground hover:bg-accent/50"
            )}
            title={isPaused ? "Resume Recording" : "Pause Recording"}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
          </motion.button>

          <div className="w-px h-6 bg-border/50" />

          {/* Recording Controls (Mic/Cam) */}
          <div className="flex items-center gap-1">
            {/* Mic Toggle */}
            <motion.button
              type="button"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              onClick={handleToggleMicrophone}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
                deviceSettings.microphone.enabled
                  ? "text-foreground hover:bg-accent/50"
                  : "text-destructive hover:bg-destructive/10"
              )}
              title={deviceSettings.microphone.enabled ? 'Mute Microphone' : 'Unmute Microphone'}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {deviceSettings.microphone.enabled ? (
                <Mic className="w-4 h-4" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
            </motion.button>

            {/* Camera Toggle */}
            <motion.button
              type="button"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              onClick={handleToggleWebcam}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
                deviceSettings.webcam.enabled
                  ? "text-foreground hover:bg-accent/50"
                  : "text-destructive hover:bg-destructive/10"
              )}
              title={deviceSettings.webcam.enabled ? 'Turn Camera Off' : 'Turn Camera On'}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {deviceSettings.webcam.enabled ? (
                <Camera className="w-4 h-4" />
              ) : (
                <CameraOff className="w-4 h-4" />
              )}
            </motion.button>
          </div>

          <div className="w-px h-6 bg-border/50" />

          <motion.button
            type="button"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onClick={handleStop}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3.5 rounded-lg",
              "bg-muted/50 hover:bg-muted",
              "text-foreground/85 text-xs font-medium",
              "transition-all duration-100"
            )}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={springConfig}
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            <span>Stop</span>
          </motion.button>
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
        <motion.div
          initial={false}
          animate={panelPhase === 'open' ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
          className={cn(
            "w-sidebar p-2 rounded-xl",
            panelPhase === 'open' ? "pointer-events-auto" : "pointer-events-none",
            "bg-popover/95 backdrop-blur-xl",
            "border border-border/50"
          )}
        >
          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search windows..."
              value={windowSearch}
              onChange={(e) => setWindowSearch(e.target.value)}
              className={cn(
                "w-full h-8 pl-7 pr-7 rounded-lg",
                "bg-muted/30 border-none",
                "text-foreground/90 text-xs placeholder:text-muted-foreground/40",
                "focus:outline-none",
                "transition-all duration-100"
              )}
            />
            {windowSearch && (
              <button
                type="button"
                onClick={() => setWindowSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground/60 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Window List */}
          <div className="max-h-[160px] overflow-y-auto">
            {filteredWindows.length === 0 ? (
              <div className="py-6 text-center text-2xs text-muted-foreground/40 font-medium">
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
                      "w-full px-2.5 py-2 rounded-md text-2xs truncate text-left",
                      "transition-all duration-100",
                      selectedSourceId === win.id
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground"
                    )}
                    title={win.name}
                  >
                    {win.name.length > 45 ? win.name.slice(0, 45) + '…' : win.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Device Picker - renders ABOVE the dock bar when devices are enabled */}
      {(deviceSettings.webcam.enabled || deviceSettings.microphone.enabled) && showDevicePicker && (
        <motion.div
          initial={false}
          animate={panelPhase === 'open' ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
          className={cn(
            "w-popover p-2.5 rounded-xl",
            panelPhase === 'open' ? "pointer-events-auto" : "pointer-events-none",
            "bg-popover/95 backdrop-blur-xl",
            "border border-border/50"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Devices</span>
            <button
              type="button"
              onClick={closeDockPanel}
              className="p-1 rounded hover:bg-accent/50 transition-colors"
            >
              <X className="w-3 h-3 text-muted-foreground/60" />
            </button>
          </div>

          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {/* Camera Selection */}
            {deviceSettings.webcam.enabled && (
              <div className="p-2 bg-muted/20 rounded-lg">
                <div className="flex items-center gap-2 mb-1.5">
                  <Camera className="w-3.5 h-3.5 text-muted-foreground/70" />
                  <span className="text-3xs font-medium text-muted-foreground/70 uppercase tracking-wide">Camera</span>
                </div>
                <div className="space-y-0.5">
                  {webcams.length === 0 ? (
                    <div className="py-2 text-center text-3xs text-muted-foreground/40">No cameras found</div>
                  ) : (
                    webcams.map(cam => (
                      <button
                        key={cam.deviceId}
                        type="button"
                        onClick={() => selectWebcam(cam.deviceId)}
                        className={cn(
                          "w-full px-2 py-1.5 rounded-sm text-2xs text-left truncate",
                          "transition-all duration-75",
                          deviceSettings.webcam.deviceId === cam.deviceId
                            ? "bg-primary/20 text-foreground font-medium"
                            : "text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground"
                        )}
                        title={cam.label}
                      >
                        {cam.label || 'Camera'}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Microphone Selection */}
            {deviceSettings.microphone.enabled && (
              <div className="p-2 bg-muted/20 rounded-lg">
                <div className="flex items-center gap-2 mb-1.5">
                  <Mic className="w-3.5 h-3.5 text-muted-foreground/70" />
                  <span className="text-3xs font-medium text-muted-foreground/70 uppercase tracking-wide">Microphone</span>
                </div>
                <div className="space-y-0.5">
                  {microphones.length === 0 ? (
                    <div className="py-2 text-center text-3xs text-muted-foreground/40">No microphones found</div>
                  ) : (
                    microphones.map(mic => (
                      <button
                        key={mic.deviceId}
                        type="button"
                        onClick={() => selectMicrophone(mic.deviceId)}
                        className={cn(
                          "w-full px-2 py-1.5 rounded-sm text-2xs text-left truncate",
                          "transition-all duration-75",
                          deviceSettings.microphone.deviceId === mic.deviceId
                            ? "bg-primary/20 text-foreground font-medium"
                            : "text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground"
                        )}
                        title={mic.label}
                      >
                        {mic.label || 'Microphone'}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
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
              <motion.button
                type="button"
                key={screen.id}
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={() => handleSourceSelect(screen)}
                className={sourceButtonStyle(selectedSourceId === screen.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <AnimatePresence>
                  {selectedSourceId === screen.id && (
                    <motion.div
                      className="absolute inset-0 rounded-lg bg-accent"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={springConfig}
                      layoutId="dock-source-active"
                    />
                  )}
                </AnimatePresence>
                <Monitor className="relative z-10 w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                <span className="relative z-10">
                  {screens.length > 1
                    ? (screen.displayInfo?.isPrimary ? 'Main' : `Display ${idx + 1}`)
                    : 'Display'}
                </span>
              </motion.button>
            ))}

            {windows.length > 0 && (
              <motion.button
                type="button"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={handleWindowModeClick}
                className={sourceButtonStyle(isWindowSelected || showWindowPicker)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <AnimatePresence>
                  {(isWindowSelected || showWindowPicker) && (
                    <motion.div
                      className="absolute inset-0 rounded-lg bg-accent"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={springConfig}
                      layoutId="dock-source-active"
                    />
                  )}
                </AnimatePresence>
                <AppWindow className="relative z-10 w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                <span className="relative z-10">Window</span>
                <ChevronDown className={cn(
                  "relative z-10 w-3 h-3 opacity-50 transition-transform duration-100 -ml-0.5",
                  showWindowPicker && "rotate-180"
                )} />
              </motion.button>
            )}

            {areaOption && (
              <motion.button
                type="button"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={handleAreaClick}
                className={sourceButtonStyle(selectedSourceId?.startsWith('area:') ?? false)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <AnimatePresence>
                  {(selectedSourceId?.startsWith('area:') ?? false) && (
                    <motion.div
                      className="absolute inset-0 rounded-lg bg-accent"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={springConfig}
                      layoutId="dock-source-active"
                    />
                  )}
                </AnimatePresence>
                <Crop className="relative z-10 w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                <span className="relative z-10">Area</span>
              </motion.button>
            )}
          </>
        )}

        <div className="w-px h-6 bg-border/50 mx-1" />

        {/* Options */}
        <div className="flex items-center gap-1.5">
          {/* System Audio */}
          <motion.button
            type="button"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={optionButtonStyle(audioEnabled)}
            title={audioEnabled ? 'System audio enabled' : 'System audio muted'}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={springConfig}
          >
            <AnimatePresence>
              {audioEnabled && (
                <motion.div
                  className="absolute inset-0 rounded-md bg-accent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                />
              )}
            </AnimatePresence>
            {audioEnabled ? <Volume2 className="relative z-10 w-3 h-3" strokeWidth={1.75} /> : <MicOff className="relative z-10 w-3 h-3" strokeWidth={1.75} />}
            <span className="relative z-10">{audioEnabled ? 'System' : 'Muted'}</span>
          </motion.button>

          {/* Webcam Toggle */}
          <div className="flex items-center">
            <motion.button
              type="button"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              onClick={handleToggleWebcam}
              className={cn(
                optionButtonStyle(deviceSettings.webcam.enabled),
                deviceSettings.webcam.enabled && "rounded-r-none pr-1"
              )}
              title={deviceSettings.webcam.enabled ? 'Camera enabled' : 'Camera disabled'}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <AnimatePresence>
                {deviceSettings.webcam.enabled && (
                  <motion.div
                    className="absolute inset-0 rounded-l-md rounded-r-none bg-accent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  />
                )}
              </AnimatePresence>
              {deviceSettings.webcam.enabled ? (
                <Camera className="relative z-10 w-3 h-3" strokeWidth={1.75} />
              ) : (
                <CameraOff className="relative z-10 w-3 h-3" strokeWidth={1.75} />
              )}
              <span className="relative z-10">Cam</span>
            </motion.button>
            {deviceSettings.webcam.enabled && (
              <motion.button
                type="button"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={handleDevicePickerToggle}
                className="relative flex items-center justify-center h-8 px-1.5 rounded-r-md rounded-l-none hover:bg-accent/30 transition-colors"
                title="Select camera"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={springConfig}
              >
                <div className="absolute inset-0 rounded-r-md rounded-l-none bg-accent -z-10" />
                <ChevronDown className={cn(
                  "w-2.5 h-2.5 text-accent-foreground transition-transform duration-100",
                  showDevicePicker && "rotate-180"
                )} />
              </motion.button>
            )}
          </div>

          {/* Microphone Toggle */}
          <div className="flex items-center">
            <motion.button
              type="button"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              onClick={handleToggleMicrophone}
              className={cn(
                optionButtonStyle(deviceSettings.microphone.enabled),
                deviceSettings.microphone.enabled && "rounded-r-none pr-1"
              )}
              title={deviceSettings.microphone.enabled ? 'Microphone enabled' : 'Microphone disabled'}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <AnimatePresence>
                {deviceSettings.microphone.enabled && (
                  <motion.div
                    className="absolute inset-0 rounded-l-md rounded-r-none bg-accent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  />
                )}
              </AnimatePresence>
              {deviceSettings.microphone.enabled ? (
                <Mic className="relative z-10 w-3 h-3" strokeWidth={1.75} />
              ) : (
                <MicOff className="relative z-10 w-3 h-3" strokeWidth={1.75} />
              )}
              <span className="relative z-10">Mic</span>
            </motion.button>
            {deviceSettings.microphone.enabled && (
              <motion.button
                type="button"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={handleDevicePickerToggle}
                className="relative flex items-center justify-center h-8 px-1.5 rounded-r-md rounded-l-none hover:bg-accent/30 transition-colors"
                title="Select microphone"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={springConfig}
              >
                <div className="absolute inset-0 rounded-r-md rounded-l-none bg-accent -z-10" />
                <ChevronDown className={cn(
                  "w-2.5 h-2.5 text-accent-foreground transition-transform duration-100",
                  showDevicePicker && "rotate-180"
                )} />
              </motion.button>
            )}
          </div>

          {/* Desktop Icons Toggle */}
          <motion.button
            type="button"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onClick={() => setHideDesktopIcons(!hideDesktopIcons)}
            className={optionButtonStyle(hideDesktopIcons)}
            title={hideDesktopIcons ? 'Desktop icons hidden' : 'Desktop icons visible'}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={springConfig}
          >
            <AnimatePresence>
              {hideDesktopIcons && (
                <motion.div
                  className="absolute inset-0 rounded-md bg-accent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                />
              )}
            </AnimatePresence>
            {hideDesktopIcons ? <EyeOff className="relative z-10 w-3 h-3" strokeWidth={1.75} /> : <Eye className="relative z-10 w-3 h-3" strokeWidth={1.75} />}
            <span className="relative z-10">{hideDesktopIcons ? 'Clean' : 'Desktop'}</span>
          </motion.button>
        </div>

        <div className="w-px h-6 bg-border/50 mx-1" />

        {/* Notes Button */}
        <motion.button
          type="button"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          onClick={() => window.electronAPI?.toggleTeleprompterWindow?.()}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-accent/50 transition-all duration-100"
          title="Recording Notes"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={springConfig}
        >
          <NotebookText className="w-4 h-4" strokeWidth={1.75} />
        </motion.button>

        {/* Library */}
        <motion.button
          type="button"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          onClick={() => window.electronAPI?.openWorkspace?.()}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-accent/50 transition-all duration-100"
          title="Open Library"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={springConfig}
        >
          <FolderOpen className="w-4 h-4" strokeWidth={1.75} />
        </motion.button>

        {/* Record Button */}
        <motion.button
          type="button"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          onClick={handleStartRecording}
          disabled={!selectedSourceId || isStartingRecording}
          className={cn(
            "flex items-center justify-center gap-2 h-10 px-5 rounded-10",
            "text-2xs font-semibold uppercase tracking-[0.08em]",
            "transition-all duration-150 ease-out",
            selectedSourceId && !isStartingRecording
              ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_1px_3px_rgba(0,0,0,0.2)] hover:brightness-110 active:scale-[0.97]"
              : "bg-muted/40 text-muted-foreground/20 cursor-not-allowed"
          )}
          whileHover={selectedSourceId && !isStartingRecording ? { scale: 1.02 } : undefined}
          whileTap={selectedSourceId && !isStartingRecording ? { scale: 0.98 } : undefined}
          transition={springConfig}
        >
          <span className={cn(
            "w-2 h-2 rounded-pill",
            selectedSourceId && !isStartingRecording
              ? "bg-primary-foreground shadow-[0_0_8px_rgba(255,255,255,0.5)]"
              : "bg-muted-foreground/30"
          )} />
          <span>{isStartingRecording ? 'Starting' : 'Record'}</span>
        </motion.button>
      </div>
    </div>

  )
}
