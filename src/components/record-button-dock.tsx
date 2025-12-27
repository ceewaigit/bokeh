import { useEffect, useState, useCallback, useRef } from 'react'
import { useRecording } from '@/hooks/use-recording'
import { usePermissions } from '@/hooks/use-permissions'
import { useRecordingSessionStore } from '@/stores/recording-session-store'
import { useDeviceStore } from '@/stores/device-store'
import { formatTime, cn } from '@/lib/utils'
import { logger } from '@/lib/utils/logger'
import { initializeDefaultWallpaper } from '@/lib/constants/default-effects'
import { createAreaSourceId } from '@/lib/recording/utils/area-source-parser'
import { RecordingSourceType } from '@/types/project'
import { AudioInput } from '@/types'
import { useProjectStore } from '@/stores/project-store'
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
  Volume2
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
  const resizeTimeoutRef = useRef<number | null>(null)
  const focusTimeoutRef = useRef<number | null>(null)
  const countdownTimeoutRef = useRef<number | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [sources, setSources] = useState<Source[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [hideDesktopIcons, setHideDesktopIcons] = useState(false)
  const [includeAppWindows] = useState(false)
  const [isLoadingSources, setIsLoadingSources] = useState(true)
  const [showWindowPicker, setShowWindowPicker] = useState(false)
  const [windowSearch, setWindowSearch] = useState('')
  const [showDevicePicker, setShowDevicePicker] = useState(false)

  // Centralized permissions
  const {
    screenRecording,
    camera: cameraPermission,
    microphone: microphonePermission,
    requestScreenRecording,
    requestCamera,
    requestMicrophone
  } = usePermissions()

  const { startRecording, stopRecording, pauseRecording, resumeRecording, canPause, canResume } = useRecording()
  const { isRecording, isPaused, duration, updateSettings, startCountdown, prepareRecording } = useRecordingSessionStore()
  const setRecordingSettings = useProjectStore((s) => s.setRecordingSettings)

  useEffect(() => {
    return () => {
      if (countdownTimeoutRef.current !== null) {
        window.clearTimeout(countdownTimeoutRef.current)
        countdownTimeoutRef.current = null
      }
    }
  }, [])

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
        useRecordingSessionStore.getState().setPaused(false)
      }
    }
  }, [])

  useEffect(() => { initializeDefaultWallpaper() }, [])

  // Initialize device manager
  useEffect(() => {
    if (!devicesInitialized) {
      initializeDevices()
    }
  }, [devicesInitialized, initializeDevices])

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
    const scheduleUpdate = () => {
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current)
      }
      resizeTimeoutRef.current = window.setTimeout(updateSize, 16)
    }

    scheduleUpdate()
    const observer = new ResizeObserver(() => scheduleUpdate())
    observer.observe(container)
    return () => {
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current)
        resizeTimeoutRef.current = null
      }
      observer.disconnect()
    }
  }, [isRecording, showWindowPicker, showDevicePicker])

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
      setShowDevicePicker(false)
    }
  }

  const handleAreaClick = async () => {
    window.electronAPI?.hideMonitorOverlay?.()
    setShowWindowPicker(false)
    setShowDevicePicker(false)

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

    const source = sources.find(s => s.id === selectedSourceId)
    const displayId = source?.displayInfo?.id

    window.electronAPI?.hideMonitorOverlay?.()
    window.electronAPI?.hideRecordingOverlay?.()
    setShowWindowPicker(false)
    setShowDevicePicker(false)
    await initializeDefaultWallpaper()

    if (hideDesktopIcons) {
      await window.electronAPI?.hideDesktopIcons?.()
    }

    setRecordingSettings({ includeAppWindows })

    if (selectedSourceId.startsWith('area:')) {
      if (selectedSourceId === 'area:selection') {
        const result = await window.electronAPI?.selectScreenArea?.()
        const area = result?.area
        if (result?.success && area) {
          prepareRecording(createAreaSourceId(area), area.displayId)
          if (countdownTimeoutRef.current !== null) {
            window.clearTimeout(countdownTimeoutRef.current)
          }
          countdownTimeoutRef.current = window.setTimeout(() => startCountdown(startRecording, area.displayId), 50)
        }
      } else {
        prepareRecording(selectedSourceId, displayId)
        if (countdownTimeoutRef.current !== null) {
          window.clearTimeout(countdownTimeoutRef.current)
        }
        countdownTimeoutRef.current = window.setTimeout(() => startCountdown(startRecording, displayId), 50)
      }
    } else {
      prepareRecording(selectedSourceId, displayId)
      if (countdownTimeoutRef.current !== null) {
        window.clearTimeout(countdownTimeoutRef.current)
      }
      countdownTimeoutRef.current = window.setTimeout(() => startCountdown(startRecording, displayId), 50)
    }
  }

  const handleStop = async () => {
    if (hideDesktopIcons) {
      await window.electronAPI?.showDesktopIcons?.()
    }
    await stopRecording()
    window.electronAPI?.openWorkspace?.()
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
    setShowDevicePicker(!showDevicePicker)
    if (showWindowPicker) setShowWindowPicker(false)
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
    "flex items-center gap-1 px-1.5 py-1.5 rounded-[14px]",
    "bg-[#1c1c1e]/95 backdrop-blur-xl",
    "border border-white/[0.08]"
  )

  // Horizontal icon+text buttons - Apple-like snappy animations
  const sourceButtonStyle = (isSelected: boolean) => cn(
    "relative flex items-center gap-1.5 h-[36px] px-3 rounded-[8px] whitespace-nowrap",
    "transition-colors duration-150",
    "text-[11px] font-medium tracking-[-0.01em]",
    "active:scale-[0.97]",
    isSelected
      ? "text-white"
      : "text-white/40 hover:text-white/75 hover:bg-white/[0.06]"
  )

  const optionButtonStyle = (isActive: boolean) => cn(
    "relative flex items-center gap-1.5 h-[32px] px-2.5 rounded-[6px] whitespace-nowrap",
    "text-[10px] font-medium tracking-[-0.01em]",
    "transition-[color,background] duration-80 ease-standard",
    "active:opacity-70",
    isActive
      ? "text-white/80"
      : "text-white/35 hover:text-white/60"
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
            {/* Recording dot - both layers absolutely positioned for perfect centering */}
            <span className="relative flex-shrink-0 w-[6px] h-[6px]">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#ff3b30] opacity-60 will-change-transform" />
              <span className="absolute inset-0 rounded-full bg-[#ff3b30]" />
            </span>
            {/* Timer - fixed width to prevent layout shift */}
            <span className="text-white/90 text-[13px] font-mono font-medium tabular-nums tracking-tight min-w-[52px]">
              {formatTime(duration)}
            </span>
          </div>

          <div className="w-px h-6 bg-white/[0.08]" />

          {(canPause() || canResume()) && (
            <motion.button
              type="button"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              onClick={isPaused ? resumeRecording : pauseRecording}
              className="flex items-center justify-center w-[36px] h-[36px] rounded-[8px] text-white/50 hover:text-white hover:bg-white/[0.08] transition-all duration-100"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={springConfig}
            >
              {isPaused ? <Play className="w-[14px] h-[14px] fill-current" /> : <Pause className="w-[14px] h-[14px]" />}
            </motion.button>
          )}

          <motion.button
            type="button"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onClick={handleStop}
            className={cn(
              "flex items-center gap-1.5 h-[36px] px-3.5 rounded-[8px]",
              "bg-white/[0.08] hover:bg-white/[0.12]",
              "text-white/85 text-[12px] font-medium",
              "transition-all duration-100"
            )}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={springConfig}
          >
            <Square className="w-[10px] h-[10px] fill-current" />
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

      {/* Device Picker - renders ABOVE the dock bar when devices are enabled */}
      {(deviceSettings.webcam.enabled || deviceSettings.microphone.enabled) && showDevicePicker && (
        <div
          className={cn(
            "w-[260px] p-2.5 rounded-[12px]",
            "bg-[#1c1c1e]/95 backdrop-blur-xl",
            "border border-white/[0.08]"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-medium text-white/60 uppercase tracking-wide">Devices</span>
            <button
              type="button"
              onClick={() => setShowDevicePicker(false)}
              className="p-1 rounded hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-3 h-3 text-white/40" />
            </button>
          </div>

          <div className="space-y-2">
            {/* Camera Selection */}
            {deviceSettings.webcam.enabled && (
              <div className="p-2 bg-white/[0.04] rounded-[8px]">
                <div className="flex items-center gap-2 mb-1.5">
                  <Camera className="w-3.5 h-3.5 text-white/50" />
                  <span className="text-[10px] font-medium text-white/50 uppercase tracking-wide">Camera</span>
                </div>
                <div className="space-y-0.5">
                  {webcams.length === 0 ? (
                    <div className="py-2 text-center text-[10px] text-white/30">No cameras found</div>
                  ) : (
                    webcams.map(cam => (
                      <button
                        key={cam.deviceId}
                        type="button"
                        onClick={() => selectWebcam(cam.deviceId)}
                        className={cn(
                          "w-full px-2 py-1.5 rounded-[4px] text-[11px] text-left truncate",
                          "transition-all duration-75",
                          deviceSettings.webcam.deviceId === cam.deviceId
                            ? "bg-accent/20 text-white font-medium"
                            : "text-white/60 hover:bg-white/[0.06] hover:text-white/80"
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
              <div className="p-2 bg-white/[0.04] rounded-[8px]">
                <div className="flex items-center gap-2 mb-1.5">
                  <Mic className="w-3.5 h-3.5 text-white/50" />
                  <span className="text-[10px] font-medium text-white/50 uppercase tracking-wide">Microphone</span>
                </div>
                <div className="space-y-0.5">
                  {microphones.length === 0 ? (
                    <div className="py-2 text-center text-[10px] text-white/30">No microphones found</div>
                  ) : (
                    microphones.map(mic => (
                      <button
                        key={mic.deviceId}
                        type="button"
                        onClick={() => selectMicrophone(mic.deviceId)}
                        className={cn(
                          "w-full px-2 py-1.5 rounded-[4px] text-[11px] text-left truncate",
                          "transition-all duration-75",
                          deviceSettings.microphone.deviceId === mic.deviceId
                            ? "bg-accent/20 text-white font-medium"
                            : "text-white/60 hover:bg-white/[0.06] hover:text-white/80"
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
                      className="absolute inset-0 rounded-[8px] bg-white/[0.12]"
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
                      className="absolute inset-0 rounded-[8px] bg-white/[0.12]"
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
                      className="absolute inset-0 rounded-[8px] bg-white/[0.12]"
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

        <div className="w-px h-6 bg-white/[0.08] mx-1" />

        {/* Options */}
        <div className="flex items-center">
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
                  className="absolute inset-0 rounded-[6px] bg-white/[0.06]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                />
              )}
            </AnimatePresence>
            {audioEnabled ? <Volume2 className="relative z-10 w-[12px] h-[12px]" strokeWidth={1.75} /> : <MicOff className="relative z-10 w-[12px] h-[12px]" strokeWidth={1.75} />}
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
                    className="absolute inset-0 rounded-l-[6px] rounded-r-none bg-white/[0.06]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  />
                )}
              </AnimatePresence>
              {deviceSettings.webcam.enabled ? (
                <Camera className="relative z-10 w-[12px] h-[12px]" strokeWidth={1.75} />
              ) : (
                <CameraOff className="relative z-10 w-[12px] h-[12px]" strokeWidth={1.75} />
              )}
              <span className="relative z-10">Cam</span>
            </motion.button>
            {deviceSettings.webcam.enabled && (
              <motion.button
                type="button"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={handleDevicePickerToggle}
                className="relative flex items-center justify-center h-[32px] px-1.5 rounded-r-[6px] rounded-l-none hover:bg-white/[0.1] transition-colors"
                title="Select camera"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={springConfig}
              >
                <div className="absolute inset-0 rounded-r-[6px] rounded-l-none bg-white/[0.06] -z-10" />
                <ChevronDown className={cn(
                  "w-2.5 h-2.5 text-white/60 transition-transform duration-100",
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
                    className="absolute inset-0 rounded-l-[6px] rounded-r-none bg-white/[0.06]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  />
                )}
              </AnimatePresence>
              {deviceSettings.microphone.enabled ? (
                <Mic className="relative z-10 w-[12px] h-[12px]" strokeWidth={1.75} />
              ) : (
                <MicOff className="relative z-10 w-[12px] h-[12px]" strokeWidth={1.75} />
              )}
              <span className="relative z-10">Mic</span>
            </motion.button>
            {deviceSettings.microphone.enabled && (
              <motion.button
                type="button"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                onClick={handleDevicePickerToggle}
                className="relative flex items-center justify-center h-[32px] px-1.5 rounded-r-[6px] rounded-l-none hover:bg-white/[0.1] transition-colors"
                title="Select microphone"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={springConfig}
              >
                <div className="absolute inset-0 rounded-r-[6px] rounded-l-none bg-white/[0.06] -z-10" />
                <ChevronDown className={cn(
                  "w-2.5 h-2.5 text-white/60 transition-transform duration-100",
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
                  className="absolute inset-0 rounded-[6px] bg-white/[0.06]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                />
              )}
            </AnimatePresence>
            {hideDesktopIcons ? <EyeOff className="relative z-10 w-[12px] h-[12px]" strokeWidth={1.75} /> : <Eye className="relative z-10 w-[12px] h-[12px]" strokeWidth={1.75} />}
            <span className="relative z-10">{hideDesktopIcons ? 'Clean' : 'Desktop'}</span>
          </motion.button>
        </div>

        <div className="w-px h-6 bg-white/[0.08] mx-1" />

        {/* Library */}
        <motion.button
          type="button"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          onClick={() => window.electronAPI?.openWorkspace?.()}
          className="flex items-center justify-center w-[36px] h-[36px] rounded-[8px] text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all duration-100"
          title="Open Library"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={springConfig}
        >
          <FolderOpen className="w-[15px] h-[15px]" strokeWidth={1.75} />
        </motion.button>

        {/* Record Button */}
        <motion.button
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
          whileHover={selectedSourceId ? { scale: 1.02 } : undefined}
          whileTap={selectedSourceId ? { scale: 0.98 } : undefined}
          transition={springConfig}
        >
          <span className={cn(
            "w-[7px] h-[7px] rounded-full",
            selectedSourceId
              ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
              : "bg-white/30"
          )} />
          <span>Record</span>
        </motion.button>
      </div>
    </div>
  )
}
