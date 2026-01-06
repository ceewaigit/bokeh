'use client'

import React from 'react'
import { Wind, ChevronRight, Activity, Video } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { useProjectStore } from '@/features/core/stores/project-store'
import { Switch } from '@/components/ui/switch'
import { DEFAULT_PROJECT_SETTINGS } from '@/features/core/settings/defaults'
import { motion, AnimatePresence } from 'framer-motion'
import { CompactSlider, SegmentedControl, SectionHeader, springConfig } from './motion-controls'

export function MotionTab() {
  const camera = useProjectStore((s) => s.currentProject?.settings.camera ?? DEFAULT_PROJECT_SETTINGS.camera)
  const setCameraSettings = useProjectStore((s) => s.setCameraSettings)

  // --- Camera Movement State ---
  const [cameraStylePreset, setCameraStylePreset] = React.useState<'tight' | 'balanced' | 'steady' | 'cinematic' | 'floaty' | 'custom'>('cinematic')

  const cameraStylePresets = React.useMemo(() => ([
    // Tight: k=300, c=35 (zeta=1.0) -> Snappy, instant verification
    { id: 'tight', label: 'Tight', stiffness: 300, damping: 35, mass: 1, value: 8 },
    // Balanced: k=180, c=27 (zeta=1.0) -> Good balance of smoothness and tracking
    { id: 'balanced', label: 'Balanced', stiffness: 180, damping: 27, mass: 1, value: 24 },
    // Steady: k=100, c=20 (zeta=1.0) -> Smoother, absorbs jitters
    { id: 'steady', label: 'Steady', stiffness: 100, damping: 20, mass: 1, value: 36 },
    // Cinematic: k=60, c=15 (zeta=1.0) -> Slow, deliberate pans
    { id: 'cinematic', label: 'Cinematic', stiffness: 60, damping: 15, mass: 1, value: 48 },
    // Floaty: k=30, c=6 (zeta=0.55) -> Slight overshoot, very fluid
    { id: 'floaty', label: 'Floaty', stiffness: 30, damping: 6, mass: 1, value: 72 },
    { id: 'custom', label: 'Custom', stiffness: null, damping: null, mass: null, value: null },
  ] as const), [])

  const resolveCameraStylePreset = React.useCallback((settings: typeof camera) => {
    if (settings.cameraDynamics) {
      const { stiffness, damping } = settings.cameraDynamics
      const match = cameraStylePresets.find(p =>
        p.stiffness === stiffness && p.damping === damping
      )
      return (match?.id ?? 'custom') as typeof cameraStylePreset
    }
    const effectiveSmoothing = settings.cameraSmoothness ?? 48
    const match = cameraStylePresets.find(p => p.value === effectiveSmoothing)
    return (match?.id ?? 'custom') as typeof cameraStylePreset
  }, [cameraStylePresets])

  React.useEffect(() => {
    setCameraStylePreset(resolveCameraStylePreset(camera))
  }, [camera, resolveCameraStylePreset])

  const applyCameraStylePreset = (preset: typeof cameraStylePreset) => {
    setCameraStylePreset(preset)
    const presetData = cameraStylePresets.find((item) => item.id === preset)
    if (!presetData || presetData.id === 'custom') return

    setCameraSettings({
      cameraDynamics: {
        stiffness: presetData.stiffness!,
        damping: presetData.damping!,
        mass: presetData.mass!
      },
      cameraSmoothness: presetData.value
    })
  }

  // --- Motion Blur State (Existing) ---
  const [motionBlurPreset, setMotionBlurPreset] = React.useState<'subtle' | 'balanced' | 'dynamic' | 'custom'>('balanced')
  const [isAdvancedBlurOpen, setIsAdvancedBlurOpen] = React.useState(false)

  const motionBlurPresets = React.useMemo(() => ([
    { id: 'subtle', label: 'Subtle', values: { intensity: 25, threshold: 20, gamma: 1.0, smooth: 8, ramp: 0.5, clamp: 45, black: 0, saturation: 1.0, samples: 16 } },
    { id: 'balanced', label: 'Balanced', values: { intensity: 100, threshold: 70, gamma: 1.0, smooth: 6, ramp: 0.5, clamp: 60, black: 0, saturation: 1.0, samples: 32 } },
    { id: 'dynamic', label: 'Dynamic', values: { intensity: 100, threshold: 30, gamma: 1.0, smooth: 5, ramp: 0.3, clamp: 100, black: 0, saturation: 1.0, samples: 48 } },
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
      motionBlurBlackLevel: values.black ?? 0,
      motionBlurSaturation: values.saturation ?? 1.0,
      motionBlurSamples: values.samples,
      motionBlurEnabled: true
    })
  }

  return (
    <div className="space-y-6 px-1">
      <div className="flex items-center gap-2 mb-4 opacity-80">
        <Wind className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Motion & Blur</span>
      </div>

      {/* --- Camera Movement Section --- */}
      <div className="rounded-2xl border border-border/30 bg-background/20 backdrop-blur-sm p-3.5 space-y-4 shadow-sm transition-all hover:bg-background/30 overflow-hidden">
        <SectionHeader
          icon={Video}
          title="Camera Movement"
          subtitle="Viewport smoothing"
        />

        <SegmentedControl
          options={[
            { id: 'tight', label: 'Tight' },
            { id: 'balanced', label: 'Balanced' },
            { id: 'steady', label: 'Steady' },
            { id: 'cinematic', label: 'Cinematic' },
            // { id: 'floaty', label: 'Floaty' }, // Optional, leaving out if too many options or keep consistent with ZoomTab
            { id: 'custom', label: 'Custom' }
          ]}
          value={cameraStylePreset === 'floaty' ? 'cinematic' : cameraStylePreset} // Map floaty to cinematic visually or just show custom? Fallback to custom if not in list.
          onChange={(id) => applyCameraStylePreset(id as any)}
          namespace="camera-motion"
        />

        {/* Helper text for current preset */}
        {cameraStylePreset !== 'custom' && (
          <p className="text-xs text-muted-foreground/70 px-1">
            {cameraStylePreset === 'tight' && "Snappy, instant verification."}
            {cameraStylePreset === 'balanced' && "Good balance of smoothness and tracking."}
            {cameraStylePreset === 'steady' && "Smoother, absorbs jitters."}
            {cameraStylePreset === 'cinematic' && "Slow, deliberate pans."}
            {cameraStylePreset === 'floaty' && "Slight overshoot, very fluid."}
          </p>
        )}
      </div>


      {/* --- Motion Blur Section (Existing) --- */}
      <div className="rounded-2xl border border-border/30 bg-background/20 backdrop-blur-sm p-3.5 space-y-4 shadow-sm transition-all hover:bg-background/30 overflow-hidden">
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
            onClick={() => setIsAdvancedBlurOpen(!isAdvancedBlurOpen)}
            className="flex items-center gap-1.5 text-3xs font-semibold text-muted-foreground hover:text-primary transition-colors select-none mb-2"
          >
            <ChevronRight className={cn("w-3 h-3 transition-transform duration-200", isAdvancedBlurOpen && "rotate-90")} />
            ADVANCED SETTINGS
          </button>

          <AnimatePresence>
            {isAdvancedBlurOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={springConfig}
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
                    <span className="text-2xs font-medium text-muted-foreground">Fix Dark Edges (Unpack)</span>
                    <Switch
                      checked={camera.motionBlurUnpackPremultiply ?? false}
                      onCheckedChange={(checked) => setCameraSettings({ motionBlurUnpackPremultiply: checked })}
                    />
                  </div>

                  <CompactSlider
                    label="Black Level"
                    value={camera.motionBlurBlackLevel ?? 0}
                    min={-0.2}
                    max={0.2}
                    step={0.01}
                    onValueChange={(val) => setCameraSettings({ motionBlurBlackLevel: val })}
                    description="Adjust black point to match native video."
                  />

                  <div className="flex items-center justify-between py-1">
                    <span className="text-2xs font-medium text-muted-foreground">Use WebGL Video Pipeline</span>
                    <Switch
                      checked={camera.motionBlurUseWebglVideo ?? true}
                      onCheckedChange={(checked) => setCameraSettings({ motionBlurUseWebglVideo: checked })}
                    />
                  </div>

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

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
