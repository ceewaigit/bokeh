'use client'

import React from 'react'
import { Wind, ChevronRight, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/project-store'
import { Switch } from '@/components/ui/switch'
import { DEFAULT_PROJECT_SETTINGS } from '@/lib/settings/defaults'
import { motion, AnimatePresence } from 'framer-motion'
import { CompactSlider, SegmentedControl, SectionHeader, springConfig } from './motion-controls'

import { useWorkspaceStore } from '@/stores/workspace-store'

export function MotionTab() {
  const camera = useProjectStore((s) => s.currentProject?.settings.camera ?? DEFAULT_PROJECT_SETTINGS.camera)
  const setCameraSettings = useProjectStore((s) => s.setCameraSettings)

  const [motionBlurPreset, setMotionBlurPreset] = React.useState<'subtle' | 'balanced' | 'dynamic' | 'custom'>('balanced')

  const isAdvancedOpen = useWorkspaceStore((s) => s.motionTabAdvancedOpen)
  const setIsAdvancedOpen = useWorkspaceStore((s) => s.setMotionTabAdvancedOpen)

  const motionBlurPresets = React.useMemo(() => ([
    { id: 'subtle', label: 'Subtle', values: { intensity: 25, threshold: 20, gamma: 1.0, smooth: 8, ramp: 0.5, clamp: 45, black: -0.13, saturation: 1.0 } },
    { id: 'balanced', label: 'Balanced', values: { intensity: 100, threshold: 70, gamma: 1.0, smooth: 6, ramp: 0.5, clamp: 60, black: -0.11, saturation: 1.1 } },
    { id: 'dynamic', label: 'Dynamic', values: { intensity: 100, threshold: 30, gamma: 1.0, smooth: 5, ramp: 0.3, clamp: 100, black: -0.13, saturation: 1.0 } },
    { id: 'custom', label: 'Custom', values: null },
  ] as const), [])

  const resolveMotionBlurPreset = React.useCallback((intensity: number, threshold: number) => {
    const effectiveIntensity = intensity ?? 50
    const effectiveThreshold = threshold ?? 50
    const match = motionBlurPresets.find(p => p.values && p.values.intensity === effectiveIntensity && p.values.threshold === effectiveThreshold)
    return (match?.id ?? 'custom') as typeof motionBlurPreset
  }, [motionBlurPresets])

  React.useEffect(() => {
    setMotionBlurPreset(resolveMotionBlurPreset(camera.motionBlurIntensity ?? 50, camera.motionBlurThreshold ?? 50))
  }, [camera.motionBlurIntensity, camera.motionBlurThreshold, resolveMotionBlurPreset])

  const applyMotionBlurPreset = (preset: typeof motionBlurPreset) => {
    setMotionBlurPreset(preset)
    const values = motionBlurPresets.find((item) => item.id === preset)?.values
    if (!values) return

    setCameraSettings({
      motionBlurIntensity: values.intensity,
      motionBlurThreshold: values.threshold,
      motionBlurGamma: values.gamma,
      motionBlurSmoothWindow: values.smooth,
      motionBlurRampRange: values.ramp,
      motionBlurClamp: values.clamp,
      motionBlurBlackLevel: values.black ?? -0.13,
      motionBlurSaturation: values.saturation ?? 1.0,
      motionBlurEnabled: true
    })
  }

  return (
    <div className="space-y-4 px-1">
      <div className="flex items-center gap-2 mb-4 opacity-80">
        <Wind className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Motion & Blur</span>
      </div>

      <div className="rounded-xl border border-border/30 bg-background/20 backdrop-blur-sm p-3.5 space-y-4 shadow-sm transition-all hover:bg-background/30">
        <div className="flex items-center justify-between">
          <SectionHeader
            icon={Activity}
            title="Motion Blur"
            subtitle="Natural movement trails"
          />
        </div>

        <SegmentedControl
          options={motionBlurPresets}
          value={motionBlurPreset}
          onChange={(id) => applyMotionBlurPreset(id as typeof motionBlurPreset)}
          namespace="motion-blur"
        />

        <div className="space-y-4 pt-1">
          <CompactSlider
            label="Shutter Angle (Intensity)"
            value={camera.motionBlurIntensity ?? 50}
            min={0}
            max={200}
            step={5}
            unit="%"
            onValueChange={(val) => setCameraSettings({ motionBlurIntensity: val, motionBlurEnabled: val > 0 })}
            description="Controls the length of blur trails."
          />
        </div>

        <div className="pt-1">
          <button
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground hover:text-primary transition-colors select-none mb-2"
          >
            <ChevronRight className={cn("w-3 h-3 transition-transform duration-200", isAdvancedOpen && "rotate-90")} />
            ADVANCED SETTINGS
          </button>

          <AnimatePresence>
            {isAdvancedOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={springConfig}
                layout
                className="overflow-hidden"
              >
                <div className="space-y-4 pb-2 pl-1 border-l-2 border-border/30 ml-1.5 pr-1">
                  <CompactSlider
                    label="Threshold"
                    value={camera.motionBlurThreshold ?? 50}
                    min={0}
                    max={100}
                    step={5}
                    unit="%"
                    onValueChange={(val) => setCameraSettings({ motionBlurThreshold: val })}
                    description="Minimum speed required to trigger blur."
                  />

                  <CompactSlider
                    label="Smoothing Window"
                    value={camera.motionBlurSmoothWindow ?? 6}
                    min={1}
                    max={15}
                    unit=" fr"
                    onValueChange={(val) => setCameraSettings({ motionBlurSmoothWindow: val })}
                  />

                  <CompactSlider
                    label="Max Blur Radius"
                    value={camera.motionBlurClamp ?? 60}
                    min={10}
                    max={200}
                    step={5}
                    unit=" px"
                    onValueChange={(val) => setCameraSettings({ motionBlurClamp: val })}
                  />

                  <div className="flex items-center justify-between py-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Fix Dark Edges (Unpack)</span>
                    <Switch
                      checked={camera.motionBlurUnpackPremultiply ?? false}
                      onCheckedChange={(checked) => setCameraSettings({ motionBlurUnpackPremultiply: checked })}
                    />
                  </div>

                  <CompactSlider
                    label="Black Level"
                    value={camera.motionBlurBlackLevel ?? -0.13}
                    min={-0.2}
                    max={0.2}
                    step={0.01}
                    onValueChange={(val) => setCameraSettings({ motionBlurBlackLevel: val })}
                    description="Adjust black point to match native video."
                  />

                  <CompactSlider
                    label="Saturation"
                    value={Math.round((camera.motionBlurSaturation ?? 1.0) * 100)}
                    min={0}
                    max={200}
                    step={5}
                    unit="%"
                    onValueChange={(val) => setCameraSettings({ motionBlurSaturation: val / 100 })}
                    description="Match color saturation."
                  />

                  <div className="flex items-center justify-between py-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Debug View</span>
                    <Switch
                      checked={camera.motionBlurDebugSplit ?? false}
                      onCheckedChange={(checked) => setCameraSettings({ motionBlurDebugSplit: checked })}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
