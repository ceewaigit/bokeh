/**
 * Apple Text Reveal Plugin - Apple commercial-style text animations
 */

import React from 'react'
import type { PluginDefinition, PluginRenderProps } from '../../config/plugin-sdk'
import { easeOutCubic, easeInOutQuad, clamp } from '@/features/rendering/canvas/math'

interface AppleTextRevealParams {
    // Content
    text: string

    // Typography
    fontSize: number
    fontWeight: 'light' | 'regular' | 'medium' | 'semibold' | 'bold'
    textColor: string
    textAlign: 'left' | 'center' | 'right'
    letterSpacing: number
    lineHeight: number

    // Background
    backgroundColor: string

    // Animation
    animationStyle: 'fade' | 'blur-fade' | 'slide-fade' | 'scale-fade'
    stagger: 'none' | 'words' | 'lines'
    staggerDelay: number
    fadeInDuration: number
    holdDuration: number
    fadeOutDuration: number
    fadeOutStyle: 'together' | 'sequential' | 'reverse'

    // Effects
    blurAmount: number
    slideDistance: number
    scaleFrom: number
}

export const AppleTextRevealPlugin: PluginDefinition<AppleTextRevealParams> = {
    id: 'apple-text-reveal',
    name: 'Text Reveal',
    description: 'Apple commercial-style text fade in/out animations',
    icon: 'Type',
    category: 'transition',
    params: {
        text: {
            type: 'string',
            default: 'bokeh.',
            label: 'Text'
        },
        fontSize: {
            type: 'number',
            default: 8,
            label: 'Font Size',
            min: 3,
            max: 20,
            step: 0.5,
            unit: '%'
        },
        fontWeight: {
            type: 'enum',
            default: 'light',
            label: 'Weight',
            options: [
                { value: 'light', label: 'Light' },
                { value: 'regular', label: 'Regular' },
                { value: 'medium', label: 'Medium' },
                { value: 'semibold', label: 'Semibold' },
                { value: 'bold', label: 'Bold' },
            ]
        },
        textColor: { type: 'color', default: '#000000', label: 'Text Color' },
        textAlign: {
            type: 'enum',
            default: 'center',
            label: 'Align',
            options: [
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
            ]
        },
        letterSpacing: {
            type: 'number',
            default: -0.02,
            label: 'Letter Spacing',
            min: -0.1,
            max: 0.2,
            step: 0.01,
            unit: 'em'
        },
        lineHeight: {
            type: 'number',
            default: 1.2,
            label: 'Line Height',
            min: 0.8,
            max: 2,
            step: 0.1
        },
        backgroundColor: { type: 'color', default: '#ffffff', label: 'Background' },
        animationStyle: {
            type: 'enum',
            default: 'blur-fade',
            label: 'Animation',
            options: [
                { value: 'fade', label: 'Fade' },
                { value: 'blur-fade', label: 'Blur Fade' },
                { value: 'slide-fade', label: 'Slide Fade' },
                { value: 'scale-fade', label: 'Scale Fade' },
            ]
        },
        stagger: {
            type: 'enum',
            default: 'words',
            label: 'Stagger',
            options: [
                { value: 'none', label: 'None' },
                { value: 'words', label: 'Words' },
                { value: 'lines', label: 'Lines' },
            ]
        },
        staggerDelay: {
            type: 'number',
            default: 80,
            label: 'Stagger Delay',
            min: 20,
            max: 300,
            step: 10,
            unit: 'ms'
        },
        fadeInDuration: {
            type: 'number',
            default: 30,
            label: 'Fade In',
            min: 10,
            max: 50,
            step: 5,
            unit: '%'
        },
        holdDuration: {
            type: 'number',
            default: 40,
            label: 'Hold',
            min: 10,
            max: 60,
            step: 5,
            unit: '%'
        },
        fadeOutDuration: {
            type: 'number',
            default: 30,
            label: 'Fade Out',
            min: 10,
            max: 50,
            step: 5,
            unit: '%'
        },
        fadeOutStyle: {
            type: 'enum',
            default: 'reverse',
            label: 'Fade Out Style',
            options: [
                { value: 'together', label: 'Together' },
                { value: 'sequential', label: 'Sequential' },
                { value: 'reverse', label: 'Reverse' },
            ]
        },
        blurAmount: {
            type: 'number',
            default: 12,
            label: 'Blur Amount',
            min: 0,
            max: 30,
            step: 2,
            unit: 'px'
        },
        slideDistance: {
            type: 'number',
            default: 30,
            label: 'Slide Distance',
            min: 0,
            max: 100,
            step: 5,
            unit: 'px'
        },
        scaleFrom: {
            type: 'number',
            default: 95,
            label: 'Scale From',
            min: 80,
            max: 100,
            step: 1,
            unit: '%'
        },
    },
    render(props: PluginRenderProps<AppleTextRevealParams>) {
        const { params, frame, width: _canvasWidth, height: canvasHeight } = props
        const {
            text,
            fontSize,
            fontWeight,
            textColor,
            textAlign,
            letterSpacing,
            lineHeight,
            backgroundColor,
            animationStyle,
            stagger,
            staggerDelay,
            fadeInDuration,
            holdDuration,
            fadeOutDuration,
            fadeOutStyle,
            blurAmount,
            slideDistance,
            scaleFrom,
        } = params

        const progress = frame.progress
        const fps = frame.fps || 30

        // Normalize durations (they should sum to 100%)
        const totalDuration = fadeInDuration + holdDuration + fadeOutDuration
        const fadeInEnd = fadeInDuration / totalDuration
        const holdEnd = (fadeInDuration + holdDuration) / totalDuration

        // Font weight mapping
        const fontWeightMap: Record<string, number> = {
            light: 300,
            regular: 400,
            medium: 500,
            semibold: 600,
            bold: 700,
        }

        // Parse text into elements based on stagger mode
        const parseText = (): { type: 'word' | 'line'; content: string; lineIndex: number }[] => {
            const lines = text.split('\n').filter(l => l.trim())
            const elements: { type: 'word' | 'line'; content: string; lineIndex: number }[] = []

            if (stagger === 'none') {
                // Return entire text as single element
                return [{ type: 'line', content: text, lineIndex: 0 }]
            }

            if (stagger === 'lines') {
                return lines.map((line, i) => ({ type: 'line', content: line, lineIndex: i }))
            }

            // Words mode
            lines.forEach((line, lineIndex) => {
                const words = line.split(/\s+/).filter(w => w)
                words.forEach(word => {
                    elements.push({ type: 'word', content: word, lineIndex })
                })
            })

            return elements
        }

        const elements = parseText()
        const elementCount = elements.length
        const staggerDelayNormalized = staggerDelay / 1000 / (frame.durationFrames / fps) // Convert ms to progress units

        // Calculate animation state for each element
        const getElementState = (index: number, total: number) => {
            // Calculate stagger offset
            const fadeInStaggerOffset = index * staggerDelayNormalized

            // Calculate fade out index based on style
            let fadeOutIndex = index
            if (fadeOutStyle === 'reverse') {
                fadeOutIndex = total - 1 - index
            } else if (fadeOutStyle === 'together') {
                fadeOutIndex = 0 // All start at same time
            }
            const fadeOutStaggerOffset = fadeOutIndex * staggerDelayNormalized

            // Determine phase and local progress
            let opacity = 0
            let blur = blurAmount
            let translateY = slideDistance
            let scale = scaleFrom / 100

            if (progress < fadeInEnd) {
                // Fade in phase
                const phaseProgress = progress / fadeInEnd
                const elementProgress = clamp((phaseProgress - fadeInStaggerOffset / fadeInEnd) / (1 - fadeInStaggerOffset), 0, 1)
                const easedProgress = easeOutCubic(elementProgress)

                opacity = easedProgress
                blur = blurAmount * (1 - easedProgress)
                translateY = slideDistance * (1 - easedProgress)
                scale = (scaleFrom / 100) + ((1 - scaleFrom / 100) * easedProgress)
            } else if (progress < holdEnd) {
                // Hold phase - fully visible
                opacity = 1
                blur = 0
                translateY = 0
                scale = 1
            } else {
                // Fade out phase
                const phaseProgress = (progress - holdEnd) / (1 - holdEnd)
                const adjustedStagger = fadeOutStyle === 'together' ? 0 : fadeOutStaggerOffset / (1 - holdEnd)
                const elementProgress = clamp((phaseProgress - adjustedStagger) / (1 - adjustedStagger), 0, 1)
                const easedProgress = easeInOutQuad(elementProgress)

                opacity = 1 - easedProgress
                blur = blurAmount * easedProgress
                translateY = -slideDistance * easedProgress // Slide up on exit
                scale = 1 - ((1 - scaleFrom / 100) * easedProgress)
            }

            return { opacity, blur, translateY, scale }
        }

        // Build transform string based on animation style
        const getTransform = (state: { translateY: number; scale: number }) => {
            const transforms: string[] = []

            if (animationStyle === 'slide-fade' || animationStyle === 'scale-fade') {
                if (animationStyle === 'slide-fade') {
                    transforms.push(`translateY(${state.translateY}px)`)
                }
                if (animationStyle === 'scale-fade') {
                    transforms.push(`scale(${state.scale})`)
                }
            }

            return transforms.length > 0 ? transforms.join(' ') : 'none'
        }

        // Group elements by line for rendering
        const lineGroups: Map<number, typeof elements> = new Map()
        elements.forEach(el => {
            if (!lineGroups.has(el.lineIndex)) {
                lineGroups.set(el.lineIndex, [])
            }
            lineGroups.get(el.lineIndex)!.push(el)
        })

        const calculatedFontSize = (fontSize / 100) * canvasHeight

        return (
            <div style={{
                position: 'absolute',
                inset: 0,
                background: backgroundColor,
                display: 'flex',
                flexDirection: 'column',
                alignItems: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
                justifyContent: 'center',
                padding: '10%',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
                fontSize: calculatedFontSize,
                fontWeight: fontWeightMap[fontWeight] || 400,
                color: textColor,
                letterSpacing: `${letterSpacing}em`,
                lineHeight: lineHeight,
                textAlign: textAlign,
                overflow: 'hidden',
            }}>
                {Array.from(lineGroups.entries()).map(([lineIndex, lineElements]) => (
                    <div key={lineIndex} style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
                        gap: stagger === 'words' ? `0 ${calculatedFontSize * 0.3}px` : 0,
                    }}>
                        {lineElements.map((el, elIndex) => {
                            // Calculate global index for this element
                            let globalIndex = 0
                            for (let i = 0; i < lineIndex; i++) {
                                globalIndex += lineGroups.get(i)?.length || 0
                            }
                            globalIndex += elIndex

                            const state = getElementState(globalIndex, elementCount)
                            const transform = getTransform(state)

                            return (
                                <span
                                    key={`${lineIndex}-${elIndex}`}
                                    style={{
                                        display: 'inline-block',
                                        opacity: state.opacity,
                                        filter: animationStyle === 'blur-fade' || animationStyle === 'fade'
                                            ? `blur(${state.blur}px)`
                                            : 'none',
                                        transform: transform,
                                        willChange: 'opacity, filter, transform',
                                    }}
                                >
                                    {el.content}
                                </span>
                            )
                        })}
                    </div>
                ))}
            </div>
        )
    }
}
