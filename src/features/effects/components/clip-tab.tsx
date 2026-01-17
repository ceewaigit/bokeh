'use client'

import React, { useState, useEffect } from 'react'
import { Slider } from '@/components/ui/slider'
import { SpeedControls } from '@/components/ui/speed-controls'
import { PresetButton } from '@/components/ui/preset-button'
import { ChevronRight, Zap } from 'lucide-react'
import { UpdateClipCommand } from '@/features/core/commands'
import { cn } from '@/shared/utils/utils'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'
import { useSelectedClip } from '@/features/core/stores/selectors/clip-selectors'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'

export function ClipTab() {
  const [introFadeMs, setIntroFadeMs] = useState(0)
  const [outroFadeMs, setOutroFadeMs] = useState(0)
  const showSpeedAdvanced = useWorkspaceStore((s) => s.clipTabSpeedAdvancedOpen)
  const setShowSpeedAdvanced = useWorkspaceStore((s) => s.setClipTabSpeedAdvancedOpen)
  const showFadeAdvanced = useWorkspaceStore((s) => s.clipTabFadeAdvancedOpen)
  const setShowFadeAdvanced = useWorkspaceStore((s) => s.setClipTabFadeAdvancedOpen)
  const executorRef = useCommandExecutor()

  const selectedClipResult = useSelectedClip()
  const selectedClip = selectedClipResult?.clip ?? null

  useEffect(() => {
    if (selectedClip) {
      setIntroFadeMs(selectedClip.introFadeMs || 0)
      setOutroFadeMs(selectedClip.outroFadeMs || 0)
    }
  }, [selectedClip, selectedClip?.introFadeMs, selectedClip?.outroFadeMs])

  const handleIntroFadeChange = (value: number[]) => {
    const newValue = value[0]
    setIntroFadeMs(newValue)
  }

  const commitIntroFade = (value: number) => {
    if (selectedClip && executorRef.current) {
      executorRef.current.execute(UpdateClipCommand, selectedClip.id, { introFadeMs: value > 0 ? value : undefined })
    }
  }

  const handleOutroFadeChange = (value: number[]) => {
    const newValue = value[0]
    setOutroFadeMs(newValue)
  }

  const commitOutroFade = (value: number) => {
    if (selectedClip && executorRef.current) {
      executorRef.current.execute(UpdateClipCommand, selectedClip.id, { outroFadeMs: value > 0 ? value : undefined })
    }
  }

  const MAX_FADE_MS = 2000

  if (!selectedClip) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center mb-3">
          <Zap className="w-5 h-5 text-muted-foreground/50" />
        </div>
        <p className="text-sm text-muted-foreground">Select a clip to edit</p>
      </div>
    )
  }

  const effectiveDuration = selectedClip.duration / 1000

  return (
    <div className="space-y-3">
      {/* Clip Info */}
      <div className="flex items-center justify-between px-1">
        <span className="text-2xs text-muted-foreground/60 font-mono">
          {selectedClip.id.slice(0, 8)}
        </span>
        <span className="text-2xs text-muted-foreground">
          {effectiveDuration.toFixed(2)}s
          {selectedClip.playbackRate && selectedClip.playbackRate !== 1.0 && (
            <span className="ml-1.5 text-orange-500/80">({selectedClip.playbackRate}x)</span>
          )}
        </span>
      </div>

      {/* Playback Speed */}
      <SpeedControls
        key={selectedClip.id}
        clipId={selectedClip.id}
        currentRate={selectedClip.playbackRate ?? 1.0}
        showAdvanced={showSpeedAdvanced}
        onShowAdvancedChange={setShowSpeedAdvanced}
      />

      {/* Fades */}
      <div className="rounded-xl bg-black/[0.02] dark:bg-white/[0.02] p-3 space-y-3">
        <span className="text-xs font-medium">Fades</span>

        <div className="flex flex-wrap gap-1.5">
          <PresetButton
            active={introFadeMs === 0 && outroFadeMs === 0}
            onClick={() => {
              setIntroFadeMs(0)
              setOutroFadeMs(0)
              if (selectedClip && executorRef.current) {
                executorRef.current.execute(UpdateClipCommand, selectedClip.id, { introFadeMs: undefined, outroFadeMs: undefined })
              }
            }}
          >
            None
          </PresetButton>
          <PresetButton
            active={introFadeMs === 250 && outroFadeMs === 250}
            onClick={() => {
              setIntroFadeMs(250)
              setOutroFadeMs(250)
              if (selectedClip && executorRef.current) {
                executorRef.current.execute(UpdateClipCommand, selectedClip.id, { introFadeMs: 250, outroFadeMs: 250 })
              }
            }}
          >
            Quick
          </PresetButton>
          <PresetButton
            active={introFadeMs === 500 && outroFadeMs === 500}
            onClick={() => {
              setIntroFadeMs(500)
              setOutroFadeMs(500)
              if (selectedClip && executorRef.current) {
                executorRef.current.execute(UpdateClipCommand, selectedClip.id, { introFadeMs: 500, outroFadeMs: 500 })
              }
            }}
          >
            Smooth
          </PresetButton>
          <PresetButton
            active={introFadeMs === 1000 && outroFadeMs === 1000}
            onClick={() => {
              setIntroFadeMs(1000)
              setOutroFadeMs(1000)
              if (selectedClip && executorRef.current) {
                executorRef.current.execute(UpdateClipCommand, selectedClip.id, { introFadeMs: 1000, outroFadeMs: 1000 })
              }
            }}
          >
            Slow
          </PresetButton>
        </div>

        <button
          onClick={() => setShowFadeAdvanced(!showFadeAdvanced)}
          className="flex items-center gap-1.5 text-2xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          <ChevronRight className={cn("w-3 h-3 transition-transform duration-150", showFadeAdvanced && "rotate-90")} />
          Fine tune
        </button>

        {showFadeAdvanced && (
          <div className="space-y-3 pt-1">
            <div className="group space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-2xs text-muted-foreground group-hover:text-foreground/80 transition-colors">Fade In</span>
                <span className="text-2xs font-mono tabular-nums text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                  {introFadeMs}ms
                </span>
              </div>
              <Slider
                value={[introFadeMs]}
                onValueChange={handleIntroFadeChange}
                onValueCommit={(vals) => commitIntroFade(vals[0])}
                min={0}
                max={MAX_FADE_MS}
                step={50}
              />
            </div>

            <div className="group space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-2xs text-muted-foreground group-hover:text-foreground/80 transition-colors">Fade Out</span>
                <span className="text-2xs font-mono tabular-nums text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                  {outroFadeMs}ms
                </span>
              </div>
              <Slider
                value={[outroFadeMs]}
                onValueChange={handleOutroFadeChange}
                onValueCommit={(vals) => commitOutroFade(vals[0])}
                min={0}
                max={MAX_FADE_MS}
                step={50}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
