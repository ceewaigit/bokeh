'use client'

import React from 'react'
import { Bot, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { useProjectStore } from '@/stores/project-store'
import type { Effect } from '@/types/project'
import { EffectType } from '@/types/project'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function AdvancedTab({
  effects,
  onEffectChange,
}: {
  effects: Effect[] | undefined
  onEffectChange: (type: EffectType, data: any) => void
}) {
  const camera = useProjectStore((s) => s.settings.camera)
  const updateSettings = useProjectStore((s) => s.updateSettings)

  const [localSmoothing, setLocalSmoothing] = React.useState<number | null>(null)
  const [motionBlurIntensity, setMotionBlurIntensity] = React.useState(camera.motionBlurIntensity ?? 40)
  const [motionBlurThreshold, setMotionBlurThreshold] = React.useState(camera.motionBlurThreshold ?? 30)
  const [refocusBlurIntensity, setRefocusBlurIntensity] = React.useState(camera.refocusBlurIntensity ?? 40)

  React.useEffect(() => {
    setMotionBlurIntensity(camera.motionBlurIntensity ?? 40)
  }, [camera.motionBlurIntensity])

  React.useEffect(() => {
    setMotionBlurThreshold(camera.motionBlurThreshold ?? 30)
  }, [camera.motionBlurThreshold])

  React.useEffect(() => {
    setRefocusBlurIntensity(camera.refocusBlurIntensity ?? 40)
  }, [camera.refocusBlurIntensity])

  const currentSmoothing =
    (effects?.find(
      (e) => e.type === EffectType.Annotation && (e as any).data?.kind === 'scrollCinematic' && e.enabled
    ) as any)?.data?.smoothing ?? 0

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-background/40 p-2.5">
        <div className="flex items-start gap-2">
          <Bot className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold leading-none tracking-[-0.01em]">Camera & Motion</div>
            <div className="mt-1 text-[11px] text-muted-foreground leading-snug">
              Camera motion and effects
            </div>
          </div>
        </div>
      </div>

      {/* Motion smoothing (scroll cinematic annotation) */}
      <div className="rounded-md bg-background/40 p-2.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold leading-none tracking-[-0.01em]">Motion Smoothing</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
              Reduce jitter in camera panning
            </div>
          </div>
          <div className="text-xs font-mono text-muted-foreground w-8 text-right">
            {localSmoothing ?? currentSmoothing}
          </div>
        </div>

        <Slider
          value={[localSmoothing ?? currentSmoothing]}
          max={100}
          step={1}
          onValueChange={([value]) => setLocalSmoothing(value)}
          onValueCommit={([value]) => {
            onEffectChange(EffectType.Annotation, {
              kind: 'scrollCinematic',
              enabled: value > 0,
              data: { smoothing: value },
            })
            setTimeout(() => setLocalSmoothing(null), 200)
          }}
        />
      </div>

      {/* Screen motion blur */}
      <div className="rounded-md bg-background/40 p-2.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-[11px] font-semibold leading-none tracking-[-0.01em]">Screen Motion Blur</div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="left">Adds blur during fast screen movement.</TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
              Adds blur during fast screen movement
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={cn("text-[11px] text-muted-foreground uppercase tracking-wider font-medium")}>Intensity</span>
              <span className="text-xs font-mono text-primary tabular-nums">{motionBlurIntensity}%</span>
            </div>
            <Slider
              value={[motionBlurIntensity]}
              onValueChange={([value]) => setMotionBlurIntensity(value)}
              onValueCommit={([value]) =>
                updateSettings({
                  camera: { ...camera, motionBlurIntensity: value, motionBlurEnabled: value > 0 },
                })
              }
              min={0}
              max={100}
              step={5}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={cn("text-[11px] text-muted-foreground uppercase tracking-wider font-medium")}>Threshold</span>
              <span className="text-xs font-mono text-primary tabular-nums">{motionBlurThreshold}%</span>
            </div>
            <Slider
              value={[motionBlurThreshold]}
              onValueChange={([value]) => setMotionBlurThreshold(value)}
              onValueCommit={([value]) =>
                updateSettings({
                  camera: {
                    ...camera,
                    motionBlurThreshold: value,
                    motionBlurEnabled: (motionBlurIntensity ?? 0) > 0,
                  },
                })
              }
              min={0}
              max={100}
              step={5}
            />
            <p className="text-[11px] text-muted-foreground/60 italic">Higher threshold = blur only on faster movements</p>
          </div>
        </div>
      </div>

      {/* Screen zoom blur */}
      <div className="rounded-md bg-background/40 p-2.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold leading-none tracking-[-0.01em]">Screen Zoom Blur</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
              Softens focus during zoom in/out
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Intensity</span>
            <span className="text-xs font-mono text-primary tabular-nums">{refocusBlurIntensity}%</span>
          </div>
          <Slider
            value={[refocusBlurIntensity]}
            onValueChange={([value]) => setRefocusBlurIntensity(value)}
            onValueCommit={([value]) =>
              updateSettings({
                camera: { ...camera, refocusBlurIntensity: value, refocusBlurEnabled: value > 0 },
              })
            }
            min={0}
            max={100}
            step={5}
          />
          <p className="text-[11px] text-muted-foreground/60 italic">Adjust blur strength during zoom transitions</p>
        </div>
      </div>
    </div>
  )
}
