import React from 'react'
import { Slider } from '@/components/ui/slider'

interface OverlayStyleControlProps {
  // Font
  fontSize?: number
  onFontSizeChange?: (value: number) => void

  // Box Model
  padding?: number
  onPaddingChange?: (value: number) => void
  borderRadius?: number
  onBorderRadiusChange?: (value: number) => void

  // Opacity
  backgroundOpacity?: number
  onBackgroundOpacityChange?: (value: number) => void
}

interface SliderRowProps {
  label: string
  value: number
  displayValue: string
  onChange: (value: number) => void
  min: number
  max: number
  step: number
}

function SliderRow({ label, value, displayValue, onChange, min, max, step }: SliderRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-2xs text-muted-foreground">{label}</label>
        <span className="text-2xs text-muted-foreground/60 tabular-nums">{displayValue}</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
    </div>
  )
}

export function OverlayStyleControl({
  fontSize,
  onFontSizeChange,
  padding,
  onPaddingChange,
  borderRadius,
  onBorderRadiusChange,
  backgroundOpacity,
  onBackgroundOpacityChange,
}: OverlayStyleControlProps) {
  const hasAnyControl =
    (typeof fontSize === 'number' && onFontSizeChange) ||
    (typeof padding === 'number' && onPaddingChange) ||
    (typeof borderRadius === 'number' && onBorderRadiusChange) ||
    (typeof backgroundOpacity === 'number' && onBackgroundOpacityChange)

  if (!hasAnyControl) return null

  return (
    <div className="space-y-3">
      {typeof fontSize === 'number' && onFontSizeChange && (
        <SliderRow
          label="Size"
          value={fontSize}
          displayValue={`${fontSize}px`}
          onChange={onFontSizeChange}
          min={4}
          max={48}
          step={1}
        />
      )}

      {typeof padding === 'number' && onPaddingChange && (
        <SliderRow
          label="Padding"
          value={padding}
          displayValue={`${padding}px`}
          onChange={onPaddingChange}
          min={0}
          max={40}
          step={1}
        />
      )}

      {typeof borderRadius === 'number' && onBorderRadiusChange && (
        <SliderRow
          label="Corner Radius"
          value={borderRadius}
          displayValue={`${borderRadius}px`}
          onChange={onBorderRadiusChange}
          min={0}
          max={24}
          step={1}
        />
      )}

      {typeof backgroundOpacity === 'number' && onBackgroundOpacityChange && (
        <SliderRow
          label="Background Opacity"
          value={backgroundOpacity}
          displayValue={`${Math.round(backgroundOpacity * 100)}%`}
          onChange={onBackgroundOpacityChange}
          min={0}
          max={1}
          step={0.05}
        />
      )}
    </div>
  )
}
