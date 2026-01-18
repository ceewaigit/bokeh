"use client"

import { useEffect, useState, useCallback } from 'react'
import { Activity, Video, Play, Palette, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'
import { useProjectStore } from '@/features/core/stores/project-store'
import { usePreviewSettingsStore } from '@/features/core/stores/preview-settings-store'
import { useTheme, type ColorPreset } from '@/shared/contexts/theme-context'
import { PRESET_DETAILS } from '@/shared/constants/appearance'
import { springSnappy } from '@/shared/constants/animations'
import { cn } from '@/shared/utils/utils'

// Subtle, fast transition
const quickTransition = { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }

type SettingsTab = 'playback' | 'recording' | 'appearance' | 'diagnostics'

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'playback', label: 'Playback', icon: Play },
  { id: 'recording', label: 'Recording', icon: Video },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
]

type BokehProcessSnapshot = {
  timestamp: number
  appName: string
  processes: Array<{
    pid: number
    name: string
    cpu: number
    memRss: number | null
  }>
  totalCpu: number
  totalMemRssBytes: number
}

export function SettingsDialog() {
  const isOpen = useWorkspaceStore((s) => s.isSettingsOpen)
  const setOpen = useWorkspaceStore((s) => s.setSettingsOpen)
  const [activeTab, setActiveTab] = useState<SettingsTab>('playback')

  const isHighQualityPlaybackEnabled = usePreviewSettingsStore((s) => s.highQuality)
  const isGlowEnabled = usePreviewSettingsStore((s) => s.showGlow)
  const glowIntensity = usePreviewSettingsStore((s) => s.glowIntensity)
  const showTimelineThumbnails = usePreviewSettingsStore((s) => s.showTimelineThumbnails)
  const scrubOnHover = usePreviewSettingsStore((s) => s.scrubOnHover)
  const setPreviewSettings = usePreviewSettingsStore((s) => s.setPreviewSettings)

  const recordingSettings = useProjectStore((s) => s.settings.recording)
  const setRecordingSettings = useProjectStore((s) => s.setRecordingSettings)

  const { colorPreset, setColorPreset } = useTheme()

  const [processSnapshot, setProcessSnapshot] = useState<BokehProcessSnapshot | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)
  const [processLoading, setProcessLoading] = useState(false)

  const formatPercent = useCallback((value?: number | null) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—'
    return `${Math.round(value)}%`
  }, [])

  const formatProcessMemory = useCallback((bytes?: number | null) => {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
    const mb = bytes / (1024 ** 2)
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
  }, [])

  const fetchProcessSnapshot = useCallback(async () => {
    setProcessLoading(true)
    setProcessError(null)
    try {
      const snapshot = await window.electronAPI?.getBokehProcesses?.()
      if (!snapshot) throw new Error('Unavailable')
      setProcessSnapshot(snapshot)
    } catch {
      setProcessError('Desktop app required.')
    } finally {
      setProcessLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onOpenSettingsDialog?.(() => setOpen(true))
    if (window.electronAPI?.consumePendingSettingsOpen?.()) setOpen(true)
    return () => { unsubscribe?.() }
  }, [setOpen])

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-[540px] p-0 gap-0 overflow-hidden shadow-modal bg-popover backdrop-blur-xl ring-1 ring-border">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure application preferences</DialogDescription>
        </DialogHeader>

        <div className="flex h-[400px]">
          {/* Sidebar */}
          <nav className="w-[160px] flex-shrink-0 flex flex-col pt-5 pb-4 px-2 border-r border-border">
            <div className="space-y-0.5">
              {SETTINGS_TABS.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    transition={springSnappy}
                    className={cn(
                      "relative w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-ui-sm transition-colors",
                      isActive
                        ? "text-foreground bg-muted"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <tab.icon className="w-4 h-4" strokeWidth={1.5} />
                    <span>{tab.label}</span>
                  </motion.button>
                )
              })}
            </div>
          </nav>

          {/* Content - fixed height */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={quickTransition}
                className="h-full p-5 overflow-y-auto"
              >
                {activeTab === 'recording' && (
                  <div className="space-y-4">
                    <SectionHeader title="Recording" />
                    <div className="space-y-1">
                      <SettingRow
                        label="Low-Memory Encoder"
                        description="For devices with limited RAM"
                        checked={recordingSettings.lowMemoryEncoder}
                        onChange={(c) => setRecordingSettings({ lowMemoryEncoder: c })}
                      />
                      <SettingRow
                        label="Optimized macOS Encoder"
                        description="Hardware acceleration for Apple Silicon"
                        checked={recordingSettings.useMacOSDefaults}
                        onChange={(c) => setRecordingSettings({ useMacOSDefaults: c })}
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'playback' && (
                  <div className="space-y-4">
                    <SectionHeader title="Playback" />
                    <div className="space-y-1">
                      <SettingRow
                        label="High-Quality Playback"
                        description="Render at full resolution"
                        checked={isHighQualityPlaybackEnabled}
                        onChange={(c) => setPreviewSettings({ highQuality: c })}
                      />
                      <SettingRow
                        label="Timeline Thumbnails"
                        description="Show frames on clips"
                        checked={showTimelineThumbnails}
                        onChange={(c) => setPreviewSettings({ showTimelineThumbnails: c })}
                      />
                      <SettingRow
                        label="Scrub on Hover"
                        description="Preview when hovering timeline"
                        checked={scrubOnHover}
                        onChange={(c) => setPreviewSettings({ scrubOnHover: c })}
                      />
                      <SettingRow
                        label="Ambient Glow"
                        description="Color-matched bias lighting"
                        checked={isGlowEnabled}
                        onChange={(c) => setPreviewSettings({ showGlow: c })}
                        expandedContent={
                          <div className="pt-3 pb-1">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-2xs text-muted-foreground">Intensity</span>
                              <span className="text-2xs text-muted-foreground tabular-nums">
                                {Math.round(glowIntensity * 100)}%
                              </span>
                            </div>
                            <Slider
                              value={[glowIntensity]}
                              onValueChange={([v]) => setPreviewSettings({ glowIntensity: v })}
                              min={0}
                              max={1}
                              step={0.05}
                            />
                          </div>
                        }
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'appearance' && (
                  <div className="space-y-4">
                    <SectionHeader title="Accent Color" />
                    <div className="grid grid-cols-4 gap-2">
                      {(Object.keys(PRESET_DETAILS) as ColorPreset[]).map((preset) => {
                        const details = PRESET_DETAILS[preset]
                        const isSelected = colorPreset === preset
                        return (
                          <button
                            key={preset}
                            onClick={() => setColorPreset(preset)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 p-2.5 rounded-lg transition-colors",
                              isSelected ? "bg-muted" : "hover:bg-muted/50"
                            )}
                          >
                            <div className={cn(
                              "relative w-6 h-6 rounded-full",
                              details.accent
                            )}>
                              {isSelected && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
                                </div>
                              )}
                            </div>
                            <span className={cn(
                              "text-2xs",
                              isSelected ? "text-foreground" : "text-muted-foreground"
                            )}>
                              {details.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {activeTab === 'diagnostics' && (
                  <div className="space-y-4">
                    <SectionHeader title="Diagnostics" />

                    <button
                      onClick={fetchProcessSnapshot}
                      disabled={processLoading}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left",
                        "bg-muted/50 hover:bg-muted transition-colors",
                        "disabled:opacity-50"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Activity className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                        <div>
                          <div className="text-ui-sm">System Snapshot</div>
                          <div className="text-2xs text-muted-foreground">
                            {processLoading ? 'Scanning...' : 'CPU & memory usage'}
                          </div>
                        </div>
                      </div>
                    </button>

                    {processError && (
                      <div className="text-xs text-destructive px-3 py-2 rounded-lg bg-destructive/15">
                        {processError}
                      </div>
                    )}

                    {processSnapshot && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-3"
                      >
                        <div className="grid grid-cols-2 gap-2">
                          <div className="px-3 py-2 rounded-lg bg-muted/50">
                            <div className="text-3xs text-muted-foreground uppercase tracking-wider mb-0.5">CPU</div>
                            <div className="text-ui-base font-medium tabular-nums">{formatPercent(processSnapshot.totalCpu)}</div>
                          </div>
                          <div className="px-3 py-2 rounded-lg bg-muted/50">
                            <div className="text-3xs text-muted-foreground uppercase tracking-wider mb-0.5">Memory</div>
                            <div className="text-ui-base font-medium tabular-nums">{formatProcessMemory(processSnapshot.totalMemRssBytes)}</div>
                          </div>
                        </div>

                        <div className="rounded-lg overflow-hidden bg-muted/50">
                          <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
                            <span className="text-3xs text-muted-foreground uppercase tracking-wider">Processes</span>
                            <span className="text-3xs text-muted-foreground tabular-nums">{processSnapshot.processes.length}</span>
                          </div>
                          <div className="max-h-[100px] overflow-y-auto">
                            {processSnapshot.processes.map((p) => (
                              <div key={p.pid} className="flex items-center justify-between px-3 py-1.5 text-2xs">
                                <span className="text-foreground/80 truncate max-w-[120px]">{p.name}</span>
                                <span className="text-muted-foreground tabular-nums">
                                  {formatPercent(p.cpu)} · {formatProcessMemory(p.memRss)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-ui-sm font-medium text-foreground/70 mb-1">{title}</h2>
  )
}

function SettingRow({
  label,
  description,
  checked,
  onChange,
  expandedContent
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (c: boolean) => void
  expandedContent?: React.ReactNode
}) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between">
        <div className="flex-1 mr-3">
          <Label className="text-ui-sm text-foreground">{label}</Label>
          {description && (
            <p className="text-2xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
      {checked && expandedContent && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15 }}
        >
          {expandedContent}
        </motion.div>
      )}
    </div>
  )
}
