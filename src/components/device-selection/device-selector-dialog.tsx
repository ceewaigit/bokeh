'use client'

import React, { useEffect } from 'react'
import { Camera, Mic, Settings2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useDeviceStore } from '@/stores/device-store'
import { usePermissions } from '@/hooks/use-permissions'
import { CameraPreview } from './camera-preview'
import { AudioLevelMeter } from './audio-level-meter'
import { motion, AnimatePresence } from 'framer-motion'

interface DeviceSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm?: () => void
}

export function DeviceSelectorDialog({
  open,
  onOpenChange,
  onConfirm
}: DeviceSelectorDialogProps) {
  // Device state
  const {
    webcams,
    microphones,
    settings,
    refreshDevices,
    selectWebcam,
    selectMicrophone,
    toggleWebcam,
    toggleMicrophone,
    setWebcamResolution,
    setMicrophoneSettings
  } = useDeviceStore()

  // Permission state
  const {
    camera: hasCameraPermission,
    microphone: hasMicrophonePermission,
    requestCamera,
    requestMicrophone
  } = usePermissions()

  // Refresh devices when dialog opens
  useEffect(() => {
    if (open) refreshDevices()
  }, [open, refreshDevices])

  const handleConfirm = () => {
    onConfirm?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Recording Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Camera Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Camera</h3>
                <PermissionBadge granted={hasCameraPermission} />
              </div>
              <Switch
                checked={settings.webcam.enabled}
                onCheckedChange={async (enabled) => {
                  if (enabled && !hasCameraPermission) {
                    const granted = await requestCamera()
                    if (granted) toggleWebcam(true)
                  } else {
                    toggleWebcam(enabled)
                  }
                }}
              />
            </div>

            <AnimatePresence>
              {settings.webcam.enabled && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <CameraPreview
                      deviceId={settings.webcam.deviceId}
                      className="rounded-lg"
                      showControls
                    />

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Camera
                        </label>
                        <Select
                          value={settings.webcam.deviceId ?? ''}
                          onValueChange={selectWebcam}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select camera" />
                          </SelectTrigger>
                          <SelectContent>
                            {webcams.map(cam => (
                              <SelectItem key={cam.deviceId} value={cam.deviceId}>
                                {cam.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Resolution
                        </label>
                        <Select
                          value={settings.webcam.resolution}
                          onValueChange={setWebcamResolution}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="720p">720p (HD)</SelectItem>
                            <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                            <SelectItem value="4k">4K (Ultra HD)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <div className="border-t border-border/50" />

          {/* Microphone Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Microphone</h3>
                <PermissionBadge granted={hasMicrophonePermission} />
              </div>
              <Switch
                checked={settings.microphone.enabled}
                onCheckedChange={async (enabled) => {
                  if (enabled && !hasMicrophonePermission) {
                    const granted = await requestMicrophone()
                    if (granted) toggleMicrophone(true)
                  } else {
                    toggleMicrophone(enabled)
                  }
                }}
              />
            </div>

            <AnimatePresence>
              {settings.microphone.enabled && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        Input Device
                      </label>
                      <Select
                        value={settings.microphone.deviceId ?? ''}
                        onValueChange={selectMicrophone}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select microphone" />
                        </SelectTrigger>
                        <SelectContent>
                          {microphones.map(mic => (
                            <SelectItem key={mic.deviceId} value={mic.deviceId}>
                              {mic.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <AudioLevelMeter
                      deviceId={settings.microphone.deviceId}
                      showLabel
                    />

                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground">
                          Echo cancellation
                        </label>
                        <Switch
                          checked={settings.microphone.echoCancellation}
                          onCheckedChange={(checked) =>
                            setMicrophoneSettings({ echoCancellation: checked })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground">
                          Noise suppression
                        </label>
                        <Switch
                          checked={settings.microphone.noiseSuppression}
                          onCheckedChange={(checked) =>
                            setMicrophoneSettings({ noiseSuppression: checked })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PermissionBadge({ granted }: { granted: boolean }) {
  if (granted) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500">
        <CheckCircle className="w-3 h-3" />
        <span className="text-[10px] font-medium">Granted</span>
      </div>
    )
  }
  return null
}

export { CameraPreview } from './camera-preview'
export { AudioLevelMeter, InlineLevelIndicator } from './audio-level-meter'
export { QuickDevicePicker, DeviceStatusIndicator } from './quick-device-picker'
