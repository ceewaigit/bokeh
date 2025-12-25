'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RotateCcw, Zap } from 'lucide-react'
import type { Clip } from '@/types/project'
import { CommandExecutor, ChangePlaybackRateCommand } from '@/lib/commands'
import { useProjectStore } from '@/stores/project-store'
import { InfoTooltip } from './info-tooltip'

interface ClipTabProps {
  selectedClip: Clip | null
  onClipUpdate?: (clipId: string, updates: Partial<Clip>) => void
}

export function ClipTab({ selectedClip: propSelectedClip, onClipUpdate }: ClipTabProps) {
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [introFadeMs, setIntroFadeMs] = useState(0)
  const [outroFadeMs, setOutroFadeMs] = useState(0)
  const executorRef = useRef<CommandExecutor | null>(null)
  const updateClip = useProjectStore((s) => s.updateClip)

  // Initialize CommandExecutor
  useEffect(() => {
    if (!executorRef.current && CommandExecutor.isInitialized()) {
      executorRef.current = CommandExecutor.getInstance()
    }
  }, [])

  // Get the actual selected clip from the store to ensure reactivity
  const selectedClips = useProjectStore((s) => s.selectedClips)
  const currentProject = useProjectStore((s) => s.currentProject)
  const selectedClipId = selectedClips[0]

  // Find the current clip in the project to get the latest data
  const selectedClip = React.useMemo(() => {
    if (!selectedClipId || !currentProject) return propSelectedClip

    for (const track of currentProject.timeline.tracks) {
      const clip = track.clips.find(c => c.id === selectedClipId)
      if (clip) return clip
    }
    return propSelectedClip
  }, [selectedClipId, currentProject, propSelectedClip])

  // Update local state when selected clip changes
  useEffect(() => {
    if (selectedClip) {
      setPlaybackRate(selectedClip.playbackRate || 1.0)
      setIntroFadeMs(selectedClip.introFadeMs || 0)
      setOutroFadeMs(selectedClip.outroFadeMs || 0)
    }
  }, [selectedClip, selectedClip?.playbackRate, selectedClip?.introFadeMs, selectedClip?.outroFadeMs])

  const handlePlaybackRateChange = async (value: number[]) => {
    const newRate = value[0]
    setPlaybackRate(newRate)
  }

  const commitPlaybackRate = async (rate: number) => {
    if (selectedClip && executorRef.current) {
      try {
        await executorRef.current.execute(ChangePlaybackRateCommand, selectedClip.id, rate)
      } catch (error) {
        console.error('Failed to change playback rate:', error)
        setPlaybackRate(selectedClip.playbackRate || 1.0)
      }
    }
  }

  const resetPlaybackRate = async () => {
    if (selectedClip && executorRef.current) {
      try {
        await executorRef.current.execute(ChangePlaybackRateCommand, selectedClip.id, 1.0)
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

  // Fade handlers
  const handleIntroFadeChange = (value: number[]) => {
    const newValue = value[0]
    setIntroFadeMs(newValue)
  }

  const commitIntroFade = (value: number) => {
    if (selectedClip) {
      updateClip(selectedClip.id, { introFadeMs: value > 0 ? value : undefined })
    }
  }

  const handleOutroFadeChange = (value: number[]) => {
    const newValue = value[0]
    setOutroFadeMs(newValue)
  }

  const commitOutroFade = (value: number) => {
    if (selectedClip) {
      updateClip(selectedClip.id, { outroFadeMs: value > 0 ? value : undefined })
    }
  }

  const MIN_RATE = 0.25
  const MAX_RATE = 4
  const MAX_FADE_MS = 2000

  if (!selectedClip) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select a clip to edit its properties</p>
      </div>
    )
  }

  // Calculate effective duration (how long it plays in the timeline)
  const effectiveDuration = selectedClip.duration / 1000 // Convert to seconds

  return (
    <div className="space-y-3">
      <div className="px-3 py-2 bg-background/40 rounded-lg text-xs text-muted-foreground">
        <span>Clip ID: {selectedClip.id.slice(0, 8)}...</span>
        <span className="mx-2">•</span>
        <span>
          {effectiveDuration.toFixed(2)}s
          {selectedClip.playbackRate && selectedClip.playbackRate !== 1.0 && (
            <span className="ml-1 text-orange-500">({selectedClip.playbackRate}x)</span>
          )}
        </span>
      </div>

      {/* Playback Speed Section */}
      <div className="p-3 bg-background/40 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-medium text-foreground">Playback Speed</h4>
            <InfoTooltip content="Changes how fast the video plays." />
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 h-5">
              {playbackRate.toFixed(2)}x
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={resetPlaybackRate}
              className="h-5 w-5 p-0"
              title="Reset to normal speed"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Slider
            value={[playbackRate]}
            onValueChange={handlePlaybackRateChange}
            onValueCommit={(vals) => commitPlaybackRate(vals[0])}
            min={MIN_RATE}
            max={MAX_RATE}
            step={0.25}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground/70 tabular-nums">
            <span>0.25x</span>
            <span>1x</span>
            <span>4x</span>
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t border-border/30">
          <div className="text-[10px] font-medium text-muted-foreground">Quick Presets</div>
          <div className="flex gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 0.5) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(0.5)}
              className="text-[10px] h-6 px-2"
            >
              0.5x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 0.75) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(0.75)}
              className="text-[10px] h-6 px-2"
            >
              0.75x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 1.0) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(1.0)}
              className="text-[10px] h-6 px-2"
            >
              1x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 1.25) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(1.25)}
              className="text-[10px] h-6 px-2"
            >
              1.25x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 1.5) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(1.5)}
              className="text-[10px] h-6 px-2"
            >
              1.5x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 2.0) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(2.0)}
              className="text-[10px] h-6 px-2"
            >
              2x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 3.0) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(3.0)}
              className="text-[10px] h-6 px-2"
            >
              3x
            </Button>
          </div>
        </div>
      </div>

      {/* Fade Section */}
      <div className="p-3 bg-background/40 rounded-lg space-y-3">
        <div className="flex items-center gap-1.5">
          <h4 className="text-xs font-medium text-foreground">Clip Fades</h4>
          <InfoTooltip content="Fades the video in at the start and out at the end." />
        </div>

        {/* Intro Fade */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Intro (Fade In)</span>
            <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums">
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
            className="w-full"
          />
        </div>

        {/* Outro Fade */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Outro (Fade Out)</span>
            <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums">
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
            className="w-full"
          />
        </div>

        {/* Quick Presets */}
        <div className="space-y-1.5 pt-2 border-t border-border/30">
          <div className="text-[10px] font-medium text-muted-foreground">Quick Presets</div>
          <div className="flex gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant={introFadeMs === 0 && outroFadeMs === 0 ? "default" : "outline"}
              onClick={() => {
                setIntroFadeMs(0)
                setOutroFadeMs(0)
                if (selectedClip) {
                  updateClip(selectedClip.id, { introFadeMs: undefined, outroFadeMs: undefined })
                }
              }}
              className="text-[10px] h-6 px-2"
            >
              None
            </Button>
            <Button
              size="sm"
              variant={introFadeMs === 250 && outroFadeMs === 250 ? "default" : "outline"}
              onClick={() => {
                setIntroFadeMs(250)
                setOutroFadeMs(250)
                if (selectedClip) {
                  updateClip(selectedClip.id, { introFadeMs: 250, outroFadeMs: 250 })
                }
              }}
              className="text-[10px] h-6 px-2"
            >
              Quick
            </Button>
            <Button
              size="sm"
              variant={introFadeMs === 500 && outroFadeMs === 500 ? "default" : "outline"}
              onClick={() => {
                setIntroFadeMs(500)
                setOutroFadeMs(500)
                if (selectedClip) {
                  updateClip(selectedClip.id, { introFadeMs: 500, outroFadeMs: 500 })
                }
              }}
              className="text-[10px] h-6 px-2"
            >
              Smooth
            </Button>
            <Button
              size="sm"
              variant={introFadeMs === 1000 && outroFadeMs === 1000 ? "default" : "outline"}
              onClick={() => {
                setIntroFadeMs(1000)
                setOutroFadeMs(1000)
                if (selectedClip) {
                  updateClip(selectedClip.id, { introFadeMs: 1000, outroFadeMs: 1000 })
                }
              }}
              className="text-[10px] h-6 px-2"
            >
              Slow
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
} 
