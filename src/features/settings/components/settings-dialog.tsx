"use client"

import { useEffect, useState, useMemo } from 'react'
import { Activity, Video, Play, Palette, Info, Check, Sparkles, Layers } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { useWorkspaceStore } from '@/features/stores/workspace-store'
import { useProjectStore } from '@/features/stores/project-store'
import { usePreviewSettingsStore } from '@/features/stores/preview-settings-store'
import { useTheme, type ColorPreset } from '@/shared/contexts/theme-context'
import { cn } from '@/shared/utils/utils'

// Refined spring config for a premium feel
const smoothSpring = {
  type: "spring",
  stiffness: 400,
  damping: 30
} as const;

type SettingsTab = 'recording' | 'playback' | 'appearance' | 'diagnostics'

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'recording', label: 'Recording', icon: Video },
  { id: 'playback', label: 'Playback', icon: Play },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
]

// Rich metadata for color presets
const PRESET_DETAILS: Record<ColorPreset, { label: string; description: string; gradient: string; accent: string; adjectives: string[] }> = {
  default: {
    label: 'Royal',
    description: 'Deep purple tones for a creative atmosphere.',
    gradient: 'from-violet-600/20 via-purple-600/10 to-transparent',
    accent: 'bg-violet-600',
    adjectives: ['Creative', 'Deep', 'Royal']
  },
  sand: {
    label: 'Sand',
    description: 'Warm, natural tones for focused work.',
    gradient: 'from-orange-600/20 via-amber-600/10 to-transparent',
    accent: 'bg-orange-600',
    adjectives: ['Warm', 'Earth', 'Focus']
  },
  industrial: {
    label: 'Industrial',
    description: 'High-contrast red for precision editing.',
    gradient: 'from-red-600/20 via-rose-600/10 to-transparent',
    accent: 'bg-red-600',
    adjectives: ['Bold', 'Sharp', 'Tech']
  },
  forest: {
    label: 'Forest',
    description: 'Calming greens to reduce eye strain.',
    gradient: 'from-green-600/20 via-emerald-600/10 to-transparent',
    accent: 'bg-green-600',
    adjectives: ['Calm', 'Fresh', 'Nature']
  },
  nordic: {
    label: 'Nordic',
    description: 'Cool blues inspired by minimal design.',
    gradient: 'from-blue-600/20 via-sky-600/10 to-transparent',
    accent: 'bg-blue-600',
    adjectives: ['Cool', 'Clean', 'Air']
  },
  midnight: {
    label: 'Midnight',
    description: 'Vibrant pinks for high energy.',
    gradient: 'from-pink-600/20 via-fuchsia-600/10 to-transparent',
    accent: 'bg-pink-600',
    adjectives: ['Vivid', 'Neon', 'Night']
  },
  space: {
    label: 'Space',
    description: 'Monochrome slate for pure content focus.',
    gradient: 'from-slate-600/20 via-gray-600/10 to-transparent',
    accent: 'bg-slate-600',
    adjectives: ['Mono', 'Sleek', 'Zero']
  },
  mono: {
    label: 'Mono',
    description: 'Pure black, white, and gray for industrial focus.',
    gradient: 'from-zinc-700/20 via-zinc-500/10 to-transparent',
    accent: 'bg-zinc-600',
    adjectives: ['Mono', 'Steel', 'Focus']
  },
}

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

  const currentPresetDetails = useMemo(() => PRESET_DETAILS[colorPreset] || PRESET_DETAILS.default, [colorPreset])

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
      setProcessError('Desktop app required.')
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
      <DialogContent className="max-w-[40rem] min-h-[460px] w-dialog p-0 gap-0 overflow-hidden [&>button]:top-4 [&>button]:right-4 border shadow-2xl bg-background/95 backdrop-blur-xl ring-1 ring-border/50">
        <DialogHeader className="px-4 py-1.5 sr-only">
          <DialogTitle className="text-sm">Settings</DialogTitle>
          <DialogDescription className="sr-only">Configure application preferences</DialogDescription>
        </DialogHeader>

        <div className="flex h-full min-h-[460px]">
          {/* Sidebar Rail */}
          <div className="w-[60px] flex-shrink-0 flex flex-col items-center py-4 border-r border-border/40 bg-muted/20 gap-2 z-10">
            {SETTINGS_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Tooltip key={tab.id} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "relative group flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 z-10",
                        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      )}
                    >
                      {/* Active Background Pill - Subtle */}
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active-bg"
                          className="absolute inset-0 bg-primary/10 rounded-lg"
                          transition={smoothSpring}
                        />
                      )}

                      <tab.icon
                        className="relative w-5 h-5 z-10"
                        strokeWidth={isActive ? 2 : 1.5}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium text-xs px-2.5 py-1 z-[70]" sideOffset={12}>
                    {tab.label}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-hidden bg-background relative selection:bg-primary/20">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10, filter: 'blur(2px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: -10, filter: 'blur(2px)' }}
                transition={{
                  ...smoothSpring,
                  filter: { type: "tween", duration: 0.2 } // Use tween for blur to avoid negative values
                }}
                className="h-full max-w-xl mx-auto flex flex-col"
              >
                {activeTab === 'recording' && (
                  <div className="space-y-6">
                    <SettingsHeader
                      title="Recording"
                      description="Optimize capture and encoding performance."
                    />
                    <div className="space-y-4">
                      <SettingRow
                        label="Low-Memory Encoder"
                        description="Reduces RAM usage. Recommended for devices with <16GB RAM."
                        tooltip="Chunk-based processing reduces memory footprint but may slightly increase export time."
                        checked={recordingSettings.lowMemoryEncoder}
                        onChange={(c) => setRecordingSettings({ lowMemoryEncoder: c })}
                      />
                      <SettingRow
                        label="Optimized macOS Encoder"
                        description="Hardware acceleration for Apple Silicon."
                        tooltip="Uses native VideoToolbox APIs for significantly faster export on M1/M2/M3 chips."
                        checked={recordingSettings.useMacOSDefaults}
                        onChange={(c) => setRecordingSettings({ useMacOSDefaults: c })}
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'playback' && (
                  <div className="space-y-6">
                    <SettingsHeader
                      title="Playback"
                      description="Customize preview fidelity and viewport capabilities."
                    />
                    <div className="space-y-2">
                      <SettingRow
                        label="High-Quality Playback"
                        description="Render preview at full 1:1 resolution."
                        tooltip="Sharper preview but higher GPU load. Disable if scrubbing is choppy."
                        checked={isHighQualityPlaybackEnabled}
                        onChange={(c) => setPreviewSettings({ highQuality: c })}
                      />
                      <SettingRow
                        label="Timeline Thumbnails"
                        description="Show visual frames on timeline clips."
                        tooltip="Disabling improves scrolling performance on large projects."
                        checked={showTimelineThumbnails}
                        onChange={(c) => setPreviewSettings({ showTimelineThumbnails: c })}
                      />
                      <SettingRow
                        label="Ambient Glow"
                        description="Dynamic value-matching bias lighting."
                        tooltip="Projects a subtle glow behind the video matching the content color."
                        checked={isGlowEnabled}
                        onChange={(c) => setPreviewSettings({ showGlow: c })}
                      />
                    </div>

                    <AnimatePresence>
                      {isGlowEnabled && (
                        <motion.div
                          key="glow-intensity"
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          transition={smoothSpring}
                          className="rounded-lg bg-muted/40 border border-border/20 p-4 overflow-hidden"
                        >
                          <div className="pb-1">
                            <div className="flex items-center justify-between mb-3">
                              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Intensity</Label>
                              <span className="text-[10px] font-mono text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded">
                                {Math.round(glowIntensity * 100)}%
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <Slider
                                value={[glowIntensity]}
                                onValueChange={([v]) => setPreviewSettings({ glowIntensity: v })}
                                min={0} max={1} step={0.05}
                                className="flex-1"
                              />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {activeTab === 'appearance' && (
                  <div className="space-y-6 h-full flex flex-col">
                    <SettingsHeader
                      title="Appearance"
                      description="Customize the workspace accent color."
                    />

                    <div className="flex-1 flex flex-col gap-4">
                      {/* Preset Grid */}
                      <div className="grid grid-cols-4 gap-2">
                        {(Object.keys(PRESET_DETAILS) as ColorPreset[]).map((preset) => (
                          <button
                            key={preset}
                            onClick={() => setColorPreset(preset)}
                            className={cn(
                              "group relative flex flex-col items-center justify-center gap-2 p-2 rounded-xl border transition-all duration-200 h-24",
                              colorPreset === preset
                                ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20 shadow-sm"
                                : "border-border/40 hover:border-border/80 hover:bg-muted/30"
                            )}
                          >
                            <div className={cn("w-5 h-5 rounded-full shadow-sm ring-2 ring-white/20", PRESET_DETAILS[preset].accent)} />
                            <span className={cn(
                              "text-[10px] font-semibold transition-colors mt-1",
                              colorPreset === preset ? "text-foreground" : "text-muted-foreground"
                            )}>
                              {PRESET_DETAILS[preset].label}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Rich Hero Card */}
                      <div className={cn("relative overflow-hidden rounded-2xl border border-white/10 shadow-lg transition-colors duration-500 min-h-[160px]", "bg-gradient-to-br", currentPresetDetails.gradient)}>
                        {/* Noise texture overlay */}
                        <div className="absolute inset-0 bg-noise opacity-10 mix-blend-overlay pointer-events-none" />

                        <div className="relative z-10 flex items-start justify-between p-6">
                          <div className="space-y-1.5 z-10">
                            <h3 className="text-2xl font-bold tracking-tight text-white drop-shadow-sm">
                              {currentPresetDetails.label}
                            </h3>
                            <p className="text-white/90 text-sm max-w-[240px] font-medium leading-relaxed">
                              {currentPresetDetails.description}
                            </p>
                            <div className="flex gap-1.5 mt-3">
                              {currentPresetDetails.adjectives.map(adj => (
                                <span key={adj} className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/20 backdrop-blur-md text-white border border-white/10 shadow-sm">
                                  {adj}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* 3D Tilting UI Mockup */}
                          <div className="hidden sm:block absolute right-6 top-6 transform rotate-[-4deg] hover:rotate-0 transition-transform duration-500 ease-out origin-top-right">
                            <div className="w-[160px] h-[100px] rounded-xl bg-background/40 backdrop-blur-xl border border-white/20 shadow-xl p-3 flex flex-col gap-2">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full bg-red-400/80" />
                                <div className="w-2 h-2 rounded-full bg-yellow-400/80" />
                                <div className="w-2 h-2 rounded-full bg-green-400/80" />
                              </div>
                              <div className="h-2 w-3/4 rounded-full bg-white/20" />
                              <div className="h-2 w-1/2 rounded-full bg-white/20" />
                              <div className="mt-auto h-6 w-full rounded bg-primary/20 border border-primary/10 flex items-center justify-center">
                                <div className="h-1.5 w-12 rounded-full bg-primary/40" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'diagnostics' && (
                  <div className="space-y-6">
                    <SettingsHeader
                      title="Diagnostics"
                      description="System telemetry and health."
                    />

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-muted/10">
                        <div className="flex items-center gap-3">
                          <Activity className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">System Snapshot</div>
                            <div className="text-[10px] text-muted-foreground">CPU & Memory Usage</div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={fetchProcessSnapshot}
                          disabled={processLoading}
                          className="h-7 text-xs px-3"
                        >
                          {processLoading ? 'Scanning...' : 'Scan'}
                        </Button>
                      </div>

                      {processError && (
                        <div className="text-xs text-destructive p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                          {processError}
                        </div>
                      )}

                      {processSnapshot && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={smoothSpring}
                          className="space-y-3"
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-muted/20 border border-border/20 rounded-lg">
                              <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Total CPU</div>
                              <div className="text-lg font-mono font-medium">{formatPercent(processSnapshot.totalCpu)}</div>
                            </div>
                            <div className="p-3 bg-muted/20 border border-border/20 rounded-lg">
                              <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Total RAM</div>
                              <div className="text-lg font-mono font-medium">{formatProcessMemory(processSnapshot.totalMemRssBytes)}</div>
                            </div>
                          </div>

                          <div className="border border-border/20 rounded-lg overflow-hidden bg-background">
                            <div className="px-3 py-2 bg-muted/20 border-b border-border/10 flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Processes</span>
                              <span className="text-[10px] font-mono text-muted-foreground">{processSnapshot.processes.length}</span>
                            </div>
                            <div className="max-h-[160px] overflow-y-auto p-1 custom-scrollbar">
                              {processSnapshot.processes.map((p) => (
                                <div key={p.pid} className="flex items-center justify-between py-1.5 px-2 hover:bg-muted/30 rounded text-[10px] group transition-colors">
                                  <span className="font-medium text-foreground/80">{p.name}</span>
                                  <span className="font-mono text-muted-foreground">{formatPercent(p.cpu)} / {formatProcessMemory(p.memRss)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog >
  )
}

function SettingsHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-lg font-semibold tracking-tight text-foreground mb-1">{title}</h2>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-[320px]">{description}</p>
    </div>
  )
}

function SettingRow({
  label,
  description,
  tooltip,
  checked,
  onChange
}: {
  label: string
  description?: string
  tooltip?: string
  checked: boolean
  onChange: (c: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between py-3 px-3 -mx-3 rounded-lg hover:bg-muted/30 transition-colors group">
      <div className="space-y-0.5 flex-1 mr-4">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium leading-none text-foreground/90">
            {label}
          </Label>
          {tooltip && (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground/30 hover:text-primary transition-colors cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-[240px] text-[10px] p-2 leading-relaxed font-medium z-[70]">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {description && (
          <p className="text-[11px] text-muted-foreground/70 leading-normal font-normal">
            {description}
          </p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5 scale-90" />
    </div>
  )
}
