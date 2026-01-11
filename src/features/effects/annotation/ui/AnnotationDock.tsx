'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline, ChevronDown, Check } from 'lucide-react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { EffectStore } from '@/features/effects/core/store'
import { Button } from '@/components/ui/button'
import { ColorPickerPopover } from '@/components/ui/color-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { AnnotationType, EffectType } from '@/types/project'
import { EffectLayerType } from '@/features/effects/types'
import { RedactionPattern } from '@/features/effects/annotation/types'
import type { AnnotationData, AnnotationStyle, Effect } from '@/types/project'
import { cn } from '@/shared/utils/utils'
import { CommandExecutor, UpdateEffectCommand } from '@/features/core/commands'

const FONT_FAMILIES = [
    { label: 'System', value: 'system-ui, -apple-system, sans-serif' },
    { label: 'Inter', value: 'Inter, sans-serif' },
    { label: 'Mono', value: "'Courier New', monospace" },
    { label: 'Serif', value: 'Georgia, serif' },
    { label: 'Hand', value: "'Comic Sans MS', cursive" },
] as const

// Redaction pattern options with visual icons
const REDACTION_PATTERNS = [
    { value: RedactionPattern.Solid, label: 'Solid', icon: '█' },
    { value: RedactionPattern.Noise, label: 'Grain', icon: '░' },
    { value: RedactionPattern.Diagonal, label: 'Lines', icon: '╱' },
    { value: RedactionPattern.Mosaic, label: 'Mosaic', icon: '▓' },
    { value: RedactionPattern.Marker, label: 'Marker', icon: '▌' },
] as const

export function AnnotationDock() {
    const project = useProjectStore((s) => s.currentProject)
    const selectedEffectLayer = useProjectStore((s) => s.selectedEffectLayer)
    const updateEffect = useProjectStore((s) => s.updateEffect)
    const [isFontPopoverOpen, setIsFontPopoverOpen] = useState(false)

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
    const selectedType = selectedData?.type
    const isVisible = Boolean(selectedAnnotation && selectedType && selectedType !== AnnotationType.Blur)

    const updateStyle = useCallback((updates: Partial<AnnotationStyle>) => {
        if (!selectedAnnotation) return
        const currentData = selectedAnnotation.data as AnnotationData
        const newStyle = { ...currentData.style, ...updates }
        if (CommandExecutor.isInitialized()) {
            void CommandExecutor.getInstance().execute(UpdateEffectCommand, selectedAnnotation.id, {
                data: { ...currentData, style: newStyle }
            } as Partial<Effect>)
        } else {
            updateEffect(selectedAnnotation.id, { data: { ...currentData, style: newStyle } } as Partial<Effect>)
        }
    }, [selectedAnnotation, updateEffect])

    if (!isVisible || !selectedData) return null

    const style = selectedData.style ?? {}
    const annotationType = selectedData.type as AnnotationType

    const showTextControls = annotationType === AnnotationType.Text
    const showArrowControls = annotationType === AnnotationType.Arrow
    const showHighlightControls = annotationType === AnnotationType.Highlight
    const showRedactionControls = annotationType === AnnotationType.Redaction

    const fontSize = Math.round(style.fontSize ?? 18)
    const fontWeight = style.fontWeight ?? 'normal'
    const isBold = typeof fontWeight === 'number' ? fontWeight >= 600 : fontWeight === 'bold'
    const isItalic = style.fontStyle === 'italic'
    const isUnderline = style.textDecoration === 'underline'
    const textAlign = style.textAlign ?? 'center'
    const fontFamily = style.fontFamily ?? 'system-ui, -apple-system, sans-serif'
    const textColor = style.color ?? '#ffffff'

    const strokeWidth = Math.round((style.strokeWidth as number | undefined) ?? 3)
    const arrowHeadSize = Math.round((style.arrowHeadSize as number | undefined) ?? 10)

    const highlightDim = Math.round((style.opacity as number | undefined) ?? 55)
    const cornerRadius = Math.round((style.borderRadius as number | undefined) ?? 20)

    const handleFontSizeChange = (next: number) => {
        const clamped = Math.max(8, Math.min(200, next))
        updateStyle({ fontSize: clamped })
    }

    const activeFontLabel = FONT_FAMILIES.find(f => f.value === fontFamily)?.label ?? 'System'

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
                            {showTextControls && (
                                <>
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
                                        <Popover open={isFontPopoverOpen} onOpenChange={setIsFontPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={isFontPopoverOpen}
                                                    className="h-8 w-[140px] justify-between text-xs bg-background/70 border-border/60 px-2 text-foreground/90 hover:bg-background/80"
                                                >
                                                    {activeFontLabel}
                                                    <ChevronDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[140px] p-0" align="start">
                                                <div className="flex flex-col">
                                                    {FONT_FAMILIES.map((family) => (
                                                        <button
                                                            key={family.value}
                                                            className={cn(
                                                                "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                                                                fontFamily === family.value && "bg-accent text-accent-foreground"
                                                            )}
                                                            onClick={() => {
                                                                updateStyle({ fontFamily: family.value })
                                                                setIsFontPopoverOpen(false)
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-3 w-3",
                                                                    fontFamily === family.value ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            {family.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </PopoverContent>
                                        </Popover>
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
                                            modal={true}
                                        />
                                    </div>
                                </>
                            )}

                            {showArrowControls && (
                                <>
                                    <div>
                                        <ColorPickerPopover
                                            value={style.color ?? '#ff0000'}
                                            onChange={(value) => updateStyle({ color: value })}
                                            className="h-8 px-2"
                                            swatchClassName="h-5 w-5"
                                            modal={true}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-2 py-1">
                                        <span className="text-3xs text-muted-foreground/80">Stroke</span>
                                        <Slider
                                            value={[strokeWidth]}
                                            onValueChange={([v]) => updateStyle({ strokeWidth: v })}
                                            min={1}
                                            max={24}
                                            step={1}
                                            className="w-28"
                                        />
                                        <span className="w-6 text-3xs tabular-nums text-muted-foreground/80 text-right">{strokeWidth}</span>
                                    </div>
                                    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-2 py-1">
                                        <span className="text-3xs text-muted-foreground/80">Head</span>
                                        <Slider
                                            value={[arrowHeadSize]}
                                            onValueChange={([v]) => updateStyle({ arrowHeadSize: v })}
                                            min={6}
                                            max={40}
                                            step={1}
                                            className="w-28"
                                        />
                                        <span className="w-6 text-3xs tabular-nums text-muted-foreground/80 text-right">{arrowHeadSize}</span>
                                    </div>
                                </>
                            )}

                            {showHighlightControls && (
                                <>
                                    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-2 py-1">
                                        <span className="text-3xs text-muted-foreground/80">Dim</span>
                                        <Slider
                                            value={[highlightDim]}
                                            onValueChange={([v]) => updateStyle({ opacity: v })}
                                            min={0}
                                            max={95}
                                            step={1}
                                            className="w-28"
                                        />
                                        <span className="w-8 text-3xs tabular-nums text-muted-foreground/80 text-right">{highlightDim}%</span>
                                    </div>
                                </>
                            )}

                            {(showRedactionControls || showHighlightControls) && (
                                <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-2 py-1">
                                    <span className="text-3xs text-muted-foreground/80">Radius</span>
                                    <Slider
                                        value={[cornerRadius]}
                                        onValueChange={([v]) => updateStyle({ borderRadius: v })}
                                        min={0}
                                        max={60}
                                        step={1}
                                        className="w-28"
                                    />
                                    <span className="w-6 text-3xs tabular-nums text-muted-foreground/80 text-right">{cornerRadius}</span>
                                </div>
                            )}

                            {showRedactionControls && (
                                <>
                                    <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/70 px-2 py-1">
                                        <span className="text-3xs text-muted-foreground/80">Style</span>
                                        {REDACTION_PATTERNS.map((pattern) => (
                                            <Button
                                                key={pattern.value}
                                                type="button"
                                                size="icon"
                                                variant={(style.redactionPattern ?? RedactionPattern.Solid) === pattern.value ? 'secondary' : 'ghost'}
                                                className="h-7 w-7 text-xs font-medium"
                                                title={pattern.label}
                                                onClick={() => updateStyle({ redactionPattern: pattern.value })}
                                            >
                                                {pattern.icon}
                                            </Button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-2 py-1">
                                        <span className="text-3xs text-muted-foreground/80">Color</span>
                                        <ColorPickerPopover
                                            value={style.backgroundColor ?? '#000000'}
                                            onChange={(value) => updateStyle({ backgroundColor: value })}
                                            className="h-6 w-8 px-0"
                                            swatchClassName="h-4 w-4"
                                            modal={true}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-2 py-1">
                                        <span className="text-3xs text-muted-foreground/80">Border</span>
                                        <div className="flex items-center gap-1">
                                            <ColorPickerPopover
                                                value={style.borderColor ?? '#ffffff'}
                                                onChange={(value) => updateStyle({ borderColor: value })}
                                                className="h-6 w-8 px-0"
                                                swatchClassName="h-4 w-4"
                                                modal={true}
                                            />
                                            <Slider
                                                value={[Math.round((style.borderWidth as number | undefined) ?? 0)]}
                                                onValueChange={([v]) => updateStyle({ borderWidth: v })}
                                                min={0}
                                                max={10}
                                                step={1}
                                                className="w-20"
                                            />
                                        </div>
                                        <span className="w-4 text-3xs tabular-nums text-muted-foreground/80 text-right">
                                            {Math.round((style.borderWidth as number | undefined) ?? 0)}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
