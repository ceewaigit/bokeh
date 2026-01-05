'use client'

import React from 'react'
import { cn } from '@/shared/utils/utils'
import { Camera, Mic, Settings, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useDeviceStore } from '@/features/core/stores/device-store'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { AudioLevelMeter } from './audio-level-meter'
import { motion, AnimatePresence } from 'framer-motion'

interface QuickDevicePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStartRecording: () => void
  onOpenSettings?: () => void
  trigger?: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
}

export function QuickDevicePicker({
  open,
  onOpenChange,
  onStartRecording,
  onOpenSettings,
  trigger,
  side = 'top',
  align = 'center'
}: QuickDevicePickerProps) {
  // Device state
  const {
    webcams,
    microphones,
    settings,
    selectWebcam,
    selectMicrophone,
    toggleWebcam,
    toggleMicrophone
  } = useDeviceStore()

  // Permission state
  const {
    camera: hasCameraPermission,
    microphone: hasMicrophonePermission,
    requestCamera,
    requestMicrophone
  } = usePermissions()

  const handleToggleWebcam = async (enabled: boolean) => {
    if (enabled && !hasCameraPermission) {
      const granted = await requestCamera()
      if (!granted) return
    }
    toggleWebcam(enabled)
  }

  const handleToggleMicrophone = async (enabled: boolean) => {
    if (enabled && !hasMicrophonePermission) {
      const granted = await requestMicrophone()
      if (!granted) return
    }
    toggleMicrophone(enabled)
  }

  const handleStart = () => {
    onOpenChange(false)
    onStartRecording()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm">
            <ChevronDown className="w-4 h-4" />
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent
        side={side}
        align={align}
        className="w-72 p-0"
        sideOffset={8}
      >
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Recording Options</span>
            {onOpenSettings && (
              <button
                onClick={() => {
                  onOpenChange(false)
                  onOpenSettings()
                }}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="Open settings"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Camera Section */}
          <div className="p-2.5 bg-muted/30 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium">Camera</span>
              </div>
              <Switch
                checked={settings.webcam.enabled}
                onCheckedChange={handleToggleWebcam}
              />
            </div>

            <AnimatePresence>
              {settings.webcam.enabled && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <Select
                    value={settings.webcam.deviceId ?? ''}
                    onValueChange={selectWebcam}
                    disabled={webcams.length === 0}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select camera" />
                    </SelectTrigger>
                    <SelectContent>
                      {webcams.map(cam => (
                        <SelectItem key={cam.deviceId} value={cam.deviceId}>
                          <span className="truncate">{cam.label}</span>
                        </SelectItem>
                      ))}
                      {webcams.length === 0 && (
                        <div className="py-2 px-3 text-xs text-muted-foreground">
                          No cameras found
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Microphone Section */}
          <div className="p-2.5 bg-muted/30 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium">Microphone</span>
              </div>
              <Switch
                checked={settings.microphone.enabled}
                onCheckedChange={handleToggleMicrophone}
              />
            </div>

            <AnimatePresence>
              {settings.microphone.enabled && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden space-y-2"
                >
                  <Select
                    value={settings.microphone.deviceId ?? ''}
                    onValueChange={selectMicrophone}
                    disabled={microphones.length === 0}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select microphone" />
                    </SelectTrigger>
                    <SelectContent>
                      {microphones.map(mic => (
                        <SelectItem key={mic.deviceId} value={mic.deviceId}>
                          <span className="truncate">{mic.label}</span>
                        </SelectItem>
                      ))}
                      {microphones.length === 0 && (
                        <div className="py-2 px-3 text-xs text-muted-foreground">
                          No microphones found
                        </div>
                      )}
                    </SelectContent>
                  </Select>

                  <AudioLevelMeter
                    deviceId={settings.microphone.deviceId}
                    variant="minimal"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Button className="w-full" onClick={handleStart}>
            Start Recording
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function DeviceStatusIndicator({ className }: { className?: string }) {
  const settings = useDeviceStore(state => state.settings)

  if (!settings.webcam.enabled && !settings.microphone.enabled) return null

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {settings.webcam.enabled && (
        <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10">
          <Camera className="w-3 h-3 text-primary" />
        </div>
      )}
      {settings.microphone.enabled && (
        <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10">
          <Mic className="w-3 h-3 text-primary" />
        </div>
      )}
    </div>
  )
}
