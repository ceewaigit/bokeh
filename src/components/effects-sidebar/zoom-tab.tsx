'use client'

import React, { useState } from 'react'
import { ZoomIn, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useProjectStore } from '@/stores/project-store'
import type { Clip, Effect, ZoomEffectData } from '@/types/project'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'
import { EffectLayerType } from '@/types/effects'
import { getZoomEffects } from '@/lib/effects/effect-filters'
import { CommandExecutor, AddEffectCommand } from '@/lib/commands'
import { DEFAULT_ZOOM_DATA } from '@/lib/constants/default-effects'
import { InfoTooltip } from './info-tooltip'

interface ZoomTabProps {
  effects: Effect[] | undefined
  selectedEffectLayer?: SelectedEffectLayer
  selectedClip: Clip | null
  onUpdateZoom: (updates: any) => void
  onEffectChange: (type: EffectType.Zoom | EffectType.Annotation, data: any) => void
  onZoomBlockUpdate?: (blockId: string, updates: any) => void
}

export function ZoomTab({
  effects,
  selectedEffectLayer,
  selectedClip,
  onUpdateZoom,
  onEffectChange,
  onZoomBlockUpdate
}: ZoomTabProps) {
  const zoomEffects = effects ? getZoomEffects(effects) : []

  // Local state for slider values during dragging
  const [localScale, setLocalScale] = React.useState<number | null>(null)
  const [localIntroMs, setLocalIntroMs] = React.useState<number | null>(null)
  const [localOutroMs, setLocalOutroMs] = React.useState<number | null>(null)
  const [localMouseIdlePx, setLocalMouseIdlePx] = React.useState<number | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <div className="space-y-3">
      {/* Quick Fill Screen Zoom */}
      {selectedClip && (
        <div className="p-3 bg-background/40 rounded-lg">
          <button
            className="w-full px-4 py-2.5 text-xs rounded-lg transition-all flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary"
            onClick={async () => {
              const project = useProjectStore.getState().currentProject
              const existingZoomEffects = (project?.timeline.effects || [])
                .filter(effect => effect.type === EffectType.Zoom)
                .sort((a, b) => a.startTime - b.startTime)
              const blockDuration = Math.max(0, selectedClip.duration)
              let finalStartTime = Math.max(0, selectedClip.startTime)

              for (const effect of existingZoomEffects) {
                if (finalStartTime < effect.endTime && (finalStartTime + blockDuration) > effect.startTime) {
                  finalStartTime = effect.endTime + 100
                }
              }
              const newEffect: Effect = {
                id: `zoom-fill-${Date.now()}`,
                type: EffectType.Zoom,
                startTime: finalStartTime,
                endTime: finalStartTime + blockDuration,
                enabled: true,
                data: {
                  scale: 1,
                  introMs: DEFAULT_ZOOM_DATA.introMs,
                  outroMs: DEFAULT_ZOOM_DATA.outroMs,
                  smoothing: 50,
                  followStrategy: ZoomFollowStrategy.Center,
                  autoScale: 'fill'
                } as ZoomEffectData
              }
              if (CommandExecutor.isInitialized()) {
                await CommandExecutor.getInstance().execute(AddEffectCommand, newEffect)
              }
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Add Fill Screen Zoom
          </button>
          <div className="mt-2 flex items-center justify-center gap-2">
            <p className="text-xs text-muted-foreground/70 italic leading-snug">
              Center-locked 1.5x zoom for a full-frame look.
            </p>
            <InfoTooltip content="Adds a zoom block to the timeline that you can resize." />
          </div>
        </div>
      )}

      {/* Selected Zoom Block Editor */}
      {selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer?.id && (() => {
        const selectedBlock = zoomEffects.find(e => e.id === selectedEffectLayer.id)
        if (!selectedBlock) return null
        const zoomData = selectedBlock.data as ZoomEffectData
        if (!zoomData) return null
        const followStrategy = zoomData.followStrategy ?? ZoomFollowStrategy.Mouse
        const isFillScreen = zoomData.autoScale === 'fill'
        const isCenterLocked = followStrategy === ZoomFollowStrategy.Center

        return (
          <div
            key={`zoom-block-${selectedEffectLayer.id}`}
            className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {/* Scale Control */}
            <div className="p-3 bg-background/40 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ZoomIn className="w-3 h-3 text-muted-foreground" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium leading-none">Zoom Scale</span>
                    <InfoTooltip content="Adjusts how much to zoom in." />
                  </div>
                </div>
                <span className="text-[10px] font-mono text-primary tabular-nums">
                  {isFillScreen ? 'Fill' : `${(localScale ?? zoomData.scale ?? DEFAULT_ZOOM_DATA.scale).toFixed(1)}x`}
                </span>
              </div>
              <Slider
                key={`scale-${selectedEffectLayer.id}`}
                value={[localScale ?? zoomData.scale ?? DEFAULT_ZOOM_DATA.scale]}
                onValueChange={([value]) => setLocalScale(value)}
                onValueCommit={([value]) => {
                  if (selectedEffectLayer.id && onZoomBlockUpdate) {
                    onZoomBlockUpdate(selectedEffectLayer.id, { scale: value })
                    setTimeout(() => setLocalScale(null), 300)
                  }
                }}
                min={1}
                max={7}
                step={0.1}
                className="w-full"
                disabled={isFillScreen}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/70 tabular-nums">
                <span>1x</span>
                <span>7x</span>
              </div>
            </div>

            {/* Focus Mode */}
            <div className="p-3 bg-background/40 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium leading-none">Focus Mode</span>
                  <InfoTooltip content="Choose whether the zoom tracks the cursor or stays centered." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={cn(
                    "px-3 py-2 text-[11px] font-medium rounded-md transition-colors",
                    !isCenterLocked
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/60 text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => {
                    if (selectedEffectLayer.id && onZoomBlockUpdate) {
                      onZoomBlockUpdate(selectedEffectLayer.id, {
                        followStrategy: ZoomFollowStrategy.Mouse,
                        autoScale: undefined
                      })
                    }
                  }}
                >
                  Follow Cursor
                </button>
                <button
                  className={cn(
                    "px-3 py-2 text-[11px] font-medium rounded-md transition-colors",
                    isCenterLocked
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/60 text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => {
                    if (selectedEffectLayer.id && onZoomBlockUpdate) {
                      onZoomBlockUpdate(selectedEffectLayer.id, {
                        followStrategy: ZoomFollowStrategy.Center,
                        scale: 1,
                        autoScale: 'fill'
                      })
                      setLocalScale(1)
                      setTimeout(() => setLocalScale(null), 300)
                    }
                  }}
                >
                  Fill Screen
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/70 leading-snug">
                Fill Screen locks the zoom center for a cinematic full-frame look.
              </p>
            </div>

            {/* Easing Controls */}
            <div className="p-4 bg-background/40 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium leading-none">Easing Duration</span>
                <InfoTooltip content="Makes the zoom transition smooth." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* Ease In */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">In</span>
                    <span className="text-xs font-mono text-muted-foreground tabular-nums">
                      {localIntroMs ?? (zoomData.introMs || DEFAULT_ZOOM_DATA.introMs)}ms
                    </span>
                  </div>
                  <Slider
                    key={`intro-${selectedEffectLayer.id}`}
                    value={[localIntroMs ?? (zoomData.introMs || DEFAULT_ZOOM_DATA.introMs)]}
                    onValueChange={([value]) => setLocalIntroMs(value)}
                    onValueCommit={([value]) => {
                      if (selectedEffectLayer.id && onZoomBlockUpdate) {
                        onZoomBlockUpdate(selectedEffectLayer.id, { introMs: value })
                        setTimeout(() => setLocalIntroMs(null), 300)
                      }
                    }}
                    min={0}
                    max={1000}
                    step={50}
                    className="w-full"
                  />
                </div>
                {/* Ease Out */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Out</span>
                    <span className="text-xs font-mono text-muted-foreground tabular-nums">
                      {localOutroMs ?? (zoomData.outroMs || DEFAULT_ZOOM_DATA.outroMs)}ms
                    </span>
                  </div>
                  <Slider
                    key={`outro-${selectedEffectLayer.id}`}
                    value={[localOutroMs ?? (zoomData.outroMs || DEFAULT_ZOOM_DATA.outroMs)]}
                    onValueChange={([value]) => setLocalOutroMs(value)}
                    onValueCommit={([value]) => {
                      if (selectedEffectLayer.id && onZoomBlockUpdate) {
                        onZoomBlockUpdate(selectedEffectLayer.id, { outroMs: value })
                        setTimeout(() => setLocalOutroMs(null), 300)
                      }
                    }}
                    min={0}
                    max={1000}
                    step={50}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground bg-background/30 hover:bg-background/50 rounded-lg transition-colors"
            >
              <span className="flex items-center gap-2">
                Advanced
                <InfoTooltip content="Fine-tune how zoom regions track cursor movement." />
              </span>
              <ChevronRight className={cn("w-3.5 h-3.5 transition-transform duration-200", showAdvanced && "rotate-90")} />
            </button>

            {showAdvanced && !isFillScreen && (
              <div className="p-4 bg-background/30 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Mouse Idle Threshold</span>
                    <InfoTooltip content="Minimum movement (px) needed to trigger panning inside a zoom." />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground tabular-nums">
                    {zoomData.mouseIdlePx ?? DEFAULT_ZOOM_DATA.mouseIdlePx ?? 3}px
                  </span>
                </div>
                <Slider
                  key={`mouseidle-${selectedEffectLayer.id}`}
                  value={[localMouseIdlePx ?? (zoomData.mouseIdlePx ?? DEFAULT_ZOOM_DATA.mouseIdlePx ?? 3)]}
                  onValueChange={([value]) => setLocalMouseIdlePx(value)}
                  onValueCommit={([value]) => {
                    if (selectedEffectLayer.id && onZoomBlockUpdate) {
                      onZoomBlockUpdate(selectedEffectLayer.id, { mouseIdlePx: value })
                      setTimeout(() => setLocalMouseIdlePx(null), 200)
                    }
                  }}
                  min={1}
                  max={20}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground/70 leading-snug">Minimum cursor movement to trigger pan</p>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-border/30" />
          </div>
        )
      })()}

      {/* Zoom Effects Toggle */}
      <div className="p-3 bg-background/40 rounded-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-xs font-medium leading-none">Zoom Effects</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
                Auto-detect and apply zoom regions.
              </div>
            </div>
          </div>
          <Switch
            aria-label="Enable zoom effects"
            checked={zoomEffects.length > 0}
            onCheckedChange={(checked) => onUpdateZoom({ enabled: checked })}
          />
        </div>
      </div>
    </div>
  )
}
