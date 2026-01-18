'use client'

import React, { useState, useEffect } from 'react'
import { ChevronRight, RotateCcw } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'
import { PresetButton } from '@/components/ui/preset-button'
import { ChangePlaybackRateCommand } from '@/features/core/commands'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'

// Speed control constants
const MIN_RATE = 0.25
const MAX_RATE = 4
const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]

// Logarithmic scale helpers so 1x is centered (0.25x → 1x → 4x maps to -2 → 0 → 2)
const rateToSlider = (rate: number): number => Math.log2(rate)
const sliderToRate = (slider: number): number => Math.pow(2, slider)
const SLIDER_MIN = rateToSlider(MIN_RATE) // -2
const SLIDER_MAX = rateToSlider(MAX_RATE) // 2

interface SpeedControlsProps {
  /** The clip ID to control speed for */
  clipId: string
  /** Current playback rate from the clip */
  currentRate: number
  /** Whether the fine-tune slider is expanded */
  showAdvanced: boolean
  /** Callback when advanced toggle changes */
  onShowAdvancedChange: (open: boolean) => void
}

/**
 * SpeedControls - Reusable playback speed controls
 * Used in ClipTab and WebcamTab for controlling clip playback rate
 */
export function SpeedControls({
  clipId,
  currentRate,
  showAdvanced,
  onShowAdvancedChange,
}: SpeedControlsProps) {
  const [playbackRate, setPlaybackRate] = useState(currentRate)
  const executorRef = useCommandExecutor()

  // Sync local state when prop or clip changes
  useEffect(() => {
    setPlaybackRate(currentRate)
  }, [currentRate, clipId])

  const handleSliderChange = (value: number[]) => {
    // Convert from log slider value to actual rate
    setPlaybackRate(sliderToRate(value[0]))
  }

  const commitPlaybackRate = async (rate: number) => {
    if (executorRef.current) {
      try {
        await executorRef.current.execute(ChangePlaybackRateCommand, clipId, rate)
      } catch (error) {
        console.error('Failed to change playback rate:', error)
        setPlaybackRate(currentRate)
      }
    }
  }

  const resetPlaybackRate = async () => {
    if (executorRef.current) {
      try {
        await executorRef.current.execute(ChangePlaybackRateCommand, clipId, 1.0)
        setPlaybackRate(1.0)
      } catch (error) {
        console.error('Failed to reset playback rate:', error)
      }
    }
  }

  const setCommonSpeed = async (speed: number) => {
    setPlaybackRate(speed)
    await commitPlaybackRate(speed)
  }

  return (
    <div className="rounded-xl bg-black/[0.02] dark:bg-white/[0.02] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Speed</span>
        <div className="flex items-center gap-2">
          <span className="text-2xs font-mono tabular-nums text-muted-foreground">
            {playbackRate.toFixed(2)}x
          </span>
          <button
            onClick={resetPlaybackRate}
            className="p-1 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
            title="Reset to 1.0x"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SPEED_PRESETS.map((speed) => (
          <PresetButton
            key={speed}
            active={Math.abs(playbackRate - speed) < 0.01}
            onClick={() => setCommonSpeed(speed)}
          >
            {speed}x
          </PresetButton>
        ))}
      </div>

      <button
        onClick={() => onShowAdvancedChange(!showAdvanced)}
        className="flex items-center gap-1.5 text-2xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        <ChevronRight className={cn("w-3 h-3 transition-transform duration-150", showAdvanced && "rotate-90")} />
        Fine tune
      </button>

      {showAdvanced && (
        <div className="space-y-1.5 pt-1">
          <Slider
            value={[rateToSlider(playbackRate)]}
            onValueChange={handleSliderChange}
            onValueCommit={(vals) => commitPlaybackRate(sliderToRate(vals[0]))}
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={0.125}
          />
          <div className="grid grid-cols-3 text-2xs text-muted-foreground/50 tabular-nums">
            <span className="text-left">0.25x</span>
            <span className="text-center">1x</span>
            <span className="text-right">4x</span>
          </div>
        </div>
      )}
    </div>
  )
}
