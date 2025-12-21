"use client"

import { useEffect } from 'react'
import { Info } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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

export function SettingsDialog() {
  const isOpen = useWorkspaceStore((s) => s.isSettingsOpen)
  const setOpen = useWorkspaceStore((s) => s.setSettingsOpen)
  const recordingSettings = useRecordingSessionStore((s) => s.settings)
  const updateRecordingSettings = useRecordingSessionStore((s) => s.updateSettings)

  const lowMemoryEncoder = recordingSettings.lowMemoryEncoder ?? true

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
      <DialogContent className="max-w-md">
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
                  Reduces VideoToolbox buffering to lower VTEncoderService memory usage.
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
