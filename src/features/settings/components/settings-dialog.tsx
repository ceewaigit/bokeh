"use client"

import { useEffect, useState } from 'react'
import { Activity, Video, Play, Palette } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useWorkspaceStore } from '@/features/stores/workspace-store'
import { useProjectStore } from '@/features/stores/project-store'
import { usePreviewSettingsStore } from '@/features/stores/preview-settings-store'
import { useTheme, type ColorPreset } from '@/shared/contexts/theme-context'
import { cn } from '@/shared/utils/utils'

type SettingsTab = 'recording' | 'playback' | 'appearance' | 'diagnostics'

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'recording', label: 'Recording', icon: Video },
  { id: 'playback', label: 'Playback', icon: Play },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
]

type BokehProcessSnapshot = {
  timestamp: number
  appName: string
  totalCpu: number
  totalMemRssBytes: number
  gpu: {
    vramTotalBytes: number | null
    vramUsedBytes: number | null
  }
  processes: Array<{
    pid: number
    ppid: number | null
    type: string
    name: string
    command: string | null
    cpu: number
    memRss: number | null
  }>
}

export function SettingsDialog() {
  const isOpen = useWorkspaceStore((s) => s.isSettingsOpen)
  const setOpen = useWorkspaceStore((s) => s.setSettingsOpen)
  const [activeTab, setActiveTab] = useState<SettingsTab>('recording')

  const isHighQualityPlaybackEnabled = usePreviewSettingsStore((s) => s.highQuality)
  const isGlowEnabled = usePreviewSettingsStore((s) => s.showGlow)
  const glowIntensity = usePreviewSettingsStore((s) => s.glowIntensity)
  const showTimelineThumbnails = usePreviewSettingsStore((s) => s.showTimelineThumbnails)
  const setPreviewSettings = usePreviewSettingsStore((s) => s.setPreviewSettings)

  const recordingSettings = useProjectStore((s) => s.settings.recording)
  const setRecordingSettings = useProjectStore((s) => s.setRecordingSettings)

  const { colorPreset, setColorPreset } = useTheme()

  const [processSnapshot, setProcessSnapshot] = useState<BokehProcessSnapshot | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)
  const [processLoading, setProcessLoading] = useState(false)

  const formatPercent = (value?: number | null) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—'
    return `${Math.round(value)}%`
  }

  const formatProcessMemory = (bytes?: number | null) => {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
    const mb = bytes / (1024 ** 2)
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
  }

  const fetchProcessSnapshot = async () => {
    setProcessLoading(true)
    setProcessError(null)
    try {
      const snapshot = await window.electronAPI?.getBokehProcesses?.()
      if (!snapshot) throw new Error('Unavailable')
      setProcessSnapshot(snapshot)
    } catch {
      setProcessError('Only available in desktop app.')
    } finally {
      setProcessLoading(false)
    }
  }

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onOpenSettingsDialog?.(() => setOpen(true))
    if (window.electronAPI?.consumePendingSettingsOpen?.()) setOpen(true)
    return () => { unsubscribe?.() }
  }, [setOpen])

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-md w-dialog p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-sm">Settings</DialogTitle>
        </DialogHeader>

        <TooltipProvider delayDuration={400}>
          <div className="flex border-t border-border/30">
            {/* Compact tab strip */}
            <div className="w-11 flex-shrink-0 flex flex-col items-center py-2 border-r border-border/20 bg-muted/10">
              {SETTINGS_TABS.map((tab) => (
                <Tooltip key={tab.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150 ease-out",
                        activeTab === tab.id
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={6} className="text-2xs">
                    {tab.label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 p-4 min-h-[200px]">
              {activeTab === 'recording' && (
                <div className="space-y-4">
                  <SettingRow
                    label="Low-Memory Encoder"
                    checked={recordingSettings.lowMemoryEncoder}
                    onChange={(c) => setRecordingSettings({ lowMemoryEncoder: c })}
                  />
                  <SettingRow
                    label="Optimized macOS Encoder"
                    checked={recordingSettings.useMacOSDefaults}
                    onChange={(c) => setRecordingSettings({ useMacOSDefaults: c })}
                  />
                </div>
              )}

              {activeTab === 'playback' && (
                <div className="space-y-4">
                  <SettingRow
                    label="High-Quality Playback"
                    checked={isHighQualityPlaybackEnabled}
                    onChange={(c) => setPreviewSettings({ highQuality: c })}
                  />
                  <SettingRow
                    label="Timeline Thumbnails"
                    checked={showTimelineThumbnails}
                    onChange={(c) => setPreviewSettings({ showTimelineThumbnails: c })}
                  />
                  <SettingRow
                    label="Ambient Glow"
                    checked={isGlowEnabled}
                    onChange={(c) => setPreviewSettings({ showGlow: c })}
                  />
                  {isGlowEnabled && (
                    <div className="pt-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xs text-muted-foreground">Intensity</span>
                        <span className="text-2xs font-mono text-muted-foreground">
                          {Math.round(glowIntensity * 100)}%
                        </span>
                      </div>
                      <Slider
                        value={[glowIntensity]}
                        onValueChange={([v]) => setPreviewSettings({ glowIntensity: v })}
                        min={0} max={1} step={0.05}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <Label className="text-xs mb-3 block">Theme Preset</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'default', label: 'Default', colors: 'bg-[#6d28d9]' },
                        { id: 'sand', label: 'Sand', colors: 'bg-[#ea580c]' },
                        { id: 'industrial', label: 'Industrial', colors: 'bg-[#dc2626]' },
                        { id: 'forest', label: 'Forest', colors: 'bg-[#16a34a]' },
                        { id: 'nordic', label: 'Nordic', colors: 'bg-[#2563eb]' },
                        { id: 'midnight', label: 'Midnight', colors: 'bg-[#e11d48]' },
                        { id: 'space', label: 'Space', colors: 'bg-[#94a3b8]' },
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => setColorPreset(preset.id as ColorPreset)}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md border transition-all text-left",
                            colorPreset === preset.id
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border/30 hover:border-border/60 hover:bg-muted/30"
                          )}
                        >
                          <div className={cn("w-3 h-3 rounded-full", preset.colors)} />
                          <span className="text-xs font-medium capitalize">{preset.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/20">
                    <p className="text-3xs text-muted-foreground leading-relaxed">
                      Presets adjust the overall color palette and accent colors across the application.
                      Some presets may look different in light and dark modes.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'diagnostics' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Process Stats</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={fetchProcessSnapshot}
                      disabled={processLoading}
                      className="h-6 text-2xs px-2"
                    >
                      {processLoading ? '...' : 'Sample'}
                    </Button>
                  </div>

                  {processError && <div className="text-2xs text-destructive">{processError}</div>}

                  {processSnapshot && (
                    <div className="space-y-2 text-2xs">
                      <div className="flex gap-3">
                        <span className="text-muted-foreground">CPU</span>
                        <span className="font-mono">{formatPercent(processSnapshot.totalCpu)}</span>
                        <span className="text-muted-foreground ml-2">RAM</span>
                        <span className="font-mono">{formatProcessMemory(processSnapshot.totalMemRssBytes)}</span>
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {processSnapshot.processes.map((p) => (
                          <div key={p.pid} className="flex items-center justify-between text-3xs text-muted-foreground">
                            <span>{p.name}</span>
                            <span className="font-mono">{formatPercent(p.cpu)} / {formatProcessMemory(p.memRss)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog >
  )
}

function SettingRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-90" />
    </div>
  )
}
