'use client'

import React from 'react'
import { Bot, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
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

  React.useEffect(() => {
    setMotionBlurIntensity(camera.motionBlurIntensity ?? 40)
  }, [camera.motionBlurIntensity])

  React.useEffect(() => {
    setMotionBlurThreshold(camera.motionBlurThreshold ?? 30)
  }, [camera.motionBlurThreshold])

  const currentSmoothing =
    (effects?.find(
      (e) => e.type === EffectType.Annotation && (e as any).data?.kind === 'scrollCinematic' && e.enabled
    ) as any)?.data?.smoothing ?? 0

  return (
    <div className="space-y-4">
      <div className="p-3 bg-background/40 rounded-lg">
        <div className="flex items-start gap-2">
          <Bot className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="min-w-0">
            <div className="text-xs font-medium leading-none">Advanced</div>
            <div className="mt-1 text-[10px] text-muted-foreground leading-snug">
              Fine-tuning controls and global camera effects.
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground/70 leading-snug">
              Plugins live in <span className="text-muted-foreground">Utilities → Plugins</span>.
            </div>
          </div>
        </div>
      </div>

      {/* Motion smoothing (scroll cinematic annotation) */}
      <div className="p-3 bg-background/40 rounded-lg space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium leading-none">Motion Smoothing</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
              Smooth out camera movement.
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

      {/* Camera motion blur */}
      <div className="p-3 bg-background/40 rounded-lg space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium leading-none">Camera Motion Blur</div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="left">Adds blur during fast camera pans.</TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
              Global camera setting.
            </div>
          </div>
          <Switch
            id="motion-blur-enabled"
            checked={camera.motionBlurEnabled ?? true}
            onCheckedChange={(enabled) =>
              updateSettings({
                camera: { ...camera, motionBlurEnabled: enabled },
              })
            }
          />
        </div>

        {(camera.motionBlurEnabled ?? true) && (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={cn("text-[10px] text-muted-foreground uppercase tracking-wider font-medium")}>Intensity</span>
                <span className="text-xs font-mono text-primary tabular-nums">{motionBlurIntensity}%</span>
              </div>
              <Slider
                value={[motionBlurIntensity]}
                onValueChange={([value]) => setMotionBlurIntensity(value)}
                onValueCommit={([value]) =>
                  updateSettings({
                    camera: { ...camera, motionBlurIntensity: value },
                  })
                }
                min={0}
                max={100}
                step={5}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={cn("text-[10px] text-muted-foreground uppercase tracking-wider font-medium")}>Threshold</span>
                <span className="text-xs font-mono text-primary tabular-nums">{motionBlurThreshold}%</span>
              </div>
              <Slider
                value={[motionBlurThreshold]}
                onValueChange={([value]) => setMotionBlurThreshold(value)}
                onValueCommit={([value]) =>
                  updateSettings({
                    camera: { ...camera, motionBlurThreshold: value },
                  })
                }
                min={0}
                max={100}
                step={5}
              />
              <p className="text-[10px] text-muted-foreground/60 italic">Higher = less blur, only on fast pans</p>
            </div>
          </div>
        )}
      </div>

      {/* Refocus blur */}
      <div className="p-3 bg-background/40 rounded-lg space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium leading-none">Refocus Blur</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
              Adds a focus-pull feel during zoom transitions.
            </div>
          </div>
          <Switch
            id="refocus-blur-enabled"
            checked={camera.refocusBlurEnabled ?? true}
            onCheckedChange={(enabled) =>
              updateSettings({
                camera: { ...camera, refocusBlurEnabled: enabled },
              })
            }
          />
        </div>

        {(camera.refocusBlurEnabled ?? true) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Intensity</span>
              <span className="text-xs font-mono text-primary tabular-nums">{camera.refocusBlurIntensity ?? 40}%</span>
            </div>
            <Slider
              value={[camera.refocusBlurIntensity ?? 40]}
              onValueCommit={([value]) =>
                updateSettings({
                  camera: { ...camera, refocusBlurIntensity: value },
                })
              }
              min={0}
              max={100}
              step={5}
            />
            <p className="text-[10px] text-muted-foreground/60 italic">Blurs during zoom in/out transitions</p>
          </div>
        )}
      </div>
    </div>
  )
}
