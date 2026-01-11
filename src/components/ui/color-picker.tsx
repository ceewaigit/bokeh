"use client"

import Color from 'color'
import { PipetteIcon } from 'lucide-react'
import * as Slider from '@radix-ui/react-slider'
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/shared/utils/utils'

type ColorInput = Parameters<typeof Color>[0]
type ColorInstance = ReturnType<typeof Color>

interface ColorPickerContextValue {
  hue: number
  saturation: number
  lightness: number
  alpha: number
  mode: string
  setHue: (hue: number) => void
  setSaturation: (saturation: number) => void
  setLightness: (lightness: number) => void
  setAlpha: (alpha: number) => void
  setMode: (mode: string) => void
  beginInteraction?: () => void
  endInteraction?: () => void
}

const ColorPickerContext = createContext<ColorPickerContextValue | undefined>(
  undefined
)

export const useColorPicker = () => {
  const context = useContext(ColorPickerContext)
  if (!context) {
    throw new Error('useColorPicker must be used within a ColorPickerProvider')
  }
  return context
}

export type ColorPickerProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'value' | 'defaultValue'> & {
  value?: ColorInput
  defaultValue?: ColorInput
  onChange?: (value: string) => void
  onInteractionStart?: () => void
  onInteractionEnd?: () => void
}

const toSafeColor = (input: ColorInput | undefined, fallback: ColorInstance) => {
  if (!input) return fallback
  try {
    return Color(input)
  } catch {
    return fallback
  }
}

const toHexOutput = (color: ColorInstance, alpha: number) => {
  const normalized = color.alpha(alpha / 100)
  return alpha < 100 ? normalized.hexa() : normalized.hex()
}

const normalizeValue = (input: ColorInput | undefined, fallback: ColorInstance) => {
  const resolved = toSafeColor(input, fallback)
  const alpha = Math.round((resolved.alpha() || 1) * 100)
  return toHexOutput(resolved, alpha)
}

export const ColorPicker = ({
  value,
  defaultValue = '#000000',
  onChange,
  onInteractionStart,
  onInteractionEnd,
  className,
  ...props
}: ColorPickerProps) => {
  const fallbackColor = useMemo(() => {
    try {
      return Color(defaultValue)
    } catch {
      return Color('#000000')
    }
  }, [defaultValue])

  const resolvedColor = useMemo(() => {
    return toSafeColor(value, fallbackColor)
  }, [value, fallbackColor])

  const [hue, setHue] = useState(resolvedColor.hsl().hue() || 0)
  const [saturation, setSaturation] = useState(resolvedColor.hsl().saturationl() || 100)
  const [lightness, setLightness] = useState(resolvedColor.hsl().lightness() || 50)
  const [alpha, setAlpha] = useState(Math.round((resolvedColor.alpha() || 1) * 100))
  const [mode, setMode] = useState('hex')
  const isSyncingRef = useRef(false)
  const isInteractingRef = useRef(false)
  const lastEmittedRef = useRef<string | null>(null)

  const beginInteraction = useCallback(() => {
    if (isInteractingRef.current) return
    isInteractingRef.current = true
    onInteractionStart?.()
  }, [onInteractionStart])

  const endInteraction = useCallback(() => {
    if (!isInteractingRef.current) return
    isInteractingRef.current = false
    onInteractionEnd?.()
  }, [onInteractionEnd])

  useEffect(() => {
    if (isInteractingRef.current) return
    const normalizedProp = normalizeValue(value, fallbackColor).toLowerCase()
    if (lastEmittedRef.current && normalizedProp === lastEmittedRef.current.toLowerCase()) {
      return
    }
    const next = toSafeColor(value, fallbackColor)
    const hsl = next.hsl()
    const nextHue = hsl.hue() || 0
    const nextSaturation = hsl.saturationl() || 100
    const nextLightness = hsl.lightness() || 50
    const nextAlpha = Math.round((next.alpha() || 1) * 100)
    const shouldUpdate = nextHue !== hue
      || nextSaturation !== saturation
      || nextLightness !== lightness
      || nextAlpha !== alpha
    if (shouldUpdate) {
      isSyncingRef.current = true
      setHue(nextHue)
      setSaturation(nextSaturation)
      setLightness(nextLightness)
      setAlpha(nextAlpha)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, fallbackColor])

  useEffect(() => {
    if (!onChange) return
    const color = Color.hsl(hue, saturation, lightness)
    const nextValue = toHexOutput(color, alpha)
    if (isSyncingRef.current) {
      isSyncingRef.current = false
      return
    }
    const normalizedProp = normalizeValue(value, fallbackColor)
    if (nextValue.toLowerCase() === normalizedProp.toLowerCase()) {
      return
    }
    if (lastEmittedRef.current?.toLowerCase() === nextValue.toLowerCase()) {
      return
    }
    lastEmittedRef.current = nextValue
    onChange(nextValue)
  }, [hue, saturation, lightness, alpha, onChange, value, fallbackColor])

  return (
    <ColorPickerContext.Provider
      value={{
        hue,
        saturation,
        lightness,
        alpha,
        mode,
        setHue,
        setSaturation,
        setLightness,
        setAlpha,
        setMode,
        beginInteraction,
        endInteraction,
      }}
    >
      <div
        className={cn('flex w-full flex-col gap-4', className)}
        {...(props as any)}
      />
    </ColorPickerContext.Provider>
  )
}

export type ColorPickerSelectionProps = HTMLAttributes<HTMLDivElement>
export const ColorPickerSelection = memo(
  ({ className, ...props }: ColorPickerSelectionProps) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [positionX, setPositionX] = useState(0)
    const [positionY, setPositionY] = useState(0)
    const activePointerIdRef = useRef<number | null>(null)
    const { hue, saturation, lightness, setSaturation, setLightness, beginInteraction, endInteraction } = useColorPicker()

    const backgroundGradient = useMemo(() => {
      return `linear-gradient(0deg, rgba(0,0,0,1), rgba(0,0,0,0)),
            linear-gradient(90deg, rgba(255,255,255,1), rgba(255,255,255,0)),
            hsl(${hue}, 100%, 50%)`
    }, [hue])

    const syncPositionFromColor = useCallback(() => {
      const x = Math.max(0, Math.min(1, saturation / 100))
      const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x)
      const y = Math.max(0, Math.min(1, 1 - lightness / topLightness))
      setPositionX(x)
      setPositionY(y)
    }, [saturation, lightness])

    const handlePointerMove = useCallback(
      (event: PointerEvent | MouseEvent) => {
        if (!(isDragging && containerRef.current)) {
          return
        }
        const rect = containerRef.current.getBoundingClientRect()
        const x = Math.max(
          0,
          Math.min(1, (event.clientX - rect.left) / rect.width)
        )
        const y = Math.max(
          0,
          Math.min(1, (event.clientY - rect.top) / rect.height)
        )
        setPositionX(x)
        setPositionY(y)
        setSaturation(x * 100)
        const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x)
        const nextLightness = topLightness * (1 - y)
        setLightness(nextLightness)
      },
      [isDragging, setSaturation, setLightness]
    )

    useEffect(() => {
      syncPositionFromColor()
    }, [syncPositionFromColor])

    useEffect(() => {
      const handlePointerUp = () => {
        setIsDragging(false)
        if (containerRef.current && activePointerIdRef.current !== null) {
          try {
            containerRef.current.releasePointerCapture(activePointerIdRef.current)
          } catch {
            // Ignore release errors.
          }
        }
        activePointerIdRef.current = null
        endInteraction?.()
      }
      if (isDragging) {
        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', handlePointerUp)
        window.addEventListener('pointercancel', handlePointerUp)
      }
      return () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerUp)
      }
    }, [isDragging, handlePointerMove])

    return (
      <div
        className={cn('relative h-32 w-full cursor-crosshair rounded-md', className)}
        onPointerDown={(e) => {
          e.preventDefault()
          beginInteraction?.()
          setIsDragging(true)
          activePointerIdRef.current = e.pointerId
          if (containerRef.current) {
            try {
              containerRef.current.setPointerCapture(e.pointerId)
            } catch {
              // Ignore capture errors.
            }
          }
          handlePointerMove(e.nativeEvent)
        }}
        ref={containerRef}
        style={{
          background: backgroundGradient,
        }}
        {...(props as any)}
      >
        <div
          className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute h-4 w-4 rounded-pill border-2 border-white"
          style={{
            left: `${positionX * 100}%`,
            top: `${positionY * 100}%`,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
          }}
        />
      </div>
    )
  }
)
ColorPickerSelection.displayName = 'ColorPickerSelection'

export type ColorPickerHueProps = ComponentProps<typeof Slider.Root>
export const ColorPickerHue = ({
  className,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onValueCommit,
  ...props
}: ColorPickerHueProps) => {
  const { hue, setHue, beginInteraction, endInteraction } = useColorPicker()
  return (
    <Slider.Root
      className={cn('relative flex h-4 w-full touch-none', className)}
      max={360}
      onValueChange={([next]) => setHue(next)}
      onValueCommit={(value) => {
        onValueCommit?.(value)
        endInteraction?.()
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        beginInteraction?.()
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event)
        endInteraction?.()
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event)
        endInteraction?.()
      }}
      step={1}
      value={[hue]}
      {...(props as any)}
    >
      <Slider.Track className="relative my-0.5 h-3 w-full grow rounded-pill bg-[linear-gradient(90deg,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)]">
        <Slider.Range className="absolute h-full" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-pill border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  )
}

export type ColorPickerAlphaProps = ComponentProps<typeof Slider.Root>
export const ColorPickerAlpha = ({
  className,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onValueCommit,
  ...props
}: ColorPickerAlphaProps) => {
  const { alpha, setAlpha, hue, saturation, lightness, beginInteraction, endInteraction } = useColorPicker()
  const alphaGradient = useMemo(() => {
    const base = Color.hsl(hue, saturation, lightness)
    const solid = base.alpha(1).rgb().string()
    return `linear-gradient(90deg, rgba(0,0,0,0), ${solid})`
  }, [hue, saturation, lightness])
  return (
    <Slider.Root
      className={cn('relative flex h-5 w-full touch-none items-center', className)}
      max={100}
      onValueChange={([next]) => setAlpha(next)}
      onValueCommit={(value) => {
        onValueCommit?.(value)
        endInteraction?.()
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        beginInteraction?.()
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event)
        endInteraction?.()
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event)
        endInteraction?.()
      }}
      step={1}
      value={[alpha]}
      {...(props as any)}
    >
      <Slider.Track
        className="relative h-4 w-full grow rounded-pill border border-border/50 overflow-hidden"
        style={{
          background:
            'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==") left center',
        }}
      >
        <div className="absolute inset-0" style={{ background: alphaGradient }} />
        <Slider.Range className="absolute h-full rounded-pill bg-transparent" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-pill border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  )
}

export type ColorPickerEyeDropperProps = ComponentProps<typeof Button>
export const ColorPickerEyeDropper = ({
  className,
  ...props
}: ColorPickerEyeDropperProps) => {
  const { setHue, setSaturation, setLightness, setAlpha } = useColorPicker()
  const handleEyeDropper = async () => {
    try {
      // @ts-expect-error - EyeDropper API is experimental
      const eyeDropper = new EyeDropper()
      const result = await eyeDropper.open()
      const color = Color(result.sRGBHex)
      const [h, s, l] = color.hsl().array()
      setHue(h)
      setSaturation(s)
      setLightness(l)
      setAlpha(100)
    } catch (error) {
      console.error('EyeDropper failed:', error)
    }
  }
  return (
    <Button
      className={cn('shrink-0 text-muted-foreground', className)}
      onClick={handleEyeDropper}
      size="icon"
      variant="outline"
      type="button"
      {...(props as any)}
    >
      <PipetteIcon size={16} />
    </Button>
  )
}

export type ColorPickerOutputProps = ComponentProps<typeof SelectTrigger>
const formats = ['hex', 'rgb', 'css', 'hsl']
export const ColorPickerOutput = ({
  className,
  ...props
}: ColorPickerOutputProps) => {
  const { mode, setMode } = useColorPicker()
  return (
    <Select onValueChange={setMode} value={mode}>
      <SelectTrigger className={cn('h-8 w-20 shrink-0 text-xs', className)} {...(props as any)}>
        <SelectValue placeholder="Mode" />
      </SelectTrigger>
      <SelectContent>
        {formats.map((format) => (
          <SelectItem className="text-xs" key={format} value={format}>
            {format.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type PercentageInputProps = ComponentProps<typeof Input>
const PercentageInput = ({ className, ...props }: PercentageInputProps) => {
  return (
    <div className="relative">
      <Input
        type="text"
        {...(props as any)}
        className={cn(
          'h-8 w-[3.25rem] rounded-l-none bg-secondary px-2 text-xs shadow-none',
          className
        )}
      />
      <span className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground text-xs">
        %
      </span>
    </div>
  )
}

export type ColorPickerFormatProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const ColorPickerFormat = ({
  className,
  ...props
}: ColorPickerFormatProps) => {
  const { hue, saturation, lightness, alpha, mode, setHue, setSaturation, setLightness, setAlpha } = useColorPicker()
  const color = useMemo(() => Color.hsl(hue, saturation, lightness, alpha / 100), [hue, saturation, lightness, alpha])
  const updateFromColor = useCallback((next: ColorInstance) => {
    const hsl = next.hsl()
    setHue(hsl.hue() || 0)
    setSaturation(hsl.saturationl() || 100)
    setLightness(hsl.lightness() || 50)
    setAlpha(Math.round((next.alpha() || 1) * 100))
  }, [setHue, setSaturation, setLightness, setAlpha])

  const [hexInput, setHexInput] = useState(() => (alpha < 100 ? color.hexa() : color.hex()))
  const [cssInput, setCssInput] = useState(() => `rgba(${color.rgb().array().map((value) => Math.round(value)).join(', ')}, ${alpha}%)`)
  const [rgbInputs, setRgbInputs] = useState(() => color.rgb().array().map((value) => Math.round(value).toString()))
  const [hslInputs, setHslInputs] = useState(() => color.hsl().array().map((value) => Math.round(value).toString()))
  const [alphaInput, setAlphaInput] = useState(() => alpha.toString())
  const [activeField, setActiveField] = useState<string | null>(null)

  useEffect(() => {
    if (activeField !== 'hex') {
      setHexInput(alpha < 100 ? color.hexa() : color.hex())
    }
    if (activeField !== 'css') {
      setCssInput(`rgba(${color.rgb().array().map((value) => Math.round(value)).join(', ')}, ${alpha}%)`)
    }
    if (!activeField?.startsWith('rgb-')) {
      setRgbInputs(color.rgb().array().map((value) => Math.round(value).toString()))
    }
    if (!activeField?.startsWith('hsl-')) {
      setHslInputs(color.hsl().array().map((value) => Math.round(value).toString()))
    }
    if (activeField !== 'alpha') {
      setAlphaInput(alpha.toString())
    }
  }, [alpha, color, activeField])

  const commitHex = useCallback((value: string) => {
    const trimmed = value.trim()
    const match = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
    if (!match) return
    let hex = match[1]
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('')
    }
    const normalized = `#${hex}`
    try {
      updateFromColor(Color(normalized))
    } catch {
      // Ignore invalid color parse.
    }
  }, [updateFromColor])

  const commitRgb = useCallback((values: string[]) => {
    const [r, g, b] = values.map((v) => Number(v))
    if ([r, g, b].some((val) => Number.isNaN(val))) return
    updateFromColor(Color.rgb(
      clamp(r, 0, 255),
      clamp(g, 0, 255),
      clamp(b, 0, 255)
    ).alpha(alpha / 100))
  }, [alpha, updateFromColor])

  const commitHsl = useCallback((values: string[]) => {
    const [h, s, l] = values.map((v) => Number(v))
    if ([h, s, l].some((val) => Number.isNaN(val))) return
    updateFromColor(Color.hsl(
      clamp(h, 0, 360),
      clamp(s, 0, 100),
      clamp(l, 0, 100)
    ).alpha(alpha / 100))
  }, [alpha, updateFromColor])

  const commitCss = useCallback((value: string) => {
    try {
      updateFromColor(Color(value))
    } catch {
      // Ignore invalid CSS.
    }
  }, [updateFromColor])

  const commitAlpha = useCallback((value: string) => {
    const next = Number(value)
    if (Number.isNaN(next)) return
    setAlpha(clamp(next, 0, 100))
  }, [setAlpha])
  if (mode === 'hex') {
    return (
      <div
        className={cn(
          '-space-x-px relative flex w-full items-center rounded-md shadow-sm',
          className
        )}
        {...(props as any)}
      >
        <Input
          className="h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none"
          type="text"
          value={hexInput}
          onFocus={() => setActiveField('hex')}
          onBlur={() => {
            setActiveField(null)
            commitHex(hexInput)
          }}
          onChange={(event) => setHexInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
        />
        <PercentageInput
          value={alphaInput}
          onFocus={() => setActiveField('alpha')}
          onBlur={() => {
            setActiveField(null)
            commitAlpha(alphaInput)
          }}
          onChange={(event) => setAlphaInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
        />
      </div>
    )
  }
  if (mode === 'rgb') {
    return (
      <div
        className={cn(
          '-space-x-px flex items-center rounded-md shadow-sm',
          className
        )}
        {...(props as any)}
      >
        {rgbInputs.map((value, index) => (
          <Input
            className={cn(
              'h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none',
              index && 'rounded-l-none',
              className
            )}
            key={index}
            type="text"
            value={value}
            onFocus={() => setActiveField(`rgb-${index}`)}
            onBlur={() => {
              setActiveField(null)
              commitRgb(rgbInputs)
            }}
            onChange={(event) => {
              const next = [...rgbInputs]
              next[index] = event.target.value
              setRgbInputs(next)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
          />
        ))}
        <PercentageInput
          value={alphaInput}
          onFocus={() => setActiveField('alpha')}
          onBlur={() => {
            setActiveField(null)
            commitAlpha(alphaInput)
          }}
          onChange={(event) => setAlphaInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
        />
      </div>
    )
  }
  if (mode === 'css') {
    return (
      <div className={cn('w-full rounded-md shadow-sm', className)} {...(props as any)}>
        <Input
          className="h-8 w-full bg-secondary px-2 text-xs shadow-none"
          type="text"
          value={cssInput}
          onFocus={() => setActiveField('css')}
          onBlur={() => {
            setActiveField(null)
            commitCss(cssInput)
          }}
          onChange={(event) => setCssInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
        />
      </div>
    )
  }
  if (mode === 'hsl') {
    return (
      <div
        className={cn(
          '-space-x-px flex items-center rounded-md shadow-sm',
          className
        )}
        {...(props as any)}
      >
        {hslInputs.map((value, index) => (
          <Input
            className={cn(
              'h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none',
              index && 'rounded-l-none',
              className
            )}
            key={index}
            type="text"
            value={value}
            onFocus={() => setActiveField(`hsl-${index}`)}
            onBlur={() => {
              setActiveField(null)
              commitHsl(hslInputs)
            }}
            onChange={(event) => {
              const next = [...hslInputs]
              next[index] = event.target.value
              setHslInputs(next)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
          />
        ))}
        <PercentageInput
          value={alphaInput}
          onFocus={() => setActiveField('alpha')}
          onBlur={() => {
            setActiveField(null)
            commitAlpha(alphaInput)
          }}
          onChange={(event) => setAlphaInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
        />
      </div>
    )
  }
  return null
}

export type ColorPickerPanelProps = {
  value?: ColorInput
  defaultValue?: ColorInput
  onChange?: (value: string) => void
  onInteractionStart?: () => void
  onInteractionEnd?: () => void
  className?: string
}

export const ColorPickerPanel = ({
  value,
  defaultValue,
  onChange,
  onInteractionStart,
  onInteractionEnd,
  className,
}: ColorPickerPanelProps) => {
  const [showPresets, setShowPresets] = useState(false)
  const PRESET_COLORS = [
    '#000000', '#1f2937', '#374151', '#6b7280', '#9ca3af', '#e5e7eb', '#ffffff',
    '#ef4444', '#f97316', '#f59e0b', '#facc15', '#84cc16', '#22c55e', '#10b981',
    '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
    '#d946ef', '#ec4899', '#f43f5e', '#fb7185', '#fda4af', '#fca5a5', '#fed7aa',
    '#fde68a', '#bbf7d0', '#a7f3d0', '#99f6e4', '#bae6fd', '#bfdbfe', '#ddd6fe',
    '#e9d5ff', '#f5d0fe', '#fbcfe8', '#fecdd3', '#ffe4e6', '#f8fafc', '#fef3c7',
    '#dcfce7', '#ecfeff', '#eff6ff', '#f5f3ff', '#faf5ff', '#fdf2f8', '#fff1f2'
  ]
  return (
    <ColorPicker
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      onInteractionStart={onInteractionStart}
      onInteractionEnd={onInteractionEnd}
    >
      <div className={cn('space-y-3', className)}>
        <ColorPickerSelection />
        <ColorPickerHue />
        <div className="space-y-1">
          <div className="text-2xs font-medium text-muted-foreground uppercase tracking-[0.16em]">Opacity</div>
          <ColorPickerAlpha />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-2xs font-medium text-muted-foreground uppercase tracking-[0.16em]">Presets</div>
            <button
              type="button"
              onClick={() => setShowPresets((prev) => !prev)}
              className="text-2xs font-medium text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              {showPresets ? 'Hide' : 'More'}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.slice(0, 10).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onChange?.(preset)}
                className="h-5 w-5 rounded-md border border-border/40 transition-transform hover:scale-110"
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
          {showPresets && (
            <div className="grid grid-cols-8 gap-1.5 pt-1">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={`full-${preset}`}
                  type="button"
                  onClick={() => onChange?.(preset)}
                  className="h-5 w-5 rounded-md border border-border/40 transition-transform hover:scale-110"
                  style={{ backgroundColor: preset }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <ColorPickerEyeDropper />
          <ColorPickerOutput />
        </div>
        <ColorPickerFormat />
      </div>
    </ColorPicker>
  )
}

export type ColorPickerPopoverProps = {
  value?: ColorInput
  defaultValue?: ColorInput
  onChange?: (value: string) => void
  onInteractionStart?: () => void
  onInteractionEnd?: () => void
  label?: string
  className?: string
  swatchClassName?: string
  contentClassName?: string
  align?: ComponentProps<typeof PopoverContent>['align']
  sideOffset?: ComponentProps<typeof PopoverContent>['sideOffset']
  open?: boolean
  onOpenChange?: (open: boolean) => void
  modal?: boolean
}

export const ColorPickerPopover = ({
  value,
  defaultValue,
  onChange,
  onInteractionStart,
  onInteractionEnd,
  label,
  className,
  swatchClassName,
  contentClassName,
  align = 'center',
  sideOffset = 8,
  open,
  onOpenChange,
  modal,
}: ColorPickerPopoverProps) => {
  const swatchColor = value ? String(value) : String(defaultValue ?? '#000000')

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={modal}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs text-foreground shadow-sm transition-colors hover:bg-background/80',
            className
          )}
        >
          <span
            className={cn('h-4 w-4 rounded-sm border border-border/60', swatchClassName)}
            style={{ backgroundColor: swatchColor }}
          />
          {label && <span className="text-xs font-medium">{label}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={sideOffset}
        className={cn('w-80 p-4', contentClassName)}
      >
        <ColorPickerPanel
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onInteractionStart={onInteractionStart}
          onInteractionEnd={onInteractionEnd}
        />
      </PopoverContent>
    </Popover>
  )
}
