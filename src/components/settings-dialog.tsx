"use client"

import { useEffect, useState } from 'react'
import { Activity, Info } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useRecordingSessionStore } from '@/stores/recording-session-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { cn } from '@/lib/utils'

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
  const isHighQualityPlaybackEnabled = useWorkspaceStore((s) => s.isHighQualityPlaybackEnabled)
  const setHighQualityPlaybackEnabled = useWorkspaceStore((s) => s.setHighQualityPlaybackEnabled)
  const isGlowEnabled = useWorkspaceStore((s) => s.isGlowEnabled)
  const setGlowEnabled = useWorkspaceStore((s) => s.setGlowEnabled)
  const recordingSettings = useRecordingSessionStore((s) => s.settings)
  const updateRecordingSettings = useRecordingSessionStore((s) => s.updateSettings)
  const [processSnapshot, setProcessSnapshot] = useState<BokehProcessSnapshot | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)
  const [processLoading, setProcessLoading] = useState(false)

  const lowMemoryEncoder = recordingSettings.lowMemoryEncoder ?? false
  const useMacOSDefaults = recordingSettings.useMacOSDefaults ?? true

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
      const snapshot = window.electronAPI?.getBokehProcesses
        ? await window.electronAPI.getBokehProcesses()
        : await window.electronAPI?.ipcRenderer?.invoke('get-bokeh-processes')
      if (!snapshot) {
        throw new Error('Process stats are unavailable in this context.')
      }
      setProcessSnapshot(snapshot)
    } catch (error) {
      console.error('[SettingsDialog] Failed to load process stats', error)
      setProcessError('Process stats are only available in the desktop app.')
    } finally {
      setProcessLoading(false)
    }
  }

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onOpenSettingsDialog?.(() => setOpen(true))
    if (window.electronAPI?.consumePendingSettingsOpen?.()) {
      setOpen(true)
    }
    return () => {
      unsubscribe?.()
    }
  }, [setOpen])

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl w-[880px] max-w-[92vw]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Global preferences for recording and editing.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
            Recording
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="low-memory-encoder" className="text-xs text-muted-foreground">
                Low-Memory Encoder
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  Reduces encoder buffering and may lower capture scale to reduce memory usage.
                </TooltipContent>
              </Tooltip>
            </div>
            <Switch
              id="low-memory-encoder"
              checked={lowMemoryEncoder}
              onCheckedChange={(checked) => updateRecordingSettings({ lowMemoryEncoder: checked })}
              className="scale-75 origin-right"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="macos-defaults" className="text-xs text-muted-foreground">
                Optimized macOS Encoder
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  Uses hardware-friendly encoding (HEVC + YUV + realtime). Tradeoffs: higher load on older Macs and HEVC compatibility on very old players.
                </TooltipContent>
              </Tooltip>
            </div>
            <Switch
              id="macos-defaults"
              checked={useMacOSDefaults}
              onCheckedChange={(checked) => updateRecordingSettings({ useMacOSDefaults: checked })}
              className="scale-75 origin-right"
            />
          </div>

          <div className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide pt-2">
            Playback
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="high-quality-playback" className="text-xs text-muted-foreground">
                High-Quality Playback
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  Plays full-resolution video during playback when needed for sharp zoom. Uses more memory.
                </TooltipContent>
              </Tooltip>
            </div>
            <Switch
              id="high-quality-playback"
              checked={isHighQualityPlaybackEnabled}
              onCheckedChange={setHighQualityPlaybackEnabled}
              className="scale-75 origin-right"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="glow-effect" className="text-xs text-muted-foreground">
                Ambient Glow
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  Adds a soft glow behind the video. Uses more computer memory.
                </TooltipContent>
              </Tooltip>
            </div>
            <Switch
              id="glow-effect"
              checked={isGlowEnabled}
              onCheckedChange={setGlowEnabled}
              className="scale-75 origin-right"
            />
          </div>

          <div className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide pt-2">
            Diagnostics
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">Bokeh Processes</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={fetchProcessSnapshot}
                disabled={processLoading}
              >
                {processLoading ? 'Sampling…' : processSnapshot ? 'Refresh' : 'Sample'}
              </Button>
            </div>

            {processError && (
              <div className="text-[11px] text-destructive">{processError}</div>
            )}

            {processSnapshot && (
              <div className="rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 via-background to-muted/10 p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-foreground/90">
                    {processSnapshot.appName} Process Tree
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(processSnapshot.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                <div
                  className={cn(
                    "mt-2 grid grid-cols-1 gap-2 text-[11px] text-muted-foreground sm:grid-cols-2",
                    processSnapshot.gpu.vramTotalBytes ? "lg:grid-cols-3" : "lg:grid-cols-2"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate whitespace-nowrap">CPU Load</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3 h-3 text-muted-foreground/60" />
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={10}>
                          Share of your CPU used by Bokeh right now.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="font-mono text-foreground/80">{formatPercent(processSnapshot.totalCpu)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate whitespace-nowrap">Memory Used</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3 h-3 text-muted-foreground/60" />
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={10}>
                          Working memory used by all Bokeh processes (RSS in RAM).
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="font-mono text-foreground/80">
                      {formatProcessMemory(processSnapshot.totalMemRssBytes)}
                    </span>
                  </div>
                  {processSnapshot.gpu.vramTotalBytes && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate whitespace-nowrap">GPU Memory</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3 h-3 text-muted-foreground/60" />
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={10}>
                            GPU memory in use on your system (not per-app).
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <span className="font-mono text-foreground/80">
                        {`${formatProcessMemory(processSnapshot.gpu.vramUsedBytes)} / ${formatProcessMemory(processSnapshot.gpu.vramTotalBytes)}`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-2 max-h-44 overflow-y-auto pr-1">
                  {processSnapshot.processes.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground/70">No matching processes found.</div>
                  ) : (
                    processSnapshot.processes.map((proc) => (
                      <div
                        key={proc.pid}
                        className="rounded-lg border border-border/40 bg-background/60 px-2 py-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground/90">{proc.name}</span>
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                              {proc.type}
                            </span>
                          </div>
                          <span className="font-mono text-muted-foreground">PID {proc.pid}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>CPU {formatPercent(proc.cpu)}</span>
                          <span>RSS {formatProcessMemory(proc.memRss)}</span>
                        </div>
                        {proc.command && (
                          <div className="mt-1 truncate text-[10px] text-muted-foreground/70" title={proc.command}>
                            {proc.command}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 text-[10px] text-muted-foreground/70">
                  Memory numbers are measured from each Bokeh process. GPU memory is system-level, and per-app GPU usage is not exposed by macOS.
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
