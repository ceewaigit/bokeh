'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Slider } from '@/components/ui/slider'
import type { BackgroundEffectData, Effect } from '@/types/project'
import { BackgroundType } from '@/types/project'
import { cn } from '@/shared/utils/utils'

type Corner = 'tl' | 'tr' | 'bl' | 'br'

interface ShapeTabProps {
  backgroundEffect: Effect | undefined
  onUpdateBackground: (updates: Partial<BackgroundEffectData>) => void
}

// Corner preview - zoomed square view showing padding gap and shadow
function CornerPreview({
  padding,
  cornerRadius,
  shadowIntensity,
  bgData,
}: {
  padding: number
  cornerRadius: number
  shadowIntensity: number
  bgData: BackgroundEffectData | undefined
}) {
  const [selectedCorner, setSelectedCorner] = useState<Corner>('tr')

  const corners: { id: Corner; label: string }[] = [
    { id: 'tl', label: 'TL' },
    { id: 'tr', label: 'TR' },
    { id: 'bl', label: 'BL' },
    { id: 'br', label: 'BR' },
  ]

  // Background style based on current background type
  const backgroundStyle = useMemo((): React.CSSProperties => {
    if (!bgData) {
      return { background: 'linear-gradient(135deg, #3a3a4a 0%, #2a2a3a 100%)' }
    }

    switch (bgData.type) {
      case BackgroundType.Gradient:
        if (bgData.gradient?.colors) {
          return {
            background: `linear-gradient(${bgData.gradient.angle || 135}deg, ${bgData.gradient.colors[0]}, ${bgData.gradient.colors[1]})`,
          }
        }
        return { background: 'linear-gradient(135deg, #3a3a4a 0%, #2a2a3a 100%)' }

      case BackgroundType.Color:
        return { background: bgData.color || '#2a2a3a' }

      case BackgroundType.Wallpaper:
      case BackgroundType.Image:
        if (bgData.wallpaper || bgData.image) {
          return {
            backgroundImage: `url(${bgData.wallpaper || bgData.image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        }
        return { background: 'linear-gradient(135deg, #4a4a5a 0%, #2a2a3a 100%)' }

      default:
        return { background: 'linear-gradient(135deg, #3a3a4a 0%, #2a2a3a 100%)' }
    }
  }, [bgData])

  // Scale padding for preview (maps 0-200px to 0-40px visible range)
  const scaledPadding = (padding / 200) * 40

  // Shadow style
  const shadowStyle = useMemo(() => {
    if (shadowIntensity <= 0) return 'none'
    const blur = 8 + shadowIntensity * 0.3
    const spread = shadowIntensity * 0.05
    const opacity = 0.2 + (shadowIntensity / 100) * 0.5
    return `0 ${blur * 0.4}px ${blur}px ${spread}px rgba(0,0,0,${opacity})`
  }, [shadowIntensity])

  return (
    <div className="space-y-2">
      {/* Header with corner tabs */}
      <div className="flex items-center justify-end">
        <div className="inline-flex p-0.5 rounded-lg bg-black/[0.06] dark:bg-white/[0.06]">
          {corners.map((corner) => {
            const isSelected = selectedCorner === corner.id
            return (
              <button
                key={corner.id}
                onClick={() => setSelectedCorner(corner.id)}
                className="relative px-2.5 py-1 text-2xs font-medium rounded-md transition-colors"
              >
                {isSelected && (
                  <motion.div
                    layoutId="corner-tab"
                    className="absolute inset-0 bg-white dark:bg-white/10 rounded-md shadow-sm"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className={cn("relative z-10", isSelected ? 'text-foreground' : 'text-muted-foreground/60')}>
                  {corner.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Preview - half-square rectangle */}
      <div
        className="relative w-full rounded-xl overflow-hidden"
        style={{ ...backgroundStyle, aspectRatio: '2 / 1' }}
      >
        {/* Video element - square, extends beyond bounds */}
        <motion.div
          key={selectedCorner}
          initial={false}
          animate={{
            x: selectedCorner.includes('r') ? 0 : undefined,
            y: selectedCorner.includes('b') ? 0 : undefined,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute"
          style={{
            width: '150%',
            height: '150%',
            backgroundColor: '#111113',
            boxShadow: shadowStyle,
            borderRadius: cornerRadius,
            // Position based on corner
            ...(selectedCorner === 'tl' && { top: scaledPadding, left: scaledPadding }),
            ...(selectedCorner === 'tr' && { top: scaledPadding, right: scaledPadding }),
            ...(selectedCorner === 'bl' && { bottom: scaledPadding, left: scaledPadding }),
            ...(selectedCorner === 'br' && { bottom: scaledPadding, right: scaledPadding }),
          }}
        />
      </div>
    </div>
  )
}

export function ShapeTab({ backgroundEffect, onUpdateBackground }: ShapeTabProps) {
  const bgData = backgroundEffect?.data as BackgroundEffectData

  const [padding, setPadding] = useState(bgData?.padding ?? 40)
  const [cornerRadius, setCornerRadius] = useState(bgData?.cornerRadius ?? 15)
  const isMockupEnabled = bgData?.mockup?.enabled ?? false
  const currentShadow = isMockupEnabled ? (bgData?.mockup?.shadowIntensity ?? 0) : (bgData?.shadowIntensity ?? 85)
  const [shadowIntensity, setShadowIntensity] = useState(currentShadow)

  useEffect(() => setPadding(bgData?.padding ?? 40), [bgData?.padding])
  useEffect(() => setCornerRadius(bgData?.cornerRadius ?? 15), [bgData?.cornerRadius])
  useEffect(() => setShadowIntensity(isMockupEnabled ? (bgData?.mockup?.shadowIntensity ?? 0) : (bgData?.shadowIntensity ?? 85)), [bgData?.shadowIntensity, bgData?.mockup?.shadowIntensity, isMockupEnabled])

  const applyShadowUpdate = (value: number) => {
    setShadowIntensity(value)
    if (isMockupEnabled) {
      if (!bgData?.mockup) return
      onUpdateBackground({
        mockup: {
          ...bgData.mockup,
          shadowIntensity: value
        }
      })
    } else {
      onUpdateBackground({ shadowIntensity: value })
    }
  }

  return (
    <div className="space-y-4">
      {/* Corner Preview */}
      <CornerPreview
        padding={padding}
        cornerRadius={cornerRadius}
        shadowIntensity={shadowIntensity}
        bgData={bgData}
      />

      {/* Controls */}
      <div className="space-y-3">
        {/* Padding */}
        <div className="group space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              Padding
            </label>
            <span className="text-xs font-mono tabular-nums text-muted-foreground/70 transition-colors group-hover:text-foreground/80">
              {padding}px
            </span>
          </div>
          <Slider
            value={[padding]}
            onValueChange={([value]) => {
              setPadding(value)
              onUpdateBackground({ padding: value })
            }}
            min={0}
            max={200}
            step={2}
          />
        </div>

        {/* Corner Radius */}
        <div className="group space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              Corner Radius
            </label>
            <span className="text-xs font-mono tabular-nums text-muted-foreground/70 transition-colors group-hover:text-foreground/80">
              {cornerRadius}px
            </span>
          </div>
          <Slider
            value={[cornerRadius]}
            onValueChange={([value]) => {
              setCornerRadius(value)
              onUpdateBackground({ cornerRadius: value })
            }}
            min={0}
            max={48}
            step={1}
            disabled={isMockupEnabled}
          />
        </div>

        {/* Shadow */}
        <div className="group space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              Shadow
            </label>
            <span className="text-xs font-mono tabular-nums text-muted-foreground/70 transition-colors group-hover:text-foreground/80">
              {shadowIntensity}%
            </span>
          </div>
          <Slider
            value={[shadowIntensity]}
            onValueChange={([value]) => applyShadowUpdate(value)}
            min={0}
            max={100}
            step={1}
          />
        </div>
      </div>
    </div>
  )
}
