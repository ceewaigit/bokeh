'use client'

import React, { useCallback, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from 'lucide-react'
import { useProjectStore } from '@/features/stores/project-store'
import { EffectStore } from '@/features/effects/core/store'
import { Button } from '@/components/ui/button'
import { ColorPickerPopover } from '@/components/ui/color-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AnnotationType, EffectType } from '@/types/project'
import { EffectLayerType } from '@/types/effects'
import type { AnnotationData, AnnotationStyle, Effect } from '@/types/project'

const FONT_FAMILIES = [
  { label: 'System', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Mono', value: "'Courier New', monospace" },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Hand', value: "'Comic Sans MS', cursive" },
] as const

export function AnnotationTextDock() {
  const project = useProjectStore((s) => s.currentProject)
  const selectedEffectLayer = useProjectStore((s) => s.selectedEffectLayer)
  const updateEffect = useProjectStore((s) => s.updateEffect)
  const dockVariants = useMemo(() => ({
    hidden: { opacity: 0, y: -10, scale: 0.98 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 820,
        damping: 34,
        opacity: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
        when: 'beforeChildren'
      }
    },
    exit: {
      opacity: 0,
      y: -10,
      scale: 0.98,
      transition: {
        type: 'spring',
        stiffness: 760,
        damping: 30,
        opacity: { duration: 0.1, ease: [0.2, 0, 0.2, 1] },
        when: 'afterChildren'
      }
    }
  }), [])

  const selectedAnnotation = useMemo(() => {
    if (!project || selectedEffectLayer?.type !== EffectLayerType.Annotation) return null
    return (
      EffectStore.getAll(project).find(
        (effect) => effect.id === selectedEffectLayer.id && effect.type === EffectType.Annotation
      ) ?? null
    )
  }, [project, selectedEffectLayer])

  const selectedData = selectedAnnotation?.data as AnnotationData | undefined
  const isVisible = Boolean(selectedAnnotation && selectedData?.type === AnnotationType.Text)

  const updateStyle = useCallback((updates: Partial<AnnotationStyle>) => {
    if (!selectedAnnotation) return
    const currentData = selectedAnnotation.data as AnnotationData
    const newStyle = { ...currentData.style, ...updates }
    updateEffect(selectedAnnotation.id, { data: { ...currentData, style: newStyle } } as Partial<Effect>)
  }, [selectedAnnotation, updateEffect])

  if (!isVisible || !selectedData) return null

  const style = selectedData.style ?? {}
  const fontSize = Math.round(style.fontSize ?? 18)
  const fontWeight = style.fontWeight ?? 'normal'
  const isBold = typeof fontWeight === 'number' ? fontWeight >= 600 : fontWeight === 'bold'
  const isItalic = style.fontStyle === 'italic'
  const isUnderline = style.textDecoration === 'underline'
  const textAlign = style.textAlign ?? 'center'
  const fontFamily = style.fontFamily ?? 'system-ui, -apple-system, sans-serif'
  const textColor = style.color ?? '#ffffff'

  const handleFontSizeChange = (next: number) => {
    const clamped = Math.max(8, Math.min(200, next))
    updateStyle({ fontSize: clamped })
  }

  return (
    <div className="absolute left-1/2 top-3 z-[3000] -translate-x-1/2 pointer-events-none">
      <AnimatePresence>
        {isVisible && (
          <motion.div
            key="annotation-text-dock"
            data-annotation-text-dock="true"
            variants={dockVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            layout
            className="pointer-events-auto"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center flex-nowrap gap-2 rounded-2xl border border-border/70 bg-background/95 px-3 py-2 shadow-lg backdrop-blur whitespace-nowrap overflow-x-auto text-foreground/90">
              <div className="flex items-center rounded-lg border border-border/60 bg-background/70">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-none text-foreground/90"
                  onClick={() => handleFontSizeChange(fontSize - 1)}
                >
                  -
                </Button>
                <input
                  type="number"
                  min={8}
                  max={200}
                  value={fontSize}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isFinite(next)) {
                      handleFontSizeChange(next)
                    }
                  }}
                  className="h-8 w-14 border-0 bg-transparent text-center text-xs text-foreground/90 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-none text-foreground/90"
                  onClick={() => handleFontSizeChange(fontSize + 1)}
                >
                  +
                </Button>
              </div>

              <div>
                <Select
                  value={fontFamily}
                  onValueChange={(value) => updateStyle({ fontFamily: value })}
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs bg-background/70 border-border/60 px-2 text-foreground/90">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_FAMILIES.map((family) => (
                    <SelectItem key={family.value} value={family.value} className="text-xs">
                        {family.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant={textAlign === 'left' ? 'secondary' : 'ghost'}
                  className="h-8 w-8 text-foreground/90"
                  onClick={() => updateStyle({ textAlign: 'left' })}
                >
                  <AlignLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={textAlign === 'center' ? 'secondary' : 'ghost'}
                  className="h-8 w-8 text-foreground/90"
                  onClick={() => updateStyle({ textAlign: 'center' })}
                >
                  <AlignCenter className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={textAlign === 'right' ? 'secondary' : 'ghost'}
                  className="h-8 w-8 text-foreground/90"
                  onClick={() => updateStyle({ textAlign: 'right' })}
                >
                  <AlignRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant={isBold ? 'secondary' : 'ghost'}
                  className="h-8 w-8 text-foreground/90"
                  onClick={() => updateStyle({ fontWeight: isBold ? 400 : 700 })}
                >
                  <Bold className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={isItalic ? 'secondary' : 'ghost'}
                  className="h-8 w-8 text-foreground/90"
                  onClick={() => updateStyle({ fontStyle: isItalic ? 'normal' : 'italic' })}
                >
                  <Italic className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={isUnderline ? 'secondary' : 'ghost'}
                  className="h-8 w-8 text-foreground/90"
                  onClick={() => updateStyle({ textDecoration: isUnderline ? 'none' : 'underline' })}
                >
                  <Underline className="h-4 w-4" />
                </Button>
              </div>

              <div>
                <ColorPickerPopover
                  value={textColor}
                  onChange={(value) => updateStyle({ color: value })}
                  className="h-8 px-2"
                  swatchClassName="h-5 w-5"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
